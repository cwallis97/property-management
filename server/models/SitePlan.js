import { DataTypes, Model } from "sequelize";

export const SITE_PLAN_ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];

export class SitePlan extends Model {}

export function initSitePlanModel(sequelize) {
  SitePlan.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      propertyId: { type: DataTypes.UUID, allowNull: false, field: "property_id" },
      storedFilename: { type: DataTypes.STRING, allowNull: false, field: "stored_filename" },
      originalFilename: { type: DataTypes.STRING, allowNull: false, field: "original_filename" },
      mimeType: {
        type: DataTypes.STRING,
        allowNull: false,
        field: "mime_type",
        validate: { isIn: [SITE_PLAN_ALLOWED_MIME_TYPES] },
      },
      fileSize: { type: DataTypes.INTEGER, allowNull: false, field: "file_size" },
    },
    {
      sequelize,
      modelName: "SitePlan",
      tableName: "site_plans",
      underscored: true,
    }
  );
  return SitePlan;
}
