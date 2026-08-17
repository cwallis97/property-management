import { DataTypes, Model } from "sequelize";

export class Location extends Model {}

export function initLocationModel(sequelize) {
  Location.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      propertyId: { type: DataTypes.UUID, allowNull: false, field: "property_id" },
      parentLocationId: { type: DataTypes.UUID, allowNull: true, field: "parent_location_id" },
      name: { type: DataTypes.STRING, allowNull: false },
      type: { type: DataTypes.STRING, allowNull: false },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: "archived_at" },
    },
    {
      sequelize,
      modelName: "Location",
      tableName: "locations",
      underscored: true,
    }
  );
  return Location;
}
