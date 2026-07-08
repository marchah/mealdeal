# AGENTS.md — working rules for coding agents on MealDeal

Read this before editing. It defines the architecture, the conventions, and the contract you must not
break. Keep changes focused and idiomatic to the surrounding code.

## What MealDeal is

A self-hosted app: an **ingest worker** reads a dedicated IMAP mailbox on a schedule, uses an
**OpenAI-compatible LLM** to extract structured grocery deals from newsletter emails, and stores them
in **SQLite**; a **web** app lists active deals and manages mute/watchlist prefs. One container, bring
your own inbox + LLM. North star: weekly recipes generated from on-sale ingredients.

## Architecture (files)

- `src/index.ts` — entrypoint: starts the web server + schedules the ingest worker (node-cron).
- `src/config.ts` — all config from env. Add new knobs here + document them in `.env.example`.
- `src/server.ts` — Express API + serves `public/`. Routes: `/api/health`, `/api/deals`,
  `/api/prefs` (GET/POST/DELETE), `/api/ingest` (optional external push, token-gated — TODO).
- `src/db/db.ts` + `src/db/schema.sql` — the SQLite layer. **All DB access goes through `Db`.**
- `src/ingest/{imap,extract,worker,run-once}.ts` — fetch mail → LLM extract → dedup + store.
- `src/types.ts` — the shared contract (`Deal`, `ExtractedDeal`, `TrackingPref`, `FetchedEmail`).
- `public/index.html` — the UI (currently a stub — this is the main thing to build out).

## The contract — change deliberately

`src/types.ts` + `src/db/schema.sql` are the agreement between the worker (writes) and the web (reads).
If you change a field, update **schema.sql, the types, the `Db` methods, and any callers together**, and
keep `dedup_hash` stable (deals dedup on it). Prefer additive changes.

## Conventions

- **TypeScript on Node ≥ 26**, run natively (no build step). ESM (`"type": "module"`).
- **Relative imports include the `.ts` extension** (e.g. `import { Db } from './db/db.ts'`).
- Only **erasable** TS (types/interfaces/`type` imports) — no enums, no parameter properties
  (enforced by `erasableSyntaxOnly`).
- SQLite via the built-in **`node:sqlite`** (`DatabaseSync`). No new DB deps without reason.
- Keep runtime **dependencies minimal**; new deps need a clear justification.
- Secrets only via env; never hard-code or commit them (repo is public).

## Commands (must pass before committing)

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (fix: npm run lint:fix)
npm start           # boot locally
npm run ingest:once # run a single ingest pass against your configured inbox
```

## What to build (good next tasks)

- Flesh out `public/index.html`: filters/search, category grouping, expiry sorting, watchlist view.
- Tune the extraction prompt in `src/ingest/extract.ts` (grocery focus, category taxonomy, ISO dates,
  precision — skip non-deals). This is the biggest quality lever.
- Implement `POST /api/ingest` (validate `ExtractedDeal[]`, upsert) if you want external ingesters.
- Later: a `recipes` feature (schema + endpoint + UI) that plans meals from active, non-muted deals.

## Verify your change end-to-end

Boot the app, add a sample deal (via a real newsletter or a temporary test), confirm it appears in the
UI, mute its item/category and confirm it disappears. Don't rely on the agent's words — check the DB/UI.

## PRs

Small, focused branches → PR against `main`. CI runs typecheck + lint on every PR; keep them green.
