
-- Extend brain_products with rich metadata for Nina's recommendation logic
ALTER TABLE public.brain_products
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS skin_types TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS main_goals TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS usage_short TEXT,
  ADD COLUMN IF NOT EXISTS in_protocols BOOLEAN,
  ADD COLUMN IF NOT EXISTS related_protocols TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS protocol_role TEXT,
  ADD COLUMN IF NOT EXISTS combines_with TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS avoid_combinations TEXT,
  ADD COLUMN IF NOT EXISTS common_objections_md TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes_md TEXT;

-- Extend brain_knowledge with classification + routing fields
ALTER TABLE public.brain_knowledge
  ADD COLUMN IF NOT EXISTS knowledge_type TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS related_products TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS when_to_use_md TEXT,
  ADD COLUMN IF NOT EXISTS when_to_escalate_md TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT;
