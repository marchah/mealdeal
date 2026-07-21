# AGENTS.md — architecture & working rules for MealDeal

Read this before writing any code. These rules are **mechanically enforced** by `pnpm check`
(typecheck + ESLint layer boundaries + Prettier + tests + schema/codegen drift). Code that breaks
them cannot pass review and cannot be committed by the loop. Keep changes focused and idiomatic to
the surrounding code.

**For the full architecture — layers, ports & adapters, DI, naming, and the enforcement roadmap —
read [`ARCHITECTURE.md`](./ARCHITECTURE.md).** This file is the quick working rules + the gate;
`ARCHITECTURE.md` is the clean architecture the coder, reviewer, and planner follow.

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
   resolver (graphql/)          →  service.ts  →  repository.ts  →  db (Drizzle + libsql/SQLite)
                                        ▲
   ingest worker (imap → LLM extract → Zod) ┘  reuses the same services

packages/contract   the shared SDL (schema.graphql) — the ONLY artifact web + api both touch
```

Backend = a standalone Yoga server (a real `main()` in `server.ts`) with a **factory-function DI**
composition root. It also serves the built SPA's static files, so the whole thing ships as **one
container / one Node process** (the ingest cron runs in-process by default).

## Folder = slice, file = role

Each backend feature is a vertical slice — a folder under `packages/api/src/entities/<entity>/` (a
low-level **data entity**) or `packages/api/src/features/<name>/` (a service with more complex
**business logic**). Both have the same fixed file roles:

| File                | Role                                                  | May import                                                      | May NOT import                          |
| ------------------- | ----------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------- |
| `<e>/types.ts`      | domain types + repository/service **port interfaces** | `common`                                                        | anything with side effects              |
| `<e>/repository.ts` | data access — the **only** layer that touches the db  | `db/`, `drizzle-orm`, own `types`                               | a service or resolver                   |
| `<e>/service.ts`    | business logic                                        | repository **port types**, other services' port types, `common` | `db/` / `db/schema`, a resolver, Pothos |
| `<e>/graphql/*.ts`  | GraphQL types + resolvers (`type`/`query`/`mutation`) | `builder`, `common`, own `types`, other slices' `graphql` refs  | `db/`, a repository, an adapter         |
| `<e>/*.spec.ts`     | Vitest unit tests                                     | anything                                                        | —                                       |

Each module has an **`index.ts`** that builds its own services (`entities/index.ts` →
`getEntitiesServices`, `features/index.ts`, `third-party/index.ts`) or re-exports its surface
(`common/index.ts`); the individual slices stay plain files. Backbone (not per-slice): `builder.ts`
(the one Pothos builder), `services.ts` (composition root — composes the module indexes), `context.ts`
(request services + DataLoaders), `schema.ts` (imports each module to assemble GraphQL), `server.ts` /
`worker.ts` (entrypoints), `db/{schema,client,migrate}.ts`, `common/{errors,types}.ts`,
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
`entities/deal/service.spec.ts` — the reference test).

**Inject the repository (or the slice's own data port, e.g. `zipCoordinateLookup`) whole and first;
destructure every _other_ collaborator service to the functions used** — typed as the full service,
`dealService: { listDeals, countDeals }` — so the factory header shows exactly what it consumes. In
the unit test, **mock only those functions** (a partial object with `// @ts-expect-error partial mock`
above it); a missing-but-called mock makes the test fail, which is the point.

## How to add a feature / entity — copy the `deal` entity

`entities/deal/` is the **canonical reference**. Most features are **entities** (low-level data slices);
reserve `features/<name>/` for services with more complex business logic. To add an entity:

1. `cp -r packages/api/src/entities/deal packages/api/src/entities/<entity>` and rename the types/factories.
2. Adjust `types.ts` (domain type + ports), `repository.ts` (Drizzle queries), `service.ts` (logic),
   `graphql/{type,query,mutation}.ts` (GraphQL types + resolvers via `ctx.services`).
3. Register it in its module's **`index.ts`**: build its repo + service in `getEntitiesServices`, add
   it to `EntitiesServices`, and add its `graphql/*` to the side-effect imports. (`services.ts` and
   `schema.ts` already import the module index — no per-slice edit there.)
4. Run `pnpm build-schema` (updates `packages/contract/schema.graphql`) and, for web changes,
   `pnpm gen` (updates `graphql-env.d.ts`). **Commit both generated files.**
5. Add a `*.spec.ts` for the new service.

For a DB change: edit `db/schema.ts`, run `pnpm db:generate` (commits a migration), update the affected
repository + port + service together. Keep changes additive; keep `dedup_hash` stable.

For an **external integration** (third-party HTTP API, SDK, LLM, geocoder): put the adapter in
`packages/api/src/third-party/<provider>/` named **`<provider>AdapterFactory`**, behind a **port
interface declared in the consuming slice's `types.ts`**; wire it in `services.ts` and inject it into
the service. If the provider's raw API needs translation, add a `<provider>ServiceFactory` (`service.ts`)
on top of the adapter — the anti-corruption layer — and inject that instead. A provider's client/SDK
**must never appear outside `third-party/`**. See `ARCHITECTURE.md` §3.

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
pnpm check             # typecheck + lint (+ boundaries) + prettier + unit tests + drift — the gate
pnpm test:integration  # boot the real composition root against a file-based test DB (own CI job)
pnpm dev           # api (:4000) + web (Vite dev) together
pnpm build         # SDL → web build → api bundle
pnpm build-schema  # emit packages/contract/schema.graphql
pnpm gen           # build-schema + regenerate web graphql-env.d.ts
pnpm db:generate   # generate a Drizzle migration from db/schema.ts
```

## Definition of Done (satisfy before finishing a task)

- [ ] `pnpm check` is green (types, lint+boundaries, prettier, unit tests, drift).
- [ ] **Test pyramid** for new behavior: a **unit** test for any new service (factory-DI mock style,
      see `entities/deal/service.spec.ts`) **and** an **integration** test that exercises the new
      resolver/query against a real test DB (`pnpm test:integration`; template
      `packages/api/test/integration/deal.integration.spec.ts`). Tests must be meaningful and cover
      edge cases (empty/null/boundary/error), not just the happy path. (**e2e** with Playwright is
      required too once that infra lands — not yet built.)
- [ ] All inputs validated with **Zod** at the boundary (GraphQL args, IMAP, LLM output — never trust LLM shape).
- [ ] No secrets/PII in code or fixtures (**public repo**; config comes from env only).
- [ ] `packages/contract/schema.graphql` + `packages/web/src/graphql-env.d.ts` regenerated and committed.
- [ ] Follows the `deal` entity template: correct files/roles, factory-DI, data reached only via `ctx.services`.
- [ ] Web changes are accessibility-clean (no `jsx-a11y` errors).

## Reviewing a PR

Every PR gets a rigorous review against this file, the plan, and the test pyramid. Use the portable
**`review-pr`** skill (`.agents/skills/review-pr/SKILL.md`, mirrored to `.claude/skills/`): in Claude Code
run `/review-pr <PR#>`; in ChatGPT/Codex paste the skill plus `gh pr view/diff <N>` and `docs/PLAN.md`. It
grades spec conformance, architecture, the test pyramid, reuse/anti-duplication, correctness, security,
migrations, performance, readability, and hygiene, then emits APPROVE / REQUEST CHANGES + a must-fix list.
A PR missing a required test tier for new behavior is a blocker.

## Review guidelines

(Codex automatic PR review and the loop Reviewer read this section.)

- Judge a PR against **its slice/plan scope**, not the whole roadmap. An explicitly deferred
  layer is by-design, not a gap; require only the test tiers the delivered scope needs.
- REQUEST CHANGES only for **genuine defects** — broken, unsafe, or a violation of the rules in
  this file _as shipped_. MealDeal is a **single-user, self-hosted** app: do NOT block on
  enterprise hardening it doesn't need (rate-limiting, CSRF, multi-tenant authz, CVE audits) or
  on theoretical nits / style preferences.
- Always block a PR that: fails `pnpm check`; hand-edits a generated artifact (SDL /
  graphql-env.d.ts); hand-writes a migration; skips a required test tier for new behavior; reads
  `process.env` outside `common/settings.ts`; uses `console.*`; or crosses a layer boundary.
- Block a PR that puts an **external-service client outside `third-party/<provider>/`**, misnames an
  adapter (must be `<provider>AdapterFactory` behind a slice-owned port), or has a slice import a
  provider SDK directly instead of the port (`ARCHITECTURE.md` §3).

## Conventions

- **TypeScript strict** (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, …). Prefix intentionally
  unused params with `_`. Use `import type` for type-only imports.
- **Factory layout:** declare every method as a `function` in the factory body — the `return { … }`
  only lists them (never inline in the return, never a body/return mix; a body `function` restates the
  param types the inline form borrowed). Order methods, and `graphql/` `query` / `mutation` fields,
  reads → writes → the rest: `get`/`find` → `list` → `count` → `create`/`add` → `update` → `delete`,
  then composed/complex logic last (the SDL is sorted, so reordering graphql fields never drifts).
  Matches `entities/deal/`.
- **Explicit method names:** every service **and repository** method is entity-qualified and globally
  unique (`getDealById`, `countDeals`, `addDeal`, `findCouponTypeById`) — never a bare
  `get`/`count`/`add`/`list`. Keeps destructured collaborators unambiguous and collision-free.
- **Latest stable versions** of dependencies; commit the lockfile; bump deliberately.
- **Config:** every environment variable is read + validated (Zod) in `common/settings.ts` — the single
  source of truth. Import `settings`; **never read `process.env` elsewhere** (ESLint enforces this).
- **Logging:** use `common/logger.ts` (`logInfo` / `logWarning` / `logError` / `logException`, with a
  `{ tag, extra }` option); **never `console.*`** (ESLint enforces this).
- **Errors:** throw the typed classes in `common/errors.ts`; list them in a field's `errors` to expose
  as union members.
- **Enums:** a fixed value set is a TS `enum` (**SCREAMING_SNAKE_CASE** key **and** value, e.g.
  `MUTE = 'MUTE'`) in the slice's `types.ts`, reused by the Drizzle column (`.$type<Enum>()`) and the
  GraphQL enum (`builder.enumType(Enum, { name })`) — one source of truth, not a string-union + a
  duplicate Pothos value list.
- **No new runtime dependency** without a clear reason.
- **Run the gate (`pnpm check`) in your workspace and make it green before finishing** — never report a task done without it passing.

## Files to read first

`entities/deal/{types,repository,service,graphql/*,service.spec}.ts` (the template) · `entities/index.ts`
(a module composition root) · `services.ts`
(composition root) · `context.ts` (services + loaders) · `builder.ts` · `eslint.config.js` (the enforced
boundaries).
