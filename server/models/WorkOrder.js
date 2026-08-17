import { DataTypes, Model } from "sequelize";

export const WORK_ORDER_STATUSES = ["open", "assigned", "in_progress", "waiting", "completed"];
export const WORK_ORDER_PRIORITIES = ["low", "medium", "high", "urgent"];

export class WorkOrder extends Model {}

export function initWorkOrderModel(sequelize) {
  WorkOrder.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      propertyId: { type: DataTypes.UUID, allowNull: false, field: "property_id" },
      locationId: { type: DataTypes.UUID, allowNull: true, field: "location_id" },
      assetId: { type: DataTypes.UUID, allowNull: true, field: "asset_id" },
      title: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "open",
        validate: { isIn: [WORK_ORDER_STATUSES] },
      },
      priority: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "medium",
        validate: { isIn: [WORK_ORDER_PRIORITIES] },
      },
      dueDate: { type: DataTypes.DATEONLY, allowNull: true, field: "due_date" },
      completedAt: { type: DataTypes.DATE, allowNull: true, field: "completed_at" },
      cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      photoUrls: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: "photo_urls" },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: "archived_at" },
    },
    {
      sequelize,
      modelName: "WorkOrder",
      tableName: "work_orders",
      underscored: true,
    }
  );
  return WorkOrder;
}
