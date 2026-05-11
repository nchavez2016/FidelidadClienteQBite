-- 1. Lock down sensitive profile fields against self-update
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.accepted_campaigns IS DISTINCT FROM OLD.accepted_campaigns
     OR NEW.branch_id        IS DISTINCT FROM OLD.branch_id
     OR NEW.is_active        IS DISTINCT FROM OLD.is_active
     OR NEW.legacy_id        IS DISTINCT FROM OLD.legacy_id
     OR NEW.revoked_from_phone IS DISTINCT FROM OLD.revoked_from_phone
     OR NEW.deleted_at       IS DISTINCT FROM OLD.deleted_at
     OR NEW.phone            IS DISTINCT FROM OLD.phone THEN
    RAISE EXCEPTION 'forbidden_field_update' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_guard_privileged_fields_tg ON public.profiles;
CREATE TRIGGER profiles_guard_privileged_fields_tg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileged_fields();

-- 2. Pin search_path on the append-only guard
CREATE OR REPLACE FUNCTION public.point_transactions_no_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.pt_internal', true) = '1' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'point_transactions is append-only';
END $$;

-- 3. Revoke anon EXECUTE on SECURITY DEFINER RPCs (require auth)
REVOKE EXECUTE ON FUNCTION public.earn_points(uuid,uuid,uuid,text,text,text,uuid,numeric) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.redeem_reward(uuid,uuid,uuid,text,integer,uuid,text)    FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reverse_transaction(uuid,text)                          FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.adjust_points(uuid,uuid,integer,text)                   FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.apply_point_transaction()                               FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.profiles_guard_privileged_fields()                      FROM anon, public;

GRANT EXECUTE ON FUNCTION public.earn_points(uuid,uuid,uuid,text,text,text,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_reward(uuid,uuid,uuid,text,integer,uuid,text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(uuid,text)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_points(uuid,uuid,integer,text)                   TO authenticated;

-- 4. Hide internal tables from anon (RLS already blocks; this also drops them from anon GraphQL schema)
REVOKE SELECT ON public.point_transactions FROM anon;
REVOKE SELECT ON public.customer_points    FROM anon;