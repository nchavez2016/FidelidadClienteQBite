CREATE TYPE public.redemption_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

CREATE TABLE public.redemption_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  reward_id TEXT NOT NULL,
  reward_name_snapshot TEXT NOT NULL,
  points_cost_snapshot INTEGER NOT NULL CHECK (points_cost_snapshot >= 0),
  status public.redemption_status NOT NULL DEFAULT 'pending',
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (status IN ('approved', 'rejected', 'cancelled') AND resolved_at IS NOT NULL)
    OR
    (status = 'pending' AND resolved_at IS NULL)
  )
);

-- Indices
CREATE UNIQUE INDEX idx_one_pending_request
ON public.redemption_requests (customer_id)
WHERE status = 'pending';

CREATE INDEX idx_redemption_requests_customer ON public.redemption_requests(customer_id);
CREATE INDEX idx_redemption_requests_status ON public.redemption_requests(status);
CREATE INDEX idx_redemption_requests_requested_at ON public.redemption_requests(requested_at DESC);
CREATE INDEX idx_redemp_req_campaign ON public.redemption_requests (campaign_id, status);

-- Trigger for updated_at (using the existing set_updated_at from previous phases)
CREATE TRIGGER trg_redemp_req_updated_at
  BEFORE UPDATE ON public.redemption_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RPC for atomic approval
CREATE OR REPLACE FUNCTION public.approve_redemption_request(
  p_request_id UUID,
  p_staff_id UUID,
  p_notes TEXT,
  p_branch_id UUID DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req RECORD;
BEGIN
  -- Lock the row for update
  SELECT * INTO v_req 
  FROM public.redemption_requests 
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already processed';
  END IF;

  -- 1. Insert ledger transaction first (calls existing RPC)
  -- If this fails (e.g. not enough points, validation error), the whole transaction rolls back!
  PERFORM public.redeem_reward(
    v_req.customer_id,
    v_req.campaign_id,
    v_req.reward_id,
    v_req.reward_name_snapshot,
    v_req.points_cost_snapshot,
    p_branch_id,
    gen_random_uuid()::TEXT
  );

  -- 2. Update request to approved
  UPDATE public.redemption_requests
  SET status = 'approved',
      resolved_by = p_staff_id,
      notes = p_notes,
      resolved_at = now()
  WHERE id = p_request_id;
END;
$$;

-- RLS
ALTER TABLE public.redemption_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "redemp_req_select_own" ON public.redemption_requests
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

CREATE POLICY "redemp_req_insert_own" ON public.redemption_requests
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid() AND status = 'pending');

CREATE POLICY "redemp_req_update_own" ON public.redemption_requests
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid() AND status = 'pending')
  WITH CHECK (customer_id = auth.uid() AND status = 'cancelled');

CREATE POLICY "redemp_req_select_staff" ON public.redemption_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'cashier'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "redemp_req_update_staff" ON public.redemption_requests
  FOR UPDATE TO authenticated
  USING ((public.has_role(auth.uid(), 'cashier'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)) AND status = 'pending')
  WITH CHECK ((public.has_role(auth.uid(), 'cashier'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)) AND status IN ('approved', 'rejected'));
