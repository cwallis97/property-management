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

## Continuous Integration

PRs and pushes to `main` run (`.github/workflows/ci.yml`):

- backend syntax validation
- the permanent server regression/security test suite, against an
  isolated, ephemeral Postgres service (never a real dev/prod database)
- frontend production build
- an informational dependency audit (does not fail the build)
