import { Op } from "sequelize";
import { Location, Property } from "../models/index.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

async function findOwnedProperty(propertyId, companyIds) {
  return Property.findOne({ where: { id: propertyId, companyId: { [Op.in]: companyIds } } });
}

// Excludes archived locations by default — archiving hides a location from
// every normal read/write path the same way a delete would, while keeping
// the row in the database for future history/reporting features.
async function findOwnedLocation(locationId, companyIds, { includeArchived = false } = {}) {
  const where = { id: locationId };
  if (!includeArchived) where.archivedAt = null;

  return Location.findOne({
    where,
    include: {
      model: Property,
      as: "property",
      where: { companyId: { [Op.in]: companyIds } },
      attributes: [],
    },
  });
}

export async function listLocationsForProperty(req, res) {
  if (!isValidUUID(req.params.propertyId)) {
    return res.status(400).json({ error: "Invalid property id." });
  }

  const property = await findOwnedProperty(req.params.propertyId, req.companyIds);
  if (!property) return res.status(404).json({ error: "Property not found." });

  const locations = await Location.findAll({
    where: { propertyId: property.id, archivedAt: null },
    order: [["createdAt", "ASC"]],
  });
  res.json(locations);
}

export async function createLocation(req, res) {
  if (!isValidUUID(req.params.propertyId)) {
    return res.status(400).json({ error: "Invalid property id." });
  }

  const property = await findOwnedProperty(req.params.propertyId, req.companyIds);
  if (!property) return res.status(404).json({ error: "Property not found." });

  const { name, type, parentLocationId } = req.body;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required." });
  }
  if (!type || typeof type !== "string") {
    return res.status(400).json({ error: "type is required." });
  }

  let resolvedParentId = null;
  if (parentLocationId !== undefined && parentLocationId !== null) {
    if (!isValidUUID(parentLocationId)) {
      return res.status(400).json({ error: "Invalid parentLocationId." });
    }

    const parent = await findOwnedLocation(parentLocationId, req.companyIds, { includeArchived: true });
    if (!parent) return res.status(404).json({ error: "Parent location not found." });
    if (parent.archivedAt) {
      return res.status(400).json({ error: "Cannot create a location under an archived parent location." });
    }
    if (parent.propertyId !== property.id) {
      return res.status(400).json({ error: "parentLocationId must belong to the same property." });
    }

    resolvedParentId = parent.id;
  }

  const location = await Location.create({
    propertyId: property.id,
    parentLocationId: resolvedParentId,
    name,
    type,
  });
  res.status(201).json(location);
}

export async function getLocation(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid location id." });
  }

  const location = await findOwnedLocation(req.params.id, req.companyIds);
  if (!location) return res.status(404).json({ error: "Location not found." });

  res.json(location);
}

export async function updateLocation(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid location id." });
  }

  const location = await findOwnedLocation(req.params.id, req.companyIds);
  if (!location) return res.status(404).json({ error: "Location not found." });

  const { name, type, parentLocationId } = req.body;

  if (name !== undefined) {
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name must be a non-empty string." });
    }
    location.name = name;
  }

  if (type !== undefined) {
    if (!type || typeof type !== "string") {
      return res.status(400).json({ error: "type must be a non-empty string." });
    }
    location.type = type;
  }

  if (parentLocationId !== undefined) {
    if (parentLocationId === null) {
      location.parentLocationId = null;
    } else {
      if (!isValidUUID(parentLocationId)) {
        return res.status(400).json({ error: "Invalid parentLocationId." });
      }
      if (parentLocationId === location.id) {
        return res.status(400).json({ error: "A location cannot be its own parent." });
      }

      const parent = await findOwnedLocation(parentLocationId, req.companyIds, { includeArchived: true });
      if (!parent) return res.status(404).json({ error: "Parent location not found." });
      if (parent.archivedAt) {
        return res.status(400).json({ error: "Cannot move a location under an archived parent location." });
      }
      if (parent.propertyId !== location.propertyId) {
        return res.status(400).json({ error: "parentLocationId must belong to the same property." });
      }

      // Walk up the candidate parent's ancestor chain. If we ever reach this
      // location, assigning it as parent would create a cycle. Every node in
      // this chain is guaranteed to already belong to the same property,
      // since that invariant is enforced on every write.
      let current = parent;
      let depth = 0;
      while (current && depth < 100) {
        if (current.id === location.id) {
          return res.status(400).json({ error: "This would create a circular location hierarchy." });
        }
        if (!current.parentLocationId) break;
        current = await Location.findByPk(current.parentLocationId);
        depth += 1;
      }

      location.parentLocationId = parent.id;
    }
  }

  await location.save();
  res.json(location);
}

export async function archiveLocation(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid location id." });
  }

  const location = await findOwnedLocation(req.params.id, req.companyIds);
  if (!location) return res.status(404).json({ error: "Location not found." });

  const activeChildCount = await Location.count({
    where: { parentLocationId: location.id, archivedAt: null },
  });
  if (activeChildCount > 0) {
    return res.status(409).json({
      error: "Cannot archive a location that has active child locations. Move or archive them first.",
    });
  }

  location.archivedAt = new Date();
  await location.save();
  res.json(location);
}
