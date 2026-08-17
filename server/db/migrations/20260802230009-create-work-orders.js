import { DataTypes } from "sequelize";

export const WORK_ORDER_STATUSES = ["open", "assigned", "in_progress", "waiting", "completed"];
export const WORK_ORDER_PRIORITIES = ["low", "medium", "high", "urgent"];

export async function up({ context: queryInterface }) {
  await queryInterface.createTable("work_orders", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: queryInterface.sequelize.literal("gen_random_uuid()"),
    },
    property_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "properties", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    location_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "locations", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    asset_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "assets", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: "open" },
    priority: { type: DataTypes.STRING, allowNull: false, defaultValue: "medium" },
    due_date: { type: DataTypes.DATEONLY, allowNull: true },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    photo_urls: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    archived_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex("work_orders", ["property_id"]);
  await queryInterface.addIndex("work_orders", ["location_id"]);
  await queryInterface.addIndex("work_orders", ["asset_id"]);
  await queryInterface.addIndex("work_orders", ["property_id", "status"]);

  await queryInterface.sequelize.query(`
    ALTER TABLE work_orders
    ADD CONSTRAINT work_orders_status_check
    CHECK (status IN (${WORK_ORDER_STATUSES.map((s) => `'${s}'`).join(", ")}))
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE work_orders
    ADD CONSTRAINT work_orders_priority_check
    CHECK (priority IN (${WORK_ORDER_PRIORITIES.map((p) => `'${p}'`).join(", ")}))
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("work_orders");
}
