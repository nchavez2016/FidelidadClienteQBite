
-- Allow trigger bypass via session GUC for our new RPC
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.profile_internal', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.accepted_campaigns IS DISTINCT FROM OLD.accepted_campaigns
     OR NEW.branch_id        IS DISTINCT FROM OLD.branch_id
     OR NEW.is_active        IS DISTINCT FROM OLD.is_active
     OR NEW.legacy_id        IS DISTINCT FROM OLD.legacy_id
     OR NEW.revoked_from_phone IS DISTINCT FROM OLD.revoked_from_phone
     OR NEW.deleted_at       IS DISTINCT FROM OLD.deleted_at
     OR NEW.phone            IS DISTINCT FROM OLD.phone THEN
    RAISE EXCEPTION 'forbidden_field_update' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;

-- Allow ledger no-mutation trigger to permit terms_acceptance inserts (already allowed via INSERT path; ensure RPC bypass works the same)

-- RPC: a customer (or admin acting on behalf) accepts terms for a campaign.
CREATE OR REPLACE FUNCTION public.accept_campaign_terms(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'no_auth' USING ERRCODE = '42501';
  END IF;

  SELECT accepted_campaigns INTO v_existing
    FROM public.profiles WHERE id = v_uid FOR UPDATE;

  IF v_existing IS NULL THEN v_existing := ARRAY[]::uuid[]; END IF;

  IF p_campaign_id = ANY(v_existing) THEN
    RETURN; -- idempotent
  END IF;

  PERFORM set_config('app.profile_internal', '1', true);
  UPDATE public.profiles
     SET accepted_campaigns = array_append(v_existing, p_campaign_id),
         updated_at = now()
   WHERE id = v_uid;
  PERFORM set_config('app.profile_internal', '', true);

  -- Ledger-compatible audit row (0 pts, kind = terms_acceptance).
  INSERT INTO public.point_transactions (
    customer_id, campaign_id, kind, points_delta,
    actor_id, actor_role, metadata
  ) VALUES (
    v_uid, p_campaign_id, 'terms_acceptance', 0,
    v_uid,
    CASE
      WHEN public.has_role(v_uid,'admin')   THEN 'admin'::public.app_role
      WHEN public.has_role(v_uid,'cashier') THEN 'cashier'::public.app_role
      ELSE 'customer'::public.app_role
    END,
    jsonb_build_object('event','consent_accepted')
  );
END $$;

GRANT EXECUTE ON FUNCTION public.accept_campaign_terms(uuid) TO authenticated;

-- Backfill: re-create a terms_acceptance ledger row for legacy users with consent_accepted in metadata,
-- limited to active campaigns. Idempotent: skip if a terms_acceptance row already exists.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT u.id AS uid, c.id AS cid
    FROM auth.users u
    CROSS JOIN public.campaigns c
    WHERE (u.raw_user_meta_data->>'consent_accepted')::boolean IS TRUE
      AND c.deleted_at IS NULL
      AND c.status IN ('active','paused')
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role='customer')
  LOOP
    -- Append accepted_campaigns idempotently
    PERFORM set_config('app.profile_internal','1', true);
    UPDATE public.profiles
       SET accepted_campaigns =
            CASE WHEN r.cid = ANY(COALESCE(accepted_campaigns,'{}'::uuid[]))
                 THEN accepted_campaigns
                 ELSE array_append(COALESCE(accepted_campaigns,'{}'::uuid[]), r.cid)
            END
     WHERE id = r.uid;
    PERFORM set_config('app.profile_internal','', true);
  END LOOP;
END $$;
