# LifeLink MVP: Build Instructions for the Coding Agent

You are building **LifeLink**, a demo-quality MVP of an enterprise blood bank and organ donation coordination platform. It is a university course project (Building Enterprise Applications, BCS703B). The architecture is already designed and documented in a Phase 2 report. **Your job is to implement exactly that design, at MVP depth.** Evaluators will compare the repository against the report, so the stack, folder layout, endpoint names, function names and test cases below are fixed. Do not substitute technologies or rename things.

Work in the phases at the end of this file. Stop after each phase, show what you built, run its checks, and wait for me to say "continue". If something in this spec is impossible or clearly wrong, stop and ask instead of improvising.

---

## 1. Goal and scope

Build a working system that demonstrates, end to end:

1. A hospital raises a blood request with an urgency level (Routine / Urgent / Emergency).
2. The matching engine finds compatible, unexpired units across all blood banks, ranks them by distance and shelf life, and allocates them **without ever allocating the same unit twice**.
3. Emergency requests jump the queue; if they cannot be filled they are escalated network-wide.
4. An expiry monitor flags near-expiry and expired units.
5. Donors, hospitals and blood banks receive notifications.
6. An admin sees network-wide stats.

**MVP means:** clean, working, demo-able, tested. Not production-hardened. Prefer the simplest correct implementation of each feature. No extra features beyond this spec.

**Out of scope:** payments, medical devices, national registries, real SMS delivery, email, organ matching logic. Organs appear only as a donor "organ pledge" flag.

---

## 2. Fixed technology stack

| Concern | Choice |
|---|---|
| Language | JavaScript (CommonJS), **Node.js 20**. No TypeScript. |
| Backend framework | Express 4 for the gateway and all four services |
| Frontend | React 18 + Vite, react-router-dom, plain CSS (no UI framework) |
| Database | PostgreSQL 16, accessed with `pg` (node-postgres) and plain SQL. No ORM. |
| Cache + event bus | Redis 7 via `ioredis`: availability cache **and** Redis Streams with consumer groups |
| Auth | `jsonwebtoken` (JWT), `bcryptjs` for password hashing |
| Validation | `joi` |
| Rate limiting | `express-rate-limit` (gateway only) |
| Proxy | `http-proxy-middleware` (gateway only) |
| PII encryption | PostgreSQL `pgcrypto` (`pgp_sym_encrypt` / `pgp_sym_decrypt`) for donor phone |
| Tests | Jest + Supertest; `ioredis-mock` for Redis in tests; a real disposable Postgres for API tests |
| Lint | ESLint 9 (flat config) + `eslint-plugin-security` |
| Static analysis | SonarCloud (configured via `sonar-project.properties` + GitHub Actions) |
| Containers | One Dockerfile per service + frontend, `docker-compose.yml` for everything |
| CI | GitHub Actions |
| Monorepo | npm workspaces |

Pin dependency versions in every `package.json` (no `^` or `latest` for runtime deps is fine to relax for devDeps, but keep a committed `package-lock.json`).

---

## 3. Repository layout (must match exactly)

```
lifelink/
├── frontend/                     # React (Vite) client
│   ├── src/
│   │   ├── pages/                # Login, DonorApp, HospitalDashboard,
│   │   │                         #   BloodBankConsole, AdminConsole
│   │   ├── components/           # Tables, forms, badges, NotificationBell, Layout
│   │   ├── api/                  # client.js: fetch wrapper for the gateway
│   │   ├── App.jsx, main.jsx, styles.css
│   ├── Dockerfile
│   └── package.json
├── gateway/                      # API Gateway (Express)
│   ├── src/
│   │   ├── middleware/           # auth.js (JWT), rbac.js, rateLimit.js
│   │   ├── routes/               # auth.js (login), proxy.js
│   │   ├── app.js                # exports the Express app (no listen)
│   │   └── server.js             # app.listen
│   ├── tests/
│   ├── Dockerfile
│   └── package.json
├── services/
│   ├── donor-service/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── controllers/
│   │   │   ├── models/           # SQL data-access functions only
│   │   │   ├── validators/       # joi schemas + validateDonor()
│   │   │   ├── app.js
│   │   │   └── server.js
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── inventory-service/        # same layout + src/jobs/expiryMonitor.js
│   ├── matching-service/         # same layout + src/engine/ (compatibility.js,
│   │                             #   ranking.js, scoring.js, allocator.js, escalation.js)
│   └── notification-service/     # same layout + src/consumers/ (stream listeners)
├── shared/                       # npm workspace package "@lifelink/shared"
│   ├── db.js                     # pg Pool factory
│   ├── redis.js                  # ioredis factory (accepts injected client for tests)
│   ├── events.js                 # publish(), consume() helpers for Redis Streams
│   ├── eventSchemas.js           # JSON-Schema-like definitions of each event
│   ├── allocate.js               # the locked allocation transaction (used by 2 services)
│   ├── errors.js                 # AppError, error-handler middleware
│   └── logger.js
├── db/
│   ├── migrations/               # 001_init.sql, ...
│   ├── seed/                     # seed.sql or seed.js
│   └── migrate.js                # runs migrations in order
├── .github/workflows/ci.yml
├── docker-compose.yml
├── docker-compose.test.yml       # Postgres + Redis for local test runs
├── sonar-project.properties
├── eslint.config.js
├── .env.example
├── package.json                  # workspaces root
└── README.md
```

Every service follows **routes → controllers → models**. Controllers hold request/response logic; models hold SQL only; business rules live in `engine/`, `jobs/`, or `validators/`. Each service exports its Express app from `src/app.js` (so Supertest can import it) and only `src/server.js` calls `listen`.

---

## 4. Runtime topology

| Component | Container port | Exposed to host |
|---|---|---|
| frontend (Vite dev server or nginx) | 5173 | yes, 5173 |
| gateway | 8080 | yes, 8080 |
| donor-service | 4001 | no |
| inventory-service | 4002 | no |
| matching-service | 4003 | no |
| notification-service | 4004 | no |
| postgres | 5432 | yes, 5432 (for debugging) |
| redis | 6379 | yes, 6379 (for debugging) |

Only the gateway is reachable from the browser. Services must **not** bind fixed host ports, so `docker compose up --scale matching-service=2` works (this is the NFR-4 scalability demo).

**MVP simplification (state this in the README):** all services share one PostgreSQL database, but each service only writes the tables it owns (ownership listed in §5). Cross-service effects go through events, except the allocation transaction in `shared/allocate.js`.

---

## 5. Data model (`db/migrations/001_init.sql`)

Enable `pgcrypto`. Use UUID primary keys (`gen_random_uuid()`), `timestamptz` for times.

```
institution      (owner: admin/seed)
  id, name, type ('HOSPITAL' | 'BLOOD_BANK'), city, lat numeric, lng numeric, created_at

app_user         (owner: gateway)
  id, email unique, password_hash, role ('DONOR'|'HOSPITAL_STAFF'|'BLOODBANK_STAFF'|'ADMIN'),
  institution_id fk null, donor_id fk null, created_at

donor            (owner: donor-service)
  id, full_name, email unique, phone_encrypted bytea, blood_group, date_of_birth date,
  last_donation_date date null, organ_pledge boolean default false,
  city, lat, lng, created_at

inventory_unit   (owner: inventory-service)
  id, institution_id fk, blood_group, component ('WHOLE_BLOOD'|'PRBC'|'PLATELETS'|'PLASMA'),
  collected_at, expires_at,
  status ('AVAILABLE'|'ALLOCATED'|'EXPIRED') default 'AVAILABLE',
  expiry_flag ('OK'|'NEAR_EXPIRY'|'EXPIRED') default 'OK',
  donor_id fk null, created_at

request          (owner: matching-service)
  id, hospital_id fk, blood_group, component, quantity int check (quantity between 1 and 10),
  urgency ('ROUTINE'|'URGENT'|'EMERGENCY'),
  status ('PENDING'|'PARTIAL'|'MATCHED'|'ESCALATED'|'CANCELLED') default 'PENDING',
  created_by fk app_user, created_at, matched_at null, escalated_at null

match            (owner: matching-service)
  id, request_id fk, unit_id fk UNIQUE, institution_id fk, distance_km numeric, created_at

notification     (owner: notification-service)
  id, user_id fk null, role null, institution_id fk null,
  channel ('IN_APP'|'SMS'), title, body, read_at null, created_at
```

Blood groups are exactly: `O-`, `O+`, `A-`, `A+`, `B-`, `B+`, `AB-`, `AB+`.
Add sensible indexes: `inventory_unit(blood_group, component, status)`, `request(status, urgency, created_at)`.
`match.unit_id UNIQUE` is the database-level guarantee against double allocation.

---

## 6. Events (Redis Streams)

One stream per event type. Each service reads with its own consumer group (`XGROUP CREATE ... MKSTREAM`), `XREADGROUP ... BLOCK 5000`, and **`XACK` only after successful processing**, so un-acked messages are redelivered after a restart (this is the NFR-1 demo). On startup, a consumer must also process its pending entries (`XREADGROUP` with id `0`) before reading new ones.

| Stream | Published by | Payload | Consumed by |
|---|---|---|---|
| `request.created` | matching-service | requestId, hospitalId, bloodGroup, component, quantity, urgency | notification |
| `inventory.updated` | inventory-service | institutionId, bloodGroup, component | matching (retry open requests), inventory (refresh cache) |
| `match.created` | matching-service | requestId, hospitalId, matches[{unitId, institutionId, distanceKm}], status, matchMs | notification |
| `request.escalated` | matching-service | requestId, bloodGroup, component, urgency | notification |
| `unit.expiring` | inventory-service | unitId, institutionId, bloodGroup, flag | notification |

`shared/events.js` exposes `publish(stream, payload)` and `consume({stream, group, consumer, handler})`. Payload is stored as a single JSON field `data`.

---

## 7. Gateway (`gateway/`)

- `POST /api/auth/login` `{email, password}` → `200 {token, user:{id, email, role, institutionId, donorId}}`; `401` on bad credentials. JWT expires in 8h, secret from `JWT_SECRET`.
- `GET /api/health` → `200 {status:"ok"}`.
- JWT middleware on everything except login, health and `POST /api/donors` (public donor self-registration). Missing/invalid token → **`401 {error:"Unauthorized"}`** from the gateway itself.
- RBAC middleware with a route → roles table. Wrong role → `403`.
- Forwards identity to services as headers `x-user-id`, `x-user-role`, `x-institution-id`, `x-donor-id`. Services trust these headers (internal network only; note this in README).
- `express-rate-limit`: 300 requests / 15 min per IP generally, 10 / min on login.
- Proxy map:
  - `/api/donors/**` → donor-service
  - `/api/inventory/**` → inventory-service
  - `/api/requests/**`, `/api/matches/**`, `/api/admin/**` → matching-service
  - `/api/notifications/**` → notification-service

RBAC table:

| Route | Roles |
|---|---|
| `POST /api/donors` | public |
| `GET /api/donors/me` | DONOR |
| `GET /api/donors` | HOSPITAL_STAFF, ADMIN |
| `GET /api/inventory`, `GET /api/inventory/expiring` | BLOODBANK_STAFF, HOSPITAL_STAFF, ADMIN |
| `POST /api/inventory`, `PATCH /api/inventory/:id` | BLOODBANK_STAFF |
| `POST /api/inventory/:id/allocate` | BLOODBANK_STAFF, ADMIN |
| `POST /api/requests` | HOSPITAL_STAFF |
| `GET /api/requests`, `GET /api/requests/:id` | HOSPITAL_STAFF, ADMIN |
| `GET /api/admin/stats` | ADMIN |
| `GET /api/notifications`, `PATCH /api/notifications/:id/read` | any authenticated |

---

## 8. Services

### 8.1 donor-service
- `validateDonor(payload)` in `src/validators/donorValidator.js`: joi schema; returns `{value}` or `{error: {field, message}}`. Required: full_name, email, password (≥ 8 chars), phone, blood_group (one of the 8 groups), date_of_birth. Optional: last_donation_date, organ_pledge, city, lat, lng.
- `POST /api/donors`: validate (400 `{error, field}` on failure), create donor (phone encrypted with `PII_KEY` via pgcrypto) and an `app_user` with role DONOR in one transaction. `201 {id}`. Duplicate email → `409`.
- `GET /api/donors/me`: own profile with decrypted phone and computed `eligible` + `nextEligibleDate`.
- `GET /api/donors?bloodGroup=&eligible=true`: list without phone.
- Eligibility rule (`isEligible(donor, today)`): age 18–65 and last donation ≥ 90 days ago (or never).

### 8.2 inventory-service
- `GET /api/inventory?institutionId=&bloodGroup=&status=`: blood bank staff see only their institution; hospital/admin see all.
- `POST /api/inventory`: add a unit `{bloodGroup, component, collectedAt, expiresAt}` for the caller's institution. Publish `inventory.updated`.
- `PATCH /api/inventory/:id`: update status (e.g. discard).
- `POST /api/inventory/:id/allocate` `{requestId}`: calls `shared/allocate.js`. `200` on success, **`409 {error:"Unit not available"}`** if already allocated or locked.
- `GET /api/inventory/expiring`: units flagged NEAR_EXPIRY.
- **Availability cache:** key `avail:{institutionId}:{bloodGroup}:{component}` = count of AVAILABLE, non-expired units. Rebuild the affected key whenever a unit changes, and rebuild all keys on startup.
- **Expiry monitor** (`src/jobs/expiryMonitor.js`):
  - `classify(unit, now)` (pure function): `expires_at < now` → `EXPIRED`; `expires_at - now ≤ 3 days` → `NEAR_EXPIRY`; else `OK`.
  - `run()`: applies `classify` to all non-allocated units, sets `status='EXPIRED'` for expired ones, updates `expiry_flag`, refreshes cache, publishes `unit.expiring` for units that newly became NEAR_EXPIRY or EXPIRED.
  - Interval from `EXPIRY_INTERVAL_MS` (default 60000; demo uses 10000).

### 8.3 matching-service
Engine modules (pure functions where possible, all unit-tested):

- `engine/compatibility.js`: `isCompatible(donorGroup, recipientGroup)` and `compatibleDonorGroups(recipientGroup)` using red-cell ABO/Rh rules:

  | Recipient | Can receive from |
  |---|---|
  | O- | O- |
  | O+ | O-, O+ |
  | A- | O-, A- |
  | A+ | O-, O+, A-, A+ |
  | B- | O-, B- |
  | B+ | O-, O+, B-, B+ |
  | AB- | O-, A-, B-, AB- |
  | AB+ | all eight |

- `engine/ranking.js`: `rankRequests(requests)`: sort by urgency (EMERGENCY > URGENT > ROUTINE), then `created_at` ascending. Never mutate input.
- `engine/scoring.js`: `haversineKm(a, b)` and `scoreCandidates(candidates, hospital)`: order by exact-group match first, then distance ascending, then `expires_at` ascending (soonest expiry used first).
- `engine/allocator.js` `matchRequest(requestId)`:
  1. Load request + hospital coordinates.
  2. Read the availability cache to find institutions with stock of compatible groups (cache is a hint only; the DB is the truth).
  3. Query candidate units from those institutions (AVAILABLE, `expires_at > now()`, compatible group, same component), score them.
  4. For each needed unit, call `shared/allocate.js` until `quantity` is reached.
  5. Set request status MATCHED / PARTIAL / unchanged; set `matched_at`; compute `matchMs = matched_at - created_at`.
  6. Publish `inventory.updated` per touched institution and `match.created`.
- `shared/allocate.js` `allocateUnit(client, unitId, requestId, distanceKm)`: inside one transaction, `SELECT ... FROM inventory_unit WHERE id=$1 AND status='AVAILABLE' FOR UPDATE SKIP LOCKED`; if no row, return `{ok:false}`; else set `status='ALLOCATED'`, insert `match`, commit, return `{ok:true}`. Also treat a unique-violation on `match.unit_id` as `{ok:false}`.
- `engine/escalation.js`: an EMERGENCY request still PENDING/PARTIAL after matching becomes `ESCALATED` (`escalated_at` set) and publishes `request.escalated`. A timer every `ESCALATION_RETRY_MS` (default 30000) re-runs matching for open requests in `rankRequests` order. Requests escalated longer than `ESCALATION_ALERT_MIN` (default 10, demo 2) trigger an admin notification once.
- Endpoints:
  - `POST /api/requests` `{bloodGroup, component, quantity, urgency}`: validate (400), insert, publish `request.created`, then **immediately run `matchRequest` in-process** before responding, so the demo shows instant matching. Respond `201 {id, status, matches, matchMs}`.
  - `GET /api/requests` (hospital sees own; admin sees all), `GET /api/requests/:id` (with matches and units).
  - `GET /api/admin/stats`: units by blood group (available), requests by status, fulfilment rate (matched / total), expired-unit count (wastage), average `matchMs`.
- Also consume `inventory.updated`: re-run matching for open requests that could use that group (in rank order).

### 8.4 notification-service
- Consumers for `request.created`, `match.created`, `request.escalated`, `unit.expiring` turn events into `notification` rows:
  - match.created → the hospital's staff ("2 units of O- allocated, matched in 1.4 s") and each supplying blood bank's staff.
  - request.escalated → all blood bank staff and all eligible donors of a compatible group (in-app), plus an SMS entry.
  - unit.expiring → the owning blood bank's staff.
- SMS: a `providers/smsProvider.js` adapter. `SMS_PROVIDER=console` (default) logs `[SMS] to=... body=...` and stores a `channel='SMS'` row. Do not integrate a real provider.
- `GET /api/notifications` (own, by user_id or by role + institution), newest first, limit 50. `PATCH /api/notifications/:id/read`.

---

## 9. Frontend

Palette from the project's existing deck: navy `#0F1D33`, crimson `#A4162B`, pink accent `#E0637A`, light surface `#F6F8FA`, body text `#33465F`. Font: IBM Plex Sans (Google Fonts) with system fallback. Clean, minimal, responsive enough for a projector.

- **Login** page; redirects by role. Show the demo accounts in a small hint box on the login page.
- **Layout**: top bar with "LifeLink", role badge, notification bell (unread count, dropdown list, polls every 5 s), logout.
- **DonorApp**: public registration form (all validator fields, inline field errors from the 400 response); after login, profile card with blood group, eligibility status and next eligible date, organ-pledge flag, and notifications (donation calls).
- **HospitalDashboard**: request form (blood group, component, quantity, urgency with red Emergency styling); table of own requests with status badges (PENDING grey, MATCHED green, PARTIAL amber, ESCALATED crimson); clicking a row shows matched units, supplying bank, distance and **"Matched in X.X s"**. Poll every 5 s.
- **BloodBankConsole**: inventory table for own institution with filters; near-expiry rows highlighted amber, expired rows struck through; "Add unit" form; "Recent allocations" list.
- **AdminConsole**: stat cards (available units, fulfilment rate, expired units, avg match time); bar chart of available units by blood group (simple inline SVG or CSS bars, no chart library); requests-by-status list.
- `src/api/client.js`: base URL from `VITE_API_URL` (default `http://localhost:8080`), attaches the JWT, on 401 logs out.

---

## 10. Seed data (`db/seed`)

Bengaluru-based so distances are meaningful:
- Hospitals: "Yelahanka General Hospital" (13.1007, 77.5963), "Jayanagar City Hospital" (12.9250, 77.5938), "Whitefield Care Hospital" (12.9698, 77.7500).
- Blood banks: "Hebbal Blood Centre" (13.0358, 77.5970), "Koramangala Blood Bank" (12.9352, 77.6245), "Malleshwaram Red Cross Bank" (13.0035, 77.5709).
- ~45 units spread across banks and groups: plenty of O+/A+/B+, only **two O- units** (so a 3-unit O- Emergency request demonstrates PARTIAL → ESCALATED), several units expiring within 1–2 days, two already expired.
- 15 donors with mixed groups and last-donation dates (some ineligible).
- Users (all password `Demo@1234`): `admin@lifelink.dev`, `hospital.yelahanka@lifelink.dev`, `hospital.jayanagar@lifelink.dev`, `bank.hebbal@lifelink.dev`, `bank.koramangala@lifelink.dev`, `donor.priya@lifelink.dev`.
- `npm run db:seed` must be idempotent (truncate then insert).

---

## 11. Tests (these exact cases must exist and pass)

Use the test IDs in the `describe`/`test` names so the output can be screenshotted against the report.

| ID | Level | Location | Test |
|---|---|---|---|
| TC-01 | Unit | donor-service | `validateDonor()` with blood_group `"C+"` → error with field `blood_group` |
| TC-02 | Unit | matching-service | `isCompatible("O-","AB+") === true`, `isCompatible("A+","O-") === false` |
| TC-03 | Unit | matching-service | `rankRequests()` given a Routine created earlier and an Emergency created later → Emergency first |
| TC-04 | Unit | inventory-service | `expiryMonitor.classify()` for a unit expiring in 2 days → `NEAR_EXPIRY`; expired 1 day ago → `EXPIRED`; and an EXPIRED unit is excluded from availability |
| TC-05 | API | gateway | `POST /api/auth/login` valid hospital-staff credentials → 200, JWT whose payload role is `HOSPITAL_STAFF` |
| TC-06 | API | donor-service | `POST /api/donors` without `blood_group` → 400 with field-level error |
| TC-07 | API | gateway | `GET /api/inventory` without Authorization header → 401 from the gateway |
| TC-08 | API | matching-service | `POST /api/requests` Emergency, 2 × O- with stock seeded → 201, a `match` row per unit exists, `matchMs < 30000` |
| TC-09 | API | inventory-service | Two concurrent `POST /api/inventory/:id/allocate` for the same unit (`Promise.all`) → exactly one 200 and one 409; exactly one `match` row for that unit |

Add a handful of extra unit tests where cheap (e.g. haversine, isEligible, scoreCandidates ordering), but the nine above are mandatory.

Test infrastructure:
- `docker-compose.test.yml` starts Postgres on port 55432 and Redis on 56379.
- API tests use `DATABASE_URL_TEST`; a Jest `globalSetup` runs migrations; each suite truncates and inserts its own minimal fixtures.
- Redis is injected: services get their Redis client through `shared/redis.js`, which tests replace with `ioredis-mock`.
- The gateway tests can stub the proxy targets; TC-05 needs the `app_user` table in the test DB.
- Each workspace: `"test": "jest --coverage"`. Root: `npm test` runs all workspaces. Coverage reports in lcov format for SonarCloud. Aim for ≥ 70% line coverage on services.

---

## 12. Quality tooling

- `eslint.config.js` at root: `@eslint/js` recommended + `eslint-plugin-security` recommended, Node + Jest globals, React plugin for `frontend/`. `npm run lint` must pass with **zero errors**.
- `sonar-project.properties`: `sonar.organization`, `sonar.projectKey` as placeholders I will fill; sources = gateway/src, services/*/src, shared, frontend/src; tests = **/tests; `sonar.javascript.lcov.reportPaths` listing each workspace's `coverage/lcov.info`; exclude `db/seed`, `**/*.test.js` from coverage.
- Keep the code free of obvious Sonar issues: no unused variables, no empty catch blocks, no hard-coded secrets (read from env), no `console.log` outside `logger.js` and the console SMS provider, functions under ~40 lines where reasonable.

---

## 13. CI (`.github/workflows/ci.yml`)

Triggers: pull requests to `develop` and `main`, pushes to `develop` and `main`. Jobs in order:
1. **build**: checkout, setup Node 20 with npm cache, `npm ci`.
2. **lint**: `npm run lint`.
3. **test**: GitHub `services:` for postgres:16 and redis:7; run migrations; `npm test`; upload coverage artifacts.
4. **scan**: SonarCloud scan using the official SonarSource GitHub Action (check the currently recommended action for SonarCloud; as of recent versions this is `SonarSource/sonarqube-scan-action` with `SONAR_HOST_URL=https://sonarcloud.io`), using `SONAR_TOKEN` secret and downloaded coverage. Pin the action to a release tag.
5. **package**: `docker build` each service image (no push).

Pin every action to a version tag.

---

## 14. Docker and environment

- Each Dockerfile: `node:20-alpine`, non-root user, `npm ci --omit=dev` for the workspace, `CMD ["node","src/server.js"]`. Frontend: build with Vite, serve with `nginx:alpine` (or Vite preview), port 5173.
- `docker-compose.yml`: postgres (with a healthcheck), redis, a one-shot `migrate` service that runs migrations + seed, then gateway, four services (`depends_on` with `condition: service_healthy` / `service_completed_successfully`), frontend. Demo-friendly env: `EXPIRY_INTERVAL_MS=10000`, `ESCALATION_RETRY_MS=15000`, `ESCALATION_ALERT_MIN=2`.
- `.env.example`: `JWT_SECRET`, `PII_KEY`, `DATABASE_URL`, `REDIS_URL`, service URLs, intervals, `SMS_PROVIDER=console`, `VITE_API_URL`.
- Root scripts: `dev` (runs gateway, services, frontend concurrently with `concurrently`), `test`, `lint`, `db:migrate`, `db:seed`, `test:db:up`, `test:db:down`.

---

## 15. README.md

Include: what LifeLink is (2–3 lines); architecture diagram as text; prerequisites; the exact commands

```
git clone <repo-url> && cd lifelink
cp .env.example .env
docker compose up --build
```

and the non-Docker path (`npm install`, `npm run db:migrate && npm run db:seed`, `npm run dev`, `npm test`); URLs (frontend 5173, gateway 8080); demo accounts; the demo script (§16); branching model (main protected, develop integration, feature/* branches); the shared-database and trusted-header MVP simplifications; how to run SonarCloud.

---

## 16. Demo script (must work end to end)

1. Log in as `hospital.yelahanka@lifelink.dev`. Raise **Emergency, 2 × O+ PRBC**. It shows MATCHED within seconds with supplying banks, distances and "Matched in X.X s".
2. Log in as `bank.hebbal@lifelink.dev` in another browser: allocated units show as ALLOCATED; a notification arrived; near-expiry units are highlighted.
3. As the hospital, raise **Emergency, 3 × O-**. Only 2 exist → PARTIAL then ESCALATED; blood banks and eligible O- donors get notifications. Log in as a blood bank, add a new O- unit → the escalated request completes to MATCHED automatically (via `inventory.updated`).
4. Admin console shows stats and average match time.
5. Resilience: `docker compose stop notification-service`, raise a request, `docker compose start notification-service` → the missed notifications appear (un-acked stream messages).
6. Scale: `docker compose up -d --scale matching-service=2` → system keeps working; each event handled once.

---

## 17. Phases (stop after each one)

1. **Scaffold**: workspaces, folder layout, ESLint, shared package, Dockerfiles, docker-compose with postgres + redis, migrations + seed, `.env.example`. Check: `docker compose up postgres redis migrate` succeeds; `npm run lint` passes.
2. **Gateway + donor-service**: login, JWT, RBAC, rate limit, proxy, donor endpoints. Tests TC-01, TC-05, TC-06, TC-07.
3. **Inventory-service**: CRUD, cache, expiry monitor, allocate endpoint, `shared/allocate.js`. Tests TC-04, TC-09.
4. **Matching-service**: engine modules, requests, escalation, stats, event consumers. Tests TC-02, TC-03, TC-08.
5. **Notification-service**: consumers, SMS console provider, endpoints.
6. **Frontend**: all five pages.
7. **CI, Sonar config, README**, full `docker compose up --build` run-through of the demo script.

At the end of phase 7, give me a short report with:
- total number of test cases and how many passed (paste the Jest summary lines),
- coverage % per workspace,
- ESLint result,
- the "Matched in X.X s" value from demo step 1,
- anything in this spec you could not implement or changed, and why.

---

## 18. Rules

- Do not change the stack, names, routes, function names or test IDs in this file.
- Keep it simple; do not add features, libraries or abstractions not listed here without asking.
- No secrets in code. No `TODO` stubs left in delivered phases.
- Use small, readable functions and meaningful names; this code will be reviewed by examiners.
- Commit at the end of each phase with a clear message (`feat(inventory): expiry monitor and allocation`), on a `feature/<phase-name>` branch merged into `develop`.