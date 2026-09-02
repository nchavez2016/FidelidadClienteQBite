-- ============================================================
-- GAVIOTA AZUL — SCHEMA PRODUCCIÓN
-- Generado desde gaviota-azul-dev (estado real de BD)
-- Aplicar en SQL Editor del proyecto nuevo de Supabase
-- Orden: extensiones → enums → tablas → índices →
--        funciones → triggers → RLS → cron → semilla
-- ============================================================

-- ============================================================
-- 0. EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- ============================================================
-- 1. ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','cashier','customer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.campaign_status AS ENUM ('draft','active','paused','finished');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.gender_type AS ENUM ('masculino','femenino','otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.redemption_status AS ENUM ('pending','approved','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tx_kind AS ENUM (
    'earn','bonus','redeem','manual_adjustment','reversal','terms_acceptance'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. TABLAS (orden por dependencias FK)
-- ============================================================

-- branches
CREATE TABLE IF NOT EXISTS public.branches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  legacy_campaign_id text,
  is_active     boolean NOT NULL DEFAULT true,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- profiles (depende de auth.users via id)
CREATE TABLE IF NOT EXISTS public.profiles (
  id                      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name            text NOT NULL DEFAULT '',
  phone                   text UNIQUE,
  gender                  public.gender_type,
  branch_id               uuid REFERENCES public.branches(id),
  is_active               boolean NOT NULL DEFAULT true,
  deleted_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  accepted_campaigns      uuid[] NOT NULL DEFAULT '{}',
  revoked_from_phone      text,
  legacy_id               text,
  email                   text,
  birthdate               date,
  phone_consent_granted   boolean NOT NULL DEFAULT false,
  phone_consent_at        timestamptz,
  phone_consent_source    text,
  phone_consent_actor_id  uuid
);

-- email unique index (case-insensitive, partial)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique
  ON public.profiles (lower(email)) WHERE email IS NOT NULL;

-- user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role    public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id           uuid NOT NULL REFERENCES public.branches(id),
  name                text NOT NULL,
  status              public.campaign_status NOT NULL DEFAULT 'draft',
  start_date          date NOT NULL,
  end_date            date NOT NULL,
  terms_and_conditions text NOT NULL DEFAULT '',
  legacy_id           text UNIQUE,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  milestones          jsonb NOT NULL DEFAULT '[]',
  bonus_rules         jsonb NOT NULL DEFAULT '[]',
  min_order_amount    numeric DEFAULT 5.00,
  points_description  text
);

-- customer_points
CREATE TABLE IF NOT EXISTS public.customer_points (
  customer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id     uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  points          integer NOT NULL DEFAULT 0,
  points_lifetime integer NOT NULL DEFAULT 0,
  last_tx_id      uuid,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, campaign_id)
);

-- point_transactions
CREATE TABLE IF NOT EXISTS public.point_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id     uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  branch_id       uuid REFERENCES public.branches(id),
  kind            public.tx_kind NOT NULL,
  points_delta    integer NOT NULL,
  balance_after   integer,
  reward_id       uuid,
  bonus_rule_id   uuid,
  bonus_multiplier numeric,
  reverses_tx_id  uuid UNIQUE,
  idempotency_key text,
  actor_id        uuid,
  actor_role      public.app_role,
  comment_category text,
  comment_text    text,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  effective_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pt_idempotency_uq
  ON public.point_transactions (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- point_transactions_archive (espejo sin trigger anti-mutación)
CREATE TABLE IF NOT EXISTS public.point_transactions_archive (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL,
  campaign_id     uuid NOT NULL,
  branch_id       uuid,
  kind            public.tx_kind NOT NULL,
  points_delta    integer NOT NULL,
  balance_after   integer,
  reward_id       uuid,
  bonus_rule_id   uuid,
  bonus_multiplier numeric,
  reverses_tx_id  uuid,
  idempotency_key text,
  actor_id        uuid,
  actor_role      public.app_role,
  comment_category text,
  comment_text    text,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  effective_at    timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz NOT NULL DEFAULT now()
);

-- redemption_requests
CREATE TABLE IF NOT EXISTS public.redemption_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id          uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  reward_id            text NOT NULL,
  reward_name_snapshot text NOT NULL,
  points_cost_snapshot integer NOT NULL,
  status               public.redemption_status NOT NULL DEFAULT 'pending',
  requested_at         timestamptz NOT NULL DEFAULT now(),
  resolved_by          uuid,
  resolved_at          timestamptz,
  notes                text,
  branch_id            uuid REFERENCES public.branches(id)
);

-- redemption_request_events
CREATE TABLE IF NOT EXISTS public.redemption_request_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES public.redemption_requests(id) ON DELETE CASCADE,
  event_type    text NOT NULL,
  actor_user_id uuid,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- admin_audit_log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid,
  actor_role  public.app_role NOT NULL,
  action      text NOT NULL,
  target_type text,
  target_id   uuid,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. ÍNDICES ADICIONALES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_branches_active
  ON public.branches (is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_campaigns_branch
  ON public.campaigns (branch_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status
  ON public.campaigns (status);

CREATE INDEX IF NOT EXISTS idx_customer_points_campaign
  ON public.customer_points (campaign_id);

CREATE INDEX IF NOT EXISTS pt_customer_created_idx
  ON public.point_transactions (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pt_campaign_created_idx
  ON public.point_transactions (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pt_branch_created_idx
  ON public.point_transactions (branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pta_customer_idx
  ON public.point_transactions_archive (customer_id);
CREATE INDEX IF NOT EXISTS pta_campaign_idx
  ON public.point_transactions_archive (campaign_id);
CREATE INDEX IF NOT EXISTS pta_created_at_idx
  ON public.point_transactions_archive (created_at);

CREATE INDEX IF NOT EXISTS idx_profiles_phone
  ON public.profiles (phone);
CREATE INDEX IF NOT EXISTS idx_profiles_active
  ON public.profiles (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_profiles_legacy_id
  ON public.profiles (legacy_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_request_per_campaign
  ON public.redemption_requests (customer_id, campaign_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_redemption_requests_customer
  ON public.redemption_requests (customer_id);
CREATE INDEX IF NOT EXISTS idx_redemption_requests_status
  ON public.redemption_requests (status);
CREATE INDEX IF NOT EXISTS idx_redemption_requests_requested_at
  ON public.redemption_requests (requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemp_req_campaign
  ON public.redemption_requests (campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_redemption_request_events_request
  ON public.redemption_request_events (request_id);
CREATE INDEX IF NOT EXISTS idx_redemption_request_events_created
  ON public.redemption_request_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at
  ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor
  ON public.admin_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action
  ON public.admin_audit_log (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_roles_user
  ON public.user_roles (user_id);

-- ============================================================
-- 4. FUNCIONES UTILITARIAS
-- ============================================================

-- has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- log_system_action
CREATE OR REPLACE FUNCTION public.log_system_action(
  p_action      text,
  p_target_type text DEFAULT NULL,
  p_target_id   uuid DEFAULT NULL,
  p_metadata    jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.admin_audit_log
    (actor_id, actor_role, action, target_type, target_id, metadata)
  VALUES
    (NULL, 'admin', p_action, p_target_type, p_target_id,
     COALESCE(p_metadata, '{}'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- log_admin_action
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action      text,
  p_target_type text DEFAULT NULL,
  p_target_id   uuid DEFAULT NULL,
  p_metadata    jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
  v_id   uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no_auth' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(auth.uid(), 'admin') THEN v_role := 'admin';
  ELSIF public.has_role(auth.uid(), 'cashier') THEN v_role := 'cashier';
  ELSE RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR length(trim(p_action)) = 0 THEN
    RAISE EXCEPTION 'action_required';
  END IF;
  IF pg_column_size(COALESCE(p_metadata, '{}')) > 16384 THEN
    RAISE EXCEPTION 'metadata_too_large';
  END IF;
  INSERT INTO public.admin_audit_log
    (actor_id, actor_role, action, target_type, target_id, metadata)
  VALUES
    (auth.uid(), v_role, p_action, p_target_type, p_target_id,
     COALESCE(p_metadata, '{}'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- get_actor_display_names
CREATE OR REPLACE FUNCTION public.get_actor_display_names(p_ids uuid[])
RETURNS TABLE(id uuid, display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.display_name
  FROM public.profiles p
  WHERE p.id = ANY(p_ids);
$$;

-- ============================================================
-- 5. FUNCIONES DE NEGOCIO (SECURITY DEFINER)
-- ============================================================

-- handle_new_user (trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  v_audience text; v_phone text; v_gender_raw text; v_gender public.gender_type;
  v_display text; v_email text; v_birthdate_raw text; v_birthdate date;
  v_consent boolean; v_consent_source text; v_consent_actor uuid;
  v_err text;
BEGIN
  v_audience := COALESCE(NULLIF(NEW.raw_user_meta_data->>'audience',''),'customer');
  IF v_audience='customer' THEN
    v_phone := COALESCE(NULLIF(NEW.raw_user_meta_data->>'identifier',''),
                        NULLIF(NEW.raw_user_meta_data->>'phone',''), NEW.phone);
  ELSE
    v_phone := COALESCE(NULLIF(NEW.raw_user_meta_data->>'phone',''), NEW.phone);
  END IF;
  v_gender_raw := NULLIF(NEW.raw_user_meta_data->>'gender','');
  IF v_gender_raw IN ('masculino','femenino','otro') THEN
    v_gender := v_gender_raw::public.gender_type;
  ELSE v_gender := NULL; END IF;
  v_display := COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name',''),'');
  v_email   := NULLIF(NEW.raw_user_meta_data->>'contact_email','');
  v_birthdate_raw := NULLIF(NEW.raw_user_meta_data->>'birthdate','');
  IF v_birthdate_raw IS NOT NULL THEN
    BEGIN v_birthdate := v_birthdate_raw::date;
    EXCEPTION WHEN OTHERS THEN v_birthdate := NULL; END;
  END IF;
  v_consent := COALESCE((NEW.raw_user_meta_data->>'phone_consent_granted')::boolean, false);
  v_consent_source := NULLIF(NEW.raw_user_meta_data->>'phone_consent_source','');
  BEGIN
    v_consent_actor := NULLIF(NEW.raw_user_meta_data->>'phone_consent_actor_id','')::uuid;
  EXCEPTION WHEN OTHERS THEN v_consent_actor := NULL; END;

  BEGIN
    INSERT INTO public.profiles (
      id, display_name, phone, gender, email, birthdate,
      phone_consent_granted, phone_consent_at, phone_consent_source, phone_consent_actor_id
    ) VALUES (
      NEW.id, v_display, v_phone, v_gender, v_email, v_birthdate,
      v_consent, CASE WHEN v_consent THEN now() ELSE NULL END,
      v_consent_source, v_consent_actor
    );
  EXCEPTION WHEN unique_violation THEN
    v_err := SQLERRM;
    IF v_err ILIKE '%profiles_email_unique%' OR v_err ILIKE '%lower(email)%' THEN
      RAISE WARNING '[handle_new_user] email collision id=% email=% — retry with email=NULL', NEW.id, v_email;
      INSERT INTO public.profiles (
        id, display_name, phone, gender, email, birthdate,
        phone_consent_granted, phone_consent_at, phone_consent_source, phone_consent_actor_id
      ) VALUES (
        NEW.id, v_display, v_phone, v_gender, NULL, v_birthdate,
        v_consent, CASE WHEN v_consent THEN now() ELSE NULL END,
        v_consent_source, v_consent_actor
      );
    ELSIF v_err ILIKE '%profiles_phone_key%' OR v_err ILIKE '%idx_profiles_phone%'
       OR v_err ILIKE '%(phone)%' THEN
      RAISE WARNING '[handle_new_user] phone collision id=% phone=% — retry with phone=NULL', NEW.id, v_phone;
      INSERT INTO public.profiles (
        id, display_name, phone, gender, email, birthdate,
        phone_consent_granted, phone_consent_at, phone_consent_source, phone_consent_actor_id
      ) VALUES (
        NEW.id, v_display, NULL, v_gender, v_email, v_birthdate,
        v_consent, CASE WHEN v_consent THEN now() ELSE NULL END,
        v_consent_source, v_consent_actor
      );
    ELSIF v_err ILIKE '%profiles_pkey%' THEN
      RAISE WARNING '[handle_new_user] profile already exists id=% — merging non-null fields', NEW.id;
      PERFORM set_config('app.profile_internal','1',true);
      UPDATE public.profiles SET
        display_name           = COALESCE(NULLIF(v_display,''), display_name),
        phone                  = COALESCE(v_phone, phone),
        gender                 = COALESCE(v_gender, gender),
        email                  = COALESCE(v_email, email),
        birthdate              = COALESCE(v_birthdate, birthdate),
        phone_consent_granted  = CASE WHEN v_consent THEN true ELSE phone_consent_granted END,
        phone_consent_at       = CASE WHEN v_consent AND phone_consent_at IS NULL THEN now()
                                      ELSE phone_consent_at END,
        phone_consent_source   = COALESCE(v_consent_source, phone_consent_source),
        phone_consent_actor_id = COALESCE(v_consent_actor, phone_consent_actor_id),
        updated_at             = now()
      WHERE id = NEW.id;
      PERFORM set_config('app.profile_internal','',true);
    ELSE RAISE;
    END IF;
  WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] profile INSERT failed id=% SQLSTATE=% SQLERRM=%',
      NEW.id, SQLSTATE, SQLERRM;
    RAISE;
  END;

  IF v_audience='customer' THEN
    BEGIN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id,'customer')
      ON CONFLICT (user_id, role) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[handle_new_user] user_roles INSERT failed id=% SQLSTATE=% SQLERRM=%',
        NEW.id, SQLSTATE, SQLERRM;
      RAISE;
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- point_transactions_no_mutation
CREATE OR REPLACE FUNCTION public.point_transactions_no_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public' AS $$
BEGIN
  IF current_setting('app.pt_internal', true) = '1' THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'point_transactions is append-only';
END;
$$;

-- apply_point_transaction
CREATE OR REPLACE FUNCTION public.apply_point_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE new_balance integer;
BEGIN
  INSERT INTO public.customer_points
    (customer_id, campaign_id, points, points_lifetime, last_tx_id, updated_at)
  VALUES
    (NEW.customer_id, NEW.campaign_id, NEW.points_delta,
     GREATEST(NEW.points_delta, 0), NEW.id, now())
  ON CONFLICT (customer_id, campaign_id) DO UPDATE SET
    points          = public.customer_points.points + NEW.points_delta,
    points_lifetime = public.customer_points.points_lifetime + GREATEST(NEW.points_delta, 0),
    last_tx_id      = NEW.id,
    updated_at      = now()
  RETURNING points INTO new_balance;
  PERFORM set_config('app.pt_internal', '1', true);
  UPDATE public.point_transactions SET balance_after = new_balance WHERE id = NEW.id;
  PERFORM set_config('app.pt_internal', '', true);
  RETURN NEW;
END;
$$;

-- profiles_guard_privileged_fields
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF current_setting('app.profile_internal', true) = '1' THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF NEW.accepted_campaigns  IS DISTINCT FROM OLD.accepted_campaigns
  OR NEW.branch_id           IS DISTINCT FROM OLD.branch_id
  OR NEW.is_active           IS DISTINCT FROM OLD.is_active
  OR NEW.legacy_id           IS DISTINCT FROM OLD.legacy_id
  OR NEW.revoked_from_phone  IS DISTINCT FROM OLD.revoked_from_phone
  OR NEW.deleted_at          IS DISTINCT FROM OLD.deleted_at
  OR NEW.phone               IS DISTINCT FROM OLD.phone THEN
    RAISE EXCEPTION 'forbidden_field_update' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- user_roles_anti_self_elevation
CREATE OR REPLACE FUNCTION public.user_roles_anti_self_elevation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.role = 'admin' AND NEW.user_id = auth.uid() THEN
    RAISE EXCEPTION 'forbidden_self_admin_grant' USING ERRCODE = '42501';
  END IF;
  IF NEW.role = 'admin' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden_admin_grant_requires_admin' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- earn_points
CREATE OR REPLACE FUNCTION public.earn_points(
  p_customer_id     uuid,
  p_campaign_id     uuid,
  p_branch_id       uuid DEFAULT NULL,
  p_bonus_multiplier numeric DEFAULT NULL,
  p_bonus_rule_id   uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_comment_category text DEFAULT NULL,
  p_comment_text    text DEFAULT NULL
)
RETURNS public.point_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing public.point_transactions;
  v_row      public.point_transactions;
  v_delta    integer;
  v_kind     public.tx_kind;
  v_last_at  timestamptz;
  v_cooldown interval := interval '60 seconds';
BEGIN
  IF NOT (public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.point_transactions
    WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN RETURN v_existing; END IF;
  END IF;
  SELECT MAX(created_at) INTO v_last_at
  FROM public.point_transactions
  WHERE customer_id = p_customer_id AND campaign_id = p_campaign_id
    AND kind IN ('earn','bonus');
  IF v_last_at IS NOT NULL AND (now() - v_last_at) < v_cooldown THEN
    RAISE EXCEPTION 'cooldown_active: last_at=%, cooldown=%', v_last_at, v_cooldown
      USING ERRCODE = '22023';
  END IF;
  IF p_bonus_multiplier IS NOT NULL AND p_bonus_multiplier > 1 THEN
    v_delta := floor(p_bonus_multiplier)::int; v_kind := 'bonus';
  ELSE
    v_delta := 1; v_kind := 'earn';
  END IF;
  INSERT INTO public.point_transactions (
    customer_id, campaign_id, branch_id, kind, points_delta,
    bonus_rule_id, bonus_multiplier, idempotency_key,
    actor_id, actor_role, comment_category, comment_text
  ) VALUES (
    p_customer_id, p_campaign_id, p_branch_id, v_kind, v_delta,
    p_bonus_rule_id, p_bonus_multiplier, p_idempotency_key,
    auth.uid(),
    CASE WHEN public.has_role(auth.uid(),'admin') THEN 'admin'::public.app_role
         ELSE 'cashier'::public.app_role END,
    p_comment_category, p_comment_text
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- redeem_reward
CREATE OR REPLACE FUNCTION public.redeem_reward(
  p_customer_id    uuid,
  p_campaign_id    uuid,
  p_reward_id      uuid,
  p_reward_name    text,
  p_required_points integer,
  p_branch_id      uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.point_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing public.point_transactions;
  v_row      public.point_transactions;
  v_balance  integer;
BEGIN
  IF NOT (has_role(auth.uid(),'cashier') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_required_points <= 0 THEN
    RAISE EXCEPTION 'required_points must be positive';
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.point_transactions
    WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN RETURN v_existing; END IF;
  END IF;
  SELECT points INTO v_balance FROM public.customer_points
  WHERE customer_id = p_customer_id AND campaign_id = p_campaign_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_required_points THEN
    RAISE EXCEPTION 'insufficient_points: have=%, need=%', COALESCE(v_balance,0), p_required_points;
  END IF;
  INSERT INTO public.point_transactions (
    customer_id, campaign_id, branch_id, kind, points_delta,
    reward_id, idempotency_key, actor_id, actor_role, metadata
  ) VALUES (
    p_customer_id, p_campaign_id, p_branch_id, 'redeem', -p_required_points,
    p_reward_id, p_idempotency_key, auth.uid(),
    CASE WHEN has_role(auth.uid(),'admin') THEN 'admin'::public.app_role
         ELSE 'cashier'::public.app_role END,
    jsonb_build_object('reward_name', p_reward_name)
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- reverse_transaction
CREATE OR REPLACE FUNCTION public.reverse_transaction(
  p_tx_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS public.point_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_orig public.point_transactions;
  v_row  public.point_transactions;
BEGIN
  IF NOT (has_role(auth.uid(),'cashier') OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_orig FROM public.point_transactions WHERE id = p_tx_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'tx_not_found'; END IF;
  IF v_orig.kind = 'reversal' THEN RAISE EXCEPTION 'cannot_reverse_reversal'; END IF;
  INSERT INTO public.point_transactions (
    customer_id, campaign_id, branch_id, kind, points_delta,
    reverses_tx_id, actor_id, actor_role, metadata
  ) VALUES (
    v_orig.customer_id, v_orig.campaign_id, v_orig.branch_id, 'reversal',
    -v_orig.points_delta, v_orig.id, auth.uid(),
    CASE WHEN has_role(auth.uid(),'admin') THEN 'admin'::public.app_role
         ELSE 'cashier'::public.app_role END,
    jsonb_build_object('reason', p_reason)
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- adjust_points
CREATE OR REPLACE FUNCTION public.adjust_points(
  p_customer_id uuid,
  p_campaign_id uuid,
  p_delta       integer,
  p_reason      text DEFAULT NULL
)
RETURNS public.point_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.point_transactions;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_delta = 0 THEN RAISE EXCEPTION 'delta_required'; END IF;
  INSERT INTO public.point_transactions (
    customer_id, campaign_id, kind, points_delta, actor_id, actor_role, metadata
  ) VALUES (
    p_customer_id, p_campaign_id, 'manual_adjustment', p_delta,
    auth.uid(), 'admin', jsonb_build_object('reason', p_reason)
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- reset_customer_points
CREATE OR REPLACE FUNCTION public.reset_customer_points(
  p_customer_id uuid,
  p_campaign_id uuid,
  p_reason      text DEFAULT NULL,
  OUT tx_id     uuid,
  OUT new_balance integer
)
RETURNS SETOF record
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance integer;
  v_row     public.point_transactions;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT points INTO v_balance FROM public.customer_points
  WHERE customer_id = p_customer_id AND campaign_id = p_campaign_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance = 0 THEN
    tx_id := NULL; new_balance := COALESCE(v_balance, 0);
    RETURN NEXT; RETURN;
  END IF;
  INSERT INTO public.point_transactions (
    customer_id, campaign_id, kind, points_delta, actor_id, actor_role, metadata
  ) VALUES (
    p_customer_id, p_campaign_id, 'manual_adjustment', -v_balance,
    auth.uid(), 'admin',
    jsonb_build_object('reason', p_reason, 'op', 'reset_customer_points')
  ) RETURNING * INTO v_row;
  tx_id := v_row.id; new_balance := v_row.balance_after;
  RETURN NEXT;
END;
$$;

-- accept_campaign_terms
CREATE OR REPLACE FUNCTION public.accept_campaign_terms(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_existing uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no_auth' USING ERRCODE = '42501'; END IF;
  SELECT accepted_campaigns INTO v_existing FROM public.profiles
  WHERE id = v_uid FOR UPDATE;
  IF v_existing IS NULL THEN v_existing := ARRAY[]::uuid[]; END IF;
  IF p_campaign_id = ANY(v_existing) THEN RETURN; END IF;
  PERFORM set_config('app.profile_internal','1',true);
  UPDATE public.profiles
  SET accepted_campaigns = array_append(v_existing, p_campaign_id), updated_at = now()
  WHERE id = v_uid;
  PERFORM set_config('app.profile_internal','',true);
  INSERT INTO public.point_transactions (
    customer_id, campaign_id, kind, points_delta, actor_id, actor_role, metadata
  ) VALUES (
    v_uid, p_campaign_id, 'terms_acceptance', 0, v_uid,
    CASE WHEN public.has_role(v_uid,'admin') THEN 'admin'::public.app_role
         WHEN public.has_role(v_uid,'cashier') THEN 'cashier'::public.app_role
         ELSE 'customer'::public.app_role END,
    jsonb_build_object('event','consent_accepted')
  );
END;
$$;

-- approve_redemption_request
CREATE OR REPLACE FUNCTION public.approve_redemption_request(
  p_request_id       uuid,
  p_staff_id         uuid,
  p_branch_id        uuid DEFAULT NULL,
  p_notes            text DEFAULT NULL,
  p_comment_category text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req       RECORD;
  v_user_role TEXT;
  v_can       BOOLEAN := FALSE;
BEGIN
  SELECT role INTO v_user_role FROM public.user_roles
  WHERE user_id = auth.uid() LIMIT 1;
  IF v_user_role IN ('cashier','admin') THEN v_can := TRUE; END IF;
  IF NOT v_can THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_req FROM public.redemption_requests
  WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already processed' USING ERRCODE = '42501';
  END IF;
  PERFORM public.redeem_reward(
    v_req.customer_id, v_req.campaign_id, v_req.reward_id::uuid,
    v_req.reward_name_snapshot, v_req.points_cost_snapshot,
    p_branch_id, gen_random_uuid()::TEXT
  );
  UPDATE public.redemption_requests
  SET status = 'approved', resolved_by = p_staff_id,
      notes = p_notes, resolved_at = now()
  WHERE id = p_request_id;
  INSERT INTO public.redemption_request_events
    (request_id, event_type, actor_user_id, notes, created_at)
  VALUES (p_request_id, 'approved', p_staff_id, p_notes, now());
  IF v_user_role = 'admin' THEN
    PERFORM public.log_admin_action(
      p_action      => 'approve_redemption_request',
      p_target_type => 'redemption_request',
      p_target_id   => p_request_id,
      p_metadata    => jsonb_build_object(
        'customer_id', v_req.customer_id, 'campaign_id', v_req.campaign_id,
        'reward_id', v_req.reward_id, 'points_cost', v_req.points_cost_snapshot,
        'branch_id', p_branch_id, 'notes', p_notes,
        'comment_category', p_comment_category
      )
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  IF v_user_role = 'admin' THEN
    PERFORM public.log_admin_action(
      p_action      => 'approve_redemption_request_error',
      p_target_type => 'redemption_request',
      p_target_id   => p_request_id,
      p_metadata    => jsonb_build_object('error_message', SQLERRM, 'sql_state', SQLSTATE)
    );
  END IF;
  RAISE;
END;
$$;

-- ============================================================
-- 6. FUNCIONES DE RETENCIÓN Y ARCHIVO
-- ============================================================

-- archive_point_transactions
CREATE OR REPLACE FUNCTION public.archive_point_transactions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    FROM moved RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;
  PERFORM set_config('app.pt_internal','',true);
  PERFORM public.log_system_action('archive_point_transactions','point_transactions',NULL,
    jsonb_build_object('rows_archived',v_count,'threshold','12 months'));
  RETURN v_count;
END;
$$;

-- purge_archived_point_transactions
CREATE OR REPLACE FUNCTION public.purge_archived_point_transactions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  WITH inactive AS (
    SELECT pta.customer_id FROM public.point_transactions_archive pta
    GROUP BY pta.customer_id
    HAVING max(pta.created_at) < now() - interval '18 months'
      AND NOT EXISTS (
        SELECT 1 FROM public.point_transactions pt WHERE pt.customer_id = pta.customer_id
      )
  ),
  deleted AS (
    DELETE FROM public.point_transactions_archive
    WHERE customer_id IN (SELECT customer_id FROM inactive)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM deleted;
  PERFORM public.log_system_action('purge_archived_point_transactions',
    'point_transactions_archive', NULL,
    jsonb_build_object('rows_purged', v_count, 'inactivity_threshold','18 months'));
  RETURN v_count;
END;
$$;

-- purge_old_admin_audit_log
CREATE OR REPLACE FUNCTION public.purge_old_admin_audit_log()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.admin_audit_log
    WHERE created_at < now() - interval '6 months' RETURNING 1
  )
  SELECT count(*) INTO v_count FROM deleted;
  PERFORM public.log_system_action('purge_admin_audit_log','admin_audit_log',NULL,
    jsonb_build_object('rows_deleted',v_count,'retention','6 months'));
  RETURN v_count;
END;
$$;

-- purge_old_redemption_request_events
CREATE OR REPLACE FUNCTION public.purge_old_redemption_request_events()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.redemption_request_events
    WHERE created_at < now() - interval '6 months' RETURNING 1
  )
  SELECT count(*) INTO v_count FROM deleted;
  PERFORM public.log_system_action('purge_redemption_request_events',
    'redemption_request_events',NULL,
    jsonb_build_object('rows_deleted',v_count,'retention','6 months'));
  RETURN v_count;
END;
$$;

-- ============================================================
-- 7. TRIGGERS
-- ============================================================

-- on auth.users → handle_new_user
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at en branches y campaigns
CREATE OR REPLACE TRIGGER set_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- anti-mutación en point_transactions
CREATE OR REPLACE TRIGGER point_transactions_no_mutation
  BEFORE UPDATE OR DELETE ON public.point_transactions
  FOR EACH ROW EXECUTE FUNCTION public.point_transactions_no_mutation();

-- apply balance después de insert en point_transactions
CREATE OR REPLACE TRIGGER apply_point_transaction_trigger
  AFTER INSERT ON public.point_transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_point_transaction();

-- guard de campos privilegiados en profiles
CREATE OR REPLACE TRIGGER profiles_guard_privileged_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileged_fields();

-- anti self-elevation en user_roles
CREATE OR REPLACE TRIGGER user_roles_anti_self_elevation
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.user_roles_anti_self_elevation();

-- ============================================================
-- 8. RLS — HABILITAR EN TODAS LAS TABLAS
-- ============================================================
ALTER TABLE public.branches                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_points           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_transactions_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemption_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemption_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log           ENABLE ROW LEVEL SECURITY;

-- GRANTS service_role (necesario para Edge Functions)
GRANT ALL ON public.branches                   TO service_role;
GRANT ALL ON public.profiles                   TO service_role;
GRANT ALL ON public.user_roles                 TO service_role;
GRANT ALL ON public.campaigns                  TO service_role;
GRANT ALL ON public.customer_points            TO service_role;
GRANT ALL ON public.point_transactions         TO service_role;
GRANT ALL ON public.point_transactions_archive TO service_role;
GRANT ALL ON public.redemption_requests        TO service_role;
GRANT ALL ON public.redemption_request_events  TO service_role;
GRANT ALL ON public.admin_audit_log            TO service_role;

GRANT SELECT ON public.branches    TO anon, authenticated;
GRANT SELECT ON public.campaigns   TO anon, authenticated;

-- ============================================================
-- 9. POLÍTICAS RLS
-- ============================================================

-- branches
CREATE POLICY branches_select_public ON public.branches
  FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);
CREATE POLICY branches_admin_manage ON public.branches
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

-- profiles
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY profiles_select_admin ON public.profiles
  FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY profiles_select_staff ON public.profiles
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'cashier') AND has_role(id,'customer'));
CREATE POLICY profiles_insert_admin ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

-- user_roles
CREATE POLICY user_roles_select_own ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_roles_select_admin ON public.user_roles
  FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY user_roles_admin_manage ON public.user_roles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

-- campaigns
CREATE POLICY campaigns_select_public_active ON public.campaigns
  FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL AND status IN ('active','paused','finished'));
CREATE POLICY campaigns_select_staff ON public.campaigns
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'cashier'));
CREATE POLICY campaigns_admin_manage ON public.campaigns
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

-- customer_points
CREATE POLICY customer_points_select_own ON public.customer_points
  FOR SELECT TO authenticated USING (auth.uid() = customer_id);
CREATE POLICY customer_points_select_staff ON public.customer_points
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'cashier') OR has_role(auth.uid(),'admin'));

-- point_transactions
CREATE POLICY pt_select_own ON public.point_transactions
  FOR SELECT TO authenticated USING (auth.uid() = customer_id);
CREATE POLICY pt_select_staff ON public.point_transactions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'cashier') OR has_role(auth.uid(),'admin'));

-- point_transactions_archive
CREATE POLICY pta_customer_select_own ON public.point_transactions_archive
  FOR SELECT TO authenticated USING (customer_id = auth.uid());
CREATE POLICY pta_admin_select ON public.point_transactions_archive
  FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));

-- redemption_requests
CREATE POLICY redemp_req_insert_own ON public.redemption_requests
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid() AND status = 'pending');
CREATE POLICY redemp_req_select_own ON public.redemption_requests
  FOR SELECT TO authenticated USING (customer_id = auth.uid());
CREATE POLICY redemp_req_select_staff ON public.redemption_requests
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'cashier') OR has_role(auth.uid(),'admin'));
CREATE POLICY redemp_req_update_own ON public.redemption_requests
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid() AND status = 'pending')
  WITH CHECK (customer_id = auth.uid() AND status = 'cancelled');
CREATE POLICY redemp_req_update_staff ON public.redemption_requests
  FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(),'cashier') OR has_role(auth.uid(),'admin'))
         AND status = 'pending')
  WITH CHECK ((has_role(auth.uid(),'cashier') OR has_role(auth.uid(),'admin'))
              AND status IN ('approved','rejected'));

-- redemption_request_events
CREATE POLICY rre_select_own ON public.redemption_request_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.redemption_requests r
    WHERE r.id = request_id AND r.customer_id = auth.uid()
  ));
CREATE POLICY rre_select_staff ON public.redemption_request_events
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'cashier') OR has_role(auth.uid(),'admin'));
CREATE POLICY rre_insert_own_customer ON public.redemption_request_events
  FOR INSERT TO authenticated
  WITH CHECK (
    event_type IN ('created','cancelled') AND
    EXISTS (
      SELECT 1 FROM public.redemption_requests r
      WHERE r.id = request_id AND r.customer_id = auth.uid()
    )
  );
CREATE POLICY insert_events_staff_only ON public.redemption_request_events
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin','cashier')
  ));

-- admin_audit_log
CREATE POLICY audit_log_admin_only ON public.admin_audit_log
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ));
CREATE POLICY admin_audit_select_admin ON public.admin_audit_log
  FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));

-- ============================================================
-- 10. JOBS PG_CRON
-- ============================================================
DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'sdd_purge_admin_audit_log',
    'sdd_purge_redemption_events',
    'sdd_archive_point_transactions',
    'sdd_purge_archived_point_transactions'
  ] LOOP
    BEGIN
      PERFORM cron.unschedule(j);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

SELECT cron.schedule('sdd_purge_admin_audit_log',
  '0 3 1 * *',
  $$SELECT public.purge_old_admin_audit_log();$$);

SELECT cron.schedule('sdd_purge_redemption_events',
  '15 3 1 * *',
  $$SELECT public.purge_old_redemption_request_events();$$);

SELECT cron.schedule('sdd_archive_point_transactions',
  '0 4 2 * *',
  $$SELECT public.archive_point_transactions();$$);

SELECT cron.schedule('sdd_purge_archived_point_transactions',
  '30 4 2 * *',
  $$SELECT public.purge_archived_point_transactions();$$);

-- ============================================================
-- 11. DATOS SEMILLA — SUCURSALES REALES
-- ============================================================
INSERT INTO public.branches (id, name, is_active, created_at, updated_at)
VALUES
  ('c083afc4-21c5-4cb0-a3e7-d91f518baf6d', 'Gaviota Azul - Express', true, now(), now()),
  ('090d2649-9419-4860-9a2e-53fcf96e1e41', 'Gaviota Azul - Matriz',  true, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- FIN DEL SCRIPT
-- Siguiente paso: crear el usuario admin en Authentication >
-- Users y ejecutar el onboarding de staff desde el panel.
-- ============================================================
-- =====================Fecha 31/082026 6:61 pm=======================================
-- GRANTS FALTANTES — corrige el mismo bug de la sección 7
-- Aplicar en el proyecto QBite antes de cualquier prueba real
-- ============================================================

-- Tablas: GRANT base a authenticated (RLS filtra las filas después)
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT INSERT ON public.profiles TO authenticated; -- cubre profiles_insert_admin

GRANT SELECT ON public.user_roles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated; -- cubre user_roles_admin_manage

GRANT SELECT ON public.customer_points TO authenticated;

GRANT SELECT ON public.point_transactions TO authenticated;
GRANT SELECT ON public.point_transactions_archive TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.redemption_requests TO authenticated;
GRANT SELECT, INSERT ON public.redemption_request_events TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_audit_log TO authenticated;

-- Funciones RPC de negocio: sin esto, 403 en earn/redeem/reverse/etc.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_actor_display_names(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, uuid, jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.earn_points(
  uuid, uuid, uuid, numeric, uuid, text, text, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.redeem_reward(
  uuid, uuid, uuid, text, integer, uuid, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.reverse_transaction(uuid, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.adjust_points(uuid, uuid, integer, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.reset_customer_points(uuid, uuid, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.accept_campaign_terms(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.approve_redemption_request(
  uuid, uuid, uuid, text, text) TO authenticated;

-- =====================Fecha 02/092026=======================================
-- REALTIME — sin esto, los cambios de puntos no se reflejan en vivo en el cliente
-- Aplicar en el proyecto QBite antes de cualquier prueba real
-- ============================================================

-- Realtime: sin esto, los cambios de puntos no se reflejan en vivo en el cliente
ALTER PUBLICATION supabase_realtime ADD TABLE public.point_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_points;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_audit_log;

-- ============================================================
-- MÓDULO DE CUMPLEAÑOS — Fecha: 02/09/2026
-- Tablas birthday_config y birthday_grants, RLS, y las funciones
-- get_birthday_status(), grant_birthday_reward() y
-- get_birthday_grants_this_year() (listado de entregas del año, staff-only).
-- ============================================================

-- ============================================================
-- 1. TABLA: birthday_config (fila única)
-- ============================================================
CREATE TABLE public.birthday_config (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  CONSTRAINT birthday_config_singleton CHECK (id),
  is_active BOOLEAN NOT NULL DEFAULT false,
  -- Texto visible al cliente en el banner (ej. "🎂 Postre de cortesía en tu mes de cumpleaños")
  reward_description TEXT NOT NULL DEFAULT '',
  -- Texto solo para staff (instrucciones internas de entrega, no se expone al cliente)
  reward_message TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.birthday_config IS 'Configuración global del premio de cumpleaños. Fila única (id=true forzado por CHECK).';

-- Fila inicial. is_active=false a propósito: el programa arranca
-- apagado hasta que un admin lo active desde la pantalla de config.
INSERT INTO public.birthday_config (id, is_active, reward_description, reward_message)
VALUES (
  true,
  false,
  'Postre de cortesía en tu mes de cumpleaños 🎂',
  'Verificar identidad antes de entregar. Válido una sola vez por año, durante el mes de cumpleaños del cliente.'
)
ON CONFLICT (id) DO NOTHING;

-- Auto-completa updated_at/updated_by en cada UPDATE (no confiar en lo que mande el cliente)
CREATE OR REPLACE FUNCTION public.set_birthday_config_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER set_birthday_config_audit
  BEFORE UPDATE ON public.birthday_config
  FOR EACH ROW EXECUTE FUNCTION public.set_birthday_config_audit();


-- ============================================================
-- 2. TABLA: birthday_grants (registro de entregas, anti-fraude)
-- ============================================================
CREATE TABLE public.birthday_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Año calendario en que se entregó (no el año de nacimiento) — la
  -- combinación con user_id es lo que impide entregar 2 veces el mismo año.
  birthday_year INTEGER NOT NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  granted_by UUID NOT NULL REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT birthday_grants_unique_year UNIQUE (user_id, birthday_year)
);

COMMENT ON TABLE public.birthday_grants IS 'Historial de entregas del premio de cumpleaños. Sin acceso directo vía API — solo a través de get_birthday_status()/grant_birthday_reward().';

CREATE INDEX idx_birthday_grants_user ON public.birthday_grants(user_id);


-- ============================================================
-- 3. RLS
-- ============================================================
ALTER TABLE public.birthday_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.birthday_grants ENABLE ROW LEVEL SECURITY;

-- birthday_config: SELECT solo staff (admin/cashier) — reward_message es
-- texto interno, no debe ser legible por clientes vía acceso directo a la
-- tabla. UPDATE solo admin.
CREATE POLICY birthday_config_select_staff
  ON public.birthday_config FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cashier'));

CREATE POLICY birthday_config_admin_update
  ON public.birthday_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- birthday_grants: sin policies == sin acceso directo desde el cliente.
-- Las funciones SECURITY DEFINER de abajo corren como dueño de la tabla
-- y sí pueden leer/escribir; PostgREST directo, no.


-- ============================================================
-- 4. FUNCIÓN: get_birthday_status(p_customer_id)
--    Llamable por el propio cliente (sobre sí mismo) o por staff.
--    Devuelve únicamente reward_description (texto público) — nunca
--    reward_message.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_birthday_status(p_customer_id uuid)
RETURNS TABLE (
  is_program_active boolean,
  is_birthday_month boolean,
  is_birthday_today boolean,
  reward_description text,
  already_granted boolean,
  granted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_birthdate date;
  v_config RECORD;
  v_grant RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no_auth' USING ERRCODE = '42501';
  END IF;

  -- Solo el propio cliente o staff (admin/cashier) pueden consultar este
  -- estado — evita que cualquier usuario autenticado consulte el
  -- cumpleaños/estado de premio de un tercero.
  IF NOT (
    auth.uid() = p_customer_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'cashier')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT birthdate INTO v_birthdate
  FROM public.profiles
  WHERE id = p_customer_id
    AND is_active IS DISTINCT FROM false
    AND deleted_at IS NULL;

  IF v_birthdate IS NULL THEN
    RETURN QUERY SELECT false, false, false, ''::text, false, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT * INTO v_config FROM public.birthday_config WHERE id = true;

  SELECT * INTO v_grant
  FROM public.birthday_grants
  WHERE user_id = p_customer_id
    AND birthday_year = EXTRACT(YEAR FROM now())::int
  LIMIT 1;

  RETURN QUERY SELECT
    COALESCE(v_config.is_active, false),
    (EXTRACT(MONTH FROM v_birthdate) = EXTRACT(MONTH FROM now())),
    (EXTRACT(MONTH FROM v_birthdate) = EXTRACT(MONTH FROM now())
       AND EXTRACT(DAY FROM v_birthdate) = EXTRACT(DAY FROM now())),
    COALESCE(v_config.reward_description, ''),
    (v_grant.id IS NOT NULL),
    v_grant.created_at;
END;
$function$;


-- ============================================================
-- 5. FUNCIÓN: grant_birthday_reward(p_customer_id, p_notes)
--    Solo staff (admin/cashier). Idempotente por año vía UNIQUE.
-- ============================================================
CREATE OR REPLACE FUNCTION public.grant_birthday_reward(p_customer_id uuid, p_notes text DEFAULT NULL)
RETURNS public.birthday_grants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_birthdate date;
  v_config RECORD;
  v_caller_branch uuid;
  v_current_year int := EXTRACT(YEAR FROM now())::int;
  v_grant public.birthday_grants;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no_auth' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cashier')) THEN
    RAISE EXCEPTION 'forbidden_staff_only' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(p_customer_id, 'customer') THEN
    RAISE EXCEPTION 'target_not_customer' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE: bloquea la fila del cliente durante la transacción para
  -- reducir la ventana de una doble entrega concurrente (el UNIQUE de
  -- birthday_grants es el resguardo definitivo, esto es defensa adicional).
  SELECT birthdate INTO v_birthdate
  FROM public.profiles
  WHERE id = p_customer_id
    AND is_active IS DISTINCT FROM false
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_birthdate IS NULL THEN
    RAISE EXCEPTION 'customer_not_found_or_no_birthdate' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_config FROM public.birthday_config WHERE id = true FOR UPDATE;
  IF v_config IS NULL OR v_config.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'program_inactive' USING ERRCODE = 'P0001';
  END IF;

  IF EXTRACT(MONTH FROM v_birthdate) <> EXTRACT(MONTH FROM now()) THEN
    RAISE EXCEPTION 'not_birthday_month' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.birthday_grants
    WHERE user_id = p_customer_id AND birthday_year = v_current_year
  ) THEN
    -- Reutilizo el código de unique_violation a propósito, para que el
    -- cliente lo trate igual que si hubiera chocado contra el UNIQUE.
    RAISE EXCEPTION 'already_granted' USING ERRCODE = '23505';
  END IF;

  SELECT branch_id INTO v_caller_branch FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.birthday_grants (user_id, birthday_year, branch_id, granted_by, notes)
  VALUES (p_customer_id, v_current_year, v_caller_branch, auth.uid(), NULLIF(trim(p_notes), ''))
  RETURNING * INTO v_grant;

  PERFORM public.log_admin_action(
    'birthday_reward_granted',
    'customer',
    p_customer_id,
    jsonb_build_object('birthday_year', v_current_year, 'grant_id', v_grant.id, 'branch_id', v_caller_branch)
  );

  RETURN v_grant;
END;
$function$;


-- ============================================================
-- 6. FUNCIÓN: get_birthday_grants_this_year()
--    Solo staff. Lista las entregas del año en curso.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_birthday_grants_this_year()
RETURNS TABLE (user_id uuid, granted_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cashier')) THEN
    RAISE EXCEPTION 'forbidden_staff_only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT bg.user_id, bg.created_at
  FROM public.birthday_grants bg
  WHERE bg.birthday_year = EXTRACT(YEAR FROM now())::int;
END;
$function$;


-- ============================================================
-- 7. GRANTS
-- ============================================================
GRANT SELECT ON public.birthday_config TO authenticated;
GRANT UPDATE ON public.birthday_config TO authenticated; -- RLS ya restringe a admin

GRANT EXECUTE ON FUNCTION public.get_birthday_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_birthday_reward(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_birthday_grants_this_year() TO authenticated;

-- NOTA: birthday_grants NO recibe GRANT a authenticated a propósito —
-- el acceso es exclusivamente vía las tres funciones de arriba.