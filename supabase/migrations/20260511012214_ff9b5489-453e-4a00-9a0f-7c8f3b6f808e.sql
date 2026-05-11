-- =========================================================
-- Phase 6A — Point transactions ledger (append-only)
-- =========================================================

-- 1. Enum
DO $$ BEGIN
  CREATE TYPE public.tx_kind AS ENUM (
    'earn', 'bonus', 'redeem', 'manual_adjustment', 'reversal', 'terms_acceptance'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Extend customer_points (cache derivada)
ALTER TABLE public.customer_points
  ADD COLUMN IF NOT EXISTS points_lifetime integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_tx_id uuid;

-- Ensure PK exists on (customer_id, campaign_id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customer_points'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.customer_points
      ADD CONSTRAINT customer_points_pkey PRIMARY KEY (customer_id, campaign_id);
  END IF;
END $$;

-- 3. Ledger table
CREATE TABLE IF NOT EXISTS public.point_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL,
  campaign_id     uuid NOT NULL,
  branch_id       uuid,
  kind            public.tx_kind NOT NULL,
  points_delta    integer NOT NULL,
  balance_after   integer,
  reward_id       uuid,
  bonus_rule_id   uuid,
  bonus_multiplier numeric(4,2),
  reverses_tx_id  uuid REFERENCES public.point_transactions(id),
  idempotency_key text,
  actor_id        uuid,
  actor_role      public.app_role,
  comment_category text,
  comment_text    text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  effective_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_redeem_has_reward CHECK ((kind = 'redeem') = (reward_id IS NOT NULL)),
  CONSTRAINT pt_reversal_has_ref  CHECK ((kind = 'reversal') = (reverses_tx_id IS NOT NULL)),
  CONSTRAINT pt_delta_nonzero     CHECK (points_delta <> 0 OR kind = 'terms_acceptance')
);

CREATE UNIQUE INDEX IF NOT EXISTS pt_idempotency_uq
  ON public.point_transactions (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pt_reverses_uq
  ON public.point_transactions (reverses_tx_id) WHERE reverses_tx_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pt_customer_created_idx
  ON public.point_transactions (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pt_campaign_created_idx
  ON public.point_transactions (campaign_id, created_at DESC);

-- 4. Append-only enforcement
CREATE OR REPLACE FUNCTION public.point_transactions_no_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'point_transactions is append-only';
END $$;

DROP TRIGGER IF EXISTS pt_no_update ON public.point_transactions;
CREATE TRIGGER pt_no_update BEFORE UPDATE ON public.point_transactions
  FOR EACH ROW EXECUTE FUNCTION public.point_transactions_no_mutation();
DROP TRIGGER IF EXISTS pt_no_delete ON public.point_transactions;
CREATE TRIGGER pt_no_delete BEFORE DELETE ON public.point_transactions
  FOR EACH ROW EXECUTE FUNCTION public.point_transactions_no_mutation();

-- 5. Apply trigger: keep customer_points cache in sync, fill balance_after
CREATE OR REPLACE FUNCTION public.apply_point_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_balance integer;
BEGIN
  INSERT INTO public.customer_points (customer_id, campaign_id, points, points_lifetime, last_tx_id, updated_at)
  VALUES (NEW.customer_id, NEW.campaign_id, NEW.points_delta,
          GREATEST(NEW.points_delta, 0), NEW.id, now())
  ON CONFLICT (customer_id, campaign_id) DO UPDATE
    SET points          = public.customer_points.points + NEW.points_delta,
        points_lifetime = public.customer_points.points_lifetime + GREATEST(NEW.points_delta, 0),
        last_tx_id      = NEW.id,
        updated_at      = now()
  RETURNING points INTO new_balance;

  -- Bypass append-only trigger to set balance_after on the just-inserted row
  PERFORM set_config('app.pt_internal', '1', true);
  UPDATE public.point_transactions SET balance_after = new_balance WHERE id = NEW.id;
  PERFORM set_config('app.pt_internal', '', true);

  RETURN NEW;
END $$;

-- Allow internal balance_after update by checking session flag
CREATE OR REPLACE FUNCTION public.point_transactions_no_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.pt_internal', true) = '1' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'point_transactions is append-only';
END $$;

DROP TRIGGER IF EXISTS pt_apply ON public.point_transactions;
CREATE TRIGGER pt_apply AFTER INSERT ON public.point_transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_point_transaction();

-- 6. RLS
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pt_select_own ON public.point_transactions;
CREATE POLICY pt_select_own ON public.point_transactions
  FOR SELECT TO authenticated USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS pt_select_staff ON public.point_transactions;
CREATE POLICY pt_select_staff ON public.point_transactions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'cashier') OR has_role(auth.uid(), 'admin'));

-- No INSERT/UPDATE/DELETE policies => only SECURITY DEFINER RPCs can write.

-- 7. RPCs

-- earn_points
CREATE OR REPLACE FUNCTION public.earn_points(
  p_customer_id    uuid,
  p_campaign_id    uuid,
  p_branch_id      uuid,
  p_idempotency_key text,
  p_comment_category text DEFAULT NULL,
  p_comment_text   text DEFAULT NULL,
  p_bonus_rule_id  uuid DEFAULT NULL,
  p_bonus_multiplier numeric DEFAULT NULL
) RETURNS public.point_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing public.point_transactions;
  v_row      public.point_transactions;
  v_delta    integer;
  v_kind     public.tx_kind;
BEGIN
  IF NOT (has_role(auth.uid(), 'cashier') OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.point_transactions
      WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN RETURN v_existing; END IF;
  END IF;

  IF p_bonus_multiplier IS NOT NULL AND p_bonus_multiplier > 1 THEN
    v_delta := floor(p_bonus_multiplier)::int;
    v_kind  := 'bonus';
  ELSE
    v_delta := 1;
    v_kind  := 'earn';
  END IF;

  INSERT INTO public.point_transactions (
    customer_id, campaign_id, branch_id, kind, points_delta,
    bonus_rule_id, bonus_multiplier, idempotency_key,
    actor_id, actor_role, comment_category, comment_text
  ) VALUES (
    p_customer_id, p_campaign_id, p_branch_id, v_kind, v_delta,
    p_bonus_rule_id, p_bonus_multiplier, p_idempotency_key,
    auth.uid(),
    CASE WHEN has_role(auth.uid(), 'admin') THEN 'admin'::app_role ELSE 'cashier'::app_role END,
    p_comment_category, p_comment_text
  ) RETURNING * INTO v_row;

  RETURN v_row;
END $$;

-- redeem_reward
CREATE OR REPLACE FUNCTION public.redeem_reward(
  p_customer_id    uuid,
  p_campaign_id    uuid,
  p_reward_id      uuid,
  p_reward_name    text,
  p_required_points integer,
  p_branch_id      uuid,
  p_idempotency_key text
) RETURNS public.point_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing public.point_transactions;
  v_row      public.point_transactions;
  v_balance  integer;
BEGIN
  IF NOT (has_role(auth.uid(), 'cashier') OR has_role(auth.uid(), 'admin')) THEN
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
    WHERE customer_id = p_customer_id AND campaign_id = p_campaign_id
    FOR UPDATE;

  IF v_balance IS NULL OR v_balance < p_required_points THEN
    RAISE EXCEPTION 'insufficient_points: have=%, need=%', COALESCE(v_balance, 0), p_required_points;
  END IF;

  INSERT INTO public.point_transactions (
    customer_id, campaign_id, branch_id, kind, points_delta,
    reward_id, idempotency_key,
    actor_id, actor_role,
    metadata
  ) VALUES (
    p_customer_id, p_campaign_id, p_branch_id, 'redeem', -p_required_points,
    p_reward_id, p_idempotency_key,
    auth.uid(),
    CASE WHEN has_role(auth.uid(), 'admin') THEN 'admin'::app_role ELSE 'cashier'::app_role END,
    jsonb_build_object('reward_name', p_reward_name)
  ) RETURNING * INTO v_row;

  RETURN v_row;
END $$;

-- reverse_transaction
CREATE OR REPLACE FUNCTION public.reverse_transaction(
  p_tx_id uuid,
  p_reason text DEFAULT NULL
) RETURNS public.point_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_orig public.point_transactions;
  v_row  public.point_transactions;
BEGIN
  IF NOT (has_role(auth.uid(), 'cashier') OR has_role(auth.uid(), 'admin')) THEN
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
    CASE WHEN has_role(auth.uid(), 'admin') THEN 'admin'::app_role ELSE 'cashier'::app_role END,
    jsonb_build_object('reason', p_reason)
  ) RETURNING * INTO v_row;

  RETURN v_row;
END $$;

-- adjust_points (admin only)
CREATE OR REPLACE FUNCTION public.adjust_points(
  p_customer_id uuid,
  p_campaign_id uuid,
  p_delta integer,
  p_reason text
) RETURNS public.point_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.point_transactions;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_delta = 0 THEN RAISE EXCEPTION 'delta_required'; END IF;

  INSERT INTO public.point_transactions (
    customer_id, campaign_id, kind, points_delta,
    actor_id, actor_role, metadata
  ) VALUES (
    p_customer_id, p_campaign_id, 'manual_adjustment', p_delta,
    auth.uid(), 'admin', jsonb_build_object('reason', p_reason)
  ) RETURNING * INTO v_row;

  RETURN v_row;
END $$;

-- 8. Backfill: seed ledger from current customer_points balances
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT cp.customer_id, cp.campaign_id, cp.points
    FROM public.customer_points cp
    WHERE cp.points <> 0
      AND NOT EXISTS (
        SELECT 1 FROM public.point_transactions pt
        WHERE pt.customer_id = cp.customer_id
          AND pt.campaign_id = cp.campaign_id
      )
  LOOP
    -- Reset balance so trigger reapplies it cleanly
    UPDATE public.customer_points
      SET points = 0, points_lifetime = 0
      WHERE customer_id = r.customer_id AND campaign_id = r.campaign_id;

    INSERT INTO public.point_transactions (
      customer_id, campaign_id, kind, points_delta, metadata
    ) VALUES (
      r.customer_id, r.campaign_id, 'manual_adjustment', r.points,
      jsonb_build_object('reason', 'phase6a_backfill_from_customer_points')
    );
  END LOOP;
END $$;