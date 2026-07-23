# MealDeal

Self-hosted grocery-deal tracker. An ingest worker reads a dedicated IMAP mailbox on a schedule, uses
an OpenAI-compatible LLM to extract structured deals, and stores them in SQLite; a small web app lists
active deals and manages mute/watchlist preferences. **Bring your own inbox + LLM. One container.**

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

## Architecture & contributing

See **[AGENTS.md](./AGENTS.md)**. The backend is layered `resolver → service → repository → db`, and
that boundary is enforced by ESLint (not just convention). Adding a feature = copy the canonical
`packages/api/src/entities/deal/` slice. Small, focused PRs; keep `pnpm check` green.

## License

MIT
