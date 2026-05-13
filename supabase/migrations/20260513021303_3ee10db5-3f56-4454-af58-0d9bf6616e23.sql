CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_audience    text;
  v_phone       text;
  v_gender_raw  text;
  v_gender      public.gender_type;
  v_display     text;
BEGIN
  v_audience := COALESCE(NULLIF(NEW.raw_user_meta_data->>'audience', ''), 'customer');

  IF v_audience = 'customer' THEN
    v_phone := COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'identifier', ''),
      NULLIF(NEW.raw_user_meta_data->>'phone', ''),
      NEW.phone
    );
  ELSE
    v_phone := COALESCE(NULLIF(NEW.raw_user_meta_data->>'phone', ''), NEW.phone);
  END IF;

  v_gender_raw := NULLIF(NEW.raw_user_meta_data->>'gender', '');
  IF v_gender_raw IN ('masculino', 'femenino', 'otro') THEN
    v_gender := v_gender_raw::public.gender_type;
  ELSE
    v_gender := NULL;
  END IF;

  v_display := COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), '');

  RAISE WARNING '[handle_new_user] inserting profile id=% audience=% phone=% gender=% display=%',
    NEW.id, v_audience, v_phone, v_gender, v_display;

  BEGIN
    INSERT INTO public.profiles (id, display_name, phone, gender)
    VALUES (NEW.id, v_display, v_phone, v_gender)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    -- phone collision: insert with NULL phone so signup still completes; log it.
    RAISE WARNING '[handle_new_user] phone collision id=% phone=% SQLSTATE=% SQLERRM=% — inserting with NULL phone',
      NEW.id, v_phone, SQLSTATE, SQLERRM;
    INSERT INTO public.profiles (id, display_name, phone, gender)
    VALUES (NEW.id, v_display, NULL, v_gender)
    ON CONFLICT (id) DO NOTHING;
  WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] profile INSERT failed id=% SQLSTATE=% SQLERRM=%',
      NEW.id, SQLSTATE, SQLERRM;
    RAISE;
  END;

  IF v_audience = 'customer' THEN
    BEGIN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'customer')
      ON CONFLICT (user_id, role) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[handle_new_user] user_roles INSERT failed id=% SQLSTATE=% SQLERRM=%',
        NEW.id, SQLSTATE, SQLERRM;
      RAISE;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill missing profiles. NULL phone for any user whose phone collides with
-- an existing profile (so the row still gets created — UI doesn't go blank).
INSERT INTO public.profiles (id, display_name, phone, gender)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data->>'display_name',''), ''),
  CASE
    WHEN cand.phone IS NULL THEN NULL
    WHEN EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.phone = cand.phone) THEN NULL
    ELSE cand.phone
  END,
  CASE
    WHEN NULLIF(u.raw_user_meta_data->>'gender','') IN ('masculino','femenino','otro')
      THEN (u.raw_user_meta_data->>'gender')::public.gender_type
    ELSE NULL
  END
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN LATERAL (
  SELECT COALESCE(
    NULLIF(u.raw_user_meta_data->>'identifier',''),
    NULLIF(u.raw_user_meta_data->>'phone',''),
    u.phone
  ) AS phone
) cand ON TRUE
WHERE p.id IS NULL;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'customer'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id AND r.role = 'customer'
WHERE r.user_id IS NULL
  AND COALESCE(NULLIF(u.raw_user_meta_data->>'audience',''), 'customer') = 'customer'
ON CONFLICT (user_id, role) DO NOTHING;