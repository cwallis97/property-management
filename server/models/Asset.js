import { DataTypes, Model } from "sequelize";

export const ASSET_STATUSES = ["operational", "needs-attention", "critical"];

export class Asset extends Model {}

export function initAssetModel(sequelize) {
  Asset.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      propertyId: { type: DataTypes.UUID, allowNull: false, field: "property_id" },
      locationId: { type: DataTypes.UUID, allowNull: true, field: "location_id" },
      name: { type: DataTypes.STRING, allowNull: false },
      category: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "operational",
        validate: { isIn: [ASSET_STATUSES] },
      },
      installDate: { type: DataTypes.DATEONLY, allowNull: true, field: "install_date" },
      notes: { type: DataTypes.TEXT, allowNull: true },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: "archived_at" },
    },
    {
      sequelize,
      modelName: "Asset",
      tableName: "assets",
      underscored: true,
    }
  );
  return Asset;
}
