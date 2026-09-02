// Global Search V1 — pg_trgm plus GIN trigram indexes on the handful of
// human-facing fields people are actually most likely to type into the
// top search bar. Deliberately selective: only these primary-signal
// columns get their own index. Lower-value secondary text (asset.notes,
// asset.category, vendor.category/email/phone, document.notes/category,
// location.type, work_types.label, work_orders.category) is still searched
// via ILIKE but is left to a sequential scan at this scale — small,
// intentional indexing that we measure and extend later rather than
// trigram-indexing every text column up front.
//
// pg_trgm is a "trusted" extension in PostgreSQL 13+, so CREATE EXTENSION
// succeeds for this app's non-superuser role (it holds CREATE on the
// database) — no superuser step, and it installs the same way in the CI
// and dedicated test databases.
//
// Plain CREATE INDEX, not CONCURRENTLY: every indexed table is tiny today.
// A non-blocking CONCURRENTLY build is the right call once these tables
// carry real production volume — that is a deliberate future change, not
// an oversight here.

const TRGM_INDEXES = [
  ["properties", "name"],
  ["properties", "address"],
  ["locations", "name"],
  ["work_orders", "title"],
  ["work_orders", "description"],
  ["assets", "name"],
  ["vendors", "name"],
  ["vendors", "contact_name"],
  ["documents", "name"],
  ["documents", "original_filename"],
  ["users", "display_name"],
  ["users", "email"],
];

function indexName(table, column) {
  return `${table}_${column}_trgm`;
}

export async function up({ context: queryInterface }) {
  const q = queryInterface.sequelize;
  await q.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  for (const [table, column] of TRGM_INDEXES) {
    await q.query(
      `CREATE INDEX IF NOT EXISTS ${indexName(table, column)} ON ${table} USING gin (${column} gin_trgm_ops)`
    );
  }
}

export async function down({ context: queryInterface }) {
  const q = queryInterface.sequelize;
  for (const [table, column] of TRGM_INDEXES) {
    await q.query(`DROP INDEX IF EXISTS ${indexName(table, column)}`);
  }
  // Deliberately leaves the pg_trgm extension installed — dropping it
  // would break anything that has since come to depend on it, and an
  // unused extension is harmless.
}
