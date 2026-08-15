# Pokedex API (Express + JavaScript)

RESTful API translating the "Java - BLA - Technical Interview Exercise" to Node.js/Express (ESM).
Integrates with the external [PokeAPI](https://pokeapi.co/docs/v2), replicates Pokemon data into
**PostgreSQL**, and exposes CRUD + auth endpoints documented with **Swagger**.

> **Implementation complete — see the docs pass for full documentation.**

## Architecture

Controllers stay thin and delegate to services; all SQL lives in models; the PokeAPI gateway
is isolated in `clients/`. Every endpoint returns the standard `{ data, error, msg, meta }` shape.

```
src/
├── config/         # Env (dotenv), Database (pg Pool), Swagger (swagger-jsdoc)
├── routes/         # Express routers + OpenAPI JSDoc annotations
├── controllers/    # Thin HTTP handlers — no business logic
├── services/       # Business logic (user stories US-01..US-04)
├── models/         # PostgreSQL data access (pg)
├── clients/        # External PokeAPI gateway (native fetch)
├── middleware/     # ErrorHandler (404/400/500), Auth (JWT guard)
├── swagger/        # Reusable OpenAPI component schemas
├── utils/          # Response shape helpers, domain error types
├── App.js          # App factory (no business logic)
└── Server.js       # Entry point
```

## Configuration

All settings come from environment variables loaded via `.env` (see `.env.example`):

```bash
cp .env.example .env
```

`DATABASE_URL` holds the PostgreSQL connection string. Swagger UI is served at
**`/api/docs`** in every non-production environment and disabled when `NODE_ENV=production`.

## Getting started

```bash
nvm use            # Node 22
npm install
docker compose up -d postgres
npm run dev        # http://localhost:3000/api/docs
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start with nodemon |
| `npm start` | Start (production mode expects `NODE_ENV=production`) |
| `npm run lint` | ESLint (airbnb-base) |
| `npm test` | Jest (80% coverage threshold) |

## Next steps (implementation)

- SQL schema/migrations for `pokemons`, `pokemon_abilities`, `users`
- PokeAPI client implementation + response caching (nice to have)
- Service logic via TDD (`src/__tests__/`)
- JWT signing/verification in `AuthService` / `middleware/Auth.js`
- Seed demonstration data
