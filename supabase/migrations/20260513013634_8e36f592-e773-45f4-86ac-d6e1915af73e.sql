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

    INSERT INTO public.profiles (id, display_name, phone, gender)
    VALUES (NEW.id, v_display, v_phone, v_gender)
    ON CONFLICT (id) DO NOTHING;

    IF v_audience = 'customer' THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'customer')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] non-fatal failure for user %: % (SQLSTATE %)', NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$function$;