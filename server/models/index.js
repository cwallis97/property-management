import { sequelize } from "../db/sequelize.js";
import { initUserModel, User } from "./User.js";
import { initCompanyModel, Company } from "./Company.js";
import { initMembershipModel, Membership, MEMBERSHIP_ROLES } from "./Membership.js";
import { initPropertyModel, Property } from "./Property.js";
import { initPinModel, Pin, PIN_TYPES } from "./Pin.js";
import { initRepairModel, Repair, SEVERITY_LEVELS, REPAIR_STATUSES } from "./Repair.js";

initUserModel(sequelize);
initCompanyModel(sequelize);
initMembershipModel(sequelize);
initPropertyModel(sequelize);
initPinModel(sequelize);
initRepairModel(sequelize);

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

export {
  sequelize,
  User,
  Company,
  Membership,
  Property,
  Pin,
  Repair,
  PIN_TYPES,
  SEVERITY_LEVELS,
  REPAIR_STATUSES,
  MEMBERSHIP_ROLES,
};
