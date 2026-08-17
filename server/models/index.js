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
  PIN_TYPES,
  SEVERITY_LEVELS,
  REPAIR_STATUSES,
  MEMBERSHIP_ROLES,
  ASSET_STATUSES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_PRIORITIES,
};
