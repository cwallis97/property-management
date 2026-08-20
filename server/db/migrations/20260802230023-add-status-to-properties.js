import { DataTypes } from "sequelize";

export const PROPERTY_STATUSES = ["active", "archived"];

// A dedicated, reversible status column — not archived_at. Same reasoning
// as Vendor's status field (see 20260802230019-create-vendors.js): every
// other archived_at in this schema is one-directional soft-delete with no
// "unarchive" path anywhere in the app, but Property archival explicitly
// needs a genuine Restore Property action. Reusing archived_at here would
// overload that established one-directional meaning; a small validated
// enum keeps it distinct, matching the precedent Vendor already set.
export async function up({ context: queryInterface }) {
  await queryInterface.addColumn("properties", "status", {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "active",
  });

  await queryInterface.sequelize.query(`
    ALTER TABLE properties
    ADD CONSTRAINT properties_status_check
    CHECK (status IN (${PROPERTY_STATUSES.map((s) => `'${s}'`).join(", ")}))
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.query(`ALTER TABLE properties DROP CONSTRAINT properties_status_check`);
  await queryInterface.removeColumn("properties", "status");
}
