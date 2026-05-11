-- Bug 1: handle_new_user must use the synthetic identifier (phone) from metadata
-- because customer auth uses email-based login (<phone>@phone.gaviota.local) and
-- auth.users.phone is NULL for those accounts.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_audience text;
  v_phone text;
BEGIN
  v_audience := COALESCE(NEW.raw_user_meta_data->>'audience', 'customer');

  -- For customer accounts the real phone lives in user_metadata.identifier.
  -- Fallback to NEW.phone (real phone-auth) and finally NULL for staff accounts.
  IF v_audience = 'customer' THEN
    v_phone := COALESCE(NEW.raw_user_meta_data->>'identifier', NEW.phone);
  ELSE
    v_phone := NEW.phone;
  END IF;

  INSERT INTO public.profiles (id, display_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
    v_phone
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_audience = 'customer' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'customer')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- One-shot backfill: copy identifier into profiles.phone when missing.
UPDATE public.profiles p
SET phone = u.raw_user_meta_data->>'identifier'
FROM auth.users u
WHERE u.id = p.id
  AND p.phone IS NULL
  AND (u.raw_user_meta_data->>'identifier') IS NOT NULL;