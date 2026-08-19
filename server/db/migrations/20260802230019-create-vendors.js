import { DataTypes } from "sequelize";

export const VENDOR_STATUSES = ["active", "inactive"];

// Vendor is a real Company-scoped entity — the first entity in this schema
// owned directly by a Company rather than reached through a Property (a
// Vendor can work across every Property a company owns, so it can't be
// scoped through Property the way Location/Asset/WorkOrder are). Mirrors
// WorkType's company_id column, except required here: there is no "global"
// Vendor concept.
//
// status is a small validated enum, not archived_at — "Inactive" means
// "not currently used for new work," a reversible operational state a user
// toggles deliberately. archived_at everywhere else in this schema means
// one-directional soft-delete (nothing in the app ever reverses it); Vendor
// lifecycle needed to be genuinely bidirectional, so it gets its own field
// rather than overloading that different meaning.
export async function up({ context: queryInterface }) {
  await queryInterface.createTable("vendors", {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: queryInterface.sequelize.literal("gen_random_uuid()") },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "companies", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    name: { type: DataTypes.STRING, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: true },
    contact_name: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: "active" },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex("vendors", ["company_id"]);

  await queryInterface.sequelize.query(`
    ALTER TABLE vendors
    ADD CONSTRAINT vendors_status_check
    CHECK (status IN (${VENDOR_STATUSES.map((s) => `'${s}'`).join(", ")}))
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("vendors");
}
