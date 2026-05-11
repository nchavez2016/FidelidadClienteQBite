-- Phase 2.7 — staff visibility of customer profiles
-- Cashiers need to look up customers by phone from the staff panel.
-- This policy lets them read profiles that belong to a 'customer'-role user.
-- Admin already has full read via profiles_select_admin (kept).
-- Customers keep their self-only read via profiles_select_own (kept).

CREATE POLICY "profiles_select_staff"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'cashier'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = public.profiles.id
      AND ur.role = 'customer'::public.app_role
  )
);