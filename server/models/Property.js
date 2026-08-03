import { DataTypes, Model } from "sequelize";

export class Property extends Model {}

export function initPropertyModel(sequelize) {
  Property.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      companyId: { type: DataTypes.UUID, allowNull: false, field: "company_id" },
      name: { type: DataTypes.STRING, allowNull: false },
      address: { type: DataTypes.STRING, allowNull: true },
      sitePlanUrl: { type: DataTypes.STRING, allowNull: true, field: "site_plan_url" },
    },
    {
      sequelize,
      modelName: "Property",
      tableName: "properties",
      underscored: true,
    }
  );
  return Property;
}
