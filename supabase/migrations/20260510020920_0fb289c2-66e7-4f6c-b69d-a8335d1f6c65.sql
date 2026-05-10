ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bonus_rules JSONB NOT NULL DEFAULT '[]'::jsonb;