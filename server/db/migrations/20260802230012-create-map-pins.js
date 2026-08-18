import { DataTypes } from "sequelize";

// Deliberately minimal: a pin is just "something physically exists/
// happened here" at a normalized (0-100) position on a specific site
// plan's canvas. No category/color/status/Location/Asset/WorkOrder
// relationship yet — those are future milestones. site_plan_id is CASCADE
// so replacing a Property's site plan (see SitePlan) clears pins placed
// against the old image, since their coordinates would be meaningless
// against a different uploaded canvas.
export async function up({ context: queryInterface }) {
  await queryInterface.createTable("map_pins", {
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
    site_plan_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "site_plans", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    x: { type: DataTypes.FLOAT, allowNull: false },
    y: { type: DataTypes.FLOAT, allowNull: false },
    label: { type: DataTypes.STRING, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex("map_pins", ["site_plan_id"]);
  await queryInterface.sequelize.query(`
    ALTER TABLE map_pins ADD CONSTRAINT map_pins_x_range CHECK (x >= 0 AND x <= 100)
  `);
  await queryInterface.sequelize.query(`
    ALTER TABLE map_pins ADD CONSTRAINT map_pins_y_range CHECK (y >= 0 AND y <= 100)
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("map_pins");
}
