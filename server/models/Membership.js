import { DataTypes, Model } from "sequelize";

export const MEMBERSHIP_ROLES = ["owner", "admin", "manager", "technician"];

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
