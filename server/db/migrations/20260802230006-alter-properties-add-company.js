import { DataTypes } from "sequelize";

export async function up({ context: queryInterface }) {
  await queryInterface.removeConstraint("properties", "properties_user_id_fkey");
  await queryInterface.removeIndex("properties", "properties_user_id");
  await queryInterface.removeColumn("properties", "user_id");

  await queryInterface.addColumn("properties", "company_id", {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: "companies", key: "id" },
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  await queryInterface.addIndex("properties", ["company_id"]);
}

export async function down({ context: queryInterface }) {
  await queryInterface.removeConstraint("properties", "properties_company_id_fkey");
  await queryInterface.removeIndex("properties", "properties_company_id");
  await queryInterface.removeColumn("properties", "company_id");

  await queryInterface.addColumn("properties", "user_id", {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: "users", key: "id" },
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  await queryInterface.addIndex("properties", ["user_id"]);
}
