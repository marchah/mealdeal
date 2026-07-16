# MealDeal

Self-hosted grocery-deal tracker. An ingest worker reads a dedicated IMAP mailbox on a schedule, uses
an OpenAI-compatible LLM to extract structured deals, and stores them in SQLite; a small web app lists
active deals and manages mute/watchlist preferences. **Bring your own inbox + LLM. One container.**

## Stack

- **API** — GraphQL (Yoga + Pothos, code-first) on a clean-architecture, factory-DI backend
- **Database** — Drizzle ORM over SQLite (libsql); Postgres-ready
- **Web** — React 19 + Vite + Tailwind v4 + shadcn/ui, typed GraphQL via gql.tada + urql
- **Monorepo** — pnpm workspaces: `packages/api`, `packages/web`, `packages/contract`

## Run it (Docker)

```bash
cp .env.example .env      # fill in IMAP_* and OPENAI_*
docker compose up --build
# → http://localhost:4000   (SPA + GraphQL at /graphql)
```

Everything runs as one container: the API serves the built SPA and `/graphql`, and runs the ingest
worker in-process (SQLite lives on a mounted volume).

## Develop

```bash
pnpm install
pnpm dev        # API on :4000 + the Vite dev server
pnpm check      # the gate: typecheck + lint (+ layer boundaries) + prettier + tests + codegen drift
```

## Architecture & contributing

See **[AGENTS.md](./AGENTS.md)**. The backend is layered `resolver → service → repository → db`, and
that boundary is enforced by ESLint (not just convention). Adding a feature = copy the canonical
`packages/api/src/modules/deal/` module. Small, focused PRs; keep `pnpm check` green.

## License

MIT
