import { DataTypes } from "sequelize";

// One active site plan per Property (unique on property_id) — uploading a
// replacement deletes the previous row (and its file) rather than
// versioning. Stores only file metadata: stored_filename is a
// server-generated UUID-based name on local disk, never derived from user
// input, so there's nothing here that could path-traverse. The actual
// bytes never touch this table.
export async function up({ context: queryInterface }) {
  await queryInterface.createTable("site_plans", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: queryInterface.sequelize.literal("gen_random_uuid()"),
    },
    property_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: "properties", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    stored_filename: { type: DataTypes.STRING, allowNull: false },
    original_filename: { type: DataTypes.STRING, allowNull: false },
    mime_type: { type: DataTypes.STRING, allowNull: false },
    file_size: { type: DataTypes.INTEGER, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("site_plans");
}
