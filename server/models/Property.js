import { DataTypes, Model } from "sequelize";

export const PROPERTY_STATUSES = ["active", "archived"];

export class Property extends Model {}

export function initPropertyModel(sequelize) {
  Property.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      companyId: { type: DataTypes.UUID, allowNull: false, field: "company_id" },
      name: { type: DataTypes.STRING, allowNull: false },
      address: { type: DataTypes.STRING, allowNull: true },
      sitePlanUrl: { type: DataTypes.STRING, allowNull: true, field: "site_plan_url" },
      // "Archived" = removed from active operations; every Location, Asset,
      // Work Order, Cost Entry, and Document underneath it is untouched and
      // stays fully intact and inspectable. Reversible via Restore Property
      // (status back to "active") — see the migration for why this is a
      // dedicated enum rather than archived_at.
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "active",
        validate: { isIn: [PROPERTY_STATUSES] },
      },
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
