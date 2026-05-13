
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_audience text;
  v_phone text;
  v_gender text;
BEGIN
  v_audience := COALESCE(NEW.raw_user_meta_data->>'audience', 'customer');

  IF v_audience = 'customer' THEN
    v_phone := COALESCE(NEW.raw_user_meta_data->>'identifier', NEW.phone);
  ELSE
    v_phone := NEW.phone;
  END IF;

  v_gender := NEW.raw_user_meta_data->>'gender';
  IF v_gender NOT IN ('masculino','femenino','otro') THEN
    v_gender := NULL;
  END IF;

  INSERT INTO public.profiles (id, display_name, phone, gender)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
    v_phone,
    v_gender::public.gender_type
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

UPDATE public.profiles p
SET gender = (u.raw_user_meta_data->>'gender')::public.gender_type
FROM auth.users u
WHERE u.id = p.id
  AND p.gender IS NULL
  AND (u.raw_user_meta_data->>'gender') IN ('masculino','femenino','otro');

CREATE OR REPLACE FUNCTION public.get_actor_display_names(p_ids uuid[])
RETURNS TABLE(id uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.display_name
  FROM public.profiles p
  WHERE p.id = ANY(p_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_actor_display_names(uuid[]) TO authenticated;
