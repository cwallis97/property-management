// Runs once before each test file (Vitest's `setupFiles` contract) —
// BEFORE that file's own imports are evaluated. This is the ONLY place in
// the whole test foundation that decides which database the app code
// talks to, and it exists specifically to make it structurally hard to
// ever point a test run at a real development/production database.
//
// db/sequelize.js itself is completely unmodified — it just reads
// `process.env.DATABASE_URL` at the moment it's first imported. This file
// verifies a dedicated TEST_DATABASE_URL is configured and safe, THEN
// (and only then) sets `process.env.DATABASE_URL` to it, THEN dynamically
// imports models/index.js — so db/sequelize.js's Sequelize instance is
// always constructed against the verified test database, never whatever
// might otherwise be lying around in the environment. Every test file's
// own later `import { sequelize, ... } from "../models/index.js"` reuses
// that same already-constructed instance for free, via Node's normal ESM
// module cache — no dynamic-import gymnastics needed anywhere outside
// this one file.
import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Umzug, SequelizeStorage } from "umzug";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Deliberately loads ONLY .env.test — never the developer's real .env.
// dotenv never overrides a variable that's already set in process.env, so
// this also respects TEST_DATABASE_URL being exported directly (e.g. in
// CI) instead of coming from a file at all.
loadEnv({ path: path.join(__dirname, "..", ".env.test") });

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is not set — refusing to run tests without a dedicated test database.\n" +
      "Copy server/.env.test.example to server/.env.test and point TEST_DATABASE_URL at a " +
      "database reserved for tests (see README's Testing section)."
  );
}

// The single most important guard in this file: never let the test
// database silently BE the real one just because a developer's shell also
// happens to export DATABASE_URL.
if (DATABASE_URL && TEST_DATABASE_URL === DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is identical to DATABASE_URL — refusing to run tests against a " +
      "non-test database. Point TEST_DATABASE_URL at a separate, dedicated test database."
  );
}

// Second, independent guard (not a replacement for the check above): the
// database name itself must clearly say "test". Cheap, effective, and
// fully within the developer's control — name the test database
// accordingly (e.g. property_management_test) and this is satisfied for
// free.
const dbNameMatch = TEST_DATABASE_URL.match(/\/([^/?]+)(\?.*)?$/);
const dbName = dbNameMatch ? dbNameMatch[1] : "";
if (!/test/i.test(dbName)) {
  throw new Error(
    `TEST_DATABASE_URL's database name ("${dbName}") does not contain "test" — refusing to run ` +
      "tests against a database that isn't clearly named as a test database."
  );
}

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = process.env.NODE_ENV || "test";

// Dynamic import, deliberately AFTER every check and the env remap above —
// see this file's own top comment for why static imports would be wrong
// here specifically.
const { sequelize } = await import("../models/index.js");

// Ensures the test database's schema is current via the REAL migration
// chain before any suite runs — this app deliberately never uses
// sequelize.sync() anywhere, including here, so this is also a standing
// proof that "fresh DB -> migrations -> current models" actually works,
// not just that today's model definitions match by coincidence. Safe to
// run before every test file: Umzug no-ops already-applied migrations.
const umzug = new Umzug({
  migrations: { glob: path.join(__dirname, "..", "db", "migrations", "*.js") },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: undefined,
});
await umzug.up();

// No explicit sequelize.close() here on purpose. Test files run
// sequentially in one process (see vitest.config.js's fileParallelism:
// false) and share this same module-cached `sequelize` instance — closing
// it in a per-file afterAll would tear down the connection out from under
// whichever file runs next. Vitest exits the worker process once the
// whole run completes, which cleans up the connection naturally.
