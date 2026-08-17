import { DataTypes, Model } from "sequelize";

export class WorkOrderNote extends Model {}

export function initWorkOrderNoteModel(sequelize) {
  WorkOrderNote.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      workOrderId: { type: DataTypes.UUID, allowNull: false, field: "work_order_id" },
      authorUserId: { type: DataTypes.UUID, allowNull: false, field: "author_user_id" },
      body: { type: DataTypes.TEXT, allowNull: false },
    },
    {
      sequelize,
      modelName: "WorkOrderNote",
      tableName: "work_order_notes",
      underscored: true,
    }
  );
  return WorkOrderNote;
}
