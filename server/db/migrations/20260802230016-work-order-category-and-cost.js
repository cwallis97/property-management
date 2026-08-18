import { DataTypes } from "sequelize";

// Category stays a plain validated string directly on WorkOrder (same
// pattern as status/priority — see server/models/WorkOrder.js), not a
// table; only WorkType needed real normalization. Both columns are
// nullable — existing WorkOrders remain valid with no backfill, and
// classification is never required to create or complete a WorkOrder.
export async function up({ context: queryInterface }) {
  await queryInterface.addColumn("work_orders", "category", { type: DataTypes.STRING, allowNull: true });
  await queryInterface.addColumn("work_orders", "work_type_id", {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: "work_types", key: "id" },
    // RESTRICT (the default when no onDelete/onUpdate is specified beyond
    // ON UPDATE CASCADE below) — a WorkType referenced by any WorkOrder
    // must be archived, never hard-deleted, protecting historical
    // integrity the same way WorkOrderNote -> WorkOrder already works.
    onUpdate: "CASCADE",
  });
  await queryInterface.addIndex("work_orders", ["work_type_id"]);

  // Verified immediately before this migration: 0 of the current
  // WorkOrders have a non-null cost. The column has zero frontend usage
  // anywhere in the app — it was schema/API-only and never actually used.
  await queryInterface.removeColumn("work_orders", "cost");
}

export async function down({ context: queryInterface }) {
  await queryInterface.addColumn("work_orders", "cost", { type: DataTypes.DECIMAL(12, 2), allowNull: true });
  await queryInterface.removeIndex("work_orders", ["work_type_id"]);
  await queryInterface.removeColumn("work_orders", "work_type_id");
  await queryInterface.removeColumn("work_orders", "category");
}
