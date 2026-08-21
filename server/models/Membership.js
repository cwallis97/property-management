import { DataTypes, Model } from "sequelize";

export const MEMBERSHIP_ROLES = ["owner", "admin", "manager", "technician"];
export const MEMBERSHIP_ACCESS_MODES = ["all", "restricted"];

export class Membership extends Model {}

export function initMembershipModel(sequelize) {
  Membership.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      userId: { type: DataTypes.UUID, allowNull: false, field: "user_id" },
      companyId: { type: DataTypes.UUID, allowNull: false, field: "company_id" },
      role: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "owner",
        validate: { isIn: [MEMBERSHIP_ROLES] },
      },
      // "all" = sees every Property the Company owns (today's behavior,
      // and always true for owner/admin — see authorization/propertyAccess.js).
      // "restricted" = only the Properties granted via PropertyAccess rows.
      // Never inferred from row presence/absence — see that migration's
      // comment for why an explicit column exists instead.
      accessMode: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "all",
        field: "access_mode",
        validate: { isIn: [MEMBERSHIP_ACCESS_MODES] },
      },
    },
    {
      sequelize,
      modelName: "Membership",
      tableName: "memberships",
      underscored: true,
    }
  );
  return Membership;
}
