CREATE OR REPLACE FUNCTION public.point_transactions_no_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.pt_internal', true) = '1' THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'point_transactions is append-only';
END
$function$;