# AGENTS.md — architecture & working rules for MealDeal

Read this before writing any code. These rules are **mechanically enforced** by `pnpm check`
(typecheck + ESLint layer boundaries + Prettier + tests + schema/codegen drift). Code that breaks
them cannot pass review and cannot be committed by the loop. Keep changes focused and idiomatic to
the surrounding code.

## What MealDeal is

A self-hostable app: an **ingest worker** reads a dedicated IMAP mailbox on a schedule, uses an
**OpenAI-compatible LLM** to extract structured grocery deals from newsletter emails, and stores them
in **SQLite**; a **web app** lists active deals and manages mute/watchlist prefs. One container, bring
your own inbox + LLM. North star: weekly recipes generated from on-sale ingredients.

## Architecture (decoupled backend + SPA, one container)

```
packages/web  (React SPA, urql + gql.tada)
      │  GraphQL over /graphql  (typed by the committed SDL)
      ▼
packages/api  (GraphQL Yoga)
   resolver (schema.pothos.ts)  →  service.ts  →  repository.ts  →  db (Drizzle + libsql/SQLite)
                                        ▲
   ingest worker (imap → LLM extract → Zod) ┘  reuses the same services

packages/contract   the shared SDL (schema.graphql) — the ONLY artifact web + api both touch
```

Backend = a standalone Yoga server (a real `main()` in `server.ts`) with a **factory-function DI**
composition root. It also serves the built SPA's static files, so the whole thing ships as **one
container / one Node process** (the ingest cron runs in-process by default).

## Folder = module, file = role

Each backend feature is a folder under `packages/api/src/modules/<entity>/`. Files have fixed roles:

| File                   | Role                                                  | May import                                                      | May NOT import                          |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------- |
| `<e>/types.ts`         | domain types + repository/service **port interfaces** | `common`                                                        | anything with side effects              |
| `<e>/repository.ts`    | data access — the **only** layer that touches the db  | `db/`, `drizzle-orm`, own `types`                               | a service or resolver                   |
| `<e>/service.ts`       | business logic                                        | repository **port types**, other services' port types, `common` | `db/` / `db/schema`, a resolver, Pothos |
| `<e>/schema.pothos.ts` | GraphQL types + resolvers                             | `builder`, own `service`/`types`, `common`, other modules' refs | `db/`, a repository                     |
| `<e>/*.spec.ts`        | Vitest unit tests                                     | anything                                                        | —                                       |

Backbone (not per-module): `builder.ts` (the one Pothos builder), `services.ts` (composition root —
the only wiring site), `context.ts` (request services + DataLoaders), `schema.ts` (assembles modules),
`server.ts` / `worker.ts` (entrypoints), `db/{schema,client,migrate}.ts`, `common/{errors,types}.ts`,
`ingest/{imap,extractor,run}.ts`.

## The hard dependency rule (enforced by ESLint `boundaries/dependencies`)

**resolver → service → repository → db.** Never skip or invert a layer:

- A **resolver never imports `db/` or a repository** — it reaches data only via `ctx.services`.
- A **service never imports `db/schema` or a resolver** — it depends on repository **port types**.
- A **repository never imports a service or resolver** — it is the bottom data layer.
- The **web package never imports the api package** (it depends only on `@mealdeal/contract`).

If a resolver needs data, add a method to the service. If a service needs data, add a method to the
repository port + its implementation. Violations fail `pnpm lint` with a "Layer violation" message.

## Dependency injection (no library, no decorators)

Every unit is a **factory** that takes its dependencies as one object and returns an object typed by
an explicit **port interface**:

```ts
export function dealServiceFactory({ dealRepository }: { dealRepository: DealRepository }): DealService { … }
```

The graph is wired **once** in `getServices()` (`services.ts`), memoized, and reached through the
request `ctx` (`ctx.services.dealService…`). This works with Node's runtime (no `reflect-metadata`, no
build magic) and makes unit tests trivial: build a service with hand-mocked ports (see
`modules/deal/service.spec.ts` — the reference test).

## How to add a feature / entity — copy the `deal` module

`modules/deal/` is the **canonical reference**. To add an entity:

1. `cp -r packages/api/src/modules/deal packages/api/src/modules/<entity>` and rename the types/factories.
2. Adjust `types.ts` (domain type + ports), `repository.ts` (Drizzle queries), `service.ts` (logic),
   `schema.pothos.ts` (GraphQL type + query/mutation fields via `ctx.services`).
3. Register it in **`services.ts`** (build its repo + service, add to `Services`) and import its
   `schema.pothos` in **`schema.ts`**.
4. Run `pnpm build-schema` (updates `packages/contract/schema.graphql`) and, for web changes,
   `pnpm gen` (updates `graphql-env.d.ts`). **Commit both generated files.**
5. Add a `*.spec.ts` for the new service.

For a DB change: edit `db/schema.ts`, run `pnpm db:generate` (commits a migration), update the affected
repository + port + service together. Keep changes additive; keep `dedup_hash` stable.

## GraphQL / codegen workflow

- Schema is **code-first (Pothos)**; `pnpm build-schema` prints the SDL to `packages/contract/schema.graphql`
  headlessly (no running server).
- The web gets typed operations from that SDL via **gql.tada** (`pnpm gen` writes `graphql-env.d.ts`).
- Both generated files are **committed and drift-checked** (`pnpm check:drift` fails if stale).
- New GraphQL fields default **non-null** (`defaultFieldNullability: false`); mark genuinely-optional
  fields `nullable: true`. Surface expected failures as typed **result unions** via `errors: { types: [...] }`
  (see `deal` query → `NotFoundError`), not thrown generic errors.

## Commands that must pass

```bash
pnpm check         # typecheck + lint (+ boundaries) + prettier + tests + drift — the gate
pnpm dev           # api (:4000) + web (Vite dev) together
pnpm build         # SDL → web build → api bundle
pnpm build-schema  # emit packages/contract/schema.graphql
pnpm gen           # build-schema + regenerate web graphql-env.d.ts
pnpm db:generate   # generate a Drizzle migration from db/schema.ts
```

## Definition of Done (satisfy before finishing a task)

- [ ] `pnpm check` is green (types, lint+boundaries, prettier, tests, drift).
- [ ] A unit test was added for any new service (factory-DI mock style).
- [ ] All inputs validated with **Zod** at the boundary (GraphQL args, IMAP, LLM output — never trust LLM shape).
- [ ] No secrets/PII in code or fixtures (**public repo**; config comes from env only).
- [ ] `packages/contract/schema.graphql` + `packages/web/src/graphql-env.d.ts` regenerated and committed.
- [ ] Follows the `deal` module template: correct files/roles, factory-DI, data reached only via `ctx.services`.
- [ ] Web changes are accessibility-clean (no `jsx-a11y` errors).

## Conventions

- **TypeScript strict** (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, …). Prefix intentionally
  unused params with `_`. Use `import type` for type-only imports.
- **Latest stable versions** of dependencies; commit the lockfile; bump deliberately.
- **Errors:** throw the typed classes in `common/errors.ts`; list them in a field's `errors` to expose
  as union members.
- **No new runtime dependency** without a clear reason.
- **Never** run `npm`/build/tests inside the orchestrator — the loop runs checks on the coder-runner.

## Files to read first

`modules/deal/{types,repository,service,schema.pothos,service.spec}.ts` (the template) · `services.ts`
(composition root) · `context.ts` (services + loaders) · `builder.ts` · `eslint.config.js` (the enforced
boundaries).
