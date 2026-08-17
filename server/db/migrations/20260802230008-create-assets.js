import { DataTypes } from "sequelize";

export const ASSET_STATUSES = ["operational", "needs-attention", "critical"];

export async function up({ context: queryInterface }) {
  await queryInterface.createTable("assets", {
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
    name: { type: DataTypes.STRING, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: "operational" },
    install_date: { type: DataTypes.DATEONLY, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    archived_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex("assets", ["property_id"]);
  await queryInterface.addIndex("assets", ["location_id"]);

  await queryInterface.sequelize.query(`
    ALTER TABLE assets
    ADD CONSTRAINT assets_status_check
    CHECK (status IN (${ASSET_STATUSES.map((s) => `'${s}'`).join(", ")}))
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("assets");
}
