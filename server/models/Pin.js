import { DataTypes, Model } from "sequelize";

export const PIN_TYPES = [
  "building",
  "unit",
  "water_line",
  "electrical",
  "tree",
  "parking",
  "landscaping",
  "roof",
  "hvac",
  "other",
];

export class Pin extends Model {}

export function initPinModel(sequelize) {
  Pin.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      propertyId: { type: DataTypes.UUID, allowNull: false, field: "property_id" },
      type: { type: DataTypes.STRING, allowNull: false, validate: { isIn: [PIN_TYPES] } },
      label: { type: DataTypes.STRING, allowNull: false },
      x: { type: DataTypes.FLOAT, allowNull: false },
      y: { type: DataTypes.FLOAT, allowNull: false },
      color: { type: DataTypes.STRING, allowNull: false, defaultValue: "#3b82f6" },
    },
    {
      sequelize,
      modelName: "Pin",
      tableName: "pins",
      underscored: true,
    }
  );
  return Pin;
}
