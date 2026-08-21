import { DataTypes, Model } from "sequelize";

export const INVITE_ROLES = ["admin", "manager", "technician"];

export class Invitation extends Model {}

export function initInvitationModel(sequelize) {
  Invitation.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      companyId: { type: DataTypes.UUID, allowNull: false, field: "company_id" },
      email: { type: DataTypes.STRING, allowNull: false },
      role: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [INVITE_ROLES] },
      },
      token: { type: DataTypes.STRING, allowNull: false, unique: true },
      invitedByUserId: { type: DataTypes.UUID, allowNull: false, field: "invited_by_user_id" },
      expiresAt: { type: DataTypes.DATE, allowNull: false, field: "expires_at" },
      // Nullable timestamps, not a stored status enum — "pending" is
      // whatever's left once none of these three is set, derived at read
      // time (see inviteController's serializeInvite), same discipline as
      // every other derived-not-stored field in this app.
      acceptedAt: { type: DataTypes.DATE, allowNull: true, field: "accepted_at" },
      revokedAt: { type: DataTypes.DATE, allowNull: true, field: "revoked_at" },
      // Intent captured at invite time only — null means "All Properties",
      // a non-empty array means "Selected Properties". Re-validated against
      // the inviting Company at acceptance, never trusted as-is; the real,
      // durable grant is the PropertyAccess rows acceptInvite creates then.
      // Never read again after acceptance.
      propertyIds: { type: DataTypes.JSONB, allowNull: true, field: "property_ids" },
    },
    {
      sequelize,
      modelName: "Invitation",
      tableName: "invitations",
      underscored: true,
    }
  );
  return Invitation;
}
