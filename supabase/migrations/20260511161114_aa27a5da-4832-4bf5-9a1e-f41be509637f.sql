-- Phase 3.2: lock customer_points to read-only for frontend.
-- Only RPCs (SECURITY DEFINER) may mutate the balance via the ledger trigger.
DROP POLICY IF EXISTS customer_points_staff_manage ON public.customer_points;