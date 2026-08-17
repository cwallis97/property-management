import { Op } from "sequelize";
import { Asset, Location, Property, ASSET_STATUSES } from "../models/index.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidUUID(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

// Format check plus a round-trip check so calendar-invalid dates like
// "2024-02-30" are rejected rather than silently normalized by Date().
function isValidDateOnly(value) {
  if (typeof value !== "string" || !DATE_ONLY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

async function findOwnedProperty(propertyId, companyIds) {
  return Property.findOne({ where: { id: propertyId, companyId: { [Op.in]: companyIds } } });
}

// Mirrors locationController's findOwnedLocation (kept local rather than
// shared, matching this codebase's existing per-controller duplication
// pattern for Pin/Repair/Location).
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

// Excludes archived assets by default — archiving hides an asset from every
// normal read/write path the same way a delete would, while keeping the row
// in the database for future history/reporting features.
async function findOwnedAsset(assetId, companyIds, { includeArchived = false } = {}) {
  const where = { id: assetId };
  if (!includeArchived) where.archivedAt = null;

  return Asset.findOne({
    where,
    include: {
      model: Property,
      as: "property",
      where: { companyId: { [Op.in]: companyIds } },
      attributes: [],
    },
  });
}

// Validates a candidate locationId against a property: must exist, belong to
// the caller's company, not be archived, and belong to the same property.
// Returns { error: { status, body } } or { locationId: string|null }.
async function resolveLocationId(locationId, property, companyIds) {
  if (locationId === undefined || locationId === null) {
    return { locationId: null };
  }

  if (!isValidUUID(locationId)) {
    return { error: { status: 400, body: { error: "Invalid locationId." } } };
  }

  const location = await findOwnedLocation(locationId, companyIds, { includeArchived: true });
  if (!location) {
    return { error: { status: 404, body: { error: "Location not found." } } };
  }
  if (location.archivedAt) {
    return { error: { status: 400, body: { error: "Cannot assign an asset to an archived location." } } };
  }
  if (location.propertyId !== property.id) {
    return { error: { status: 400, body: { error: "locationId must belong to the same property." } } };
  }

  return { locationId: location.id };
}

export async function listAssetsForProperty(req, res) {
  if (!isValidUUID(req.params.propertyId)) {
    return res.status(400).json({ error: "Invalid property id." });
  }

  const property = await findOwnedProperty(req.params.propertyId, req.companyIds);
  if (!property) return res.status(404).json({ error: "Property not found." });

  const assets = await Asset.findAll({
    where: { propertyId: property.id, archivedAt: null },
    order: [["createdAt", "ASC"]],
  });
  res.json(assets);
}

export async function createAsset(req, res) {
  if (!isValidUUID(req.params.propertyId)) {
    return res.status(400).json({ error: "Invalid property id." });
  }

  const property = await findOwnedProperty(req.params.propertyId, req.companyIds);
  if (!property) return res.status(404).json({ error: "Property not found." });

  const { name, category, status, installDate, notes, locationId } = req.body;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required." });
  }
  if (category !== undefined && category !== null && typeof category !== "string") {
    return res.status(400).json({ error: "category must be a string or null." });
  }
  if (status !== undefined && !ASSET_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${ASSET_STATUSES.join(", ")}` });
  }
  if (installDate !== undefined && installDate !== null && !isValidDateOnly(installDate)) {
    return res.status(400).json({ error: "installDate must be a valid date in YYYY-MM-DD format." });
  }
  if (notes !== undefined && notes !== null && typeof notes !== "string") {
    return res.status(400).json({ error: "notes must be a string or null." });
  }

  const { locationId: resolvedLocationId, error } = await resolveLocationId(locationId, property, req.companyIds);
  if (error) return res.status(error.status).json(error.body);

  const asset = await Asset.create({
    propertyId: property.id,
    locationId: resolvedLocationId,
    name,
    category: category ?? null,
    status: status ?? undefined,
    installDate: installDate ?? null,
    notes: notes ?? null,
  });
  res.status(201).json(asset);
}

export async function getAsset(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid asset id." });
  }

  const asset = await findOwnedAsset(req.params.id, req.companyIds);
  if (!asset) return res.status(404).json({ error: "Asset not found." });

  res.json(asset);
}

export async function updateAsset(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid asset id." });
  }

  const asset = await findOwnedAsset(req.params.id, req.companyIds);
  if (!asset) return res.status(404).json({ error: "Asset not found." });

  const { name, category, status, installDate, notes, locationId } = req.body;

  if (name !== undefined) {
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name must be a non-empty string." });
    }
    asset.name = name;
  }

  if (category !== undefined) {
    if (category !== null && typeof category !== "string") {
      return res.status(400).json({ error: "category must be a string or null." });
    }
    asset.category = category;
  }

  if (status !== undefined) {
    if (!ASSET_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${ASSET_STATUSES.join(", ")}` });
    }
    asset.status = status;
  }

  if (installDate !== undefined) {
    if (installDate !== null && !isValidDateOnly(installDate)) {
      return res.status(400).json({ error: "installDate must be a valid date in YYYY-MM-DD format." });
    }
    asset.installDate = installDate;
  }

  if (notes !== undefined) {
    if (notes !== null && typeof notes !== "string") {
      return res.status(400).json({ error: "notes must be a string or null." });
    }
    asset.notes = notes;
  }

  if (locationId !== undefined) {
    // Property this asset belongs to never changes via this endpoint, so
    // resolveLocationId's same-property check is against asset.propertyId.
    const { locationId: resolvedLocationId, error } = await resolveLocationId(
      locationId,
      { id: asset.propertyId },
      req.companyIds
    );
    if (error) return res.status(error.status).json(error.body);
    asset.locationId = resolvedLocationId;
  }

  await asset.save();
  res.json(asset);
}

export async function archiveAsset(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid asset id." });
  }

  const asset = await findOwnedAsset(req.params.id, req.companyIds);
  if (!asset) return res.status(404).json({ error: "Asset not found." });

  asset.archivedAt = new Date();
  await asset.save();
  res.json(asset);
}
