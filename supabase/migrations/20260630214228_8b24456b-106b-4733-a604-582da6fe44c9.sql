
-- INFRAESTRUCTURA
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.log_system_action(
  p_action text, p_target_type text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.admin_audit_log (actor_id, actor_role, action, target_type, target_id, metadata)
  VALUES (NULL, 'admin', p_action, p_target_type, p_target_id, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- MÓDULO A
CREATE OR REPLACE FUNCTION public.purge_old_admin_audit_log()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.admin_audit_log WHERE created_at < now() - interval '6 months' RETURNING 1
  ) SELECT count(*) INTO v_count FROM deleted;
  PERFORM public.log_system_action('purge_admin_audit_log','admin_audit_log',NULL,
    jsonb_build_object('rows_deleted',v_count,'retention','6 months'));
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.purge_old_redemption_request_events()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.redemption_request_events WHERE created_at < now() - interval '6 months' RETURNING 1
  ) SELECT count(*) INTO v_count FROM deleted;
  PERFORM public.log_system_action('purge_redemption_request_events','redemption_request_events',NULL,
    jsonb_build_object('rows_deleted',v_count,'retention','6 months'));
  RETURN v_count;
END; $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='sdd_purge_admin_audit_log') THEN PERFORM cron.unschedule('sdd_purge_admin_audit_log'); END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='sdd_purge_redemption_events') THEN PERFORM cron.unschedule('sdd_purge_redemption_events'); END IF;
END $$;

SELECT cron.schedule('sdd_purge_admin_audit_log','0 3 1 * *',$$SELECT public.purge_old_admin_audit_log();$$);
SELECT cron.schedule('sdd_purge_redemption_events','15 3 1 * *',$$SELECT public.purge_old_redemption_request_events();$$);

-- MÓDULO B
CREATE TABLE IF NOT EXISTS public.point_transactions_archive (
  LIKE public.point_transactions INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);

ALTER TABLE public.point_transactions_archive
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS pta_customer_idx   ON public.point_transactions_archive(customer_id);
CREATE INDEX IF NOT EXISTS pta_campaign_idx   ON public.point_transactions_archive(campaign_id);
CREATE INDEX IF NOT EXISTS pta_created_at_idx ON public.point_transactions_archive(created_at);

GRANT SELECT ON public.point_transactions_archive TO authenticated;
GRANT ALL    ON public.point_transactions_archive TO service_role;

ALTER TABLE public.point_transactions_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pta_admin_select" ON public.point_transactions_archive;
CREATE POLICY "pta_admin_select" ON public.point_transactions_archive
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "pta_customer_select_own" ON public.point_transactions_archive;
CREATE POLICY "pta_customer_select_own" ON public.point_transactions_archive
  FOR SELECT TO authenticated USING (customer_id = auth.uid());

DROP VIEW IF EXISTS public.point_transactions_full;
CREATE VIEW public.point_transactions_full AS
  SELECT pt.id, pt.customer_id, pt.campaign_id, pt.branch_id, pt.kind, pt.points_delta,
         pt.balance_after, pt.reward_id, pt.bonus_rule_id, pt.bonus_multiplier,
         pt.reverses_tx_id, pt.idempotency_key, pt.actor_id, pt.actor_role,
         pt.comment_category, pt.comment_text, pt.metadata, pt.created_at, pt.effective_at,
         NULL::timestamptz AS archived_at, false AS is_archived
    FROM public.point_transactions pt
  UNION ALL
  SELECT pta.id, pta.customer_id, pta.campaign_id, pta.branch_id, pta.kind, pta.points_delta,
         pta.balance_after, pta.reward_id, pta.bonus_rule_id, pta.bonus_multiplier,
         pta.reverses_tx_id, pta.idempotency_key, pta.actor_id, pta.actor_role,
         pta.comment_category, pta.comment_text, pta.metadata, pta.created_at, pta.effective_at,
         pta.archived_at, true AS is_archived
    FROM public.point_transactions_archive pta;

GRANT SELECT ON public.point_transactions_full TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_point_transactions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_count integer := 0;
BEGIN
  PERFORM set_config('app.pt_internal','1',true);

  WITH moved AS (
    DELETE FROM public.point_transactions
     WHERE created_at < now() - interval '12 months'
     RETURNING *
  ),
  ins AS (
    INSERT INTO public.point_transactions_archive (
      id, customer_id, campaign_id, branch_id, kind, points_delta,
      balance_after, reward_id, bonus_rule_id, bonus_multiplier, reverses_tx_id,
      idempotency_key, actor_id, actor_role, comment_category, comment_text,
      metadata, created_at, effective_at
    )
    SELECT id, customer_id, campaign_id, branch_id, kind, points_delta,
           balance_after, reward_id, bonus_rule_id, bonus_multiplier, reverses_tx_id,
           idempotency_key, actor_id, actor_role, comment_category, comment_text,
           metadata, created_at, effective_at
      FROM moved
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  PERFORM set_config('app.pt_internal','',true);

  PERFORM public.log_system_action('archive_point_transactions','point_transactions',NULL,
    jsonb_build_object('rows_archived',v_count,'threshold','12 months'));
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.purge_archived_point_transactions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  WITH inactive AS (
    SELECT pta.customer_id
      FROM public.point_transactions_archive pta
     GROUP BY pta.customer_id
    HAVING max(pta.created_at) < now() - interval '18 months'
       AND NOT EXISTS (SELECT 1 FROM public.point_transactions pt WHERE pt.customer_id = pta.customer_id)
  ),
  deleted AS (
    DELETE FROM public.point_transactions_archive
     WHERE customer_id IN (SELECT customer_id FROM inactive)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM deleted;
  PERFORM public.log_system_action('purge_archived_point_transactions','point_transactions_archive',NULL,
    jsonb_build_object('rows_purged',v_count,'inactivity_threshold','18 months'));
  RETURN v_count;
END; $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='sdd_archive_point_transactions') THEN PERFORM cron.unschedule('sdd_archive_point_transactions'); END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='sdd_purge_archived_point_transactions') THEN PERFORM cron.unschedule('sdd_purge_archived_point_transactions'); END IF;
END $$;

SELECT cron.schedule('sdd_archive_point_transactions','0 4 2 * *',$$SELECT public.archive_point_transactions();$$);
SELECT cron.schedule('sdd_purge_archived_point_transactions','30 4 2 * *',$$SELECT public.purge_archived_point_transactions();$$);

-- MÓDULO C
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_consent_granted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_consent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS phone_consent_source  text,
  ADD COLUMN IF NOT EXISTS phone_consent_actor_id uuid;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_audience text; v_phone text; v_gender_raw text; v_gender public.gender_type;
  v_display text; v_email text; v_birthdate_raw text; v_birthdate date;
  v_consent boolean; v_consent_source text; v_consent_actor uuid;
BEGIN
  v_audience := COALESCE(NULLIF(NEW.raw_user_meta_data->>'audience',''),'customer');

  IF v_audience='customer' THEN
    v_phone := COALESCE(NULLIF(NEW.raw_user_meta_data->>'identifier',''),
                        NULLIF(NEW.raw_user_meta_data->>'phone',''), NEW.phone);
  ELSE
    v_phone := COALESCE(NULLIF(NEW.raw_user_meta_data->>'phone',''), NEW.phone);
  END IF;

  v_gender_raw := NULLIF(NEW.raw_user_meta_data->>'gender','');
  IF v_gender_raw IN ('masculino','femenino','otro') THEN v_gender := v_gender_raw::public.gender_type;
  ELSE v_gender := NULL; END IF;

  v_display := COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name',''),'');
  v_email   := NULLIF(NEW.raw_user_meta_data->>'contact_email','');

  v_birthdate_raw := NULLIF(NEW.raw_user_meta_data->>'birthdate','');
  IF v_birthdate_raw IS NOT NULL THEN
    BEGIN v_birthdate := v_birthdate_raw::date; EXCEPTION WHEN OTHERS THEN v_birthdate := NULL; END;
  END IF;

  v_consent := COALESCE((NEW.raw_user_meta_data->>'phone_consent_granted')::boolean, false);
  v_consent_source := NULLIF(NEW.raw_user_meta_data->>'phone_consent_source','');
  BEGIN v_consent_actor := NULLIF(NEW.raw_user_meta_data->>'phone_consent_actor_id','')::uuid;
  EXCEPTION WHEN OTHERS THEN v_consent_actor := NULL; END;

  BEGIN
    INSERT INTO public.profiles (
      id, display_name, phone, gender, email, birthdate,
      phone_consent_granted, phone_consent_at, phone_consent_source, phone_consent_actor_id
    ) VALUES (
      NEW.id, v_display, v_phone, v_gender, v_email, v_birthdate,
      v_consent, CASE WHEN v_consent THEN now() ELSE NULL END, v_consent_source, v_consent_actor
    ) ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    RAISE WARNING '[handle_new_user] unique collision id=% phone=% email=% SQLSTATE=% SQLERRM=% — retrying with NULLs',
      NEW.id, v_phone, v_email, SQLSTATE, SQLERRM;
    INSERT INTO public.profiles (
      id, display_name, phone, gender, email, birthdate,
      phone_consent_granted, phone_consent_at, phone_consent_source, phone_consent_actor_id
    ) VALUES (
      NEW.id, v_display, NULL, v_gender, NULL, v_birthdate,
      v_consent, CASE WHEN v_consent THEN now() ELSE NULL END, v_consent_source, v_consent_actor
    ) ON CONFLICT (id) DO NOTHING;
  WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] profile INSERT failed id=% SQLSTATE=% SQLERRM=%', NEW.id, SQLSTATE, SQLERRM;
    RAISE;
  END;

  IF v_audience='customer' THEN
    BEGIN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id,'customer') ON CONFLICT (user_id, role) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[handle_new_user] user_roles INSERT failed id=% SQLSTATE=% SQLERRM=%', NEW.id, SQLSTATE, SQLERRM;
      RAISE;
    END;
  END IF;

  RETURN NEW;
END;
$function$;
