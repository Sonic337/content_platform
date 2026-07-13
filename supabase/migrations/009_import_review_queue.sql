-- Enable trigram similarity for hook deduplication / contradiction detection.
-- Called by find_similar_hooks() below and by future semantic search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index on hook_text makes similarity() fast over the full hooks table.
CREATE INDEX IF NOT EXISTS hooks_hook_text_trgm_idx
  ON hooks USING GIN (hook_text gin_trgm_ops);

-- ============================================================
-- IMPORT REVIEW QUEUE
-- Rows landed here instead of hooks when a CSV import finds
-- a similar existing hook (similarity > 0.4).
--   status='pending'          → tier mismatch (CONTRADICTION) — needs human review
--   status='duplicate_skipped' → same tier, likely duplicate — auto-skipped, visible for audit
--   status='resolved_kept_existing'  → reviewer chose to keep the existing hook
--   status='resolved_added_incoming' → reviewer chose to insert the incoming row anyway
-- incoming_payload stores all hook fields so 'resolved_added_incoming' can reconstruct the row.
-- ============================================================
CREATE TABLE import_review_queue (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  incoming_hook_text      text        NOT NULL,
  incoming_evidence_tier  text        NOT NULL,
  incoming_payload        jsonb       NOT NULL DEFAULT '{}',
  existing_hook_id        uuid        NOT NULL REFERENCES hooks(id),
  existing_evidence_tier  text        NOT NULL,
  similarity_score        real        NOT NULL,
  status                  text        NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'duplicate_skipped',
      'resolved_kept_existing',
      'resolved_added_incoming'
    )),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX import_review_queue_status_idx ON import_review_queue (status);

ALTER TABLE import_review_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alpha_all_access_import_review_queue"
  ON import_review_queue FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- find_similar_hooks(query_text, threshold)
-- Returns the single most-similar existing hook above the threshold.
-- Called by app/api/import-hooks/route.js per incoming CSV row.
-- threshold default 0.4 — tunable at call site.
-- ============================================================
CREATE OR REPLACE FUNCTION find_similar_hooks(
  query_text text,
  threshold  float DEFAULT 0.4
)
RETURNS TABLE (
  id               uuid,
  hook_text        text,
  evidence_tier    text,
  similarity_score real
)
LANGUAGE sql STABLE AS $$
  SELECT
    h.id,
    h.hook_text,
    h.evidence_tier,
    similarity(h.hook_text, query_text)::real AS similarity_score
  FROM hooks h
  WHERE similarity(h.hook_text, query_text) > threshold
  ORDER BY similarity_score DESC
  LIMIT 1;
$$;
