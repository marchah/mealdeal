---
name: mealdeal-feature
description: How to add or change a feature in MealDeal — copy the canonical deal module, wire it, regenerate the SDL, and pass pnpm check.
---

# Adding a feature to MealDeal

Read `AGENTS.md` first. The architecture is layered and **machine-enforced** by `pnpm check`.

## Add an entity (copy the canonical module)

1. `cp -r packages/api/src/modules/deal packages/api/src/modules/<entity>`
2. Rename the types + factories; adjust `types.ts` (domain type + ports), `repository.ts` (Drizzle
   queries), `service.ts` (logic), `schema.pothos.ts` (GraphQL type + fields via `ctx.services`).
3. Register it in `packages/api/src/services.ts` (build its repo + service, add to `Services`) and
   import its `schema.pothos` in `packages/api/src/schema.ts`.
4. `pnpm build-schema` (and `pnpm gen` for web changes); **commit** `packages/contract/schema.graphql`
   and `packages/web/src/graphql-env.d.ts`.
5. Add a `*.spec.ts` mocking the ports (see `modules/deal/service.spec.ts`).

## Rules that fail the build if broken

- **Layer rule:** resolver → service → repository → db. Resolvers reach data only via `ctx.services`;
  services depend on repository port types, never the db.
- GraphQL fields are **non-null by default**; validate all inputs with **Zod**; **no secrets** (public repo).

## Finish

`pnpm check` must be green: typecheck + ESLint boundaries + Prettier + tests + schema/codegen drift.
