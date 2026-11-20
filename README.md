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

## Testing

`npm test` runs Jest in every workspace. API tests use a disposable PostgreSQL
and Redis; start them with `npm run test:db:up` and stop them with
`npm run test:db:down`.

## SonarCloud

1. Fill `sonar.organization` and `sonar.projectKey` in `sonar-project.properties`.
2. Add a `SONAR_TOKEN` secret in GitHub.
3. The CI workflow downloads the coverage artifacts and runs
   `SonarSource/sonarqube-scan-action` against <https://sonarcloud.io>.
