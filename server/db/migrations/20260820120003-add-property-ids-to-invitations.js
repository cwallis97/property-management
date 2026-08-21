import { DataTypes } from "sequelize";

// Nullable JSONB array of Property ids, mirroring WorkOrder.photoUrls'
// existing "small, optional, structurally-validated-in-application-code"
// JSONB convention rather than a new join table. null means "All
// Properties" (the invite's eventual Membership gets access_mode = 'all');
// a non-null array means "Selected Properties" (the eventual Membership
// gets access_mode = 'restricted' plus one PropertyAccess row per id).
//
// Deliberately NOT a first-class pre-Membership PropertyAccess system —
// this column only ever holds the *intent* captured at invite time; every
// id is re-validated against the inviting Company at acceptance (see
// acceptInvite), and the real, durable grants are the PropertyAccess rows
// created then. Once accepted, this column is never read again for that
// invitation.
export async function up({ context: queryInterface }) {
  await queryInterface.addColumn("invitations", "property_ids", {
    type: DataTypes.JSONB,
    allowNull: true,
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.removeColumn("invitations", "property_ids");
}
