import { DataTypes } from "sequelize";

// SOC 2 Readiness Phase 1 — access-lifecycle / deprovisioning.
//
// Two independent soft-disable switches, both nullable timestamps:
//
//   users.disabled_at       — GLOBAL account kill switch. A set value
//                             means the person has no access to
//                             PropertyOS at all, in any Company. Enforced
//                             in authMiddleware for every authenticated
//                             route (403), including invitation
//                             acceptance.
//
//   memberships.disabled_at — PER-COMPANY access revocation. A set value
//                             means this one Membership grants nothing:
//                             no role/capabilities, no Property Access, no
//                             search scope, no reports, no notifications,
//                             no assignment eligibility. The person's
//                             OTHER Memberships (other Companies) are
//                             unaffected. Enforced by requireAuth loading
//                             only `disabled_at IS NULL` Memberships, so a
//                             disabled Membership is simply absent from
//                             req.memberships everywhere downstream.
//
// No disabled_by / disable_reason columns: the actor and the optional
// reason are recorded on the AuditEvent row for each user.disabled /
// user.enabled / membership.disabled / membership.enabled action, which
// is already the durable, queryable source of "who did this, when, why."
// Duplicating actor columns on the row would be a second value that could
// drift.
//
// Backfill: none. Every existing row keeps disabled_at NULL (= active),
// exactly today's behavior — the column default IS the whole
// backward-compatibility strategy.
export async function up({ context: queryInterface }) {
  await queryInterface.addColumn("users", "disabled_at", {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  });

  await queryInterface.addColumn("memberships", "disabled_at", {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  });

  // requireAuth resolves a caller's active Memberships on every single
  // request: `WHERE user_id = ? AND disabled_at IS NULL`. A partial index
  // keeps that lookup pointed only at the (overwhelmingly common) active
  // rows.
  await queryInterface.sequelize.query(`
    CREATE INDEX memberships_user_id_active_idx
    ON memberships (user_id)
    WHERE disabled_at IS NULL
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.sequelize.query(`DROP INDEX IF EXISTS memberships_user_id_active_idx`);
  await queryInterface.removeColumn("memberships", "disabled_at");
  await queryInterface.removeColumn("users", "disabled_at");
}
