# Pokedex API — Express + JavaScript

RESTful Pokedex API built with **Express 5 + modern JavaScript (ESM)** on Node 22. It integrates with the external [PokeAPI](https://pokeapi.co/docs/v2), replicates Pokemon data on demand into a shared **PostgreSQL** database (Drizzle ORM), caches upstream reads through a **two-tier L1/L2 cache** (in-memory + optional Redis), and exposes CRUD + JWT auth endpoints documented with Swagger.

This repo is the **plain-JavaScript mirror** of [`pokedex-api-express-ts`](../pokedex-api-express-ts): same clean architecture, same routes, same wire responses — with JSDoc typedefs standing in for TypeScript interfaces. Its key differentiator inside the ecosystem is also its key constraint: it is a **read-only schema mirror**. The database schema is owned by the TS repo; this repo queries the shared tables but never migrates them.

## Ecosystem overview

Four repositories make up the ecosystem. The three backends are **contract-identical**: same routes, same `{ data, error, msg, meta }` envelope (byte-identical wire responses, verified by live parity gates during development), same bcrypt/JWT parameters — so a user registered on one service logs in on another, a JWT issued by one verifies on all, and the frontend switches between them at runtime.

| Repo | Stack | Port | Role |
|---|---|---|---|
| [`pokedex-api-express-ts`](../pokedex-api-express-ts) | Node 22, Express 5, TypeScript, Drizzle | 3001 | Backend — reference implementation; **schema + infra owner** |
| [`pokedex-api-express-js`](.) | Node 22, Express 5, JavaScript (ESM) | 3000 | Backend — **this repo**; plain-JS mirror |
| [`pokedex-api-dotnet`](../pokedex-api-dotnet) | ASP.NET Core (.NET 10), EF Core, Npgsql | 5257 | Backend — database-first EF mapping |
| [`pokedex-web`](../pokedex-web) | React 19, Vite, TypeScript | 5173 | Frontend with a live backend switcher |

```mermaid
flowchart LR
    WEB["pokedex-web<br/>React 19 + Vite<br/>:5173"]

    subgraph backends ["Contract-identical backends"]
        TS["pokedex-api-express-ts<br/>:3001 — schema and infra owner"]
        JS["pokedex-api-express-js<br/>:3000 — this repo"]
        NET["pokedex-api-dotnet<br/>:5257"]
    end

    subgraph infra ["Shared infrastructure"]
        PG[("PostgreSQL<br/>pokedex — :5432<br/>required for DB-backed endpoints")]
        REDIS[("Redis L2 cache<br/>:6379 — optional")]
    end

    POKE["PokeAPI<br/>pokeapi.co"]

    WEB -->|"runtime switcher"| TS
    WEB --> JS
    WEB --> NET

    TS --> PG
    JS --> PG
    NET --> PG

    TS -.-> REDIS
    JS -.-> REDIS
    NET -.-> REDIS

    TS --> POKE
    JS --> POKE
    NET --> POKE

    style JS stroke-width:3px
```

## Architecture

Clean architecture with an explicit composition root ([`src/Container.js`](src/Container.js)): domain knows nothing, application depends only on domain + its own ports (JSDoc-typed contracts), infrastructure implements the ports, presentation is a thin HTTP skin. Every endpoint returns the standard `{ data, error, msg, meta }` envelope.

```
src/
├── Server.js                     # Entry point: fail-fast env validation, graceful shutdown, Redis connect, listen
├── Container.js                  # Composition root — wires every layer exactly once per process
├── domain/
│   ├── errors/                   # HttpError hierarchy: ValidationError (400), UnauthorizedError (401), NotFoundError (404), ConflictError (409)
│   └── types/                    # JSDoc typedefs: Api (envelope, paging), Pokemon, User
├── application/
│   ├── ports/                    # JSDoc-typed contracts the services depend on: cache, PokeAPI gateway, repositories
│   └── services/                 # AuthService, PokemonsService — all business rules, zero I/O
├── infrastructure/
│   ├── cache/                    # MemoryCache (L1 TTL map) and RedisCache (L2 — optional, fail-soft, warn-once)
│   ├── clients/                  # PokeApiClient — singleton PokeAPI gateway wrapping the two-tier cache
│   ├── config/                   # Env (dotenv + fail-fast validation), Logger
│   ├── database/                 # pg Pool + Drizzle instance; Schema.js — READ-ONLY MIRROR of the TS repo's schema
│   ├── lifecycle/                # GracefulShutdown: drain requests → close pg/Redis → exit
│   └── repositories/             # Drizzle repositories: users, refresh tokens, pokemons
└── presentation/
    ├── App.js                    # Express app factory: CORS, JSON, Swagger, routes, envelope 404, error handler
    ├── controllers/              # Thin HTTP handlers — parse, delegate, wrap in the envelope
    ├── middleware/               # Auth (JWT guard), Cors (permissive, token-auth rationale), ErrorHandler
    ├── routes/                   # AuthRoutes, PokemonsRoutes
    ├── swagger/                  # swagger-jsdoc spec + reusable component schemas
    └── utils/                    # ok() / fail() envelope builders
```

### The singleton PokeAPI client and the two-tier cache

The external PokeAPI is consumed through exactly one client instance per process (ESM modules evaluate once, so the container is a natural singleton — documented in the client's doc comment). The client caches **assembled results** (list pages, full detail objects), not raw upstream responses:

```mermaid
flowchart LR
    REQ["Request"] --> L1{"L1 in-memory<br/>TTL 5 min"}
    L1 -->|hit| RESP["Response"]
    L1 -->|miss| L2{"L2 Redis<br/>TTL 1 h"}
    L2 -->|hit| WARM["write back to L1"] --> RESP
    L2 -->|miss| NET["PokeAPI network"] --> STORE["write L1 + L2"] --> RESP
```

- **Key scheme, shared verbatim by all three backends** so they can share L2 hits: `pokeapi:list:{page}:{pageSize}` and `pokeapi:pokemon:{idOrName}`. (In practice the .NET service's HybridCache wraps values in its own payload envelope, so the Node services and .NET share the Redis *instance* and key scheme but treat each other's entries as a miss — see the .NET repo's README for the documented trade-off.)
- **Partial pages are never cached.** List hydration fans out one request per Pokemon; a transient failure drops that entry from the page (`Promise.allSettled`), but a page containing any rejection is served once and *not* written to cache, so the next request retries against the network.
- **404s are never cached.** An upstream 404 maps to `null`/`NotFoundError` without a cache write.
- **Malformed cache entries degrade to a miss** — a corrupt L1/L2 value can never crash a request.
- **Redis is fully optional.** Empty `REDIS_URL` → L1-only mode. Redis configured but unreachable → one logged warning, L1 + network continue, and the client's own reconnect strategy restores L2 automatically when Redis returns.

### Auth contract (identical in all three backends)

- **Passwords:** bcrypt, `$2b$` variant, cost **12** — hashes are verifiable by every service.
- **Access token:** JWT **HS256**, **15 min** lifetime, issuer `pokedex-api`, audience `pokedex-clients`, claims `sub` (user uuid), `email`, `jti`, `iat`, `exp`. Key material is the UTF-8 bytes of `JWT_SECRET` (≥ 32 chars).
- **Refresh token:** opaque 256-bit random value (base64url) returned in the response body; stored server-side only as a SHA-256 hex hash. **24 h absolute lifetime anchored at login** — rotation never extends it.
- **Rotation:** every `POST /api/auth/refresh` revokes the presented token and issues a new one in the same family with the same expiry.
- **Reuse detection:** presenting an already-revoked token revokes the **entire family** (theft signal) and returns 401.

See the [auth flow diagram](#auth-flow) below.

## Prerequisites

### Required

| Dependency | Version | Notes |
|---|---|---|
| Node.js | 22 (see [`.nvmrc`](.nvmrc)) | `nvm use` picks it up |
| npm | bundled with Node 22 | lockfile is npm-format |
| PostgreSQL | 14+ (native install) | **Only for DB-backed endpoints** (auth, sync, local CRUD). Browse/detail work with **no database at all** |

### Optional

| Dependency | Enables | Without it |
|---|---|---|
| Redis | L2 shared cache | Empty `REDIS_URL` → L1-only mode; Redis down → single warning, L1 + network continue |
| Docker | `docker-compose.yml` (containerized API + its own Postgres); the shared Redis compose lives in the TS repo | Run everything natively |

**Graceful degradation is a design rule:** nothing may assume Docker, Postgres, or Redis is running. Postgres being unreachable produces clear request-time errors on DB-backed endpoints, not a crash loop; `GET /api/pokemons` and the detail endpoints keep working because they only touch PokeAPI + cache.

## Configuration

Copy the example file and adjust:

```bash
cp .env.example .env
```

| Variable | Default | Required | Notes |
|---|---|---|---|
| `NODE_ENV` | `development` | No | `production` disables Swagger UI |
| `PORT` | `3000` | No | This service's port in the ecosystem allocation |
| `DATABASE_URL` | — | For DB-backed endpoints | e.g. `postgres://pokedex:pokedex@localhost:5432/pokedex` |
| `POKEAPI_BASE_URL` | `https://pokeapi.co/api/v2` | No | Upstream PokeAPI |
| `REDIS_URL` | — (empty) | No | Empty = L1-only mode; e.g. `redis://localhost:6379` |
| `JWT_SECRET` | — | **Yes** | **≥ 32 characters** (fail-fast at boot). **MUST MATCH** all services |
| `JWT_ISSUER` | `pokedex-api` | No | **MUST MATCH** all services |
| `JWT_AUDIENCE` | `pokedex-clients` | No | **MUST MATCH** all services |
| `JWT_ACCESS_MINUTES` | `15` | No | Access-token lifetime |
| `JWT_REFRESH_HOURS` | `24` | No | Absolute refresh-family lifetime |
| `BCRYPT_COST` | `12` | No | **MUST MATCH** all services |
| `CACHE_L1_TTL_SECONDS` | `300` | No | In-memory cache TTL |
| `CACHE_L2_TTL_SECONDS` | `3600` | No | Redis cache TTL |

**Why the MUST-MATCH rows matter:** the three backends share one `users` table and one token contract. If `JWT_SECRET`, issuer, or audience diverge, a token issued by one service is rejected by another; if `BCRYPT_COST` diverges, hashes still verify (cost is embedded in the hash) but new registrations become inconsistent with the ecosystem contract. The 32-character minimum exists because .NET's IdentityModel rejects shorter HS256 keys — the limit is enforced everywhere so any service can mint tokens for all.

## Database setup

PostgreSQL is installed **natively** by the owner (compose Postgres is an alternative, below). One database, one schema (`public`), shared by all three backends. Create the role and database once:

```sql
CREATE ROLE pokedex LOGIN PASSWORD 'pokedex';
CREATE DATABASE pokedex OWNER pokedex;
```

### Migrations do NOT run from this repo — ever

| Repo | Relationship to the schema |
|---|---|
| `pokedex-api-express-ts` | **Owner.** Its `Schema.ts` is the source of truth; `drizzle-kit generate`/`migrate` run **there only** |
| `pokedex-api-express-js` (this repo) | **Read-only mirror.** [`src/infrastructure/database/Schema.js`](src/infrastructure/database/Schema.js) is a hand-ported copy used for queries. There is no `drizzle-kit` here, there are no `db:*` scripts here, and none should ever be added |
| `pokedex-api-dotnet` | **Database-first.** EF Core maps to the existing tables; `dotnet ef migrations` is never used |

To set up the tables, run the migrations **from the TS repo**:

```bash
cd ../pokedex-api-express-ts
npm run db:migrate
```

If the schema ever changes, the change is made in the TS repo's `Schema.ts`, migrated from there, and then ported verbatim into this repo's `Schema.js` (the file's header comment restates this rule).

## Running

### Native (recommended for development)

```bash
nvm use            # Node 22
npm install
npm run dev        # nodemon — http://localhost:3000
```

Swagger UI: **http://localhost:3000/api/docs** (served in every non-production environment; disabled when `NODE_ENV=production`).

Production-style run: `npm start` (plain `node src/Server.js` — no build step, this is JavaScript).

### Shared Redis (owned by the TS repo)

```bash
cd ../pokedex-api-express-ts
docker compose -f docker-compose.infra.yml up -d    # Redis on :6379
```

### Full compose (API + its own Postgres)

```bash
docker compose up -d
```

This starts the API on 3000 plus a dedicated Postgres published on **5434** (native Postgres keeps 5432, the TS compose claims 5433). The containerized API reaches the shared Redis through `host.docker.internal:6379`.

### Ecosystem port allocation

| Port | What |
|---|---|
| 5432 | Native PostgreSQL (shared by all backends in native dev) |
| 5433 | TS repo's compose Postgres |
| 5434 | This repo's compose Postgres |
| 5435 | .NET repo's compose Postgres |
| 6379 | Shared Redis (compose file in the TS repo) |
| 3000 / 3001 / 5257 | This repo / TS / .NET backends |
| 5173 | Frontend dev server |

## API surface

Lowercase URLs. Lookups by id and by name are **separate endpoints** (RESTful style rule: one route per identifier type). `page`/`pageSize` query params; `meta` carries `page`, `pageSize`, `totalCount`, `totalPages`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/pokemons` | — | Paginated browse straight from PokeAPI (sprite, name, category, weight, abilities) |
| GET | `/api/pokemons/{id}` | — | Detail by numeric PokeAPI id (stats, description, types, evolution chain) |
| GET | `/api/pokemons/name/{name}` | — | Detail by name |
| POST | `/api/pokemons/{id}/sync` | Bearer | Replicate into PostgreSQL (upsert by `poke_api_id`) — 201 |
| POST | `/api/pokemons/name/{name}/sync` | Bearer | Same, by name — 201 |
| GET | `/api/pokemons/local` | — | Paginated local replicas |
| PUT | `/api/pokemons/local/{id}` | Bearer | Edit proprietary fields: `localizedName`, `region`, `classificationTag`, `description` (invalid → 400, missing → 404) |
| DELETE | `/api/pokemons/local/{id}` | Bearer | Delete a replica — 204 (missing → 404) |
| POST | `/api/auth/register` | — | Email + password (min 8 chars) — 201 with session; duplicate email → 409 |
| POST | `/api/auth/login` | — | Returns user + access + refresh tokens |
| POST | `/api/auth/refresh` | — | Body: `{ "refreshToken": "..." }` — rotates the token |
| POST | `/api/auth/logout` | Bearer | Revokes the presented token's family |

### Response envelope

Every response — success, error, even the 404 catch-all — uses the same shape:

```json
{
  "data": [
    {
      "pokeApiId": 1,
      "name": "bulbasaur",
      "spriteUrl": "https://raw.githubusercontent.com/PokeAPI/sprites/.../1.png",
      "category": "Seed Pokémon",
      "weight": 69,
      "abilities": [{ "name": "overgrow", "slot": 1, "isHidden": false }]
    }
  ],
  "error": null,
  "msg": null,
  "meta": { "page": 1, "pageSize": 1, "totalCount": 1350, "totalPages": 1350 }
}
```

```json
{
  "data": null,
  "error": "NotFound",
  "msg": "Route not found",
  "meta": null
}
```

## Auth flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Any backend
    participant DB as PostgreSQL

    C->>S: POST /api/auth/register (email, password)
    S->>DB: INSERT user (bcrypt $2b$, cost 12)
    S-->>C: 201 user + access JWT (15 min) + refresh token R1

    C->>S: POST /api/auth/login
    S->>DB: INSERT refresh token R1 (SHA-256 hash, family F, expires login + 24 h)
    S-->>C: user + access JWT + R1

    Note over C,S: Access token expires (15 min)
    C->>S: POST /api/auth/refresh (R1)
    S->>DB: Revoke R1 (replaced_by R2), INSERT R2 (same family F, SAME expiry)
    S-->>C: new access JWT + R2

    Note over C,S: R1 presented again — reuse = theft signal
    C->>S: POST /api/auth/refresh (R1, already revoked)
    S->>DB: Revoke ENTIRE family F
    S-->>C: 401 Unauthorized

    C->>S: POST /api/auth/logout (Bearer + refresh token)
    S->>DB: Revoke family F
    S-->>C: 200 Logged out
```

Because the contract is identical everywhere, the *same* refresh token can be rotated against a different backend than the one that issued it — the family lives in the shared database.

## Testing

```bash
npm test           # Jest (ESM via --experimental-vm-modules)
npm run lint       # ESLint — airbnb-base
```

**11 suites, 81 tests** — the same coverage targets as the TS reference, ported test by test: auth flows including rotation and reuse detection, cache tiering, graceful shutdown, env validation, middleware behavior. All unit-level with mocked repositories and PokeAPI client; no live infrastructure required.

## Troubleshooting

| Symptom | Explanation |
|---|---|
| `Redis unavailable — running on L1 cache only (...)` once at startup | **Expected** when Redis isn't running. The service continues on L1 + network and reconnects automatically when Redis returns. The warning fires at most once per process |
| `JWT_SECRET must be set to a string of at least 32 characters` | Fail-fast boot check. Set a proper shared secret in `.env` |
| Postgres error in Spanish, e.g. `la autentificación password falló para el usuario «pokedex»` | The native PostgreSQL install runs a Spanish locale — it is a normal auth failure. Check role/password/database from the [Database setup](#database-setup) step |
| `ExperimentalWarning: VM Modules ...` during `npm test` | Expected — Jest needs `NODE_OPTIONS=--experimental-vm-modules` for ESM; the `test` script sets it via `cross-env` |
| Ctrl+C / signals on Windows | Windows has no POSIX signals; Node synthesizes `SIGINT` for Ctrl+C in a console, and `SIGTERM` from outside is not deliverable. To exercise graceful shutdown programmatically on Windows, trigger the handler in-process (`process.emit('SIGINT')`) |
| `EADDRINUSE` on 3000 | Another instance (native or compose) already owns the port — see the [port allocation table](#ecosystem-port-allocation) |
| Tables don't exist / relation errors | Migrations were never applied — run them **from the TS repo** (`cd ../pokedex-api-express-ts && npm run db:migrate`), never from here |

## Ecosystem siblings

- [`../pokedex-api-express-ts`](../pokedex-api-express-ts) — TypeScript reference implementation, schema + infra owner (port 3001)
- [`../pokedex-api-dotnet`](../pokedex-api-dotnet) — ASP.NET Core sibling (port 5257)
- [`../pokedex-web`](../pokedex-web) — React frontend (port 5173)

Design charter: [`../pokedex-api-express-ts/docs/superpowers/specs/2026-08-14-pokedex-ecosystem-design.md`](../pokedex-api-express-ts/docs/superpowers/specs/2026-08-14-pokedex-ecosystem-design.md).
