-- Content Ops Platform — Alpha schema
-- Target: Supabase (Postgres)
-- Modules: Topics feed, Hook bank, Writing corpus
-- Retrieval: structured filtering now; vector columns reserved (nullable) for embeddings later

create extension if not exists vector; -- pgvector, needed later for embeddings, safe to enable now

-- ============================================================
-- TOPICS FEED
-- Placeholder-fed for the alpha. Real rows will come from Hermes later.
-- ============================================================
create table topics (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  summary       text,
  source_name   text,
  source_url    text,
  date_added    timestamptz not null default now(),
  tags          text[] default '{}',
  status        text not null default 'new' check (status in ('new', 'reviewed', 'used')),
  embedding     vector(1536)  -- nullable, populated later
);

create index topics_tags_idx on topics using gin (tags);
create index topics_status_idx on topics (status);

-- ============================================================
-- HOOK BANK
-- Schema mirrors master_hook_bank.xlsx exactly so the existing 117 rows
-- can be imported as-is.
-- ============================================================
create table hooks (
  id                 uuid primary key default gen_random_uuid(),
  hook_text          text not null,
  platform           text,
  category_pattern   text,     -- "Category / Pattern" column
  creator_archetype  text,
  mechanism          text,
  evidence_tier      text not null check (
    evidence_tier in ('VERIFIED 3-0', 'VERIFIED 2-1', 'SOURCED, UNVERIFIED', 'NOT CONFIRMED')
  ),
  source_report      text,
  notes              text,
  embedding          vector(1536)  -- nullable, populated later
);

create index hooks_platform_idx on hooks (platform);
create index hooks_evidence_tier_idx on hooks (evidence_tier);
create index hooks_category_idx on hooks (category_pattern);

-- ============================================================
-- WRITING CORPUS
-- Articles/posts used to train the AI on voice and style.
-- ============================================================
create table corpus (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  body_text          text not null,
  platform_published text,
  date_published     date,
  tags               text[] default '{}',
  purpose            text not null default 'style_reference',
  embedding          vector(1536)  -- nullable, populated later
);

create index corpus_tags_idx on corpus using gin (tags);

-- ============================================================
-- Row Level Security — enable now, open policy for alpha (single/small team).
-- Tighten before adding external agent write access.
-- ============================================================
alter table topics enable row level security;
alter table hooks enable row level security;
alter table corpus enable row level security;

create policy "alpha_all_access_topics" on topics for all using (true) with check (true);
create policy "alpha_all_access_hooks" on hooks for all using (true) with check (true);
create policy "alpha_all_access_corpus" on corpus for all using (true) with check (true);
