import { DataTypes } from "sequelize";

export async function up({ context: queryInterface }) {
  await queryInterface.createTable("locations", {
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
    parent_location_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "locations", key: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    },
    name: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.STRING, allowNull: false },
    archived_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex("locations", ["property_id"]);
  await queryInterface.addIndex("locations", ["parent_location_id"]);
  await queryInterface.addIndex("locations", ["property_id", "parent_location_id"]);
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("locations");
}
