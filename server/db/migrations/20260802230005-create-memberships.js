import { DataTypes } from "sequelize";

export const MEMBERSHIP_ROLES = ["owner", "admin", "manager", "technician"];

export async function up({ context: queryInterface }) {
  await queryInterface.createTable("memberships", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: queryInterface.sequelize.literal("gen_random_uuid()"),
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "companies", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    role: { type: DataTypes.STRING, allowNull: false, defaultValue: "owner" },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex("memberships", ["user_id"]);
  await queryInterface.addIndex("memberships", ["company_id"]);
  await queryInterface.addConstraint("memberships", {
    fields: ["user_id", "company_id"],
    type: "unique",
    name: "memberships_user_company_unique",
  });

  await queryInterface.sequelize.query(`
    ALTER TABLE memberships
    ADD CONSTRAINT memberships_role_check
    CHECK (role IN (${MEMBERSHIP_ROLES.map((r) => `'${r}'`).join(", ")}))
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("memberships");
}
