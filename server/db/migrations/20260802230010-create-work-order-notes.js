import { DataTypes } from "sequelize";

export async function up({ context: queryInterface }) {
  await queryInterface.createTable("work_order_notes", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: queryInterface.sequelize.literal("gen_random_uuid()"),
    },
    work_order_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "work_orders", key: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    },
    author_user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    },
    body: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex("work_order_notes", ["author_user_id"]);
  // Chronological listing per work order is the primary (and only) query
  // pattern this table needs to serve.
  await queryInterface.addIndex("work_order_notes", ["work_order_id", "created_at"]);
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("work_order_notes");
}
