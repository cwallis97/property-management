import { DataTypes, Model } from "sequelize";

// Join table: which Vendor(s) participated in which Work Order. V1's UI
// only ever writes one row per Work Order at a time (see
// workOrderController's vendorId "replace" semantics), but the schema
// itself supports many — see the migration for the full reasoning.
export class WorkOrderVendor extends Model {}

export function initWorkOrderVendorModel(sequelize) {
  WorkOrderVendor.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      workOrderId: { type: DataTypes.UUID, allowNull: false, field: "work_order_id" },
      vendorId: { type: DataTypes.UUID, allowNull: false, field: "vendor_id" },
      // Distinguishes "presently assigned" from "assigned during some past
      // period" — reassignment marks the old row false rather than
      // deleting it, so a Vendor's Work History never loses a Work Order
      // they actually worked just because someone else is assigned now.
      current: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      sequelize,
      modelName: "WorkOrderVendor",
      tableName: "work_order_vendors",
      underscored: true,
    }
  );
  return WorkOrderVendor;
}
