import { DataTypes, Model } from "sequelize";

export const VENDOR_STATUSES = ["active", "inactive"];

export class Vendor extends Model {}

export function initVendorModel(sequelize) {
  Vendor.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      companyId: { type: DataTypes.UUID, allowNull: false, field: "company_id" },
      name: { type: DataTypes.STRING, allowNull: false },
      // Free text, same precedent as Asset.category — no enum exists, and
      // linking it to WORK_ORDER_CATEGORIES would be premature
      // normalization for a V1 record.
      category: { type: DataTypes.STRING, allowNull: true },
      contactName: { type: DataTypes.STRING, allowNull: true, field: "contact_name" },
      phone: { type: DataTypes.STRING, allowNull: true },
      email: { type: DataTypes.STRING, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      // "Active" = available for new assignment. "Inactive" = no longer
      // used for new work, but every existing WorkOrderVendor row and every
      // WorkOrderCostEntry.vendorId reference remains fully valid — nothing
      // about this field ever touches historical records.
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "active",
        validate: { isIn: [VENDOR_STATUSES] },
      },
    },
    {
      sequelize,
      modelName: "Vendor",
      tableName: "vendors",
      underscored: true,
    }
  );
  return Vendor;
}
