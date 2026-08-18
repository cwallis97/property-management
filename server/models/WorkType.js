import { DataTypes, Model } from "sequelize";

// Same category list WorkOrder.category validates against — kept as one
// exported constant so the two never drift apart.
export const WORK_ORDER_CATEGORIES = [
  "water",
  "sewer",
  "electrical",
  "roads",
  "concrete",
  "trees_landscaping",
  "buildings_facilities",
  "general_other",
];

export class WorkType extends Model {}

export function initWorkTypeModel(sequelize) {
  WorkType.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      category: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [WORK_ORDER_CATEGORIES] },
      },
      key: { type: DataTypes.STRING, allowNull: false },
      label: { type: DataTypes.STRING, allowNull: false },
      // null = system/global, visible to every company. Reserved for a
      // future milestone letting a company define its own Work Types;
      // always null in 8A.
      companyId: { type: DataTypes.UUID, allowNull: true, field: "company_id" },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: "archived_at" },
    },
    {
      sequelize,
      modelName: "WorkType",
      tableName: "work_types",
      underscored: true,
    }
  );
  return WorkType;
}
