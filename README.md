# PropertyOS

An operations platform for property management — Properties, Locations,
Assets, Work Orders, Vendors, Documents, and audit history. See
`docs/Product-Bible.md` for the full product/architecture reference.

## Testing

Server-side regression/security tests live in `server/tests/` (Vitest) and
run against a **dedicated test database** — never your normal development
database.

1. Create a separate Postgres database reserved for tests, with a name
   that contains "test" (e.g. `property_management_test`):
   ```
   createdb property_management_test
   ```
2. Copy `server/.env.test.example` to `server/.env.test` and set
   `TEST_DATABASE_URL` to that database.
3. From `server/`, run:
   ```
   npm test
   ```
   The suite runs the real migration chain against the test database
   before every run (no manual migration step needed), then the full
   regression suite. `npm run test:watch` re-runs on file changes;
   `npm run test:security` runs just the core authorization/security
   suites.

Tests refuse to run at all if `TEST_DATABASE_URL` is unset, matches your
real `DATABASE_URL`, or doesn't look like a test database — see
`server/tests/setup.js` for the exact guards.

`npm run check:syntax` (from `server/`) runs a full `node --check` sweep
across the backend — the same manual check this project has run by hand
before every milestone, now scripted.

## Security & deployment configuration

The API applies a set of baseline HTTP hardening controls (SOC 2 readiness
Phase 0). Most are on by default; a few must be configured for a
production deploy. All are documented in `server/.env.example`.

| Env var | Purpose | Production requirement |
| --- | --- | --- |
| `NODE_ENV` | `production` enables HSTS and fail-closed CORS | set to `production` |
| `CORS_ORIGIN` | comma-separated browser-origin allowlist | **required** — the server refuses to start in production without it, and never falls back to allowing all origins |
| `DB_SSL` | `true` encrypts the DB connection | `true` |
| `DB_SSL_REJECT_UNAUTHORIZED` | defaults `true` (verify the DB server cert) when `DB_SSL=true` | leave default; set `false` only for a provider without a verifiable chain, and prefer `DB_SSL_CA` |
| `DB_SSL_CA` | PEM CA bundle for a managed provider that needs one | as required by the host |
| `JSON_BODY_LIMIT` | max parsed JSON/urlencoded body (default `1mb`) | optional; file uploads (multer, 15 MB/file) are unaffected |
| `RATE_LIMIT_*` | IP-based limiter budgets (`WINDOW_MS`, `GLOBAL_MAX`, `STRICT_MAX`) | optional; `/api/health` is never rate-limited |
| `TRUST_PROXY` | number of proxy hops in front of the API, so the real client IP reaches the rate limiter | set (e.g. `1`) when deployed behind a proxy / load balancer |

Other baseline controls, always on:

- **Security headers** via Helmet: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS (production
  only). No Content-Security-Policy on the API — it serves JSON and a few
  same-origin authenticated file responses; the browser-facing CSP belongs
  on the frontend (`client/vercel.json` carries the frontend headers).
- **Rate limiting**: a global per-IP budget across the API plus a tighter
  one on `/api/search` and `/api/invites`. In-memory and per-instance — if
  the API is ever run as more than one instance, move this to a shared
  (e.g. Redis) store.
- **File responses** (Documents, Site Plans): `nosniff`, a sanitized
  `Content-Disposition` (attachment for documents, inline for site plans),
  and `Cache-Control: private, no-store`.
- **Graceful shutdown**: SIGTERM/SIGINT drains in-flight requests and
  closes the DB pool before exit, with a 10s force-exit fallback.
- **`/api/health`** returns `200 { ok: true, database: "ok" }` only when a
  `SELECT 1` succeeds, otherwise `503`.

## Continuous Integration

PRs and pushes to `main` run (`.github/workflows/ci.yml`):

- backend syntax validation
- the permanent server regression/security test suite, against an
  isolated, ephemeral Postgres service (never a real dev/prod database)
- frontend production build
- an informational dependency audit (does not fail the build)
