# 🥕 MealDeal

Self-hosted grocery-deal tracker with an agent that reads your coupon/sale **newsletters** and turns
them into a browsable list of deals — mute what you don't buy, watchlist what you want, and (soon)
**get weekly recipes built from what's on sale**.

Bring your own **inbox** (any IMAP mailbox) and your own **LLM** (any OpenAI-compatible endpoint —
OpenAI, a local model, Ollama, …). Nothing is hard-coded to a vendor; it runs anywhere Docker does.

## How it works

```
newsletters → a dedicated inbox ──IMAP──▶ MealDeal (one container)
                                          ├─ ingest worker (scheduled): fetch → LLM extract → SQLite
                                          └─ web: list deals · mute/watchlist · (soon) recipes
```

You sign up to store newsletters using a **dedicated mailbox** (tip: use plus-addressing —
`you+safeway@gmail.com` — so each deal's source is tagged). A scheduled worker reads new mail, asks
your LLM to extract structured deals, and stores them. The website lists the active ones.

## Quick start

```bash
cp .env.example .env      # set IMAP_* (your mailbox) and OPENAI_* (your LLM endpoint)
docker run --rm -p 3000:3000 --env-file .env -v mealdeal-data:/app/data ghcr.io/marchah/mealdeal:latest
# open http://localhost:3000
```

Or with compose (`docker compose up -d`), or from source for development:

```bash
npm install
cp .env.example .env
npm start                 # Node >= 26; runs TypeScript directly (no build step)
```

Run one ingest pass immediately (handy for testing): `npm run ingest:once` — or set `INGEST_ON_START=true`.

## Configuration (env)

| Var | What |
|---|---|
| `PORT` | web port (default 3000) |
| `DATABASE_PATH` | SQLite file (default `./data/mealdeal.db`; mount a volume) |
| `IMAP_HOST/PORT/USER/PASSWORD/MAILBOX` | the mailbox to read (Gmail: use an App Password) |
| `OPENAI_BASE_URL/API_KEY/MODEL` | any OpenAI-compatible chat endpoint used to extract deals |
| `INGEST_CRON` | schedule (default `0 7 * * *`); `INGEST_ON_START=true` to also run at boot |
| `INGEST_TOKEN` | optional bearer token to enable `POST /api/ingest` for external pushes |

Without `IMAP_*`, the web UI still runs (ingestion just stays off).

## Security

- **No built-in auth.** Keep it on a trusted LAN or put it behind a reverse proxy with auth before exposing it publicly.
- Secrets live only in your `.env` (git-ignored). Never commit credentials.

## Roadmap

v1: ingest + dedup + auto-expire, list/filter, mute/watchlist. Next: source insight + unsubscribe,
"good deal?" scoring, shopping list. Later: **weekly recipes from on-sale ingredients**, savings tracker.

## Contributing / development

See [`AGENTS.md`](./AGENTS.md) for the architecture, conventions, and the data/ingest contract. TS on
Node 26, Express, `node:sqlite`, ESLint. `npm run lint` / `npm run typecheck` must pass. MIT licensed.
