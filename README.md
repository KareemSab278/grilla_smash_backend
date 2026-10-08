# Ordering System Backend

Node + TypeScript (strict) + Express 5 + Postgres (Supabase).

## Setup

1. Supabase > SQL editor > paste and run [database/schema.sql](./database/schema.sql) (safe to re-run).
2. Copy `.env.example` to `.env` and set `SUPABASE_DB_URL` (Project Settings > Database > Connection string).
3. `npm install`
4. `npm run dev` (or `npm run build && npm start`)

Serves on `http://127.0.0.1:8000` by default, the same routes the Admin and Frontend already call.

## Layout

```
src/
  server.ts            app wiring + graceful shutdown
  config.ts            env parsing
  db.ts                postgres pool, query helpers, transactions, error mapping
  queries.ts           every SQL statement (all static)
  types.ts             row + response types
  schemas.ts           request validation (zod)
  helpers.ts           ids, grouping, shared lookups
  errors.ts            HttpError
  middleware/          validate, errorHandler
  requestHandlers/     one router per resource
database/schema.sql    Supabase schema
```

Errors always return `{ "detail": "message" }`.
