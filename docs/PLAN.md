# MealDeal v3 — Receipt import

## Why this plan

v2 shipped Pantry: tracked items, their price history normalized to a unit price, and a verdict on
whether a price is worth acting on. What it does not solve is getting prices **in**. Every
observation today is typed by hand or read off a product URL, and hand entry is the step that
quietly stops after a few weeks — at which point the verdicts go stale and the feature dies with
them.

A grocery receipt already holds every price paid on a trip, with the store and the date. v3 turns a
photo of one into price entries: an **OCR engine** reads the photo into text, the **existing LLM**
turns that text into structured lines, the app **matches** each line to a pantry item, and you
**review and confirm** before anything is stored. This was follow-up F3 in v2 — "the
highest-leverage data-entry win, and the largest".

The hard part is not reading the receipt. It is knowing that `KS PPR TWL  19.99` is *your*
"Kirkland paper towels", and which pack it was: receipts rarely print sizes, and without a size
there is no unit price to compare. So the design centres on **learned receipt names** and a review
screen that gets faster with every receipt from the same store.

Deliberately out of scope: the shelf-side question ("Gain is $11.99 for 92 oz at Target — is that
cheaper than the Tide I usually buy?"). It needs comparison across brands and a
check-without-saving flow, and is follow-up F8.

## Earlier plans

### v2 status — delivered

Pantry price tracking, and coupon newsletter ingestion **paused** behind `COUPON_INGEST_ENABLED`
(default `false`) with the app saying so. Slices 1–10 are merged: the pause flag and `appConfig`,
the Pantry-first tab shell, `common/units.ts`, the `pantry_items` / `price_entries` tables, the
`pantryItem` and `priceEntry` entities, the `priceInsight` verdict engine, the Pantry web views,
the provider clients moved behind ports in `third-party/`, and the URL importer.

### v1 status — delivered

Features 1–12 are merged: the `couponType` taxonomy, merchant geocoding, the `store` and
`newsletter` slices, near-me, ingest-time classification, HTML→Markdown preprocessing and the
folder-backed email source. Switched off at the entrypoint by the v2 pause and kept green.

### v2 decisions still in force

The code cites these as "docs/PLAN.md decision N", so the numbers are stable. (v2 listed 2 and 3 in
the opposite order to the code and commit history that cite them; this is the order they are
cited in.)

1. **Categories reuse `coupon_types`.** A pantry item's category FKs the existing seeded taxonomy
   rather than a parallel table, exposed as `PantryItem.category: CouponType!` — an odd type name
   accepted over a risky app-wide rename (F5). A coupon and a pantry item speak one vocabulary,
   which is what makes F2 nearly free.
2. **`unitPrice` is denormalized on write, in canonical base units.** Every `price_entries` row
   stores `unit_price` already normalized (per ounce / fluid ounce / count / square foot), so
   differently-sized packs compare as plain numbers and "is this a good deal" is an aggregate over
   one indexed column. Display unit is resolved at read time from the item's `unit_price_unit`.
3. **`common/units.ts` holds enums *and* conversion math.** `Unit` is consumed by two slices, the
   Drizzle schema, the Pothos enum and the insight feature, and a conversion table is not a type —
   the same standing as `common/errors.ts`. US customary units only, so every factor is an exact
   integer.

## Architecture fit

```
photo(s) ──upload──▶ receipt                                       UPLOADED
                       │  background, one receipt at a time
                       ▼
   OCR service (own container, LAN) ──▶ printed lines             OCR_DONE   (text + engine saved)
                       ▼
   existing LLM (JsonChatCompletion) ──▶ structured lines         PARSED
                       ▼
   learned names, then LLM suggestion ──▶ matched lines           READY
                       ▼
   review screen ──confirm──▶ price_entries (RECEIPT) + learned names     CONFIRMED
```

Every slice is the copy-the-`deal`-entity pattern from `AGENTS.md`:

```
entities/receipt/            receipts, their photos and their lines
entities/receiptAlias/       learned receipt names: (store, printed text) → item + pack size, or ignore
features/receiptParser/      OCR text → structured receipt (prompt + Zod schema, existing LLM port)
features/receiptImport/      the pipeline: stages, retries, matching, confirm
third-party/<ocr engine>/    adapter (transport) + service (rebuild printed lines from boxes)
```

### Decisions a reviewer should check first

Numbered after v2's so "decision N" stays unique across the doc.

4. **Two stages: an OCR engine, then the LLM** — rather than one vision-language model reading the
   photo straight to JSON. The OCR text is stored, so a parse that goes wrong, or a better prompt
   later, re-runs on text without redoing the OCR; each stage is swapped and tested on its own; and
   the LLM stays text-only (the deployed llama-server has no vision projector loaded). The cost is
   **layout**: a receipt prints the name on the left and the price on the right, and an engine that
   emits columns separately loses the pairing. The OCR adapter's service therefore rebuilds printed
   lines from bounding boxes before anything reaches the LLM, and slice 0 tests exactly that.
5. **Learned receipt names are per store, and carry the pack size.** `KS PPR TWL` means something
   at Costco and nothing at Aldi, and one product prints differently at each chain. A learned name
   maps (merchant, normalized printed text) to a pantry item **and** a pack size — receipts rarely
   print sizes, and the pack bought at Costco is not the one bought at Harris Teeter. It can also
   map to *ignore*, so bag fees and things you never track stop appearing.
6. **Nothing becomes a price until you confirm.** Matching only suggests: an LLM suggestion is never
   auto-confirmed, and even a learned-name match is shown for review. The same stance as the URL
   importer's draft — a wrong price silently in the history is worse than one more tap.
7. **The pipeline is staged and resumable.** Each stage writes its output and the receipt's status
   before the next starts; a failure records which stage failed, and a retry restarts there.
   Receipts are processed one at a time in-process, like the ingest pass, and a restart resumes
   receipts left mid-pipeline. Confirm is idempotent per line — each line records the price entry it
   created — so a confirm that fails half-way re-runs without duplicates, and no transaction across
   slices is needed.
8. **Photos are kept, and never enter the repo.** They live on the data volume beside the database,
   so a better OCR engine can re-read old receipts (F12). Receipts print membership numbers and card
   digits and this repo is public: test fixtures are **redacted OCR text**, never photos.

## Stores in scope

Costco, Aldi, Food Lion and Harris Teeter. What to expect — to be confirmed by slice 0, not assumed:

- **Costco** — abbreviated names next to item numbers; instant savings on their own line with a
  trailing minus; long receipts that take several photos.
- **Aldi** — short abbreviated names, mostly Aldi's own brands, so learned names do more of the work
  than brand matching.
- **Food Lion** (MVP card) and **Harris Teeter** (VIC card) — loyalty savings printed as separate
  lines under the item.
- **All four** — produce by weight (`2.31 lb @ 0.59 /lb`), multi-buys (`2 @ 3.99`), tax-flag letters
  after prices, and non-item lines: subtotal, tax, deposits, bag fees, payment, change.

Three of the four print discounts as their own lines, so attaching a discount to the item it belongs
to — and marking that entry `onSale` — is core, not polish.

## OCR engine candidates

From the CognitiveStack notes (`local-ai-models/pp-ocrv6.md`, `knowledge-and-retrieval/indra-ocr.md`,
`local-ai-models/oxr-1.md`). Slice 0 picks one.

| Engine | Runs on | Why it is a candidate | Watch for |
|---|---|---|---|
| **PP-OCRv6** (medium / small) | CPU — pve2 is enough | Apache-2.0; detection + recognition with line boxes; ONNX / OpenVINO runtimes | Emits text boxes, not rows — rebuilding rows is ours |
| **Indra OCR** | CPU — pve2 is enough | ~1M params, very fast; lines with boxes **and reading order**; Markdown / JSON output | Small model, "moderate accuracy"; weights are OpenRAIL-M |
| **OXR-1.0** | GPU — pve | 1.3B document-parsing VLM; Markdown / JSON with coordinates; strong benchmark claims | Documented for Transformers / vLLM; pve's V620s are AMD, so ROCm is untested. Only if both CPU engines fall short |

Not candidates: **Unlimited-OCR** (NVIDIA-only per its note, and pve's GPUs are AMD) and
**Tesseract** (far behind both CPU candidates on the same benchmark).

Host: a CPU engine runs on **pve2**, beside the house Docker host. Only OXR-1.0 would need **pve**.

## Data model

| Table | Key columns | Notes |
|---|---|---|
| `receipts` | id, merchant_id (FK, nullable), purchased_at, status, failed_stage, error, ocr_text, ocr_engine, subtotal, tax, total, image_hash, created_at | `status`: UPLOADED → OCR_DONE → PARSED → READY → CONFIRMED, or FAILED with `failed_stage`. `image_hash` catches the same photo uploaded twice. |
| `receipt_images` | id, receipt_id (FK, cascade), position, path, content_type, bytes | A long receipt is several photos, in order. Files under `RECEIPTS_DIR`. |
| `receipt_lines` | id, receipt_id (FK, cascade), position, printed_text, description, quantity, unit_price, weight, weight_unit, line_total, discount, flags, pantry_item_id (nullable), size_amount, size_unit, match_source, decision, price_entry_id (nullable) | `match_source`: ALIAS / SUGGESTED / MANUAL. `decision`: PENDING / INCLUDE / EXCLUDE / IGNORE_ALWAYS. `price_entry_id` is what makes confirm idempotent. |
| `receipt_aliases` | id, merchant_id (FK), printed_text (normalized), pantry_item_id (FK, cascade, nullable), size_amount, size_unit, ignored, created_at, updated_at | Unique on (merchant_id, printed_text). Null item + `ignored` = always ignore at this store. |
| `price_entries` | + receipt_id (FK, nullable, ON DELETE set null) | Deleting a receipt keeps the prices it produced: the history is the precious part, the same reasoning as `archived`. |

New enums (TS `enum`, SCREAMING_SNAKE key and value): `ReceiptStatus`, `ReceiptStage`,
`ReceiptLineDecision`, `ReceiptMatchSource`, and `PriceSource.RECEIPT` (whose arrival means
`MANUAL`'s doc comment stops saying "off a receipt").

Config additions (`common/settings.ts`, the only reader of `process.env`):

- `OCR_BASE_URL` — optional. Unset means receipt import is off, and `Query.appConfig` says so — the
  same honest-state pattern as the ingestion pause.
- `RECEIPTS_DIR` — default `./data/receipts`; `/data/receipts` in Docker, on the same volume as the
  database (the deploy compose's "the ONLY precious state" comment changes with it).
- The parser reuses `OPENAI_*`. A separate receipt-model setting only if slice 0 shows another model
  parses better.

## Ordered slices

Each slice is one reviewable PR. `pnpm check` green + the required test tiers before it lands.

0. **Spike: pick the OCR engine.** Not app code — a throwaway script outside the repo. Photograph
   2–3 receipts per store, including a long Costco receipt, one with produce by weight and one with
   card savings. Run each through PP-OCRv6 and Indra (OXR-1.0 on pve only if both struggle), rebuild
   the rows, send the text to Qwen with a draft parse prompt, and score: lines found, prices right,
   discounts attached, store and date right. Outputs: the engine and its host, the photo resolution
   it needs, and per receipt the **redacted** OCR text plus the expected parse — committed as the
   fixtures slices 1–2 test against.
   Deps: [].

1. **OCR service and adapter.** The chosen engine runs as its own container on the LAN — its native
   server if it has one, otherwise a minimal HTTP wrapper — deployed as its own stack, not shipped
   in the MealDeal image. In MealDeal: a `ReceiptTextReader` port declared in
   `features/receiptImport/types.ts`; `third-party/<engine>/adapter.ts` owns transport (timeout,
   response-size cap); `service.ts` is the anti-corruption layer that rebuilds printed lines from
   boxes — group by vertical overlap, order left to right, tolerate a slight tilt. Add
   `OCR_BASE_URL` to settings, `.env.example`, the README and the deploy compose; expose
   `receiptImportEnabled` on `Query.appConfig`; list any provider package in `eslint.config.js`.
   Tests: unit — two columns rejoined into rows, a tilted photo, an item name wrapping onto a second
   line, an empty result, timeout, oversize response; `settings.spec.ts`; `appConfig` integration.
   No live OCR in CI.
   Deps: [0].

2. **Receipt parser — `features/receiptParser/`.** OCR text in, structured receipt out, through the
   existing `JsonChatCompletion` port and the same pattern as `ingest/extractor.ts`: prompt + Zod
   schema, finish reason checked first, the model's shape never trusted. Output: the store — picked
   from existing merchants when it matches one, so "COSTCO WHOLESALE #347" and "Costco" stay one
   store — the purchase date, the lines (printed text, best-guess description, quantity, unit price,
   weight + unit, line total, discount), subtotal, tax and total. Discount lines fold into the item
   they apply to; non-item lines are dropped. Two flags, computed in code rather than by the model:
   quantity × unit price ≠ line total, and lines + tax ≠ total — either usually means a misread or a
   missed line.
   Tests: unit on every slice-0 fixture with recorded model responses; both flags at their
   boundaries; a malformed response rejected; truncation.
   Deps: [0].

3. **DB + entities: `receipt`, `receiptAlias`.** The tables above, `price_entries.receipt_id` and
   `PriceSource.RECEIPT`; migration generated, never hand-written. Both entities copy the `deal`
   slice. Photos sit behind a small storage port with a filesystem implementation rooted at
   `RECEIPTS_DIR`.
   Tests: integration — lines and images cascade with their receipt; deleting a receipt leaves its
   price entries with `receipt_id` null; one learned name per (store, printed text); a learned name
   goes with its deleted item. Unit for both services.
   Deps: [].

4. **Upload + pipeline — `features/receiptImport/`.** `Mutation.uploadReceipt(images)` through
   Yoga's multipart upload: one or more photos, image types only, a per-photo size cap. It stores the
   photos, creates the receipt as UPLOADED and answers immediately; processing runs in the
   background, one receipt at a time — OCR, then parse (and match, once slice 5 lands; until then
   PARSED is the last stage). A failure records its stage and error, `retryReceipt(id)` restarts
   there, and startup resumes unfinished receipts. Duplicates: an identical photo is refused at
   upload; the same store + date + total after parsing is flagged, not blocked. Queries
   `receipts(status)` and `receipt(id)`. Web: a Receipts view under Pantry — upload
   (`accept="image/*"` with `capture`, so a phone opens its camera), a list with each receipt's
   status, polling while any is processing.
   Tests: unit — each stage's failure and retry from that stage, one-at-a-time processing, resume on
   startup, both duplicate guards; integration — upload and the receipt queries; web specs,
   `jsx-a11y` clean.
   Deps: [1, 2, 3].

5. **Matching.** The last pipeline stage, PARSED → READY. A learned name for (store, printed text)
   gives the item and pack size, or ignore. Otherwise one text-only LLM call with the unmatched lines
   and the pantry catalog (name, brand, usual size) suggests an item or none; an id not in the
   catalog is dropped. Pack size: the learned name's, then the item's usual size, then left for you.
   A line sold by weight takes its weight as the size.
   Tests: unit — learned-name hit, learned ignore, a name learned at another store not applied, an
   invented id dropped, the size order, a weighted line; integration.
   Deps: [3, 4].

6. **Review + confirm.** The receipt photo beside its lines, and every field free text you can
   correct: item (autocomplete over the pantry; a name not in it becomes a new item, with brand and
   size), size + unit, quantity, price. A line with neither a learned name nor a suggestion opens
   with the item blank — type it in, or leave it blank and it is not saved. Per line: **Exclude**
   (this receipt only) and **Always ignore at this store** (a learned ignore). Slice 2's flags show
   on the lines and receipt they concern. `Mutation.confirmReceipt(id, lines)` creates any new
   items, adds price entries (source RECEIPT, the receipt's store, `observedAt` = purchase date,
   `onSale` when discounted), learns names (item + pack size, or ignore) and marks the receipt
   CONFIRMED — idempotent per line. Plus `deleteReceipt(id)`.
   Tests: unit — new item, name learned with its size, Exclude vs Always ignore, a blank line
   skipped, a re-run after a partial failure creates no duplicates, confirming a confirmed receipt
   refused; integration — confirm end to end, the entries visible through `PantryItem.priceEntries`
   and the insight; web specs, `jsx-a11y` clean.
   Deps: [3, 5].

## Follow-ups (deliberately deferred)

- **F1 — Scheduled price refresh.** Re-fetch each tracked item's URL on the idle ingest cron and
  append a `PriceEntry` with `source = IMPORT`. Deferred: it bets reliability on scraping surviving
  bot detection. Deps: [v2 10].
- **F2 — Coupon ↔ pantry matching.** Once ingestion is re-enabled, surface "there's an active coupon
  for an item you track" via the shared taxonomy + item name. Deps: [ingestion re-enabled].
- **F3 — Receipt import.** Promoted to this plan.
- **F4 — Price-drop notifications.** When a new entry crosses `targetPrice` or lands `GREAT`.
  Deps: [v2 7].
- **F5 — Rename `CouponType` → `Category`.** Optional debt from decision 1; needs a `Deal.category`
  disambiguation first. Deps: [].
- **F6 — CSV export/import** of pantry items + price history. Self-hosted data should be portable.
- **F7 — Playwright e2e**, once that infra lands (still owed from v1's Definition of Done).
- **F8 — Shelf check.** Comparison groups across brands ("Laundry detergent": Tide, Gain, Kirkland,
  locked to one unit dimension) and checking a price without saving it, judged against your usual
  price for the group. Needs `buildPriceInsight` to judge any candidate unit price, not only the
  latest entry. Open question then: groups (recommended) vs. brandless items with the brand on each
  price entry. Deps: [v2 7].
- **F9 — Shelf-tag or flyer photo → shelf check**, reusing slices 1–2. Deps: [F8, 2].
- **F10 — Emailed receipts** through the paused IMAP pipeline, entering at the parse stage — they
  are already text, so no OCR. Deps: [4].
- **F11 — Access from outside the LAN, with authentication.** `/graphql` has none, which is fine on
  the LAN and is not once it is reachable from the internet and accepts uploads. Deps: [].
- **F12 — Re-read stored receipts** with a newer OCR engine or prompt. Deps: [4].

## Definition of Done (per slice — from AGENTS.md)

`pnpm check` green · a **unit** test for every new service and an **integration** test for every new
resolver · all inputs Zod-validated at the boundary · `packages/contract/schema.graphql` and
`packages/web/src/graphql-env.d.ts` regenerated **and committed** · migrations generated, never
hand-written · no `process.env` outside `common/settings.ts` · no `console.*` · no layer crossings ·
web changes `jsx-a11y` clean · README and `.env.example` updated wherever config or behaviour moved ·
no receipt photo, membership number or card digits in a committed fixture.
