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
import { initVendorModel, Vendor, VENDOR_STATUSES } from "./Vendor.js";
import { initWorkOrderVendorModel, WorkOrderVendor } from "./WorkOrderVendor.js";

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
initVendorModel(sequelize);
initWorkOrderVendorModel(sequelize);

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

// Vendor is Company-scoped directly (no Property owner — a Vendor can work
// across every Property a company has), the same shape as WorkType's
// company_id but required, since there is no "global" Vendor.
Company.hasMany(Vendor, { foreignKey: "companyId", as: "vendors", onDelete: "CASCADE" });
Vendor.belongsTo(Company, { foreignKey: "companyId", as: "company" });

// WorkOrderVendor is a real join table (see its migration for why this
// isn't a scalar vendor_id on WorkOrder). Both the through-association
// (for eager-loading "this Work Order's Vendors" / "this Vendor's Work
// Orders" directly) and the raw hasMany/belongsTo on the join rows
// themselves (for the controller's replace-on-update logic) are exposed —
// same dual pattern Company/User already use for Membership.
WorkOrder.belongsToMany(Vendor, { through: WorkOrderVendor, foreignKey: "workOrderId", otherKey: "vendorId", as: "vendors" });
Vendor.belongsToMany(WorkOrder, { through: WorkOrderVendor, foreignKey: "vendorId", otherKey: "workOrderId", as: "workOrders" });

WorkOrder.hasMany(WorkOrderVendor, { foreignKey: "workOrderId", as: "vendorLinks", onDelete: "RESTRICT" });
WorkOrderVendor.belongsTo(WorkOrder, { foreignKey: "workOrderId", as: "workOrder" });

Vendor.hasMany(WorkOrderVendor, { foreignKey: "vendorId", as: "workOrderLinks", onDelete: "RESTRICT" });
WorkOrderVendor.belongsTo(Vendor, { foreignKey: "vendorId", as: "vendor" });

// Deliberately separate from WorkOrderVendor above — this is financial
// attribution ("which dollars actually went to this Vendor"), not
// participation ("did this Vendor work on this job"). See
// WorkOrderCostEntry.js for the full reasoning. RESTRICT: a cost entry's
// real financial history is never silently orphaned by a Vendor change.
Vendor.hasMany(WorkOrderCostEntry, { foreignKey: "vendorId", as: "costEntries", onDelete: "RESTRICT" });
WorkOrderCostEntry.belongsTo(Vendor, { foreignKey: "vendorId", as: "vendor" });

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
  Vendor,
  VENDOR_STATUSES,
  WorkOrderVendor,
  PIN_TYPES,
  SEVERITY_LEVELS,
  REPAIR_STATUSES,
  MEMBERSHIP_ROLES,
  ASSET_STATUSES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_PRIORITIES,
};
