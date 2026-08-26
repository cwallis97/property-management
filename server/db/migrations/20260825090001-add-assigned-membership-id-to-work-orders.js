import { DataTypes } from "sequelize";

// Operational ownership of an individual Work Order — "which specific
// person is this theirs to handle" — distinct from Property Access
// (authorization) and Property Scope (UX focus). References Membership,
// not User, for the same reason PropertyAccess does: a Membership is
// inherently company-scoped, so an assignment can never even be
// constructed pointing at someone outside this Work Order's Company.
//
// SET NULL rather than CASCADE/RESTRICT: no Membership-removal workflow
// exists in this app today (see PropertyAccess's own migration comment for
// the same observation), but if one is ever added, a Work Order's
// existence must never depend on whether its assignee still exists —
// mirrors Document.uploaded_by_user_id's identical SET NULL precedent for
// a person-reference on an operational record.
export async function up({ context: queryInterface }) {
  await queryInterface.addColumn("work_orders", "assigned_membership_id", {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: "memberships", key: "id" },
    onDelete: "SET NULL",
    onUpdate: "CASCADE",
  });

  await queryInterface.addIndex("work_orders", ["assigned_membership_id"]);
}

export async function down({ context: queryInterface }) {
  await queryInterface.removeColumn("work_orders", "assigned_membership_id");
}
