# Content Ops Platform

Internal content-operations dashboard for a two-person AI content creator
operation (short-form + long-form video: AI tools, vibe-coding,
build-in-public, AI SaaS).

## Stack

- **Framework:** Next.js (App Router) + Tailwind
- **Database:** Supabase (Postgres)
- **Hosting:** Vercel
- **Text generation:** Claude (`claude-sonnet-5`) via the Anthropic API
- **Thumbnails:** fal.ai
- **News ingestion:** Telegram (webhook + on-demand fetch via GramJS)

## What it does

Seven core pages, each backed by a Supabase table:

| Page | Purpose |
|---|---|
| `/topics` | News feed — ingested from Telegram, AI-reviewed and scored, human-approved before use |
| `/hooks` | Evidence-tiered hook bank (117 seeded hooks), usage tracking, per-platform transform |
| `/corpus` | Past writing samples for voice-matching (not yet populated) |
| `/pipeline` | Core generation: script, hooks, titles, thumbnail — draft only, nothing auto-publishes |
| `/analytics` | Manual performance logging per published post |
| `/import-review` | Duplicate/contradiction review queue for bulk hook imports |
| `/hook-performance` | Read-only audit: which evidence tiers actually perform |

News flows in from Telegram (a webhook for live delivery, or a manual
"Fetch group news" button for on-demand pulls from a specific group),
gets AI-reviewed and scored against an explicit rubric
(`skills/content-review.md`), and lands as `pending_review` topics for a
human to approve or reject before anything downstream uses them.

## Running locally

```bash
npm install
cp .env.local.example .env.local   # fill in real values
npm run dev
```

Required environment variables are listed in `.env.local.example` with
comments on where to obtain each one. None of them have real values
committed anywhere in this repo.

## Deployment

Deployed on Vercel, connected to this repo's `main` branch. Environment
variables are set separately in the Vercel dashboard (Project Settings →
Environment Variables) — they are **not** derived from `.env.local` and
must be kept in sync manually when a new variable is introduced.

Database migrations live in `supabase/migrations/` and are run manually
in the Supabase SQL editor — there is no automated migration runner yet.
Each migration file is self-contained and includes a verifying `SELECT`
at the end.

## Current process gaps (being addressed)

This project has moved fast as a solo prototype. The following are known,
explicit gaps rather than oversights:

- No PR/branch workflow yet — commits go directly to `main`.
- No issue tracker (GitHub Issues / Linear / Notion) — bugs are found,
  fixed, and discussed live rather than logged.
- No CI, no automated tests, no automated linting on push.
- No formal code review — verification has been manual (real command
  output, real query results checked against every change before
  trusting it), not automated.

See `CHANGELOG.md` for a full history of what's been built.
