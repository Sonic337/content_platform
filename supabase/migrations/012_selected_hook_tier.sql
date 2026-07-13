-- Stores the evidence tier of whichever hook option was selected at approval time.
-- Nullable: null means the row pre-dates this column, or the hook was AI-generated (no tier).
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS selected_hook_tier text;
