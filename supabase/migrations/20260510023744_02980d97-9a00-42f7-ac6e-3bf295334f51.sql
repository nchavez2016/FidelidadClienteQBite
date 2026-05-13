-- Phase 5: extend profiles for customer domain + create customer_points table

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS accepted_campaigns uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS revoked_from_phone text,
  ADD COLUMN IF NOT EXISTS legacy_id text;

CREATE INDEX IF NOT EXISTS idx_profiles_legacy_id ON public.profiles(legacy_id);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);

CREATE TABLE IF NOT EXISTS public.customer_points (
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_points_campaign ON public.customer_points(campaign_id);

ALTER TABLE public.customer_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_points_select_own ON public.customer_points;
CREATE POLICY customer_points_select_own ON public.customer_points
  FOR SELECT TO authenticated
  USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS customer_points_select_staff ON public.customer_points;
CREATE POLICY customer_points_select_staff ON public.customer_points
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'cashier'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS customer_points_staff_manage ON public.customer_points;
CREATE POLICY customer_points_staff_manage ON public.customer_points
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'cashier'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'cashier'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER customer_points_set_updated_at
  BEFORE UPDATE ON public.customer_points
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();