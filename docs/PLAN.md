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

## Follow-up — data population (found in the v1 audit)

Features 1–8 build the read/query surface for near-me and coupon-type grouping, but they assume the
underlying data is already populated. Two population steps were never planned, so both features
return **empty / degenerate results against real ingested data** until these are added — the merged
code is correct, it's just starved of inputs:

9. **Populate merchant coordinates (geocoding)** — Near-me filters merchants to those with a
   non-null `lat`/`lng`, but nothing sets them: ingest creates merchants with null coordinates and
   `merchantService.updateMerchantLocation` has no caller, so `storesNearMe` / `dealsNearMe` /
   `recommendedNewsletters` return `[]` for real data. Add a geocoding step — capture the merchant
   address (extend the LLM extractor) and resolve it to coordinates through a `third-party/<geocoder>/`
   adapter behind a port (wired in `services.ts`), called during ingest via `updateMerchantLocation`.
   An admin `updateMerchantLocation` mutation is a reasonable interim to set them manually.
   Deps: [merchant-location-fields, store-module].

10. **Classify deals by coupon type during ingest** — `deal.couponTypeId` is always null today
    (ingest hard-codes it), so `dealsNearMe` grouping and the web coupon-type filter only ever surface
    the "unclassified" group. Add a classification step that maps each extracted deal to a seeded
    `CouponType` (LLM classification into the taxonomy, or a keyword→key mapping via
    `couponTypeService.getCouponTypeByKey`) and sets `couponTypeId` on the `NewDeal` before insert.
    Deps: [coupon-type-module, deal-couponTypeId-field].

## Follow-up — ingestion quality

11. **Convert emails to markdown before LLM extraction** — The extractor is currently fed the email's
    plain-text part (`imap.ts` passes only `parsed.text`), which drops the structure marketing/deal
    emails carry in HTML (offer tables, links, headings, prices). Add a preprocessing step: also
    capture the HTML part (`mailparser`'s `simpleParser` already returns `parsed.html` alongside
    `parsed.text`), convert it to clean **markdown**, and feed that to `extractor.extract`, falling back
    to `parsed.text` when an email has no HTML. Markdown preserves the deal structure the model needs
    while being far cheaper than raw HTML — meaningfully fewer tokens, which matters for the local
    model's context budget.

    **Tool — recommended: [`mdream`](https://github.com/harlan-zw/mdream)** (an HTML→markdown converter
    built for LLMs). It is Node-native (Rust/NAPI binding **plus a pure-JS fallback**, so it runs
    in-process in the single container — no second runtime), zero-dependency, ~37× faster than turndown
    and **~2× fewer output tokens**, actively maintained, with a plugin API to **isolate main content**
    (strip email header/footer/nav boilerplate) and customize table rendering. Alternatives:
    [`node-html-markdown`](https://www.npmjs.com/package/node-html-markdown) (proven, fast, Node-native)
    or [`turndown`](https://github.com/mixmark-io/turndown) + `turndown-plugin-gfm` (most battle-tested,
    best table fidelity) if we favour maturity over token efficiency. **Rejected for this app:**
    Microsoft **MarkItDown** and **trafilatura** — both capable (and already in our KB) but **Python**,
    so they'd add a second runtime to the one-Node-container design; and since `mailparser` already
    yields the HTML, their file/`.eml` parsing is redundant.

    Keep the converter swappable behind a tiny interface in the `ingest/` pipeline (mdream today,
    another lib tomorrow) and guard output length as today. Deps: [] — isolated to ingest, no schema
    change. (Ideally lands **before** features 9–10, since a richer markdown body also makes merchant
    addresses and deal categories easier to extract.)

12. **Offline ingest testing — save emails as markdown + a folder-backed mock IMAP** — Iterate on
    extraction (and on features 9–10) without a live inbox:
    - **Save the markdown.** During a real pass, also write each converted email's markdown to a
      configurable local folder (e.g. `INGEST_ARCHIVE_DIR`), building a corpus of real deal emails.
    - **Mock-IMAP flag.** Add an email-source flag (e.g. `INGEST_SOURCE=folder` + `INGEST_LOCAL_DIR`)
      that, at the composition root, swaps the real `imapClientFactory` for a **folder-backed source**
      implementing the same `fetchUnseen` / `markSeen` interface. It replays the saved `.md` files as
      the (already-markdown) email bodies straight to the extractor, so a full ingest runs entirely
      offline. `markSeen` for the folder source is a no-op (or moves the file to a `processed/` subdir
      so re-runs are idempotent).
    - **Trigger already exists.** `POST /internal/ingest` (token-gated, calls `ingestOnce`) runs a pass
      on demand against whichever source the flag selects; add a thin `pnpm ingest` script as a
      convenience wrapper.

    **Public-repo note:** real saved emails can carry PII, so the archive dir is **gitignored**; commit
    only a small **synthetic / anonymized** fixture set (a handful of `.md`) for CI + examples. This
    also makes the ingest pipeline testable end-to-end with a stable corpus (unit/integration fixtures).
    Deps: [email-markdown-preprocessing].
