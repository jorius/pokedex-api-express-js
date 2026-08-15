# Pokedex API — Express + JavaScript

RESTful Pokedex API built with **Express 5 + modern JavaScript (ESM)** on Node 22. It integrates with the external [PokeAPI](https://pokeapi.co/docs/v2), replicates Pokemon data on demand into a shared **PostgreSQL** database (Drizzle ORM), caches upstream reads through a **two-tier L1/L2 cache** (in-memory + optional Redis), and exposes CRUD + JWT auth endpoints — plus a **pokeball economy** (credits, a ball shop, a slots minigame and probabilistic catching) — documented with Swagger.

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
│   ├── rules/                    # Pure, I/O-free game rules: Pagination limits; EconomyRules — prices, odds, payouts and the rolls
│   └── types/                    # JSDoc typedefs: Api (envelope, paging), Pokemon, User, Economy
├── application/
│   ├── ports/                    # JSDoc-typed contracts the services depend on: cache, PokeAPI gateway, repositories
│   └── services/                 # AuthService, PokemonsService, EconomyService — all business rules, zero I/O
├── infrastructure/
│   ├── cache/                    # MemoryCache (L1 TTL map) and RedisCache (L2 — optional, fail-soft, warn-once)
│   ├── clients/                  # PokeApiClient — singleton PokeAPI gateway wrapping the two-tier cache
│   ├── config/                   # Env (dotenv + fail-fast validation), Logger
│   ├── database/                 # pg Pool + Drizzle instance; Schema.js — READ-ONLY MIRROR of the TS repo's schema
│   ├── lifecycle/                # GracefulShutdown: drain requests → close pg/Redis → exit
│   └── repositories/             # Drizzle repositories: users, refresh tokens, pokemons, economy (wallet, balls, spins)
└── presentation/
    ├── App.js                    # Express app factory: CORS, JSON, Swagger, routes, envelope 404, error handler
    ├── controllers/              # Thin HTTP handlers — parse, delegate, wrap in the envelope
    ├── middleware/               # Auth (JWT guard), Cors (permissive, token-auth rationale), ErrorHandler
    ├── routes/                   # AuthRoutes, PokemonsRoutes, EconomyRoutes
    ├── swagger/                  # swagger-jsdoc spec + reusable component schemas
    └── utils/                    # ok() / fail() envelope builders
```

`repositories/` is one file per aggregate, not one per table: `PokemonsRepository.js` covers the shared `pokemons`/`pokemon_abilities` replica cache **and** the per-user `collection_entries` layer (ownership filtering, idempotent capture) described below. `EconomyRepository.js` likewise owns `wallets` + `ball_inventory` + `spin_results` as a single aggregate, because no credit or ball may move without the others settling in the same atomic step.

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

### Pokeball economy (identical in all three backends)

Catching is no longer free. Since this iteration a *sync* is a **catch attempt**: it costs a ball and it can fail. Every number below lives in exactly one place — [`src/domain/rules/EconomyRules.js`](src/domain/rules/EconomyRules.js), a module of pure functions over an injectable random source — and is mirrored verbatim by the TS and .NET services, so changing one of them is a cross-service contract change, not a local tweak.

- **Starting kit:** every registration is granted **10000 credits** and **10 Poké Balls**, inserted in the *same transaction* as the `users` row ([`UsersRepository.js`](src/infrastructure/repositories/UsersRepository.js)) — an account can never exist without a wallet, and is playable immediately. Accounts created before the economy existed received the identical kit from the migration's backfill.
- **Ball catalogue**, ordered cheapest first (the shop renders the array as-is, so the order is part of the contract):

| Type | Name | Price | Base catch rate |
|---|---|---|---|
| `poke` | Poké Ball | 200 | 0.4 |
| `great` | Great Ball | 600 | 0.6 |
| `ultra` | Ultra Ball | 1200 | 0.8 |
| `master` | Master Ball | 5000 | 1 (guaranteed) |

- **Catch chance** = `clamp(base rate × rarity multiplier, 0.05, 1.0)`, rounded to **4 decimals** so all three services report the same float for the same throw. A **Master Ball short-circuits to 1.0** and ignores rarity entirely — it is the guaranteed catch the player paid 5000 credits for.

| Rarity tier | Multiplier | Applies when |
|---|---|---|
| Legendary / Mythical | 0.35 | the species id is on the hard-coded list, gens I–IX (Ultra Beasts deliberately excluded — they are their own classification) |
| Pseudo-legendary | 0.5 | base stat total ≥ 600 |
| Strong | 0.75 | base stat total ≥ 500 |
| Common | 1 | everything else, including an unknown stat line |

- **Slots:** **100 credits** a spin, **three reels** drawn from a 21-entry pool (9 common species twice each + 3 legendaries once each, so a single reel lands legendary 1 time in 7). Weighting is expressed by repetition rather than a weight table, so "pick a uniformly random element" stays the whole algorithm in every language. Payouts are evaluated richest-first:

| Outcome | Condition | Payout |
|---|---|---|
| `jackpot` | three legendaries, matching or not | 5000 |
| `triple` | any three matching | 1000 |
| `pair` | exactly two matching | 200 |
| `none` | otherwise | 0 |

Those weights give a jackpot ≈ 0.29 % of spins and a non-jackpot triple ≈ 0.78 %, for roughly a 70 % return to player.

- **Every roll happens server-side** from `crypto.randomInt` — never `Math.random`: the odds are real money in credits, and a predictable PRNG would let a determined client anticipate rolls. The random source is injectable purely so tests can pin a roll.
- **Every credit and ball movement is atomic.** Nothing is read and then written back: each debit is a single conditional `UPDATE ... WHERE credits >= cost` (or `WHERE quantity >= 1`) whose affected-row count *is* the verdict, with `CHECK` constraints on `wallets.credits` and `ball_inventory.quantity` as the database-level backstop. Two simultaneous purchases can never both pass a balance they cannot jointly afford.

## Prerequisites

### Required

| Dependency | Version | Notes |
|---|---|---|
| Node.js | 22 (see [`.nvmrc`](.nvmrc)) | `nvm use` picks it up |
| npm | bundled with Node 22 | lockfile is npm-format |
| PostgreSQL | 14+ (native install) | **Only for DB-backed endpoints** (auth, catch/sync, local CRUD, wallet/shop/slots). Browse/detail and the ball catalogue work with **no database at all** |

### Optional

| Dependency | Enables | Without it |
|---|---|---|
| Redis | L2 shared cache | Empty `REDIS_URL` → L1-only mode; Redis down → single warning, L1 + network continue |
| Docker | `docker-compose.yml` (containerized API + its own Postgres); the shared Redis compose lives in the TS repo | Run everything natively |

**Graceful degradation is a design rule:** nothing may assume Docker, Postgres, or Redis is running. Postgres being unreachable produces clear request-time errors on DB-backed endpoints, not a crash loop; `GET /api/pokemons` and the detail endpoints keep working because they only touch PokeAPI + cache, and `GET /api/economy/catalogue` keeps working because the prices are a rules-module constant, not a table.

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

**Verified live this iteration:** a token minted by any one of the three backends is accepted by the other two against the shared Postgres database. The .NET repo now supplies its dev `JWT_SECRET` via `dotnet user-secrets` instead of the placeholder committed in its `appsettings.Development.json`; if that secret drifts from this repo's `.env` value, tokens stop verifying across services in both directions (see that repo's README for its own secret-setup steps).

## Database setup

PostgreSQL is installed **natively** by the owner (compose Postgres is an alternative, below). One database, one schema (`public`), shared by all three backends. Create the role and database once:

```sql
CREATE ROLE pokedex LOGIN PASSWORD 'pokedex';
CREATE DATABASE pokedex OWNER pokedex;
```

The schema has eight tables (snake_case, uuid PKs via `gen_random_uuid()`, `timestamptz` timestamps): `users`, `refresh_tokens`, `pokemons` + `pokemon_abilities` (a **shared** PokeAPI replica cache — `pokemons`' old proprietary columns, `localized_name`/`region`/`classification_tag`, are deprecated and unused now that per-user data lives elsewhere), `collection_entries` — the per-user capture layer: one row per `(user_id, pokemon_id)` (unique-constrained, indexed on both columns, cascade-deletes with either parent), carrying `localizedName`/`region`/`classificationTag`/`description` plus `capturedAt`/`createdAt`/`updatedAt`; a collection entry's `description` overrides the shared `pokemons.description` flavor text when set — and the three **pokeball economy** tables added this iteration:

| Table | Columns | Constraints and indexes |
|---|---|---|
| `wallets` | `id` uuid PK, `user_id` uuid NOT NULL, `credits` integer NOT NULL DEFAULT `10000`, `created_at`/`updated_at` timestamptz NOT NULL DEFAULT `now()` | `UNIQUE (user_id)` — exactly one authoritative row per user to lock and guard; `CHECK (credits >= 0)`; FK to `users` cascades on delete |
| `ball_inventory` | `id` uuid PK, `user_id` uuid NOT NULL, `ball_type` text NOT NULL, `quantity` integer NOT NULL DEFAULT `0`, `created_at`/`updated_at` timestamptz NOT NULL DEFAULT `now()` | unique index on `(user_id, ball_type)` — one stack per type; index on `user_id`; `CHECK (quantity >= 0)`; FK to `users` cascades on delete |
| `spin_results` | `id` uuid PK, `user_id` uuid NOT NULL, `reels` text NOT NULL (comma-joined PokeAPI ids, e.g. `'25,25,6'` — a text column keeps the three backends free of array-type mapping differences), `cost` integer NOT NULL, `payout` integer NOT NULL, `outcome` text NOT NULL, `created_at` timestamptz NOT NULL DEFAULT `now()` | index on `(user_id, created_at DESC)`; append-only audit trail that also serves the history endpoint; FK to `users` cascades on delete |

```mermaid
erDiagram
    users ||--o{ collection_entries : owns
    users ||--|| wallets : has
    users ||--o{ ball_inventory : stocks
    users ||--o{ spin_results : spun
    pokemons ||--o{ collection_entries : "captured as"
    pokemons ||--o{ pokemon_abilities : has

    users {
        uuid id PK
    }
    pokemons {
        uuid id PK
        int poke_api_id UK
        text name
        text description
    }
    pokemon_abilities {
        uuid id PK
        uuid pokemon_id FK
        text name
        int slot
    }
    collection_entries {
        uuid id PK
        uuid user_id FK
        uuid pokemon_id FK
        text localized_name
        text region
        text classification_tag
        text description
        timestamptz captured_at
    }
    wallets {
        uuid id PK
        uuid user_id FK
        int credits
    }
    ball_inventory {
        uuid id PK
        uuid user_id FK
        text ball_type
        int quantity
    }
    spin_results {
        uuid id PK
        uuid user_id FK
        text reels
        int cost
        int payout
        text outcome
        timestamptz created_at
    }
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

If the schema ever changes, the change is made in the TS repo's `Schema.ts`, migrated from there, and then ported verbatim into this repo's `Schema.js` (the file's header comment restates this rule). The previous iteration's change — adding `collection_entries` and back-filling every pre-existing `pokemons` row to the oldest user account via an inserted `collection_entries` row (`CROSS JOIN` against `users ORDER BY created_at ASC LIMIT 1`) — landed as [`drizzle/0001_polite_violations.sql`](../pokedex-api-express-ts/drizzle/0001_polite_violations.sql). This iteration's — the three economy tables plus a hand-written, idempotent backfill that grandfathers every *existing* account into the economy with the same starting kit a new registration receives (10000 credits and 10 Poké Balls, `ON CONFLICT DO NOTHING` so a re-run is a no-op; captured collection entries are left untouched) — landed as [`drizzle/0002_absurd_black_bird.sql`](../pokedex-api-express-ts/drizzle/0002_absurd_black_bird.sql). This repo only ever received the ported `Schema.js` changes, never the migrations themselves.

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

Lowercase URLs. Lookups by id and by name are **separate endpoints** (RESTful style rule: one route per identifier type). `page`/`pageSize` query params (defaults 1 and 20; `pageSize` is capped at 100, anything outside → 400); `meta` carries `page`, `pageSize`, `totalCount`, `totalPages`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/pokemons` | — | Paginated browse straight from PokeAPI (sprite, name, category, weight, abilities) |
| GET | `/api/pokemons/{id}` | — | Detail by numeric PokeAPI id (stats, description, types, evolution chain) |
| GET | `/api/pokemons/name/{name}` | — | Detail by name |
| POST | `/api/pokemons/{id}/sync` | Bearer | **Catch attempt.** Optional `ballType` (JSON body *or* query string; omitted, `null` or blank → `poke`). One ball is consumed on **every** throw, hit or miss, re-catch included — **201 when caught**, **200 when it escaped**. A landed throw upserts the shared `pokemons` cache (by `poke_api_id`) and captures it into the caller's collection; capture stays idempotent, so re-catching returns the same collection entry with `capturedAt` unchanged and `updatedAt` bumped. Unknown ball type → 400 (rejected before any I/O, nothing spent); Pokemon not in PokeAPI → 404 (no ball consumed); none of that ball left → 409 |
| POST | `/api/pokemons/name/{name}/sync` | Bearer | Same, by name — same ball cost, status split and error cases |
| GET | `/api/pokemons/local` | Bearer | Paginated listing of the **caller's** collection entries only |
| GET | `/api/pokemons/local/by-poke-api-id/{pokeApiId}` | Bearer | The caller's collection entry for a PokeAPI id — 404 if the caller hasn't captured it (powers the frontend's "captured" check) |
| PUT | `/api/pokemons/local/{id}` | Bearer | Edit the caller's collection entry — `{id}` is the **collection entry id**, not the pokemon id: `localizedName`, `region`, `classificationTag`, `description` (invalid → 400; missing or owned by another user → 404) |
| DELETE | `/api/pokemons/local/{id}` | Bearer | Delete one of the caller's collection entries (`{id}` = entry id) — 204 (missing or owned by another user → 404) |
| POST | `/api/auth/register` | — | Email + password (min 8 chars) — 201 with session; duplicate email → 409 |
| POST | `/api/auth/login` | — | Returns user + access + refresh tokens |
| POST | `/api/auth/refresh` | — | Body: `{ "refreshToken": "..." }` — rotates the token |
| POST | `/api/auth/logout` | Bearer | Revokes the presented token's family |
| GET | `/api/economy/catalogue` | — | The four ball types cheapest first (`type`, `name`, `price`, `catchRate`). **Public on purpose** so the shop can render its prices before anyone logs in |
| GET | `/api/economy/wallet` | Bearer | The caller's `credits` plus `balls[]` — always **all four** types in catalogue order, `quantity: 0` for types never owned, so clients need no merge against the catalogue (no wallet row → 404) |
| POST | `/api/economy/shop/buy` | Bearer | Body `{ "ballType": "great", "quantity": 5 }` — debits `price × quantity` and credits the stack atomically, returns the updated wallet — **200** (unknown ball type, or a `quantity` that is not an integer in **1..99** → 400; insufficient credits → 409 `Not enough credits`, nothing changed) |
| POST | `/api/economy/slots/spin` | Bearer | No body. Costs **100 credits**, rolls three reels server-side, settles cost and payout in one arithmetic expression and records the spin — **200** with `{ reels, outcome, payout, wallet }` (insufficient credits → 409 `Not enough credits`, nothing recorded) |
| GET | `/api/economy/slots/history` | Bearer | The caller's spins, most recent first (`id` breaks timestamp ties so paging is deterministic) — paginated `{ id, reels, cost, payout, outcome, createdAt }` |

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

A collection entry (`GET /api/pokemons/local`, `GET /api/pokemons/local/by-poke-api-id/{pokeApiId}`, `PUT /api/pokemons/local/{id}`, and — nested under `entry` — a successful catch) adds the entry id, the caller's proprietary fields, and `capturedAt`:

```json
{
  "data": [
    {
      "id": "4b36c8a7-3d61-4bfe-a437-95b3ef1478f6",
      "pokeApiId": 1,
      "name": "bulbasaur",
      "spriteUrl": "https://raw.githubusercontent.com/PokeAPI/sprites/.../1.png",
      "category": "Seed Pokémon",
      "weight": 69,
      "description": "A strange seed.",
      "localizedName": null,
      "region": null,
      "classificationTag": null,
      "abilities": [{ "name": "overgrow", "slot": 1, "isHidden": false }],
      "capturedAt": "2026-08-14T00:00:00.000Z",
      "createdAt": "2026-08-14T00:00:00.000Z",
      "updatedAt": "2026-08-14T00:00:00.000Z"
    }
  ],
  "error": null,
  "msg": null,
  "meta": { "page": 1, "pageSize": 1, "totalCount": 1, "totalPages": 1 }
}
```

A catch attempt (both sync routes) reports the throw itself — the ball that was spent, what is left of that stack, the chance the server rolled against, and the collection entry, which is `null` when the Pokemon escaped. The example below is a Poké Ball thrown at a legendary (`0.4 × 0.35 = 0.14`) that got away, so the status is **200**; a landed throw is **201** with `"caught": true` and the entry in place of `null`:

```json
{
  "data": {
    "caught": false,
    "ballType": "poke",
    "remainingBalls": 7,
    "chance": 0.14,
    "entry": null
  },
  "error": null,
  "msg": null,
  "meta": null
}
```

A spin carries the reels, the outcome, the payout and the wallet as it stands after settling. `GET /api/economy/wallet` and `POST /api/economy/shop/buy` return that same wallet object directly as `data`:

```json
{
  "data": {
    "reels": [25, 25, 6],
    "outcome": "pair",
    "payout": 200,
    "wallet": {
      "credits": 9500,
      "balls": [
        { "type": "poke", "quantity": 7 },
        { "type": "great", "quantity": 1 },
        { "type": "ultra", "quantity": 0 },
        { "type": "master", "quantity": 0 }
      ]
    }
  },
  "error": null,
  "msg": null,
  "meta": null
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
    S->>DB: INSERT user (bcrypt $2b$, cost 12) + wallet (10000 credits) + 10 Poke Balls, one transaction
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

**13 suites, 153 tests** — the same coverage targets as the TS reference, ported test by test (the TS repo's suite currently reports the identical 13/153): auth flows including rotation and reuse detection, cache tiering, graceful shutdown, env validation, middleware behavior, per-user collection ownership (idempotent capture, isolation between users, ownership-filtered update/delete, deterministic slot-ordered abilities), and the pokeball economy — the catalogue, the rarity and catch-chance arithmetic including its clamp band, the weighted reel pool and payout table, wallet arithmetic across runs of spins, and the catch flow (a ball spent on hit and miss alike, 409 once the stack runs out, nothing spent on a 400 or a 404). All unit-level with mocked repositories, an in-memory economy/collection double and a mocked PokeAPI client; the rolls are pinned through the injected random source, so no live infrastructure and no luck is required.

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
| `409 Not enough credits` from the shop or the slots | Working as designed: the debit is a guarded conditional `UPDATE`, so an unaffordable purchase or spin changes nothing at all rather than half-applying |
| `409 No Poké Ball left` (or Great/Ultra/Master) from a sync | The catch routes consume a ball on **every** throw, hit or miss. Buy more with `POST /api/economy/shop/buy`, or win credits at `POST /api/economy/slots/spin` |
| `404 Wallet with key '<uuid>' was not found` | The account has no `wallets` row, so it predates the economy and never got the `0002` backfill. Apply the migrations from the TS repo — the backfill is idempotent and safe to re-run |

## Ecosystem siblings

- [`../pokedex-api-express-ts`](../pokedex-api-express-ts) — TypeScript reference implementation, schema + infra owner (port 3001)
- [`../pokedex-api-dotnet`](../pokedex-api-dotnet) — ASP.NET Core sibling (port 5257)
- [`../pokedex-web`](../pokedex-web) — React frontend (port 5173)

Design charter: [`../pokedex-api-express-ts/docs/superpowers/specs/2026-08-14-pokedex-ecosystem-design.md`](../pokedex-api-express-ts/docs/superpowers/specs/2026-08-14-pokedex-ecosystem-design.md).
