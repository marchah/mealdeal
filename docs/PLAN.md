# MealDeal v2 — Pantry price tracking; coupon ingestion on pause

## Why this plan

The v1 premise was "a coupon newsletter arrives, we extract deals from it". That premise is
**unproven** — no newsletter worth ingesting has been found. Rather than keep building on it, v2
**pauses ingestion behind a flag** (the pipeline stays intact and tested, it just doesn't run) and
puts the product weight behind a second, self-sufficient feature: **Pantry** — the items we buy
regularly, their price history, and a straight answer to *"is $19.94 a good price for this?"*

Pantry becomes the app's primary tab and default view; Coupons keeps everything v1 built, behind a
banner saying nothing new is arriving. The two halves stay one app and share a spine (merchants, the coupon-type taxonomy, the DI graph),
so re-enabling ingestion later is a config change, not a rebuild — and once it is back on, a coupon
for a tracked pantry item is an obvious, cheap payoff (follow-up F2).

### Naming decision

Top-level tabs are **Pantry** and **Coupons**, in that order — **Pantry is the primary tab and the
default landing view**. That ordering is the plan's thesis made visible: the proven feature is the one
you open the app for, and Coupons is the paused half you visit when you want to. "Pantry" is literally
*the items you buy regularly*, it is one word, and it avoids two live collisions: `trackingPref`
already owns the word *tracking* (and a `WATCHLIST` `PrefKind`), and *watchlist* would then mean two
different things.

The app's header copy moves with it: "Active grocery deals from your inbox" describes a pipeline that
is switched off, so it becomes something Pantry-first ("Know a good price when you see one").

Slices: `entities/pantryItem/` (the product) + `entities/priceEntry/` (one observed price) +
`features/priceInsight/` (the verdict engine).

## v1 status — delivered

Features 1–12 of the previous plan are **all merged**: the `couponType` taxonomy, merchant
location + geocoding via `third-party/nominatim/`, the `store` + `newsletter` slices, the near-me
queries, the web near-me view, ingest-time coupon-type classification, HTML→Markdown
preprocessing (mdream), and the folder-backed offline email source + archive. Nothing there is
removed by this plan; it is switched off at the entrypoint and kept green.

## Architecture fit

Every new slice is the **copy-the-`deal`-entity** pattern from `AGENTS.md` — same file roles, same
factory DI, same `resolver → service → repository → db` rule.

```
entities/pantryItem/    (new — the product you buy regularly)
entities/priceEntry/    (new — one observed price, at a merchant, on a date)
features/priceInsight/  (new — price history statistics + the GREAT/GOOD/TYPICAL/HIGH verdict)
features/appConfig/     (new — exposes "coupon ingestion is off" to the SPA)
common/units.ts         (new — Unit enums + conversion; see the deviation note below)
third-party/mdream|openai|productPage/   (provider clients, moved/added)
```

### Three decisions a reviewer should check first

1. **Categories reuse `coupon_types`.** A pantry item's category FKs the *existing* seeded taxonomy
   (food, household, beverages, snacks, personal-care, pharmacy, pet-supplies, other) rather than
   introducing a parallel table. It is exposed on the GraphQL type as `PantryItem.category: CouponType!`
   — a slightly odd type name for a pantry field, accepted deliberately over a risky app-wide rename
   (`Deal.category` is already taken by the free-text LLM value, so `CouponType`→`Category` would
   collide). Renaming the entity is optional debt, tracked as follow-up F5. The payoff is that a
   coupon and a pantry item speak one vocabulary, which is what makes F2 nearly free.

2. **`common/units.ts` holds enums *and* conversion math.** `AGENTS.md` says a fixed value set lives
   in the slice's `types.ts`, but `Unit` is consumed by two slices, the Drizzle schema, the Pothos
   enum and the insight feature, and the conversion table is not a type. It has the same standing as
   `common/errors.ts`: a pure, side-effect-free reference module every layer may import. Called out
   here so it reads as a decision, not a slip.

3. **`unitPrice` is denormalized on write, in canonical base units.** Every `price_entries` row stores
   `unit_price` already normalized (per ounce / per fluid ounce / per count / per square foot). This is
   the whole reason the feature works: a 150 fl-oz jug and a 2-pack of 46 fl-oz bottles become
   directly comparable numbers, and "is this a good deal" collapses to a `min`/`median` over one
   indexed column instead of a per-row conversion in JS. Display unit ($/oz vs $/gal) is a
   presentation concern resolved at read time from the item's `unit_price_unit`.

## Data model

| Table | Key columns | Notes |
|---|---|---|
| `pantry_items` | id, name, brand, coupon_type_id (FK), image_url, size_amount, size_unit, unit_price_unit, target_price, notes, archived, created_at | The product. `archived` is a soft delete so history survives. |
| `price_entries` | id, pantry_item_id (FK, cascade), merchant_id (FK, nullable), price, currency, size_amount, size_unit, quantity, unit_price, on_sale, source, url, note, observed_at, created_at | One observation. `unit_price` canonical + indexed on `(pantry_item_id, observed_at)`. |
| `merchants` | *(unchanged)* | Reused as the "where I saw it" dimension — Costco, Target, Amazon. Teaches you which store is cheapest per item. |
| `coupon_types` | *(unchanged)* | Reused as the pantry category taxonomy. `seedCouponTypes()` in `server.ts` is now load-bearing for Pantry too. |

New enums (TS `enum`, SCREAMING_SNAKE key **and** value, per the conventions):

- `UnitDimension` — `COUNT | WEIGHT | VOLUME | AREA`
- `Unit` — `COUNT`, `OUNCE`, `POUND`, `FLUID_OUNCE`, `PINT`, `QUART`, `GALLON`, `SQUARE_FOOT`
  (paper towels, foil). **US customary only**: this is a US household, and a US-only set makes every
  conversion factor an exact integer (16, 32, 128), so there is no floating-point error anywhere in
  the comparison path. Adding a metric unit later is one enum member and one factor.
- `PriceSource` — `MANUAL | IMPORT | COUPON`
- `PriceVerdict` — `GREAT | GOOD | TYPICAL | HIGH | UNKNOWN`

Config additions (`common/settings.ts`, the only reader of `process.env`):

- `COUPON_INGEST_ENABLED` — boolean, **default `false`**. The switch this plan is named for.

## Ordered feature list

Each slice is one reviewable PR. `pnpm check` green + the required test tiers before it lands.

1. **Pause coupon ingestion and make the app say so.** Add `COUPON_INGEST_ENABLED` (default `false`)
   to `settings.ts`, `.env.example` and the README. `scheduleIngest()` logs and no-ops;
   `POST /internal/ingest` answers `503 {"status":"disabled"}`; `worker.ts` idles with a clear line.
   Add `features/appConfig/` — `appConfigServiceFactory({ config })` (config injected, mirroring
   `emailSourceFactory({ config: settings })`; a service must stay unit-testable) exposing
   `Query.appConfig: AppConfig!` with `couponIngestEnabled: Boolean!` and `lastIngestAt: DateTime`.
   The Coupons tab renders a banner: *"Coupon newsletter ingestion is paused — no new coupons are
   being imported."* Already-ingested deals still list normally.
   Tests: unit (both flag states), integration (`appConfig` query), `settings.spec.ts` addition.
   Deps: [].

2. **Web: the tab shell, Pantry first.** Replace `App.tsx`'s two-state toggle with top-level
   **Pantry | Coupons** — Pantry is the first tab and the view an empty hash route resolves to, so
   opening the app lands on price tracking. Coupons keeps its existing Browse-deals / Near-me sub-nav
   — `DealsList` and `NearMeView` move under it unchanged — and carries slice 1's paused banner.
   Pantry renders a placeholder until slice 8. Update the header copy (see the naming decision).
   Deep-linking via a ~30-line `useHashRoute` hook in `web/src/lib/` rather than a `react-router`
   dependency (revisit if the surface grows; the no-new-dependency rule applies). Accessibility: real
   tab semantics (`aria-selected`, arrow-key navigation), `jsx-a11y` clean.
   Tests: `App.spec.tsx` — including that the default route is Pantry.
   Deps: [1].

3. **`common/units.ts`.** The `Unit` / `UnitDimension` enums, the conversion table, and pure helpers:
   `dimensionOf(unit)`, `toBaseAmount(amount, unit)`, `unitPriceIn(unitPrice, unit)`,
   `formatUnitPrice(unitPrice, unit)`. No I/O, no db, no deps.
   Tests: conversion round-trips, every unit in the table, cross-dimension rejection, zero/negative
   amounts, and exact (not approximate) equality on gallon↔fluid-ounce.
   Deps: [].

4. **DB migration: `pantry_items` + `price_entries`.** Edit `db/schema.ts`, `pnpm db:generate`,
   commit the generated migration (never hand-written). Additive only; nothing existing changes.
   Columns use `.$type<Unit>()` / `.$type<PriceSource>()` so the enum stays one source of truth.
   Deps: [3].

5. **`entities/pantryItem/`.** Copy the `deal` slice. `types.ts` (domain type + `PantryItemRepository`
   / `PantryItemService` ports, methods entity-qualified: `getPantryItemById`, `listPantryItems`,
   `countPantryItems`, `addPantryItem`, `updatePantryItem`, `archivePantryItem`, `deletePantryItem`),
   `repository.ts`, `service.ts`, `graphql/{type,query,mutation}.ts`. Register in `entities/index.ts`.
   `category` resolves through a DataLoader (`couponTypeById`) added to `context.ts`.
   Validation at the arg boundary (Zod via the Pothos plugin): name 1–200 chars, `imageUrl`
   http(s)-only + max 2 000 chars (same shape as `addNewsletter`'s `signupUrl`), `sizeAmount > 0`,
   `targetPrice > 0`. The service also enforces **case- and null-folded uniqueness** on
   name + brand, throwing `ConflictError`: slice 4 found that drizzle-kit cannot emit that index
   (it splits the expression on the comma inside `coalesce()` and produces SQL that fails at
   migration time), and a service check gives a better message than a constraint violation anyway.
   Tests: unit (`service.spec.ts`, hand-mocked ports) + integration against the real test DB.
   Deps: [3, 4].

6. **`entities/priceEntry/`.** Same shape. The service computes canonical `unitPrice` on write via
   `common/units.ts` — `price / (toBaseAmount(sizeAmount, sizeUnit) * quantity)` — and throws
   `ValidationError` when the entry's unit dimension does not match the item's (you cannot log
   *$/gallon* against an item measured in pounds). Exposed as `PantryItem.priceEntries(limit, since)`
   plus `addPriceEntry` / `deletePriceEntry` mutations. A `priceEntriesByPantryItemId` DataLoader
   keeps the list view off N+1.
   Tests: unit (unit-price math incl. multi-packs, dimension mismatch, `price <= 0`, `quantity <= 0`,
   future `observedAt`) + integration.
   Deps: [3, 4, 5].

7. **`features/priceInsight/` — the verdict engine.** No table of its own; composes the two entity
   services. `getPriceInsight({ pantryItemId, windowDays })` and a batched `listPriceInsights` for the
   grid. Returns: `latest`, `lowestUnitPrice`, `highestUnitPrice`, `medianUnitPrice`,
   `observationCount`, `windowDays`, `percentile`, `savingsVsMedianPct`, `meetsTargetPrice`,
   `cheapestMerchant`, and `verdict`.

   Deterministic, explainable rules — no magic:
   - fewer than 3 observations in the window → `UNKNOWN` ("not enough history yet");
   - `targetPrice` set and the latest unit price is at or below it → `GREAT`;
   - otherwise the latest unit price's percentile within the window: ≤15% → `GREAT`, ≤35% → `GOOD`,
     ≤75% → `TYPICAL`, else `HIGH`.

   **Median, not mean** (one warehouse-club bulk buy must not move the baseline) over a rolling
   window (default 365 days, so a three-year-old price stops anchoring the answer). Also extend
   `features/dashboard` with `pantryItems` and `itemsWorthBuyingNow` counts — it is already the
   cross-entity read model, so this is reuse rather than a new aggregate.
   Tests: unit is the priority here — empty history, one observation, two observations, all-equal
   prices, a single outlier, exactly at the target price, an entry on the window boundary, an entry
   older than the window.
   Deps: [5, 6].

8. **Web: the Pantry views.** A card grid — image (with `referrerPolicy="no-referrer"`, real `alt`
   text and a graceful placeholder when the URL 404s), name + size, latest price, **unit price in the
   item's display unit**, and a colour-and-text verdict badge (never colour alone — `jsx-a11y` and
   colour-blind users both care). An inline-SVG sparkline of price history, no chart dependency.
   Filters by category and verdict, sort by "best deal right now". Item detail: full history table,
   per-merchant best price, "Log a price" form. Add / edit item forms.
   Tests: component specs for the list, the badge thresholds and the empty state.
   Deps: [2, 5, 6, 7].

9. **Enabling refactor — provider clients into `third-party/`.** `AGENTS.md` §3 says a provider SDK
   must never appear outside `third-party/`; today `ingest/markdown.ts` imports `mdream` and
   `ingest/extractor.ts` imports `openai` directly. Neither trips ESLint (the `ingest` category has no
   such policy) so this is rule-spirit debt, not a build failure — but slice 10 needs both from a
   second caller, so it gets paid now rather than duplicated. Move mdream to
   `third-party/mdream/adapter.ts` (`mdreamAdapterFactory`, implementing the existing
   `HtmlToMarkdownConverter` port) and the OpenAI client to `third-party/openai/adapter.ts`
   (`openaiAdapterFactory`) behind a narrow `JsonChatCompletion` port. `ingest/extractor.ts` keeps its
   prompt and its Zod schema and takes the port. Pure refactor: **every existing test stays green,
   unchanged**, and the SDL does not move.
   Deps: [].

10. **URL import (paste an Amazon link).** Port `ProductLookup { lookupProduct: (url) => Promise<Maybe<ProductDraft>> }`
    declared in `entities/pantryItem/types.ts` (the consuming slice owns the port), implemented in
    `third-party/productPage/`: `adapter.ts` owns transport only (fetch, timeout, redirect + response-size
    caps), `service.ts` is the anti-corruption layer — try `schema.org/Product` JSON-LD and OpenGraph
    tags first, and only when name/price/size are still missing convert the HTML to Markdown (slice 9's
    port) and ask the local LLM, validating the result with Zod exactly as the deal extractor does.

    `Mutation.draftPantryItemFromUrl(url)` returns a **draft, never a saved row** — the web prefills the
    add-item form and you confirm. That is the whole robustness story: Amazon blocks plain server-side
    fetches often enough that any design assuming success is wrong, so a block degrades to
    "we couldn't read that page, here's the empty form" instead of an error state.

    Security: single-user self-hosted, so no enterprise hardening — but the server fetches a
    user-supplied URL, so http(s)-only, reject private/loopback address ranges, hard timeout and a
    response-size cap. Cheap, and the alternative is a self-hosted box making arbitrary internal requests.
    Tests: unit (JSON-LD hit, OG fallback, LLM fallback, all three fail, non-http scheme, oversize
    response) with a mocked adapter port; no live network in CI.
    Deps: [5, 9].

## Follow-ups (deliberately deferred)

- **F1 — Scheduled price refresh.** Repurpose the now-idle ingest cron into a pass that re-fetches each
  tracked item's URL and appends a `PriceEntry` with `source = IMPORT`. Deferred on purpose: it makes the
  feature's reliability depend on scraping surviving bot detection, which is not a thing to bet the core
  on before the core is proven. Deps: [10].
- **F2 — Coupon ↔ pantry matching.** Once ingestion is re-enabled, surface "there's an active coupon for
  an item you track" by matching on the shared category taxonomy + item name. This is the payoff for
  decision 1 and should be cheap. Deps: [5, ingestion re-enabled].
- **F3 — Receipt import.** Photo/PDF of a receipt → a vision model → several `PriceEntry` rows at once.
  The highest-leverage data-entry win, and the largest. Deps: [6].
- **F4 — Price-drop notifications.** When a new entry crosses `targetPrice` or lands `GREAT`. Deps: [7].
- **F5 — Rename `CouponType` → `Category`.** Optional debt from decision 1; needs a `Deal.category`
  disambiguation first, and touches the SDL, the web and a migration. Deps: [].
- **F6 — CSV export/import** of pantry items + price history. Self-hosted data should be portable.
- **F7 — Playwright e2e**, once that infra lands (still owed from v1's Definition of Done).

## Definition of Done (per slice — from AGENTS.md)

`pnpm check` green · a **unit** test for every new service and an **integration** test for every new
resolver · all inputs Zod-validated at the boundary · `packages/contract/schema.graphql` and
`packages/web/src/graphql-env.d.ts` regenerated **and committed** · migrations generated, never
hand-written · no `process.env` outside `common/settings.ts` · no `console.*` · no layer crossings ·
web changes `jsx-a11y` clean · README and `.env.example` updated wherever config or behaviour moved.
