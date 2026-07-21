# ARCHITECTURE.md — MealDeal clean architecture

> The deep reference for how MealDeal is structured. `AGENTS.md` is the quick working rules + the
> `pnpm check` gate; **this file is the architecture the coder, reviewer, and planner must follow.**
> It is a living document — modeled on our further-along services and expected to grow. When a rule
> here can be mechanically enforced, it should move into `pnpm check` (see [§9](#9-enforcement)).

## North star

A **modular monolith** with **ports & adapters** boundaries and **factory-function dependency
injection**, wired at one composition root. Every external dependency (the DB, a third-party API,
an LLM, a mailbox) sits behind a **port the domain owns**; nothing framework- or vendor-specific
leaks inward. The dependency arrow always points one way:

```
resolver (delivery) → service (domain / use-case) → repository | adapter (data & I/O ports) → db | provider
```

Inner layers never import outer ones: a resolver never touches `db/`, a service never imports a
provider SDK, a repository never calls a service.

## 1. Where things live (folder = responsibility)

| Concern                       | Location                                                                        | Notes                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Entity (data slice)**       | `packages/api/src/entities/<entity>/`                                           | A low-level data slice: types · repository · service · graphql. Copy `entities/deal/`.    |
| **Feature (complex service)** | `packages/api/src/features/<name>/`                                             | A service with more complex business logic / orchestration. Same file roles as an entity. |
| **External-service adapter**  | `packages/api/src/third-party/<provider>/`                                      | Any third-party API / SDK / LLM / geocoder. Behind a port the slice owns.                 |
| **Cross-cutting kernel**      | `packages/api/src/common/`                                                      | `errors.ts`, `settings.ts`, `logger.ts`, `types.ts`. Imports nothing domain.              |
| **Persistence**               | `packages/api/src/db/`                                                          | Drizzle schema + client. Touched **only** by repositories.                                |
| **Composition / backbone**    | `services.ts`, `schema.ts`, `builder.ts`, `context.ts`, `server.ts`/`worker.ts` | The only wiring sites.                                                                    |
| **Ingest pipeline**           | `packages/api/src/ingest/`                                                      | `imap` / `extractor` are existing reference adapters.                                     |
| **Shared SDL**                | `packages/contract/`                                                            | The one artifact web + api both touch.                                                    |
| **Web SPA**                   | `packages/web/`                                                                 | Never imports `packages/api` — depends only on `@mealdeal/contract`.                      |

**A slice never lives at `src/<name>/`** — it is an `entity` (low-level data) or a `feature` (complex
business logic). **A provider's name / client / SDK must never appear outside `third-party/`** — a
slice depends on the port, not the provider.

## 2. The vertical slice — copy `entities/deal/`

Every feature is a vertical slice — `entities/<entity>/` for a low-level data entity, or
`features/<name>/` for a service with more complex business logic. Both use the same fixed file roles
(the import matrix is in `AGENTS.md`):

```
entities/<entity>/   # (or features/<name>/ for a complex-logic service)
  types.ts          # domain types + the slice's PORT interfaces (repository / service / adapter ports)
  repository.ts     # the ONLY layer that touches db/. Returns domain types.
  service.ts        # business logic / use-cases. Depends on PORT TYPES. Takes ctx.
  graphql/
    type.ts         # GraphQL object/enum types (Pothos refs)
    query.ts        # query resolvers — thin: validate args → ctx.services → shape result
    mutation.ts     # mutation resolvers (only if the slice has any)
  *.spec.ts         # unit tests (factory-DI mocks)
```

Register it in its **module's `index.ts`**: build its repo + service inside `get<Module>Services`,
add it to that module's services type, and add its `graphql/*` to the side-effect imports. The main
`services.ts` composes the module indexes (§4); `schema.ts` imports each module. Regenerate the
SDL + gql.tada and commit the generated files.

**Layer discipline:**

- **Resolvers are thin** — parse args, call one service method via `ctx.services`, shape the result.
  No `db/`/repository access, no business logic.
- **Services** hold the logic. They depend on **repository / adapter port _types_** (declared in the
  slice's `types.ts`), never on implementations, `db/`, a resolver, or a provider SDK.
- **Repositories** are the only code that touches `db/`. They return domain types; ORM detail never
  leaks upward. A repository never imports a service or resolver.

## 3. Ports & adapters — isolating every external dependency

External dependencies are where architecture erodes fastest, so this boundary is spelled out
explicitly.

**Any integration with something outside the process — a third-party HTTP API, an SDK, an LLM, a
mailbox — is a port implemented by an adapter.**

- **The port** is a plain interface declared in the _consuming slice's_ `types.ts`:

  ```ts
  // entities/location/types.ts
  export interface ZipCoordinateLookup {
    lookup(zip: string): Promise<Coordinate>; // throws LocationLookupError on failure
  }
  ```

- **The adapter** implements the port, lives in `third-party/<provider>/`, and is named
  `<provider>AdapterFactory`:

  ```ts
  // third-party/zippopotam/adapter.ts
  export function zippopotamAdapterFactory(deps: { httpClient: HttpClient }): ZipCoordinateLookup { … }
  ```

- **The adapter owns the transport and nothing else:** the URL, auth, the fetch call, mapping the
  provider's response, and **validating that response** — never trust a provider's shape; parse it
  with Zod at this boundary. Its request/response types are a _deliberately partial_ mirror of the
  provider — only the fields we use.
- **Domain logic lives in the service, not the adapter.** The adapter returns clean domain values or
  throws a typed error; the service decides what to do with them.
- **Adapters are wired only in `services.ts`** and injected into the service. A resolver, service, or
  repository **never** imports a provider SDK or the adapter directly — it depends on the **port**.
  Name the dependency after the **port** where it's consumed (`zipCoordinateLookup`); the concrete
  adapter name (`zippopotamAdapter`) lives only in `third-party/` and the composition root, so a slice
  never hard-codes which provider backs its port.

**Rich providers add a `service.ts` on top of the adapter (an anti-corruption layer).** When a
provider's raw API needs real translation before the domain can use it — multi-call flows, mapping its
shapes/errors into our terms — put that in `third-party/<provider>/service.ts` (a
`<provider>ServiceFactory` that takes the adapter as a dep and exposes the clean operations the domain
wants). The **adapter** stays a thin transport wrapper over the SDK/HTTP; the **service** holds the
provider-specific orchestration + shape/error mapping. So a `third-party/<provider>/` folder is:
**`adapter.ts`** (raw transport) · optional **`service.ts`** (provider logic → domain-friendly
interface) · **`types.ts`** (the provider's payload types). A rich provider's `service.ts` implements
the port the slice owns; a simple one (like `zippopotam`) skips the service and the `adapter.ts`
implements the port directly.

**Swappable providers (one port, many adapters).** When a capability can have more than one provider
(say a different geocoder), keep the one port and add a second adapter under its own
`third-party/<provider>/`; select the implementation in `services.ts` from settings — never branch
on the provider inside a service.

**A slice's data source can be an adapter, not a repository.** A data entity normally reads the DB
through a `repository.ts`; a slice with no DB table (e.g. `location`) instead depends on a
`third-party` adapter behind its port (`ZipCoordinateLookup`) — same shape, different backing store.

## 4. Modules & the composition root

- **Every unit is a factory** taking its dependencies as one object and returning an object typed by
  an explicit port: `dealServiceFactory({ dealRepository }): DealService`. No DI container, no
  decorators, no module-level singletons (they break test isolation).
- **Each top-level folder is a module with an `index.ts` that builds its own piece.**
  `entities/index.ts` → `getEntitiesServices(deps)`, `features/index.ts` → `getFeaturesServices(deps)`,
  `third-party/index.ts` → `getThirdPartyServices()`, and `common/index.ts` re-exports the kernel. A
  module takes what it needs as deps and registers its own GraphQL (side-effect imports); it never
  reaches into another module's internals.
- **"Internals" means implementations, not the type contract.** The rule above forbids reaching into
  another module's _implementations_ (`repository.ts` / `service.ts` / `adapter.ts`) or its runtime
  values — not its types. A **type-only** import of another slice's port or domain type (from its
  `types.ts`, §2/§3) is allowed and expected: it's how an adapter names the port it implements
  (`third-party/index.ts` → `ZipCoordinateLookup`) and how a higher
  module names the lower-module services it composes (`features/index.ts` → `DealService`). Ports are the
  shared contract — referencing them across modules is dependency inversion, not a boundary breach.
- **Dependencies flow one way — higher-level modules depend on lower-level ones, never the reverse.** The
  layering is `common` < `entities` < `features`, with `third-party` a leaf (adapters implementing
  entity-owned ports) and `services.ts` the root that wires them. A `feature` may compose `entities`, and
  anything may use `common`, but a lower-level module must never import a higher one: `entities` must not
  depend on `features`, and `common` must not depend on either. When a low-level module finds itself reaching
  _up_ the stack, don't invert the arrow to make it compile — read it as a design signal that the behaviour
  lives in the wrong layer, and lift it there. (Example: the app-overview `stats` read model once sat on the
  `deal` entity and had to reach up into the `ingestRun` feature for the last-ingest time; the fix was to move
  it into a `dashboard` feature that legitimately composes both — not to keep the entity's upward dependency.)
- **`services.ts` is the one composition root.** It calls each module's `get*Services`, injects the
  cross-module deps (a feature service, a third-party port), memoizes once, and exposes the combined
  typed `Services` registry reached through `ctx.services`. It is the only place modules are wired
  together; `schema.ts` assembles the GraphQL by importing each module.
- **`ctx` is threaded, not global.** The request context carries the service registry + request
  identity; pass it down. Services receive their dependencies by construction and use `ctx` only for
  request-scoped data — they do not reach back into `ctx.services` to resolve siblings (inject those
  as dependencies instead).
- **Prefer an injected clock over `Date.now()`** in business logic where timing matters — it keeps
  tests deterministic.

## 5. Naming

- **Factories:** `<name>ServiceFactory` / `<name>RepositoryFactory` / `<provider>AdapterFactory`,
  returning `<Name>Service` / `<Name>Repository` / the port type.
- **Ports / interfaces:** `<Entity>Service`, `<Entity>Repository`, or a capability name (e.g.
  `ZipCoordinateLookup`) — declared in the module's `types.ts`.
- **Methods — the read semantics are load-bearing:**
  - `find*` → may return `null` (absence is normal),
  - `get*` → throws `NotFoundError` (absence is exceptional),
  - `list*` → a collection.

  Use `<verb><Entity>`: `getDeal`, `listDeals`, `createDeal`, `updateDealStatus`.

- **Errors:** all typed errors — the base hierarchy and every slice-specific subclass — live in
  `common/errors.ts`, named `<Reason>Error`.
- **Enums:** model a fixed value set as a TS `enum` in the slice's `types.ts` and reuse it — the
  Drizzle column (`.$type<Enum>()`), the domain type, and the GraphQL enum (`builder.enumType(Enum, {
name })`). One source of truth; don't pair a string-literal union with a duplicate Pothos value list.
  Use **SCREAMING_SNAKE_CASE** for both key and value (`MUTE = 'MUTE'`) — the key is the GraphQL value
  name, the value is what's stored.

## 6. Errors, validation, logging, settings

- **Errors:** throw the typed classes from `common/errors.ts` (the single home for the error
  hierarchy); expose expected failures as typed
  **GraphQL result unions** (`errors: { types: [...] }`), never generic thrown errors across the
  resolver boundary. Don't catch an error just to swallow it — log and rethrow, or return a typed
  error.
- **Validate every untrusted boundary with Zod** — GraphQL args, IMAP payloads, LLM output, **and
  third-party responses**. (A coerced `null` or empty value silently becoming `0` at a provider
  boundary is the kind of bug this prevents — never trust a provider's shape.)
- **Settings:** read env only in `common/settings.ts` (Zod-validated, single source of truth); never
  `process.env` elsewhere. _(ESLint-enforced.)_
- **Logging:** use `common/logger.ts`; never `console.*`. _(ESLint-enforced.)_

## 7. Testing

- **Unit** (`*.spec.ts`, colocated): build a service with hand-mocked ports (see
  `entities/deal/service.spec.ts` — the reference test). DI is what makes this trivial: depend on port
  types, inject fakes.
- **Integration** (`pnpm test:integration`): the real composition root against a file-based test DB.
- Cover the error paths and edge cases (empty / null / boundary), not just the happy path. Keep time
  deterministic (injected clock / fake timers) — no real `Date.now()` in a test's logic.

## 8. Codegen & migrations

- Schema is **code-first (Pothos)**; `pnpm build-schema` emits `packages/contract/schema.graphql`,
  `pnpm gen` writes the web `graphql-env.d.ts`, `pnpm db:generate` produces Drizzle migrations.
- **Generated artifacts are committed and regenerated, never hand-edited** (drift is checked by
  `pnpm check`). Never hand-write a migration.

## 9. Enforcement — put architecture in `pnpm check`, not just prose

The rules above are only as strong as the gate, so the structural ones are machine-checked. What
`pnpm check` enforces (`eslint.config.js`, `eslint-plugin-boundaries`):

- **Every file under `packages/api/src/` matches a known element** (`no-unknown-files`) — a feature
  can't be dropped at `src/<name>/` outside `entities/` or `features/`, and a stray file fails the gate.
- **The dependency rule** (`boundaries/dependencies`): a resolver never reaches `db` / a repository /
  an adapter; a service never reaches `db` / a resolver / an adapter (it depends on port types); a
  repository never reaches a service / resolver / adapter; an **adapter** never reaches a service /
  repository / resolver / `db` (it owns only transport, behind the slice's port).
- **No provider / HTTP client imported inside a slice** (`no-restricted-imports`) — transport
  belongs in `third-party/<provider>/`.
- **Env access only in `common/settings.ts`; no `console.*`.**

**Principle: if an architecture rule matters, encode it in `pnpm check`.** Prose gets followed most
of the time; a red gate gets followed every time.

---

_Reference implementations: `entities/deal/` (the canonical slice) and `ingest/{imap,extractor}` (the
existing adapters). When adding an external integration, `third-party/` is the home; a low-level data
feature is an `entities/<entity>/` slice, a complex-logic service a `features/<name>/` one._
