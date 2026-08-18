import { DataTypes } from "sequelize";

// A WorkOrder's actual cost is the SUM of these entries, computed at query
// time — never stored as a separate total that could drift. Modeled
// directly on the existing WorkOrderNote pattern: append-only child
// records, RESTRICT on the parent FK to protect financial history the same
// way Notes already protect operational history.
export async function up({ context: queryInterface }) {
  await queryInterface.createTable("work_order_cost_entries", {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: queryInterface.sequelize.literal("gen_random_uuid()") },
    work_order_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "work_orders", key: "id" },
      onUpdate: "CASCADE",
      // No onDelete hint (RESTRICT) — same historical-integrity reasoning
      // already used for work_order_notes.work_order_id.
    },
    type: { type: DataTypes.STRING, allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    note: { type: DataTypes.STRING, allowNull: true },
    created_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex("work_order_cost_entries", ["work_order_id"]);
  await queryInterface.sequelize.query(`
    ALTER TABLE work_order_cost_entries ADD CONSTRAINT work_order_cost_entries_amount_nonnegative CHECK (amount >= 0)
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("work_order_cost_entries");
}
