-- Add usage-tracking columns to hooks and a helper RPC for atomic increment.
-- times_used: count of pipeline drafts that surfaced this hook
-- last_used_at: timestamp of the most recent surfacing

ALTER TABLE hooks
  ADD COLUMN IF NOT EXISTS times_used  integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

-- Atomic increment called by the generate route after a draft is inserted.
-- Accepts an array of hook UUIDs so all bank hooks from one draft are updated
-- in a single round-trip.
CREATE OR REPLACE FUNCTION increment_hook_usage(hook_ids uuid[])
RETURNS void
LANGUAGE sql AS $$
  UPDATE hooks
  SET times_used   = times_used + 1,
      last_used_at = now()
  WHERE id = ANY(hook_ids);
$$;
