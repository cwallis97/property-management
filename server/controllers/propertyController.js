import { Op } from "sequelize";
import { Property, Pin } from "../models/index.js";

export async function listProperties(req, res) {
  const properties = await Property.findAll({
    where: { companyId: { [Op.in]: req.companyIds } },
    order: [["createdAt", "DESC"]],
  });
  res.json(properties);
}

export async function createProperty(req, res) {
  const { name, address, sitePlanUrl, companyId } = req.body;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required." });
  }

  const targetCompanyId = companyId ?? req.companyIds[0];
  if (!req.companyIds.includes(targetCompanyId)) {
    return res.status(403).json({ error: "You are not a member of that company." });
  }

  const property = await Property.create({
    companyId: targetCompanyId,
    name,
    address: address ?? null,
    sitePlanUrl: sitePlanUrl ?? null,
  });
  res.status(201).json(property);
}

export async function getProperty(req, res) {
  const property = await Property.findOne({
    where: { id: req.params.id, companyId: { [Op.in]: req.companyIds } },
    include: { model: Pin, as: "pins" },
  });

  if (!property) return res.status(404).json({ error: "Property not found." });
  res.json(property);
}

export async function updateProperty(req, res) {
  const property = await Property.findOne({
    where: { id: req.params.id, companyId: { [Op.in]: req.companyIds } },
  });
  if (!property) return res.status(404).json({ error: "Property not found." });

  const { name, address, sitePlanUrl } = req.body;
  if (name !== undefined) property.name = name;
  if (address !== undefined) property.address = address;
  if (sitePlanUrl !== undefined) property.sitePlanUrl = sitePlanUrl;
  await property.save();

  res.json(property);
}

export async function deleteProperty(req, res) {
  const property = await Property.findOne({
    where: { id: req.params.id, companyId: { [Op.in]: req.companyIds } },
  });
  if (!property) return res.status(404).json({ error: "Property not found." });

  await property.destroy();
  res.status(204).send();
}
