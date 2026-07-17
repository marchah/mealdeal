# MealDeal v1 — Coupon Types, Location, Near-Me & Newsletters

## Overview

This plan reconciles "deal" vs "coupon" naming and adds the core v1 features:
typed coupon types, store locations (address + lat/lng), near-me search by ZIP radius,
newsletter recommendations from nearby stores, and a web "near me" view.

### Naming decision

The existing `deal` module stays as-is (it's the canonical template and already used everywhere).
`coupon` is a user-facing synonym — a `Deal` *is* a coupon. We add a `CouponType` module that
classifies deals by category (food, household, beverages, snacks, personal-care, pharmacy,
pet-supplies, other). The deal's free-text `category` field remains for LLM-extracted raw values
and is kept for backwards compatibility; a new typed `couponTypeId` field is the canonical
classification.

## Architecture fit

Each new entity follows the **copy-the-deal-module** pattern from AGENTS.md:

```
modules/deal/          (canonical template — unchanged)
modules/couponType/    (new — typed classification enum + filter)
modules/store/         (new — merchant + address + lat/lng + distance search)
modules/newsletter/    (new — store newsletters for recommendation)
```

Data model additions:
- `coupon_types` — id, key (enum string), label (human-readable)
- `merchants` — add `address`, `lat`, `lng` columns
- `newsletters` — id, merchantId (FK), name, signupUrl, recommended (boolean)

Config additions:
- `settings.ts` — `USER_LOCATION` (ZIP code, e.g. `"02139"`), resolved to lat/lng for distance
  computation.

## Data model

| Table | Key columns | Notes |
|---|---|---|
| `coupon_types` | id, key, label | Reference table; pre-seeded with defaults |
| `merchants` | id, name, address, lat, lng | Existing + 3 new columns |
| `deals` | id, merchantId, couponTypeId (FK→coupon_types), category (kept) | New FK column |
| `newsletters` | id, merchantId (FK→merchants), name, signupUrl, recommended | New table |

## Ordered feature list

Each feature is a vertical slice sized for one coder task. Dependencies ensure correct build order.

1. **Add CouponType module** — Create the `couponType` module (types, repo, service, schema, spec).
   Seed with default keys (food, household, beverages, snacks, personal-care, pharmacy, pet-supplies, other).
   Adds `getCouponTypes` query. No deps.

2. **Update deal schema: add couponTypeId FK** — Add `couponTypeId` text column (FK to `coupon_types.id`)
   to the `deals` table via a Drizzle migration. Keep `category` as-is for backwards compat.
   Deps: [coupon-type-module] (the FK references the coupon_type table).

3. **Update deal module: add couponTypeId field** — Add `couponTypeId` and `couponType` (nested) to
   `Deal` type, repository, service, and GraphQL schema. Update `dealServiceFactory` to accept
   `couponTypeService` from DI. Deps: [coupon-type-module, deal-schema-coupon-type-id].

4. **Add merchant location fields** — Add `address` (text, nullable), `lat` (real, nullable),
   `lng` (real, nullable) to merchants table. Update merchant module types, schema, and GraphQL.
   Deps: [].

5. **Add Store module (with distance search)** — New module that exposes a `Store` type combining
   merchant fields + location. Adds `storesNearLocation(args: { lat, lng, radiusMiles })` query
   using the Haversine formula via SQLite's built-in `acos()`/`sin()`/`cos()` functions.
   Deps: [merchant-location-fields].

6. **Add Newsletter module** — New module with `Newsletter` type (id, merchantId, name, signupUrl,
   recommended). Adds `addNewsletter`, `removeNewsletter` mutations and `newsletter` query.
   Deps: [merchant-location-fields] (needs merchantId FK).

7. **Near-me GraphQL queries** — Add `storesNearMe` (uses USER_LOCATION from settings to resolve
   ZIP→lat/lng, then calls store search), `dealsNearMe` (deals from nearby stores grouped by
   coupon type), and `recommendedNewsletters` (newsletters from nearby stores where recommended=true).
   These are new fields on the Query type in the store module's schema.pothos.
   Deps: [store-module, coupon-type-module].

8. **Web: near-me view** — Add web components: coupon browsing by type (list/filter), a "near me"
   view showing nearby stores, their coupons grouped by type, and recommended newsletters.
   Uses the new GraphQL queries. Accessibility-clean.
   Deps: [near-me-queries].
