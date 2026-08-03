import { Op } from "sequelize";
import { Pin, Property, Repair, PIN_TYPES } from "../models/index.js";

async function findOwnedProperty(propertyId, companyIds) {
  return Property.findOne({ where: { id: propertyId, companyId: { [Op.in]: companyIds } } });
}

async function findOwnedPin(pinId, companyIds) {
  return Pin.findOne({
    where: { id: pinId },
    include: {
      model: Property,
      as: "property",
      where: { companyId: { [Op.in]: companyIds } },
      attributes: [],
    },
  });
}

export async function listPinsForProperty(req, res) {
  const property = await findOwnedProperty(req.params.propertyId, req.companyIds);
  if (!property) return res.status(404).json({ error: "Property not found." });

  const pins = await Pin.findAll({
    where: { propertyId: property.id },
    order: [["createdAt", "ASC"]],
  });
  res.json(pins);
}

export async function createPin(req, res) {
  const property = await findOwnedProperty(req.params.propertyId, req.companyIds);
  if (!property) return res.status(404).json({ error: "Property not found." });

  const { type, label, x, y, color } = req.body;

  if (!PIN_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${PIN_TYPES.join(", ")}` });
  }
  if (!label || typeof label !== "string") {
    return res.status(400).json({ error: "label is required." });
  }
  if (typeof x !== "number" || typeof y !== "number") {
    return res.status(400).json({ error: "x and y must be numbers." });
  }

  const pin = await Pin.create({
    propertyId: property.id,
    type,
    label,
    x,
    y,
    color: color ?? undefined,
  });
  res.status(201).json(pin);
}

export async function getPin(req, res) {
  const pin = await findOwnedPin(req.params.id, req.companyIds);
  if (!pin) return res.status(404).json({ error: "Pin not found." });

  const repairs = await Repair.findAll({
    where: { pinId: pin.id },
    order: [["repairDate", "DESC"]],
  });
  res.json({ ...pin.toJSON(), repairs });
}

export async function updatePin(req, res) {
  const pin = await findOwnedPin(req.params.id, req.companyIds);
  if (!pin) return res.status(404).json({ error: "Pin not found." });

  const { type, label, x, y, color } = req.body;
  if (type !== undefined) {
    if (!PIN_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${PIN_TYPES.join(", ")}` });
    }
    pin.type = type;
  }
  if (label !== undefined) pin.label = label;
  if (x !== undefined) pin.x = x;
  if (y !== undefined) pin.y = y;
  if (color !== undefined) pin.color = color;
  await pin.save();

  res.json(pin);
}

export async function deletePin(req, res) {
  const pin = await findOwnedPin(req.params.id, req.companyIds);
  if (!pin) return res.status(404).json({ error: "Pin not found." });

  await pin.destroy();
  res.status(204).send();
}
