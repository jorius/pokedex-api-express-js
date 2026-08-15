# pokedex-api-express-js Full Implementation Plan (Phase 2 — JS mirror)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the completed TypeScript reference implementation (`D:\Sources\GitHub\Personal\pokedex-api-express-ts`, HEAD `4531848`, 79 tests green) to this plain-JavaScript ESM repo, behaviorally identical: same routes, same auth contract, same cache keys, same error envelope, same test coverage.

**Architecture:** Identical clean architecture (`domain` / `application` / `infrastructure` / `presentation` + `src/Container.js` composition root). The TS repo is the SOURCE OF TRUTH — every task names the source files to port. This repo NEVER runs migrations (schema mirror is read-only); it shares the TS repo's database, Redis, JWT secret, and bcrypt parameters.

**Tech Stack:** Node 22, Express 5.2.1 (already scaffolded), ESM JavaScript, drizzle-orm 0.45.2 (queries only), pg 8.23.0, jsonwebtoken 9.0.3, bcrypt 6.0.0, redis 6.2.1, jest 30 (ESM via `cross-env NODE_OPTIONS=--experimental-vm-modules`), eslint airbnb-base. Port 3000.

---

## Porting rules (apply to EVERY task)

- **R1 — Strip types, keep contracts.** TS interfaces/`type` exports become JSDoc `@typedef` blocks ONLY where they document a port or domain shape consumed across files (CachePort, PokeApiPort, repository ports, domain types). Inline annotations (`: string`, generics, `as` casts) are dropped. `import type` lines are dropped or become JSDoc `@param`/`@returns`.
- **R2 — Keep every comment, doc block, and behavioral line.** The TS doc comments (singleton rationale, cache policy, mirror-me security notes, closer ordering) port verbatim minus type syntax.
- **R3 — Same file names and layout**, `.js` extension. Same labeled import groups, PascalCase files, max-len 180.
- **R4 — Test parity.** Every TS test file ports to the same path under `src/__tests__/` with the same `describe`/`it` names and assertions (minus type-only mechanics like `as never` — plain JS passes the values directly). Tests import from `@jest/globals`. Where a TS test asserted a type-guard behavior (non-string password etc.), the JS test is identical — those guards are runtime checks.
- **R5 — Contract invariants (from Phase 1 reviews) that MUST port exactly:**
  - bcrypt `$2b$`, cost from env (12 prod / 4 in tests); login timing equalizer (per-factory `bcrypt.hashSync` dummy hash, always-compare).
  - JWT: HS256 sign AND verify pinned (`algorithms: ['HS256']`), issuer/audience, claims sub/email/jti; middleware validates sub+email are non-empty strings before setting `req.user`; strict `/^Bearer\s+(\S+)$/` header parse.
  - Refresh tokens: 32-byte base64url, stored SHA-256 hex, 24h absolute expiry preserved through rotation, same familyId, `replacedById` from create()'s returned row (no re-lookup), family revocation on reuse BEFORE throwing, issue-then-revoke ordering (same as TS — parity over atomicity).
  - Drizzle ≥0.44 wraps pg errors: 23505 detection must check `error.code ?? error.cause?.code`.
  - `revokeFamily` guards `isNull(revokedAt)`; `upsertFromDetail` runs in `db.transaction` and builds returned abilities from `detail.abilities` (no re-select).
  - Cache keys verbatim: `pokeapi:list:{page}:{pageSize}`, `pokeapi:pokemon:{idOrName}`; L1→L2→network; L2 hit hydrates L1; corrupt cache JSON = miss (safeParse); browse hydration `Promise.allSettled`, partial pages served but NEVER cached; detail fail-fast; 404 null never cached.
  - RedisCache: empty url = pure no-op (factory never called); bounded connect (`connectTimeoutMs` 2000, race + unref'd timer, attempt.catch to prevent unhandled rejections); warn-once per instance; isReady-gated ops.
  - ErrorHandler: HttpError → status/name/message; numeric 4xx `status`/`statusCode` on non-HttpError → that status + 'Malformed request body'; else `logger.error(stack)` + 500 `InternalServerError` generic msg. App has envelope 404 catch-all (`error: 'NotFound'`, copied verbatim for parity). Envelope `{ data, error, msg, meta }` everywhere.
  - Routes mounted at `/api/pokemons` + `/api/auth` (NO /v1). Literals before params. Guards: sync ×2, local PUT/DELETE, logout.
  - GracefulShutdown: idempotent, unref'd force timer exits `exitCode || 1`, sequential closers surviving throws, `void`-prefixed fire-and-forget (needs `'no-void': ['error', { allowAsStatement: true }]` in .eslintrc.cjs), rejection stacks preserved (`reason instanceof Error ? reason.stack ?? reason.message : String(reason)`). Server.ts order: validateEnv → register → addClosers → connect → listen → setServer.
  - validateEnv: JWT_SECRET ≥32 chars; positive-integer checks naming the env var. Called only from Server.js.
  - `updatedAt` is app-managed (`new Date()` on updates).
- **R6 — Lint deltas.** No `@typescript-eslint` here; airbnb-base + the repo's existing `.eslintrc.cjs`. Expect `no-unused-vars` (underscore-prefix args pattern already configured), `import/extensions: ignorePackages` (relative imports NEED the `.js` extension — they already have it), `max-classes-per-file` (one error class per file — already the layout). Add the `no-void` option when GracefulShutdown lands. If `camelcase` flags the raw PokeAPI interfaces — in JS there are no interfaces; raw snake_case only appears as property ACCESS (`entry.is_hidden`), which airbnb's camelcase rule does not flag (it checks declarations) — no disable needed unless destructuring; prefer property access over destructuring for raw fields.

**Hooks & git:** pre-commit `npm run lint`; commit-msg capitalized infinitive verb; NO co-author trailers; commit on `main`. **No live infra ever**: no docker, no db:migrate (script must NOT exist here), tests fully faked, smoke runs use live PokeAPI only.

---

## Task 1: Dependencies and environment configuration

**Source:** TS repo `package.json`, `src/infrastructure/config/Env.ts`, `.env.example`.

- [ ] `npm install --save-exact drizzle-orm@0.45.2 jsonwebtoken@9.0.3 bcrypt@6.0.0 redis@6.2.1` and `npm install --save-dev --save-exact @jest/globals@30.4.1`. NO drizzle-kit (this repo never migrates).
- [ ] Port `Env.ts` → `src/config/Env.js` for now (restructure moves it in Task 2): env object with the same 14 keys (PORT default **3000**), plus `validateEnv` (same rules/messages) exported. Remove old `jwtExpiresIn` if present; fix any references.
- [ ] `.env.example`: mirror the TS repo's file with `PORT=3000` and a note that JWT/bcrypt/DB/Redis values MUST equal the other services'.
- [ ] Verify `npm run lint && npm test` (scaffold baseline: 1 passing + 4 todo). Commit: `Add auth, cache and Drizzle dependencies with environment configuration`

## Task 2: Clean-architecture restructure

**Source pattern:** TS repo layout at HEAD (final state, including all Phase-1 fixes).

- [ ] `git mv` the scaffold into: `domain/{types,errors}` (JSDoc typedef files port from TS `domain/types/*.ts`; errors HttpError/NotFoundError/ValidationError as-is), `application/services`, `infrastructure/{config,database,cache,clients,repositories,lifecycle}`, `presentation/{routes,controllers,middleware,swagger,utils}`; delete `src/models/*` SQL stubs; add `infrastructure/config/Logger.js` (port Logger.ts INCLUDING the exported LoggerLike concept as a JSDoc typedef).
- [ ] Do NOT port `NotImplementedError` deletions yet — keep the scaffold's error until services are rewritten (Task 8/9), then delete it in Task 10's cleanup. (If nothing references it after restructure, delete now instead — verify by grep.)
- [ ] Update all relative imports; swagger `apis` glob → `['./src/presentation/routes/*.js', './src/presentation/swagger/schemas/*.js']`.
- [ ] Lint/tests match baseline. Commit: `Refactor source into clean architecture layers`

## Task 3: Schema mirror + Database

**Source:** TS `src/infrastructure/database/Schema.ts` (with indexes/self-FK), `Database.ts`.

- [ ] `src/infrastructure/database/Schema.js`: port the four pgTable definitions EXACTLY (array-form third arg, indexes, composite unique, self-FK with the deferred-callback idiom — in JS no `AnyPgColumn` annotation needed). Header comment MUST state: *READ-ONLY MIRROR of pokedex-api-express-ts's schema (the single source of truth). Never generate or run migrations from this repo.*
- [ ] `Database.js`: pg.Pool + `drizzle(pool, { schema })`, exports `db`, `pool`.
- [ ] NO drizzle.config, NO drizzle/ dir, NO db:* scripts. Commit: `Create read-only Drizzle schema mirror with database wiring`

## Task 4: Domain errors + caches (+ tests)

**Source:** TS `domain/errors/{UnauthorizedError,ConflictError}.ts`, `application/ports/CachePort.ts` (JSDoc typedef), `infrastructure/cache/{MemoryCache,RedisCache}.ts`, tests `Errors.test.ts`, `MemoryCache.test.ts` (6), `RedisCache.test.ts` (9).

- [ ] TDD: port test files first (RED), then implementations. All R5 cache invariants apply (bounded connect, warn-once, no-op empty url, structural fake clients).
- [ ] Commit: `Add domain errors with two-tier cache adapters`

## Task 5: PokeAPI client (+ tests)

**Source:** TS `application/ports/PokeApiPort.ts` (typedef), `infrastructure/clients/PokeApiClient.ts` (final version: safeParse, allSettled, no-partial-caching), test `PokeApiClient.test.ts` (9 tests incl. partial-page, corrupt-cache, branching-chain).

- [ ] TDD; port faithfully. Commit: `Implement PokeAPI client singleton with two-tier caching`

## Task 6: Repositories

**Source:** TS `application/ports/*RepositoryPort.ts` (typedefs), `infrastructure/repositories/{UsersRepository,RefreshTokensRepository,PokemonsRepository}.ts` (final: transactional upsert, cause.code unwrap, isNull revoke guard), `domain/types/User.types.ts` (typedefs).

- [ ] No unit tests (spec §9) — typecheck doesn't exist here, so the correctness bar is lint + the service suites exercising fakes + Task 12's smoke. Port with extra care; keep every comment.
- [ ] Commit: `Create Drizzle repositories for users, refresh tokens and pokemons`

## Task 7: AuthService (+ 16 tests)

**Source:** TS `application/services/AuthService.ts` (final: timing equalizer, string guards, issueSession returns {session, record}), test `AuthService.test.ts` (16).

- [ ] TDD. bcrypt cost 4 in tests, real jwt/bcrypt/crypto — no mocks. All R5 auth invariants. Commit: `Implement authentication service with rotating refresh tokens`

## Task 8: PokemonsService (+ 10 tests)

**Source:** TS `application/services/PokemonsService.ts` (final), test `PokemonsService.test.ts` (10). Delete the scaffold's todo-stub test file.

- [ ] TDD. Commit: `Implement Pokemon service with validated pagination and sync`

## Task 9: Container + HTTP layer (+ middleware/errorhandler tests)

**Source:** TS `src/Container.ts`, `presentation/middleware/Auth.ts` (createAuthenticate factory, HS256 pin, claim validation, strict Bearer regex), `presentation/middleware/ErrorHandler.ts` (createErrorHandler factory, 4xx honor, 500 logging, InternalServerError), controllers (optional chaining, parseNumericParam `/^\d+$/`), routes (guards + swagger JSDoc, `/api` prefix — fix the scaffold's `/api/v1` mounts in App.js), `App.ts` (envelope 404 catch-all), swagger schemas (+RefreshDto), tests `AuthMiddleware.test.ts` (11) + `ErrorHandler.test.ts` (4).

- [ ] No `Express.d.ts` in JS (type-only) — document `req.user` in the middleware doc comment instead.
- [ ] Delete `NotImplementedError.js` here if still present (grep first).
- [ ] TDD for both middleware suites. Commit: `Configure dependency container with JWT middleware and auth routes`

## Task 10: Graceful shutdown + Server (+ tests, smoke)

**Source:** TS `infrastructure/lifecycle/GracefulShutdown.ts` (final: rejection stacks, void statements), `src/Server.ts` (final order incl. early addCloser), tests `GracefulShutdown.test.ts` (7) + `Env.test.ts` (3).

- [ ] Add `'no-void': ['error', { allowAsStatement: true }]` to `.eslintrc.cjs` with comment.
- [ ] Smoke run (same evidence as Phase 1): fail-fast without JWT_SECRET; with secret → `GET http://localhost:3000/api/pokemons?page=1&pageSize=1` 200 envelope; `/api/v1/...` 404 envelope; `/api/docs` 200; in-process `process.emit('SIGINT')` clean shutdown (Windows).
- [ ] Commit: `Add graceful shutdown lifecycle with fail-fast env validation`

## Task 11: Compose + final sweep

**Source:** TS repo `docker-compose.yml` (final: full env surface, `${JWT_SECRET:-...}` ≥32-char fallback, postgres published on 5433, restart policies, `name:`).

- [ ] Update this repo's `docker-compose.yml` identically but: `name: pokedex-api-express-js`, api PORT **3000**, ports "3000:3000". Do NOT create docker-compose.infra.yml here — add a comment pointing at `../pokedex-api-express-ts/docker-compose.infra.yml` (the infra owner). Postgres publish here should use **5434**:5432 (native 5432 + TS compose already claims 5433 — avoid all clashes) with the explanatory comment.
- [ ] Update `package.json` description (mirror TS wording with "JavaScript"); remove `supertest` if unused (check).
- [ ] Dockerfile: verify CMD/paths still valid for the restructured src (JS runs directly — no build step; entry `src/Server.js`).
- [ ] Final sweep: `npm run lint && npm test -- --coverage` — expect ~10 suites / ~79 tests, coverage thresholds pass with `collectCoverageFrom` allowlist mirroring the TS repo's (adjusted to .js and including ErrorHandler.js).
- [ ] Commit: `Add complete service environment with compose port isolation`

## Final phase gate

Whole-phase reviewer boots BOTH services side by side (TS on 3001, JS on 3000, no DB/Redis) and diffs live responses for: browse page 1/2, detail by id + name, 400 edges (1e3, page=0, short password, malformed JSON, body-less register), 404s (unknown pokemon, unknown route), 401s (sync without token). Responses must be byte-identical in shape (envelope, error names, messages) — ports differ, data identical modulo PokeAPI totalCount drift.
