-- 1. FKs ON DELETE CASCADE para profiles y user_roles → auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_id_fkey' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_roles_user_id_fkey' AND conrelid = 'public.user_roles'::regclass
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. handle_new_user: respeta audience. Si audience='staff', NO inserta role customer.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_audience text;
BEGIN
  v_audience := COALESCE(NEW.raw_user_meta_data->>'audience', 'customer');

  INSERT INTO public.profiles (id, display_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
    NEW.phone
  )
  ON CONFLICT (id) DO NOTHING;

  -- Solo asigna role customer por defecto si la cuenta se registró como customer.
  -- Cuentas staff reciben su role desde el edge function staff-admin.
  IF v_audience = 'customer' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'customer')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Anti-escalación: nadie puede asignarse admin a sí mismo.
-- Edge functions con service_role siguen funcionando (auth.uid() es null en ese contexto,
-- por lo que el guardia se salta de forma segura).
CREATE OR REPLACE FUNCTION public.user_roles_anti_self_elevation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Llamadas con service_role tienen auth.uid() = null → permitido.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Un usuario nunca puede otorgarse el rol admin a sí mismo.
  IF NEW.role = 'admin' AND NEW.user_id = auth.uid() THEN
    RAISE EXCEPTION 'forbidden_self_admin_grant' USING ERRCODE = '42501';
  END IF;

  -- Otorgar role admin a otro requiere ser admin.
  IF NEW.role = 'admin' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden_admin_grant_requires_admin' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_anti_self_elevation_trg ON public.user_roles;
CREATE TRIGGER user_roles_anti_self_elevation_trg
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.user_roles_anti_self_elevation();