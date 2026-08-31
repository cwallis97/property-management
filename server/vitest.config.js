import { defineConfig } from "vitest/config";

// Server-side regression/security test foundation only — see
// tests/README-equivalent notes in tests/setup.js for the full "why."
// Deliberately minimal config: no coverage thresholds, no browser/UI mode,
// no path aliases this app doesn't already have.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    setupFiles: ["./tests/setup.js"],
    // Real Postgres round-trips (fixture creation, migrations-on-first-run,
    // bulk-insert pagination fixtures) are slower than the 5s Vitest
    // default assumes for pure-JS unit tests — this is an integration
    // suite against a real database, not mocked unit tests.
    testTimeout: 20000,
    hookTimeout: 20000,
    // Run test files sequentially, not in parallel worker threads. These
    // suites share one Postgres test database (by design — a full parallel
    // migration-per-worker setup would be real added complexity for no
    // benefit at this suite's size); running files one at a time keeps
    // fixture cleanup ordering and connection-pool load predictable and
    // easy to reason about. Revisit only if suite runtime actually becomes
    // a problem.
    fileParallelism: false,
  },
});
