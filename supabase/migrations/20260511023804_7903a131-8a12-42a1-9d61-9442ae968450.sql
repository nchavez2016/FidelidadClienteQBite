CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- service_role / edge function context: auth.uid() is NULL → allow.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

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
END $function$;