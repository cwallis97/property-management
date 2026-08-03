import { DataTypes } from "sequelize";

export const PIN_TYPES = [
  "building",
  "unit",
  "water_line",
  "electrical",
  "tree",
  "parking",
  "landscaping",
  "roof",
  "hvac",
  "other",
];

export async function up({ context: queryInterface }) {
  await queryInterface.createTable("pins", {
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
    type: { type: DataTypes.STRING, allowNull: false },
    label: { type: DataTypes.STRING, allowNull: false },
    x: { type: DataTypes.FLOAT, allowNull: false },
    y: { type: DataTypes.FLOAT, allowNull: false },
    color: { type: DataTypes.STRING, allowNull: false, defaultValue: "#3b82f6" },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex("pins", ["property_id"]);

  await queryInterface.sequelize.query(`
    ALTER TABLE pins
    ADD CONSTRAINT pins_type_check
    CHECK (type IN (${PIN_TYPES.map((t) => `'${t}'`).join(", ")}))
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("pins");
}
