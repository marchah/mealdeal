---
name: mealdeal-feature
description: How to add or change a feature in MealDeal — copy the canonical deal slice, wire it, regenerate the SDL, and pass pnpm check.
---

# Adding a feature to MealDeal

Read `AGENTS.md` first. The architecture is layered and **machine-enforced** by `pnpm check`.

## Add an entity (copy the canonical slice)

1. `cp -r packages/api/src/entities/deal packages/api/src/entities/<entity>` (use `features/<name>/`
   instead only when the slice is a service with more complex business logic, not a data entity).
2. Rename the types + factories; adjust `types.ts` (domain type + ports), `repository.ts` (Drizzle
   queries), `service.ts` (logic), `graphql/{type,query,mutation}.ts` (GraphQL type + fields via
   `ctx.services`).
3. Register it in its module's `index.ts` — for an entity, `packages/api/src/entities/index.ts`: build
   its repo + service in `getEntitiesServices`, add it to `EntitiesServices`, and add its `graphql/*` to
   the side-effect imports. (`services.ts` and `schema.ts` import the module index, not each slice — no
   edit there.)
4. `pnpm build-schema` (and `pnpm gen` for web changes); **commit** `packages/contract/schema.graphql`
   and `packages/web/src/graphql-env.d.ts`.
5. Add a `*.spec.ts` mocking the ports (see `entities/deal/service.spec.ts`).

## External integration (third-party API / SDK / LLM)

Put the client in `packages/api/src/third-party/<provider>/` as `<provider>AdapterFactory`, behind a
**port interface declared in the consuming slice's `types.ts`**; wire it in `services.ts` and inject the
**port** into the service. A provider's client/SDK must never appear outside `third-party/`. See
`ARCHITECTURE.md` §3.

## Rules that fail the build if broken

- **Layer rule:** resolver → service → repository → db. Resolvers reach data only via `ctx.services`;
  services depend on repository port types, never the db.
- GraphQL fields are **non-null by default**; validate all inputs with **Zod**; **no secrets** (public repo).

## Finish

`pnpm check` must be green: typecheck + ESLint boundaries + Prettier + tests + schema/codegen drift.
