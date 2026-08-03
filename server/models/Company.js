import { DataTypes, Model } from "sequelize";

export class Company extends Model {}

export function initCompanyModel(sequelize) {
  Company.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      name: { type: DataTypes.STRING, allowNull: false },
    },
    {
      sequelize,
      modelName: "Company",
      tableName: "companies",
      underscored: true,
    }
  );
  return Company;
}
