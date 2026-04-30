# tuk-track-api

RESTful API for real-time three-wheeler (tuk-tuk) tracking and movement logging — Sri Lanka Police law-enforcement platform.

**Module:** NB6007CEM Web API Development — BSc (Hons) Computing (awarded by Coventry University), NIBM batch 24.2P
**Student ID:** _<replace with your student ID>_
**Lecturer:** Niranga Dharmaratna

## Live deployment

- **API base URL:** _<paste deployed URL after first deploy>_
- **Swagger UI:** `<base>/docs`
- **OpenAPI JSON:** `<base>/openapi.json`
- **Health probe:** `<base>/health`

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

| Command         | Purpose                                                                           |
| --------------- | --------------------------------------------------------------------------------- |
| `yarn dev`      | Start with auto-reload (nodemon)                                                  |
| `yarn start`    | Start in production mode                                                          |
| `yarn lint`     | ESLint check                                                                      |
| `yarn lint:fix` | ESLint with autofix                                                               |
| `yarn format`   | Prettier write                                                                    |
| `yarn test`     | Run Jest test suite                                                               |
| `yarn migrate`  | Apply DB migrations                                                               |
| `yarn seed`     | Seed simulation data (provinces, districts, stations, vehicles, location history) |
| `yarn db:reset` | Drop, migrate, seed                                                               |

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

Deployed on Render via `render.yaml` blueprint. CI runs lint + tests on every push (see `.github/workflows/ci.yml`).

## Documentation

The full project report (`/report`) covers business analysis, architecture, security model, and limitations.
