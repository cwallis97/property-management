import { DataTypes, Model } from "sequelize";

export const SEVERITY_LEVELS = ["low", "medium", "high"];
export const REPAIR_STATUSES = ["open", "in_progress", "completed"];

export class Repair extends Model {}

export function initRepairModel(sequelize) {
  Repair.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      pinId: { type: DataTypes.UUID, allowNull: false, field: "pin_id" },
      description: { type: DataTypes.TEXT, allowNull: false },
      cost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      vendor: { type: DataTypes.STRING, allowNull: true },
      invoiceUrl: { type: DataTypes.STRING, allowNull: true, field: "invoice_url" },
      photoUrls: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: "photo_urls" },
      warrantyInfo: { type: DataTypes.TEXT, allowNull: true, field: "warranty_info" },
      chargebackAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: "chargeback_amount" },
      reimbursementAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: "reimbursement_amount" },
      severity: { type: DataTypes.STRING, allowNull: false, defaultValue: "low", validate: { isIn: [SEVERITY_LEVELS] } },
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: "open", validate: { isIn: [REPAIR_STATUSES] } },
      repairDate: { type: DataTypes.DATEONLY, allowNull: false, field: "repair_date" },
    },
    {
      sequelize,
      modelName: "Repair",
      tableName: "repairs",
      underscored: true,
    }
  );
  return Repair;
}
