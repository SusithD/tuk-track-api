# tuk-track-api

RESTful API for real-time three-wheeler (tuk-tuk) tracking and movement logging — Sri Lanka Police law-enforcement platform.

**Module:** NB6007CEM Web API Development — BSc (Hons) Computing batch 24.2P
**Student ID:** COBSCCOMP242P-072
**Lecturer:** Niranga Dharmaratna

## Live deployment

- **API base URL:** <https://tuk-track-api.onrender.com>
- **Swagger UI:** <https://tuk-track-api.onrender.com/docs>
- **OpenAPI JSON:** <https://tuk-track-api.onrender.com/openapi.json>
- **Health probe:** <https://tuk-track-api.onrender.com/health>

> Hosted on Render's free tier, so the first request after ~15 minutes of
> idle may take 30–60 seconds while the service spins back up.

### Seeded demo credentials

The deployed instance is seeded automatically on every build. All accounts
share the password `Password123!`:

| Email                          | Role                      |
| ------------------------------ | ------------------------- |
| `hq.admin@police.lk`           | hq                        |
| `wp.admin@police.lk`           | province (Western)        |
| `cp.admin@police.lk`           | province (Central)        |
| `officer.colcentral@police.lk` | station (Colombo Central) |
| `officer.colpettah@police.lk`  | station (Pettah)          |
| `officer.gammain@police.lk`    | station (Gampaha)         |
| `officer.kanmain@police.lk`    | station (Kandy)           |
| `officer.galfort@police.lk`    | station (Galle Fort)      |

## Stack

- Node.js 20+ (ES modules)
- Express 4
- PostgreSQL (via Knex query builder + migrations)
- JWT auth (humans) + API key + HMAC (devices)
- Pino structured logging
- Helmet, CORS, rate limiting, compression
- Swagger UI / OpenAPI 3.0
- Jest + Supertest

## Prerequisites

- Node.js 20+
- [Corepack](https://nodejs.org/api/corepack.html) enabled (`corepack enable`) — pins Yarn 4 via the `packageManager` field in `package.json`
- Docker (optional, for the bundled local Postgres)

## Quick start

```bash
corepack enable                # one-time, activates yarn 4 from packageManager pin
cp .env.example .env
yarn install

# spin up local Postgres (or point DATABASE_URL at your own)
docker compose up -d

yarn migrate
yarn seed
yarn dev
```

Open <http://localhost:3000/docs> for the API explorer.

### Seeded test data

`yarn seed` provisions a deterministic dataset:

- 9 provinces, 25 districts, 25 police stations (real Sri Lanka geography)
- 8 user accounts (1 HQ, 2 province, 5 station) — login with any email + password `Password123!`
- 200 registered tuk-tuks (~95% active) with provisioned tracking devices
- 7 days of GPS pings at 10-minute intervals (~190k rows)

Override with env vars: `SEED_VEHICLE_COUNT`, `SEED_HISTORY_DAYS`, `SEED_PING_INTERVAL_MIN`.

## Scripts

| Command           | Purpose                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `yarn dev`        | Start with auto-reload (nodemon)                                 |
| `yarn start`      | Start in production mode                                         |
| `yarn lint`       | ESLint check                                                     |
| `yarn lint:fix`   | ESLint with autofix                                              |
| `yarn format`     | Prettier write                                                   |
| `yarn test`       | Run Jest test suite                                              |
| `yarn migrate`    | Apply DB migrations                                              |
| `yarn seed`       | Seed simulation data — idempotent, skips if data already present |
| `yarn seed:force` | Force-reseed (truncates everything, then re-inserts)             |
| `yarn db:reset`   | Drop, migrate, force-seed                                        |

## Inspecting the local database

`docker compose up -d` brings up two services:

| Service     | Where                   | What it's for                                                          |
| ----------- | ----------------------- | ---------------------------------------------------------------------- |
| Postgres 16 | `localhost:5433`        | The actual DB — the API connects here                                  |
| **pgweb**   | <http://localhost:8081> | Browser UI for browsing tables, running queries, viewing relationships |

Three ways to look at the data:

```bash
# Quickest — drop into a psql shell
yarn db:psql

# Open the pgweb browser UI (http://localhost:8081)
yarn db:web

# Or connect any desktop client (TablePlus, DBeaver, Postico, DataGrip):
#   host: localhost   port: 5433   database: tuktrack
#   user: postgres    password: postgres
```

A few useful queries to start with:

```sql
-- counts across all tables
SELECT 'provinces' AS tbl, count(*) FROM provinces UNION ALL
SELECT 'districts', count(*) FROM districts UNION ALL
SELECT 'stations',  count(*) FROM stations  UNION ALL
SELECT 'users',     count(*) FROM users     UNION ALL
SELECT 'vehicles',  count(*) FROM vehicles  UNION ALL
SELECT 'devices',   count(*) FROM devices   UNION ALL
SELECT 'locations', count(*) FROM locations;

-- vehicles per station, with district + province context
SELECT p.name AS province, d.name AS district, s.name AS station,
       count(v.id) AS vehicles
FROM stations s
JOIN districts d ON d.id = s.district_id
JOIN provinces p ON p.id = d.province_id
LEFT JOIN vehicles v ON v.station_id = s.id
GROUP BY p.name, d.name, s.name
ORDER BY vehicles DESC;

-- last-known location per active vehicle (Postgres DISTINCT ON)
SELECT DISTINCT ON (l.vehicle_id)
       v.plate_no, l.lat, l.lng, l.speed_kmh, l.recorded_at
FROM locations l
JOIN vehicles v ON v.id = l.vehicle_id
WHERE v.status = 'active'
ORDER BY l.vehicle_id, l.recorded_at DESC
LIMIT 20;
```

## Project layout

```
src/
  config/         env validation, db connection
  middleware/     auth, rate-limit, errors, request id
  modules/        feature modules (auth, vehicles, locations, ...)
  utils/          shared helpers (logger, pagination, etag)
  docs/           OpenAPI spec
  app.js          Express app factory
  server.js       process entrypoint (signals, shutdown)
migrations/       Knex SQL migrations
seeds/            Knex seeders
tests/            Jest + Supertest
```

## Deployment

Deployed on **Render** via the `render.yaml` blueprint:

- Web service `tuk-track-api` (free plan, Singapore region)
- Managed Postgres `tuk-track-db` (free plan, same region)
- `JWT_SECRET` auto-generated; `DATABASE_URL` injected from the managed DB
- `RENDER_EXTERNAL_URL` is read on boot to populate the Swagger server URL
- Build command runs `yarn install --immutable && yarn migrate && yarn seed` —
  migrate is idempotent via Knex's tracking table; seeders skip if rows already
  exist (set `SEED_FORCE=1` to reset)
- CI (GitHub Actions) runs lint + format-check + tests on every push to `main`

### Re-seeding on the deployed instance

If you ever need to wipe and re-seed the live DB, open Render's **Shell** for
the service and run:

```bash
SEED_FORCE=1 yarn seed
```

## Postman collection

A ready-to-import Postman collection + environment lives under [postman/](postman/).
It includes scripts that auto-capture JWTs after login, auto-capture device
credentials after provisioning, and auto-sign HMAC requests for the device
ingestion endpoints. See [postman/README.md](postman/README.md) for the
demo-flow walk-through.

## Documentation

The full project report (`/report`) covers business analysis, architecture, security model, and limitations.
