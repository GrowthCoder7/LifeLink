# LifeLink

LifeLink is a demo-quality MVP of an enterprise blood bank and organ donation
coordination platform. Hospitals raise blood requests, the matching engine finds
compatible units across all blood banks without double-allocating them, emergency
requests are prioritised and escalated, an expiry monitor flags stock, and donors,
hospitals and blood banks receive notifications. Organs appear only as a donor
pledge flag.

## Architecture

```
Browser (React + Vite, :5173)
        │  JWT in Authorization header
        ▼
API Gateway (Express, :8080) ── login, JWT, RBAC, rate limiting, reverse proxy
        ├──► donor-service         (:4001)  donors, eligibility
        ├──► inventory-service     (:4002)  units, availability cache, expiry monitor
        ├──► matching-service      (:4003)  compatibility, ranking, allocation, escalation
        └──► notification-service  (:4004)  stream consumers, SMS adapter, inbox
                │                        │
                ▼                        ▼
        PostgreSQL 16 (shared DB)   Redis 7 (availability cache + Streams)
```

Only the gateway is reachable from the browser. Cross-service effects go through
Redis Streams events, except the allocation transaction in `shared/allocate.js`.

## Prerequisites

- Node.js 20 and npm
- Docker and Docker Compose (recommended), **or** a local PostgreSQL 16 and Redis 7

## Quick start (Docker)

```
git clone <repo-url> && cd lifelink
cp .env.example .env
docker compose up --build
```

Then open <http://localhost:5173>.

The one-shot `migrate` container applies migrations and seeds the demo data only into an
empty database, so later `docker compose up` runs (such as `--scale`) keep your data.
To reset the demo, run `docker compose down -v && docker compose up -d`. Outside Docker,
`npm run db:seed` always truncates and re-seeds.

## Non-Docker path

```
npm install
npm run db:migrate && npm run db:seed
npm run dev
npm test
```

`npm run dev` starts the gateway, all four services and the frontend together.

## URLs

| Component | URL |
|---|---|
| Frontend | <http://localhost:5173> |
| API gateway | <http://localhost:8080> |
| Gateway health | <http://localhost:8080/api/health> |

## Demo accounts

All accounts use the password `Demo@1234`.

| Email | Role |
|---|---|
| `admin@lifelink.dev` | ADMIN |
| `hospital.yelahanka@lifelink.dev` | HOSPITAL_STAFF |
| `hospital.jayanagar@lifelink.dev` | HOSPITAL_STAFF |
| `bank.hebbal@lifelink.dev` | BLOODBANK_STAFF |
| `bank.koramangala@lifelink.dev` | BLOODBANK_STAFF |
| `donor.priya@lifelink.dev` | DONOR |

## Demo script

1. Log in as `hospital.yelahanka@lifelink.dev`. Raise **Emergency, 2 × O+ PRBC**.
   It shows MATCHED within seconds with supplying banks, distances and
   "Matched in X.X s".
2. Log in as `bank.hebbal@lifelink.dev` in another browser. Allocated units show
   as ALLOCATED, a notification arrived, and near-expiry units are highlighted.
3. As the hospital, raise **Emergency, 3 × O-**. Only 2 exist, so the request goes
   PARTIAL then ESCALATED; blood banks and eligible O- donors get notifications.
   Log in as a blood bank, add a new O- unit, and the escalated request completes
   to MATCHED automatically via the `inventory.updated` event.
4. The admin console shows stats and average match time.
5. Resilience: `docker compose stop notification-service`, raise a request, then
   `docker compose start notification-service`; the missed notifications appear
   because un-acked stream messages are redelivered.
6. Scale: `docker compose up -d --scale matching-service=2`; the system keeps
   working and each event is handled once per consumer group.

## Branching model

`main` is protected, `develop` is the integration branch, and work happens on
`feature/*` branches that are merged into `develop`.

## MVP simplifications

- All services share one PostgreSQL database. Each service only writes the tables
  it owns; cross-service effects go through Redis Streams events, except the
  allocation transaction in `shared/allocate.js`.
- Services trust the `x-user-id`, `x-user-role`, `x-institution-id` and
  `x-donor-id` headers set by the gateway. This is safe only on the internal
  Docker network; never expose service ports to the host.

- Organs appear only as the donor `organ_pledge` flag; there is no organ matching.
- SMS uses a console adapter (`SMS_PROVIDER=console`) that logs `[SMS] to=... body=...`
  and stores a `channel='SMS'` notification row. No real SMS is sent.

## Design notes

Decisions taken where the spec left room, so the code can be read against the report:

| Area | Decision |
|---|---|
| Matching concurrency | `matchRequest` holds a per-request PostgreSQL advisory lock, so the POST handler, the retry timer, the `inventory.updated` consumer and a second matching instance never over-fill the same request. `match.unit_id UNIQUE` plus `FOR UPDATE SKIP LOCKED` still guarantee a unit is never allocated twice. |
| Availability cache | Read as a hint only. If the hinted banks cannot cover the request, matching searches the whole database. |
| Escalation alert | Requests escalated longer than `ESCALATION_ALERT_MIN` re-publish `request.escalated` with `alert: true`; a Redis `SET NX` key makes it fire once across restarts and instances. Notification-service sends those to admins. |
| Event payloads | `match.created` also carries `bloodGroup` and `component` (for the message text); `request.escalated` carries `donorGroups` so notification-service needs no copy of the compatibility table. |
| Donor calls | Notification-service asks donor-service for eligible donors (`GET /api/donors?eligible=true`), so the eligibility rule lives in one place. If donor-service is down the event stays un-acked and is retried. |
| Rate limiting | 300 / 15 min per IP, 10 / min on login. The notification bell's 5 s poll (`GET /api/notifications`) is not counted: with the hospital table also polling every 5 s, one tab would otherwise exceed 300 / 15 min. Pages pause polling in hidden tabs. |
| CORS | The gateway answers CORS itself (a few lines) because the browser app runs on port 5173; no extra library. |
| Inventory updates | `PATCH /api/inventory/:id` accepts `AVAILABLE` or `EXPIRED` (discard). Units become `ALLOCATED` only through the allocate endpoint. |

Known MVP limits (marked `shortcut:` in the code):

- Role-wide notifications share one `read_at`, so one staff member marking one read marks it for their team.
- Notifications for one event are written in one transaction, but a crash between commit and `XACK` would store them twice (no event-id column to deduplicate).
- Stream consumers are named after the container hostname. `docker compose stop/start` keeps the name, so un-acked events are redelivered; a recreated container would leave the old consumer's pending entries unclaimed (no `XAUTOCLAIM`).
- The availability cache and alert dedupe use `KEYS`, fine for demo-sized Redis.

## Testing

```
npm run test:db:up     # Postgres on 55432, Redis on 56379
npm test               # Jest in every workspace, with coverage
npm run test:db:down
```

API tests use the disposable PostgreSQL (`DATABASE_URL_TEST`, migrated by a Jest
`globalSetup`) and `ioredis-mock`. Suites truncate tables, so do not point a running
dev stack at the test database while tests run. The nine required cases are named
`TC-01` … `TC-09`. Coverage is written per workspace to `coverage/lcov.info` with
repo-relative paths and includes the `shared/` package.

## SonarCloud

1. Create the project on <https://sonarcloud.io> (import the GitHub repository) and
   turn off Automatic Analysis, since CI runs the scan.
2. `sonar-project.properties` is set to organization `growthcoder7`, project `GrowthCoder7_LifeLink`.
3. Add a `SONAR_TOKEN` repository secret in GitHub (SonarCloud → My Account → Security).
4. Push to `develop` or open a pull request. The CI `scan` job downloads the coverage
   artifacts from `test` and runs `SonarSource/sonarqube-scan-action@v7` against
   `https://sonarcloud.io`. The React client is analysed for issues but excluded from
   coverage, since it has no unit tests.

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests to `develop` and `main`:
**build** (`npm ci`) → **lint** → **test** (PostgreSQL 16 and Redis 7 service
containers, migrations, `npm test`, coverage artifacts) → **scan** (SonarCloud) →
**package** (`docker build` of every image, no push).
