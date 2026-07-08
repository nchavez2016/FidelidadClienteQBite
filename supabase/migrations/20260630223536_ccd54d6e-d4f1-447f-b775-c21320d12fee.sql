CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_audience text; v_phone text; v_gender_raw text; v_gender public.gender_type;
  v_display text; v_email text; v_birthdate_raw text; v_birthdate date;
  v_consent boolean; v_consent_source text; v_consent_actor uuid;
  v_err text;
BEGIN
  v_audience := COALESCE(NULLIF(NEW.raw_user_meta_data->>'audience',''),'customer');

  IF v_audience='customer' THEN
    v_phone := COALESCE(NULLIF(NEW.raw_user_meta_data->>'identifier',''),
                        NULLIF(NEW.raw_user_meta_data->>'phone',''), NEW.phone);
  ELSE
    v_phone := COALESCE(NULLIF(NEW.raw_user_meta_data->>'phone',''), NEW.phone);
  END IF;

  v_gender_raw := NULLIF(NEW.raw_user_meta_data->>'gender','');
  IF v_gender_raw IN ('masculino','femenino','otro') THEN v_gender := v_gender_raw::public.gender_type;
  ELSE v_gender := NULL; END IF;

  v_display := COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name',''),'');
  v_email   := NULLIF(NEW.raw_user_meta_data->>'contact_email','');

  v_birthdate_raw := NULLIF(NEW.raw_user_meta_data->>'birthdate','');
  IF v_birthdate_raw IS NOT NULL THEN
    BEGIN v_birthdate := v_birthdate_raw::date; EXCEPTION WHEN OTHERS THEN v_birthdate := NULL; END;
  END IF;

  v_consent := COALESCE((NEW.raw_user_meta_data->>'phone_consent_granted')::boolean, false);
  v_consent_source := NULLIF(NEW.raw_user_meta_data->>'phone_consent_source','');
  BEGIN v_consent_actor := NULLIF(NEW.raw_user_meta_data->>'phone_consent_actor_id','')::uuid;
  EXCEPTION WHEN OTHERS THEN v_consent_actor := NULL; END;

  BEGIN
    INSERT INTO public.profiles (
      id, display_name, phone, gender, email, birthdate,
      phone_consent_granted, phone_consent_at, phone_consent_source, phone_consent_actor_id
    ) VALUES (
      NEW.id, v_display, v_phone, v_gender, v_email, v_birthdate,
      v_consent, CASE WHEN v_consent THEN now() ELSE NULL END, v_consent_source, v_consent_actor
    );
  EXCEPTION WHEN unique_violation THEN
    v_err := SQLERRM;
    IF v_err ILIKE '%profiles_email_unique%' OR v_err ILIKE '%lower(email)%' THEN
      -- Colisión solo en email: conservar phone, anular email.
      RAISE WARNING '[handle_new_user] email collision id=% email=% — retry with email=NULL', NEW.id, v_email;
      INSERT INTO public.profiles (
        id, display_name, phone, gender, email, birthdate,
        phone_consent_granted, phone_consent_at, phone_consent_source, phone_consent_actor_id
      ) VALUES (
        NEW.id, v_display, v_phone, v_gender, NULL, v_birthdate,
        v_consent, CASE WHEN v_consent THEN now() ELSE NULL END, v_consent_source, v_consent_actor
      );
    ELSIF v_err ILIKE '%profiles_phone_key%' OR v_err ILIKE '%idx_profiles_phone%' OR v_err ILIKE '%(phone)%' THEN
      -- Colisión solo en phone: conservar email, anular phone.
      RAISE WARNING '[handle_new_user] phone collision id=% phone=% — retry with phone=NULL', NEW.id, v_phone;
      INSERT INTO public.profiles (
        id, display_name, phone, gender, email, birthdate,
        phone_consent_granted, phone_consent_at, phone_consent_source, phone_consent_actor_id
      ) VALUES (
        NEW.id, v_display, NULL, v_gender, v_email, v_birthdate,
        v_consent, CASE WHEN v_consent THEN now() ELSE NULL END, v_consent_source, v_consent_actor
      );
    ELSIF v_err ILIKE '%profiles_pkey%' THEN
      -- Perfil ya existe: actualizar solo campos no-nulos, sin sobreescribir con NULL.
      RAISE WARNING '[handle_new_user] profile already exists id=% — merging non-null fields', NEW.id;
      PERFORM set_config('app.profile_internal','1',true);
      UPDATE public.profiles SET
        display_name = COALESCE(NULLIF(v_display,''), display_name),
        phone        = COALESCE(v_phone, phone),
        gender       = COALESCE(v_gender, gender),
        email        = COALESCE(v_email, email),
        birthdate    = COALESCE(v_birthdate, birthdate),
        phone_consent_granted   = CASE WHEN v_consent THEN true ELSE phone_consent_granted END,
        phone_consent_at        = CASE WHEN v_consent AND phone_consent_at IS NULL THEN now() ELSE phone_consent_at END,
        phone_consent_source    = COALESCE(v_consent_source, phone_consent_source),
        phone_consent_actor_id  = COALESCE(v_consent_actor, phone_consent_actor_id),
        updated_at   = now()
      WHERE id = NEW.id;
      PERFORM set_config('app.profile_internal','',true);
    ELSE
      RAISE;
    END IF;
  WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] profile INSERT failed id=% SQLSTATE=% SQLERRM=%', NEW.id, SQLSTATE, SQLERRM;
    RAISE;
  END;

  IF v_audience='customer' THEN
    BEGIN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id,'customer') ON CONFLICT (user_id, role) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[handle_new_user] user_roles INSERT failed id=% SQLSTATE=% SQLERRM=%', NEW.id, SQLSTATE, SQLERRM;
      RAISE;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

UPDATE public.profiles
SET phone = '0991234567'
WHERE id = (
  SELECT id FROM public.profiles
  WHERE phone IS NULL
    AND email ILIKE '%napochavez%'
  LIMIT 1
);