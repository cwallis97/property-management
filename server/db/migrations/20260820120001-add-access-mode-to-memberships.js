import { DataTypes } from "sequelize";

export const MEMBERSHIP_ACCESS_MODES = ["all", "restricted"];

// "all" = unrestricted (sees every Property the Company owns, today's
// behavior for every existing Membership — the DEFAULT here IS the entire
// backward-compatibility strategy, no backfill script needed). "restricted"
// = only the Properties explicitly granted via PropertyAccess rows (see
// that migration). Deliberately an explicit two-value column rather than
// inferring "unrestricted" from "zero PropertyAccess rows" — a restricted
// Membership with zero grants and an unconfigured Membership with zero
// grants would otherwise be indistinguishable, which is exactly the kind
// of implicit-rule ambiguity Property Access V1 is designed to avoid.
export async function up({ context: queryInterface }) {
  await queryInterface.addColumn("memberships", "access_mode", {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "all",
  });

  await queryInterface.sequelize.query(`
    ALTER TABLE memberships
    ADD CONSTRAINT memberships_access_mode_check
    CHECK (access_mode IN (${MEMBERSHIP_ACCESS_MODES.map((m) => `'${m}'`).join(", ")}))
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.query(`ALTER TABLE memberships DROP CONSTRAINT memberships_access_mode_check`);
  await queryInterface.removeColumn("memberships", "access_mode");
}
