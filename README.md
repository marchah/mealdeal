# MealDeal

Self-hosted grocery-deal tracker. An ingest worker reads a dedicated IMAP mailbox on a schedule, uses
an OpenAI-compatible LLM to extract structured deals, and stores them in SQLite; a small web app lists
active deals and manages mute/watchlist preferences. **Bring your own inbox + LLM. One container.**

> **Coupon newsletter ingestion ships paused** (`COUPON_INGEST_ENABLED=false`). The pipeline is built
> and tested but does not run, because no newsletter worth ingesting has been found yet — see
> [docs/PLAN.md](./docs/PLAN.md), which puts the product weight behind Pantry price tracking instead.
> Turn ingestion back on whenever you have a source: it is one environment variable.

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

## Pantry price tracking

The half of the app that works today. Track the things you buy regularly, log what you paid and
where, and MealDeal tells you whether today's price is any good — GREAT / GOOD / TYPICAL / HIGH, or
"not enough history yet" when it cannot honestly say.

Every price is stored per base unit (ounce, fluid ounce, count, square foot), which is what makes
differently-sized packs comparable: a 150 fl oz jug at $19.94 beats a 2-pack of 46 fl oz bottles at
$12.98, and nothing about the sticker prices tells you that. Set a target price on an item — a unit
price, "$0.12 a fluid ounce", not a pack price — and anything at or below it reads GREAT regardless
of history.

### Importing from a product link

Paste a product URL when adding an item and MealDeal reads what the page states — name, brand,
image, price and pack size — into the form for you to confirm. Nothing is stored until you do.

It reads `schema.org/Product` JSON-LD and OpenGraph tags first, and asks the configured LLM only
for what those leave out (usually the pack size). **Expect this to fail on Amazon and other large
retailers**: they block server-side requests as a matter of course, and MealDeal identifies itself
rather than impersonating a browser to get around it. A blocked page opens the form empty instead
of reporting an error — typing four fields is a worse outcome than a broken feature, not a failure.

The server fetches a URL you supply, so it refuses anything that is not public http(s): private,
loopback, link-local and carrier-grade-NAT addresses are rejected, DNS is resolved and checked
before connecting (so a public hostname pointing at `127.0.0.1` is caught), redirects are followed
manually and re-checked at each hop, and both the request and the response body are capped.

## Coupon newsletter ingestion (`COUPON_INGEST_ENABLED`)

Off by default. While it is off:

- the scheduler is never registered (nothing runs on `INGEST_CRON`, inline or in the worker);
- `POST /internal/ingest` answers `503 {"status":"disabled"}`, and so does `pnpm ingest`;
- `node dist/worker.js` logs that it has nothing to schedule and exits;
- the web app shows a banner saying no new coupons are being imported, alongside the last import date.

Already-ingested coupons keep working everywhere — listing, filtering and near-me are unaffected.
Set `COUPON_INGEST_ENABLED=true` to resume. Only `true` and `false` are accepted: a truthy-ish spelling
like `1` or `TRUE` fails at startup rather than silently leaving the pipeline off.

## Optional location lookup

Set `USER_LOCATION` to a five-digit US ZIP code (for example, `02139`) when using a near-me feature.
It is optional; a consumer that tries to resolve it while unset receives a typed configuration error,
an unknown but valid ZIP receives a not-found error, and a provider/network or invalid-response failure
receives a typed lookup error. This makes an unavailable lookup distinguishable from a ZIP with no match.

The default adapter calls [Zippopotam.us](https://docs.zippopotam.us/docs/v1/) only when a location is
resolved. It requires no credentials and adds no runtime dependency, but the host needs outbound HTTPS
access and the ZIP is sent to that service. Zippopotam.us uses GeoNames data; GeoNames publishes its data
under [CC BY 4.0](https://www.geonames.org/) and both sources describe the data as provided as-is. The
provider is isolated behind the `ZipCoordinateLookup` adapter port; near-me services should depend on
the injectable `LocationService` port (`services.locationService`, `getUserLocation()`) rather than
import this adapter or read settings.

## Merchant address geocoding

Ingest can persist coordinates for a merchant only when the newsletter states an address; the extractor
is instructed never to guess one. By default, those addresses are sent to the public
[Nominatim](https://operations.osmfoundation.org/policies/nominatim/) search service with the identifying
`GEOCODER_USER_AGENT`. That disclosure is a privacy consideration: configure a self-hosted or compatible
geocoder with `GEOCODER_BASE_URL` if addresses must remain within your infrastructure.

The public default is intentionally serialized in one process/thread and capped at four requests per
minute; run only one MealDeal worker against it. Stored merchant coordinates are the lookup cache, so
an already located merchant is not sent again. Higher-volume deployments must use a self-hosted/alternative endpoint, retain the required
[OpenStreetMap attribution](https://www.openstreetmap.org/copyright), and comply with its data's
[ODbL terms](https://opendatacommons.org/licenses/odbl/).

## Develop

```bash
pnpm install
pnpm dev        # API on :4000 + the Vite dev server
pnpm check      # the gate: typecheck + lint (+ layer boundaries) + prettier + tests + codegen drift
```

## Local ingest testing (offline)

Iterate on extraction without a live inbox. While ingesting real mail, set `INGEST_ARCHIVE_DIR` to
save each email's converted Markdown to a folder (gitignored — it holds real email content). Replay
that corpus offline by running the API against the folder source, then triggering a pass:

```bash
# run the API against a folder of .md emails instead of IMAP (ingestion must be enabled)
COUPON_INGEST_ENABLED=true INGEST_SOURCE=folder INGEST_LOCAL_DIR=./ingest-input pnpm dev

# then, in another shell, trigger one pass (token-gated POST /internal/ingest)
pnpm ingest
```

Processed files move to `<dir>/processed/`, so re-runs are idempotent. A small synthetic fixture
lives in `packages/api/test/fixtures/ingest/`.

The trigger **starts** a pass and returns immediately — `202 {"status":"started"}`,
`409 {"status":"already-running"}` when one is still in flight, or `503 {"status":"disabled"}` when
`COUPON_INGEST_ENABLED` is false. It does not wait for the outcome, because a full batch routinely
outlives the HTTP request. Watch the logs for the closing
`pass complete: N seen, N added, N skipped, N dropped` line instead.

## Skipping dead emails (`INGEST_MIN_BODY_LENGTH`)

An image-only marketing blast converts to a canonical body of almost nothing, so extracting it is a
guaranteed-empty inference. Set `INGEST_MIN_BODY_LENGTH` to skip the model when an email's converted
body (whitespace excluded) is shorter than that many characters. Skipped messages are still archived,
are acknowledged so they are not re-fetched every pass, are logged with the sender and the measured
length, and are counted as `messagesSkipped` in the pass result.

It defaults to `0` (disabled), because too high a value silently drops real offers. Pick a value from
evidence rather than guessing: run with `INGEST_ARCHIVE_DIR` set for a week, then measure the corpus —

```bash
wc -c "$INGEST_ARCHIVE_DIR"/*.md | sort -n | head -20
```

— and choose a threshold below your shortest genuine deal email.

## Architecture & contributing

See **[AGENTS.md](./AGENTS.md)**. The backend is layered `resolver → service → repository → db`, and
that boundary is enforced by ESLint (not just convention). Adding a feature = copy the canonical
`packages/api/src/entities/deal/` slice. Small, focused PRs; keep `pnpm check` green.

## License

MIT
