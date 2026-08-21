import { DataTypes, Model } from "sequelize";

// An explicit grant: the Membership may see/operate within the Property.
// Only ever created/consulted for a Membership whose accessMode is
// "restricted" — see Membership.js and this table's migration for the
// full reasoning (why accessMode is a separate column, why membershipId
// rather than userId, why no redundant companyId).
export class PropertyAccess extends Model {}

export function initPropertyAccessModel(sequelize) {
  PropertyAccess.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      membershipId: { type: DataTypes.UUID, allowNull: false, field: "membership_id" },
      propertyId: { type: DataTypes.UUID, allowNull: false, field: "property_id" },
    },
    {
      sequelize,
      modelName: "PropertyAccess",
      tableName: "property_access",
      underscored: true,
    }
  );
  return PropertyAccess;
}
