# Content Ops Platform — alpha

Internal dashboard for topics, hooks, and writing corpus. Three modules,
backed by Supabase. Analytics and the automation pipeline are not built yet.

## Stack

- Next.js (App Router) + Tailwind
- Supabase (Postgres, REST API, auth)
- Deploy target: Vercel

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

## Database setup

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/migrations/001_alpha_schema.sql`.
   This creates `topics`, `hooks`, and `corpus` with RLS enabled and an
   open policy (tighten before giving external agents write access).
3. The `hooks` table schema matches `master_hook_bank.xlsx` column-for-column.
   Export that sheet to CSV and import it via Supabase's table editor
   ("Import data from CSV") to seed the real 117 rows.

## What's not here yet

- Hermes ingestion (topics table is placeholder-fed for now)
- Embeddings / semantic search (vector columns exist, unused)
- Analytics module
- Automation pipeline (news in -> script/hooks/title/thumbnail out)

## Design

Current UI is a functional skeleton, not a finished visual design. Next
pass on this should apply real typography/layout decisions rather than
default Tailwind grays.
