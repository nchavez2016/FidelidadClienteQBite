-- Fix cashier customer search RLS policy on public.profiles
-- 
-- The previous policy 'profiles_select_staff' used an EXISTS clause on public.user_roles 
-- which failed because public.user_roles has RLS enabled and cashiers cannot read it.
-- We replace it using the existing SECURITY DEFINER function `public.has_role` 
-- to safely check the target profile's role without hitting RLS recursion blocks.

DROP POLICY IF EXISTS "profiles_select_staff" ON public.profiles;

CREATE POLICY "profiles_select_staff" 
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'cashier'::public.app_role)
  AND public.has_role(public.profiles.id, 'customer'::public.app_role)
);
