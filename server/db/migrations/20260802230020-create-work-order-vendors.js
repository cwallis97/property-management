import { DataTypes } from "sequelize";

// A join table, not a scalar vendor_id on work_orders — a real maintenance
// job can involve more than one outside contractor, and collapsing that
// into a 1:N column now would make supporting it later a genuinely painful
// migration (backfill every row into a new table, drop the column, rewrite
// every query against it). V1's UI only ever assigns one Vendor at a time,
// enforced here by the partial unique index below rather than by only ever
// allowing one row to exist — the schema is ready for concurrent multiple
// Vendors without ever touching this table's shape again.
//
// `current` distinguishes "the Vendor presently assigned" from "a Vendor
// who was assigned during some past period" — reassigning a Work Order's
// Vendor marks the old row `current = false` rather than deleting it.
// Operational history is permanent; lifecycle/assignment state controls
// current workflow, not historical truth — a Vendor's Work History must
// keep showing every Work Order they ever actually worked, even after
// someone else is assigned going forward.
//
// RESTRICT on both FKs, same historical-integrity reasoning as
// work_order_notes/work_order_cost_entries — a Vendor's participation in a
// Work Order is operational history and is never silently deleted out from
// under either side.
export async function up({ context: queryInterface }) {
  await queryInterface.createTable("work_order_vendors", {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: queryInterface.sequelize.literal("gen_random_uuid()") },
    work_order_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "work_orders", key: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    },
    vendor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "vendors", key: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    },
    current: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex("work_order_vendors", ["work_order_id"]);
  await queryInterface.addIndex("work_order_vendors", ["vendor_id"]);

  // V1's "one current Vendor per Work Order" rule enforced at the database
  // level, not just in the controller — but only against `current` rows,
  // so historical (current = false) rows from past reassignments, even
  // repeats of the same Vendor, are never blocked by this constraint.
  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX work_order_vendors_one_current_per_work_order ON work_order_vendors (work_order_id) WHERE current
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("work_order_vendors");
}
