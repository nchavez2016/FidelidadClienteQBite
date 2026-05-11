-- Phase 3.4.1 — Admin-only reset that goes through the ledger
CREATE OR REPLACE FUNCTION public.reset_customer_points(
  p_customer_id uuid,
  p_campaign_id uuid,
  p_reason text DEFAULT 'admin_reset'
)
RETURNS TABLE (tx_id uuid, new_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance integer;
  v_row     public.point_transactions;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT points INTO v_balance
    FROM public.customer_points
   WHERE customer_id = p_customer_id AND campaign_id = p_campaign_id
   FOR UPDATE;

  IF v_balance IS NULL OR v_balance = 0 THEN
    -- Nothing to reset; return null tx and current balance (0 if missing).
    tx_id := NULL;
    new_balance := COALESCE(v_balance, 0);
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.point_transactions (
    customer_id, campaign_id, kind, points_delta,
    actor_id, actor_role, metadata
  ) VALUES (
    p_customer_id, p_campaign_id, 'manual_adjustment', -v_balance,
    auth.uid(), 'admin',
    jsonb_build_object('reason', p_reason, 'op', 'reset_customer_points')
  ) RETURNING * INTO v_row;

  tx_id := v_row.id;
  new_balance := v_row.balance_after;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION public.reset_customer_points(uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_customer_points(uuid, uuid, text) TO authenticated;

-- Phase 3.4.2 — Server-side cooldown inside earn_points
CREATE OR REPLACE FUNCTION public.earn_points(
  p_customer_id uuid, p_campaign_id uuid, p_branch_id uuid,
  p_idempotency_key text,
  p_comment_category text DEFAULT NULL::text,
  p_comment_text text DEFAULT NULL::text,
  p_bonus_rule_id uuid DEFAULT NULL::uuid,
  p_bonus_multiplier numeric DEFAULT NULL::numeric
)
RETURNS public.point_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Anti-spam: reject if the customer has earned in this campaign within the cooldown.
  SELECT MAX(created_at) INTO v_last_at
    FROM public.point_transactions
   WHERE customer_id = p_customer_id
     AND campaign_id = p_campaign_id
     AND kind IN ('earn', 'bonus');

  IF v_last_at IS NOT NULL AND (now() - v_last_at) < v_cooldown THEN
    RAISE EXCEPTION 'cooldown_active: last_at=%, cooldown=%', v_last_at, v_cooldown
      USING ERRCODE = '22023';
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
    CASE WHEN public.has_role(auth.uid(), 'admin') THEN 'admin'::app_role ELSE 'cashier'::app_role END,
    p_comment_category, p_comment_text
  ) RETURNING * INTO v_row;

  RETURN v_row;
END $$;

-- Phase 3.4.3 — Realtime publication
ALTER TABLE public.point_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.customer_points    REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'point_transactions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.point_transactions';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'customer_points'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_points';
  END IF;
END $$;