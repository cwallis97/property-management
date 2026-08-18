import { sequelize } from "../db/sequelize.js";
import { initUserModel, User } from "./User.js";
import { initCompanyModel, Company } from "./Company.js";
import { initMembershipModel, Membership, MEMBERSHIP_ROLES } from "./Membership.js";
import { initPropertyModel, Property } from "./Property.js";
import { initPinModel, Pin, PIN_TYPES } from "./Pin.js";
import { initRepairModel, Repair, SEVERITY_LEVELS, REPAIR_STATUSES } from "./Repair.js";
import { initLocationModel, Location } from "./Location.js";
import { initAssetModel, Asset, ASSET_STATUSES } from "./Asset.js";
import {
  initWorkOrderModel,
  WorkOrder,
  WORK_ORDER_STATUSES,
  WORK_ORDER_PRIORITIES,
} from "./WorkOrder.js";
import { initWorkOrderNoteModel, WorkOrderNote } from "./WorkOrderNote.js";
import { initSitePlanModel, SitePlan, SITE_PLAN_ALLOWED_MIME_TYPES } from "./SitePlan.js";
import { initWorkTypeModel, WorkType, WORK_ORDER_CATEGORIES } from "./WorkType.js";
import { initWorkOrderCostEntryModel, WorkOrderCostEntry, WORK_ORDER_COST_TYPES } from "./WorkOrderCostEntry.js";

initUserModel(sequelize);
initCompanyModel(sequelize);
initMembershipModel(sequelize);
initPropertyModel(sequelize);
initPinModel(sequelize);
initRepairModel(sequelize);
initLocationModel(sequelize);
initAssetModel(sequelize);
initWorkOrderModel(sequelize);
initWorkOrderNoteModel(sequelize);
initSitePlanModel(sequelize);
initWorkTypeModel(sequelize);
initWorkOrderCostEntryModel(sequelize);

User.belongsToMany(Company, { through: Membership, foreignKey: "userId", otherKey: "companyId", as: "companies" });
Company.belongsToMany(User, { through: Membership, foreignKey: "companyId", otherKey: "userId", as: "users" });

User.hasMany(Membership, { foreignKey: "userId", as: "memberships", onDelete: "CASCADE" });
Membership.belongsTo(User, { foreignKey: "userId", as: "user" });

Company.hasMany(Membership, { foreignKey: "companyId", as: "memberships", onDelete: "CASCADE" });
Membership.belongsTo(Company, { foreignKey: "companyId", as: "company" });

Company.hasMany(Property, { foreignKey: "companyId", as: "properties", onDelete: "CASCADE" });
Property.belongsTo(Company, { foreignKey: "companyId", as: "company" });

Property.hasMany(Pin, { foreignKey: "propertyId", as: "pins", onDelete: "CASCADE" });
Pin.belongsTo(Property, { foreignKey: "propertyId", as: "property" });

Pin.hasMany(Repair, { foreignKey: "pinId", as: "repairs", onDelete: "CASCADE" });
Repair.belongsTo(Pin, { foreignKey: "pinId", as: "pin" });

Property.hasMany(Location, { foreignKey: "propertyId", as: "locations", onDelete: "CASCADE" });
Location.belongsTo(Property, { foreignKey: "propertyId", as: "property" });

Location.hasMany(Location, { foreignKey: "parentLocationId", as: "children" });
Location.belongsTo(Location, { foreignKey: "parentLocationId", as: "parent" });

Property.hasMany(Asset, { foreignKey: "propertyId", as: "assets", onDelete: "CASCADE" });
Asset.belongsTo(Property, { foreignKey: "propertyId", as: "property" });

Location.hasMany(Asset, { foreignKey: "locationId", as: "assets" });
Asset.belongsTo(Location, { foreignKey: "locationId", as: "location" });

Property.hasMany(WorkOrder, { foreignKey: "propertyId", as: "workOrders", onDelete: "CASCADE" });
WorkOrder.belongsTo(Property, { foreignKey: "propertyId", as: "property" });

Location.hasMany(WorkOrder, { foreignKey: "locationId", as: "workOrders" });
WorkOrder.belongsTo(Location, { foreignKey: "locationId", as: "location" });

Asset.hasMany(WorkOrder, { foreignKey: "assetId", as: "workOrders" });
WorkOrder.belongsTo(Asset, { foreignKey: "assetId", as: "asset" });

// No onDelete hint here (unlike the CASCADE associations above) — the real
// constraint is RESTRICT, matching the same "protect history" reasoning
// used for Location's self-referential parentLocationId.
WorkOrder.hasMany(WorkOrderNote, { foreignKey: "workOrderId", as: "notes" });
WorkOrderNote.belongsTo(WorkOrder, { foreignKey: "workOrderId", as: "workOrder" });

User.hasMany(WorkOrderNote, { foreignKey: "authorUserId", as: "workOrderNotes" });
WorkOrderNote.belongsTo(User, { foreignKey: "authorUserId", as: "author" });

// One active SitePlan per Property (see the migration's unique index).
Property.hasOne(SitePlan, { foreignKey: "propertyId", as: "sitePlan", onDelete: "CASCADE" });
SitePlan.belongsTo(Property, { foreignKey: "propertyId", as: "property" });

// WorkType is a reference/lookup table (global rows now, company-owned
// rows in a future milestone) — WorkOrder points at a WorkType's stable
// identity, never a typed string.
Company.hasMany(WorkType, { foreignKey: "companyId", as: "workTypes", onDelete: "CASCADE" });
WorkType.belongsTo(Company, { foreignKey: "companyId", as: "company" });

WorkType.hasMany(WorkOrder, { foreignKey: "workTypeId", as: "workOrders" });
WorkOrder.belongsTo(WorkType, { foreignKey: "workTypeId", as: "workType" });

// Cost entries are append-only history, same RESTRICT-on-parent reasoning
// as WorkOrderNote — a WorkOrder's financial record is never silently
// deleted out from under it.
WorkOrder.hasMany(WorkOrderCostEntry, { foreignKey: "workOrderId", as: "costEntries" });
WorkOrderCostEntry.belongsTo(WorkOrder, { foreignKey: "workOrderId", as: "workOrder" });

User.hasMany(WorkOrderCostEntry, { foreignKey: "createdByUserId", as: "workOrderCostEntries" });
WorkOrderCostEntry.belongsTo(User, { foreignKey: "createdByUserId", as: "createdBy" });

export {
  sequelize,
  User,
  Company,
  Membership,
  Property,
  Pin,
  Repair,
  Location,
  Asset,
  WorkOrder,
  WorkOrderNote,
  SitePlan,
  SITE_PLAN_ALLOWED_MIME_TYPES,
  WorkType,
  WORK_ORDER_CATEGORIES,
  WorkOrderCostEntry,
  WORK_ORDER_COST_TYPES,
  PIN_TYPES,
  SEVERITY_LEVELS,
  REPAIR_STATUSES,
  MEMBERSHIP_ROLES,
  ASSET_STATUSES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_PRIORITIES,
};
