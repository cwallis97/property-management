import { DataTypes } from "sequelize";

// Nullable — a WorkOrder either has a map position or it doesn't. Both
// columns are always set together (enforced at the controller level, same
// pattern as locationId/assetId consistency checks) or both left null;
// there's no DB-level "both or neither" constraint here because Postgres
// CHECK syntax for that plus "each individually in range" is more
// conveniently expressed as two independent range checks that simply never
// fire when a column is null.
export async function up({ context: queryInterface }) {
  await queryInterface.addColumn("work_orders", "map_x", { type: DataTypes.FLOAT, allowNull: true });
  await queryInterface.addColumn("work_orders", "map_y", { type: DataTypes.FLOAT, allowNull: true });

  await queryInterface.sequelize.query(`
    ALTER TABLE work_orders ADD CONSTRAINT work_orders_map_x_range CHECK (map_x IS NULL OR (map_x >= 0 AND map_x <= 100))
  `);
  await queryInterface.sequelize.query(`
    ALTER TABLE work_orders ADD CONSTRAINT work_orders_map_y_range CHECK (map_y IS NULL OR (map_y >= 0 AND map_y <= 100))
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.removeColumn("work_orders", "map_x");
  await queryInterface.removeColumn("work_orders", "map_y");
}
