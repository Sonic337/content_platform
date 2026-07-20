-- 017_source_items.sql
-- Shared staging table for Day 5 ingestion sources (changelogs, MCP scout,
-- cross-source signal, etc.) — anything that ISN'T Telegram, which keeps
-- using raw_news_items unchanged (its bigint chat/message ID columns don't
-- generalize to non-Telegram sources; forcing them through would mean
-- faking meaningless values, the same class of bug as the topic_id
-- Number() coercion fixed in migration 016).
--
-- DO NOT RE-RUN — reference only once applied to the live database.

create table if not exists source_items (
  id             uuid          primary key default gen_random_uuid(),
  source_type    text          not null,   -- 'changelog' | 'mcp_scout' | etc. — extend freely, no fixed enum, since Day 5's exact source list may grow
  external_id    text          not null,   -- whatever uniquely identifies this item WITHIN its source (a changelog entry's URL+version, an MCP registry ID, etc.) — meaning is source_type-specific, not globally interpreted
  content_text   text          not null,   -- the actual text content to run through analyze-news — same role as raw_news_items.message_text, renamed because "message" doesn't make sense for a changelog entry
  observed_at    timestamptz   not null,   -- when the underlying event/change actually happened, if known; falls back to received_at if not determinable at ingestion time
  received_at    timestamptz   not null default now(),
  raw_payload    jsonb         not null,   -- full original payload from the source, for debugging — same role as raw_news_items.raw_payload
  status         text          not null default 'unprocessed',  -- 'unprocessed' | 'processed' | 'ignored' — same values, same meaning as raw_news_items.status

  constraint source_items_source_external_unique
    unique (source_type, external_id)
);

alter table source_items enable row level security;
create policy "open" on source_items for all using (true);

-- topics needs to trace back to EITHER raw_news_items OR source_items now.
-- A single FK column can't reference two tables — add a second, separate
-- nullable FK instead of trying to force one column to do both jobs.
-- Exactly one of source_raw_news_item_id / source_item_id should be set
-- per topic row (enforced at the application level in analyze-news, not
-- a DB constraint, since a CHECK across two nullable FKs adds complexity
-- disproportionate to the benefit here).
alter table topics
  add column if not exists source_item_id uuid references source_items(id) on delete set null;

-- Verify everything landed correctly
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'source_items'
order by ordinal_position;

select column_name, data_type
from information_schema.columns
where table_name = 'topics' and column_name = 'source_item_id';
