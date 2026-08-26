import { DataTypes, Model } from "sequelize";
import { WORK_ORDER_CATEGORIES } from "./WorkType.js";

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
      // Structured maintenance classification — never required to create or
      // complete a Work Order. category is a small validated set (same
      // pattern as status/priority); workTypeId references a WorkType's
      // stable identity, never a typed string, so renaming a WorkType's
      // label later updates every historical Work Order's display for
      // free. Actual cost lives in WorkOrderCostEntry (see association in
      // models/index.js) and is always derived, never stored here.
      category: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { isIn: [WORK_ORDER_CATEGORIES] },
      },
      workTypeId: { type: DataTypes.UUID, allowNull: true, field: "work_type_id" },
      photoUrls: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: "photo_urls" },
      // Normalized 0-100 position on the property's uploaded SitePlan —
      // always both-or-neither (enforced in the controller). Independent of
      // locationId: a Work Order's physical position and its place in the
      // Location hierarchy are related but distinct concepts.
      mapX: {
        type: DataTypes.FLOAT,
        allowNull: true,
        field: "map_x",
        validate: { min: 0, max: 100 },
      },
      mapY: {
        type: DataTypes.FLOAT,
        allowNull: true,
        field: "map_y",
        validate: { min: 0, max: 100 },
      },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: "archived_at" },
      // Operational ownership — "which specific person is this Work Order
      // theirs to handle," never a role. References Membership, not User
      // (see Membership <-> WorkOrder association in models/index.js for
      // why), and is deliberately independent of Property Access: being
      // assigned here never grants access to this Work Order's Property,
      // it only ever means something once that access already exists.
      assignedMembershipId: { type: DataTypes.UUID, allowNull: true, field: "assigned_membership_id" },
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
