
-- Backfill: replace any non-UUID milestone/bonus rule ids with real UUIDs.
-- Defensive one-shot: required because the redeem_reward RPC takes a uuid,
-- and pre-existing campaigns still carry legacy frontend ids like "m-..." / "bonus-...".
DO $$
DECLARE
  c RECORD;
  new_milestones jsonb;
  new_bonus jsonb;
  elem jsonb;
  changed boolean;
BEGIN
  FOR c IN SELECT id, milestones, bonus_rules FROM public.campaigns LOOP
    changed := false;
    new_milestones := '[]'::jsonb;
    IF jsonb_typeof(c.milestones) = 'array' THEN
      FOR elem IN SELECT * FROM jsonb_array_elements(c.milestones) LOOP
        IF (elem->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          new_milestones := new_milestones || jsonb_build_array(elem);
        ELSE
          new_milestones := new_milestones || jsonb_build_array(jsonb_set(elem, '{id}', to_jsonb(gen_random_uuid()::text)));
          changed := true;
        END IF;
      END LOOP;
    END IF;

    new_bonus := '[]'::jsonb;
    IF jsonb_typeof(c.bonus_rules) = 'array' THEN
      FOR elem IN SELECT * FROM jsonb_array_elements(c.bonus_rules) LOOP
        IF (elem->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          new_bonus := new_bonus || jsonb_build_array(elem);
        ELSE
          new_bonus := new_bonus || jsonb_build_array(jsonb_set(elem, '{id}', to_jsonb(gen_random_uuid()::text)));
          changed := true;
        END IF;
      END LOOP;
    END IF;

    IF changed THEN
      UPDATE public.campaigns
         SET milestones = new_milestones,
             bonus_rules = new_bonus,
             updated_at = now()
       WHERE id = c.id;
    END IF;
  END LOOP;
END $$;
