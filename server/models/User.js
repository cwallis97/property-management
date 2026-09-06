import { DataTypes, Model } from "sequelize";

export class User extends Model {}

export function initUserModel(sequelize) {
  User.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      firebaseUid: { type: DataTypes.STRING, allowNull: false, unique: true, field: "firebase_uid" },
      email: { type: DataTypes.STRING, allowNull: false },
      displayName: { type: DataTypes.STRING, allowNull: true, field: "display_name" },
      // Global account kill switch (SOC 2 Phase 1). Non-null = the person
      // has no access to PropertyOS at all, in any Company. Enforced in
      // authMiddleware for every authenticated route. Separate from a
      // Membership's own disabled_at (per-Company revocation).
      disabledAt: { type: DataTypes.DATE, allowNull: true, field: "disabled_at" },
    },
    {
      sequelize,
      modelName: "User",
      tableName: "users",
      underscored: true,
    }
  );
  return User;
}
