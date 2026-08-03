import { DataTypes, Model } from "sequelize";

export class User extends Model {}

export function initUserModel(sequelize) {
  User.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      firebaseUid: { type: DataTypes.STRING, allowNull: false, unique: true, field: "firebase_uid" },
      email: { type: DataTypes.STRING, allowNull: false },
      displayName: { type: DataTypes.STRING, allowNull: true, field: "display_name" },
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
