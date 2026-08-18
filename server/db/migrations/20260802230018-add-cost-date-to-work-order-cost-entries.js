import { DataTypes } from "sequelize";

// cost_date is the calendar day the expense was actually incurred —
// distinct from created_at, which stays untouched as the system-entry/
// audit timestamp (when the row was recorded into PropertyOS). Added
// nullable first so the two existing rows can be backfilled, then
// tightened to NOT NULL — every cost entry must have a real expense date
// going forward, since Reports will filter on this column.
export async function up({ context: queryInterface }) {
  await queryInterface.addColumn("work_order_cost_entries", "cost_date", {
    type: DataTypes.DATEONLY,
    allowNull: true,
  });

  await queryInterface.sequelize.query(`
    UPDATE work_order_cost_entries SET cost_date = created_at::date WHERE cost_date IS NULL
  `);

  await queryInterface.changeColumn("work_order_cost_entries", "cost_date", {
    type: DataTypes.DATEONLY,
    allowNull: false,
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.removeColumn("work_order_cost_entries", "cost_date");
}
