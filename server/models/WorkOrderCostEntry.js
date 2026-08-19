import { DataTypes, Model } from "sequelize";

export const WORK_ORDER_COST_TYPES = ["labor", "material", "vendor", "equipment", "other"];

export class WorkOrderCostEntry extends Model {}

export function initWorkOrderCostEntryModel(sequelize) {
  WorkOrderCostEntry.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      workOrderId: { type: DataTypes.UUID, allowNull: false, field: "work_order_id" },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [WORK_ORDER_COST_TYPES] },
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: { min: 0 },
      },
      note: { type: DataTypes.STRING, allowNull: true },
      // The calendar day the expense was actually incurred — distinct from
      // createdAt (system-entry/audit timestamp, untouched below). This is
      // the column Reports filters by, never createdAt.
      costDate: { type: DataTypes.DATEONLY, allowNull: false, field: "cost_date" },
      createdByUserId: { type: DataTypes.UUID, allowNull: true, field: "created_by_user_id" },
      // Independent of `type` — `type: "vendor"` still just means "external/
      // contracted expense"; this answers a narrower, separate question:
      // which specific Vendor actually received this dollar amount. Never
      // inferred from a Work Order's assigned Vendor — see workOrderVendor
      // vs this field in models/index.js for the full distinction.
      vendorId: { type: DataTypes.UUID, allowNull: true, field: "vendor_id" },
    },
    {
      sequelize,
      modelName: "WorkOrderCostEntry",
      tableName: "work_order_cost_entries",
      underscored: true,
    }
  );
  return WorkOrderCostEntry;
}
