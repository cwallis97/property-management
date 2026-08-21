import { Op } from "sequelize";
import { sequelize, Asset, Location, Property, WorkOrder, WorkType, WorkOrderCostEntry, ASSET_STATUSES } from "../models/index.js";
import { CAPABILITIES, requireCapability } from "../authorization/capabilities.js";
import { getAccessiblePropertyIds, requirePropertyAccess } from "../authorization/propertyAccess.js";

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
// in the database for future history/reporting features. Selects the
// parent Property's companyId (not just an empty join filter) so callers
// can run a capability check against it without a second query.
async function findOwnedAsset(assetId, companyIds, { includeArchived = false } = {}) {
  const where = { id: assetId };
  if (!includeArchived) where.archivedAt = null;

  return Asset.findOne({
    where,
    include: {
      model: Property,
      as: "property",
      where: { companyId: { [Op.in]: companyIds } },
      attributes: ["companyId"],
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

// Portfolio-wide read, mirroring listWorkOrdersForCompany's exact shape:
// resolve the caller's owned Property ids first, then one flat Asset query
// scoped to those ids — never one query per Property. Property/Location
// names are eager-loaded for display only; the propertyIds pre-filter is
// the real tenant boundary.
export async function listAssetsForCompany(req, res) {
  const properties = await Property.findAll({
    where: { companyId: { [Op.in]: req.companyIds } },
    attributes: ["id"],
  });

  if (properties.length === 0) return res.json([]);

  let propertyIds = properties.map((p) => p.id);

  const accessiblePropertyIds = await getAccessiblePropertyIds(req, req.companyIds[0]);
  if (accessiblePropertyIds) {
    const accessibleSet = new Set(accessiblePropertyIds);
    propertyIds = propertyIds.filter((id) => accessibleSet.has(id));
  }
  if (propertyIds.length === 0) return res.json([]);

  const assets = await Asset.findAll({
    where: { propertyId: { [Op.in]: propertyIds }, archivedAt: null },
    include: [
      { model: Property, as: "property", attributes: ["id", "name"] },
      { model: Location, as: "location", attributes: ["id", "name"] },
    ],
    order: [["createdAt", "ASC"]],
  });

  res.json(assets);
}

export async function listAssetsForProperty(req, res) {
  if (!isValidUUID(req.params.propertyId)) {
    return res.status(400).json({ error: "Invalid property id." });
  }

  const property = await findOwnedProperty(req.params.propertyId, req.companyIds);
  if (!property) return res.status(404).json({ error: "Property not found." });
  if (!(await requirePropertyAccess(req, res, property.companyId, property.id))) return;

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
  if (!(await requirePropertyAccess(req, res, property.companyId, property.id))) return;
  if (!requireCapability(req, res, property.companyId, CAPABILITIES.ASSET_CREATE)) return;
  if (property.status === "archived") {
    return res.status(400).json({ error: "Cannot add an asset to an archived property. Restore it first." });
  }

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

// Enriched the same way getWorkOrder is: the bare Asset plus everything
// Asset Detail needs to tell the operational story, computed fresh from the
// real Work Order / Cost Entry records every time — never a second,
// separately-tracked history or financial total. Uses the Asset.hasMany
// (WorkOrder) relationship and WorkOrder -> WorkOrderCostEntry, both of
// which already existed and were simply unused by any controller before
// this.
export async function getAsset(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid asset id." });
  }

  const asset = await findOwnedAsset(req.params.id, req.companyIds);
  if (!asset) return res.status(404).json({ error: "Asset not found." });
  if (!(await requirePropertyAccess(req, res, asset.property.companyId, asset.propertyId))) return;

  const [property, location, workOrders] = await Promise.all([
    Property.findByPk(asset.propertyId, { attributes: ["id", "name"] }),
    asset.locationId ? Location.findByPk(asset.locationId, { attributes: ["id", "name"] }) : null,
    WorkOrder.findAll({
      where: { assetId: asset.id, archivedAt: null },
      attributes: ["id", "title", "status", "priority", "dueDate", "completedAt", "createdAt", "category", "locationId"],
      include: [{ model: WorkType, as: "workType", attributes: ["id", "label"] }],
      order: [["createdAt", "DESC"]],
    }),
  ]);

  const workOrderIds = workOrders.map((wo) => wo.id);

  // Per-Work-Order cost, grouped in one query rather than N sums, so each
  // history row can show what that specific Work Order cost. raw:true keeps
  // the grouped aggregate a plain { workOrderId, total } row rather than a
  // partially-hydrated model instance.
  const costRows = workOrderIds.length
    ? await WorkOrderCostEntry.findAll({
        where: { workOrderId: { [Op.in]: workOrderIds } },
        attributes: ["workOrderId", [sequelize.fn("SUM", sequelize.col("amount")), "total"]],
        group: ["workOrderId"],
        raw: true,
      })
    : [];
  // Postgres NUMERIC aggregates come back as strings — parse explicitly
  // before any arithmetic, same discipline as every other cost aggregate in
  // this codebase.
  const costByWorkOrderId = Object.fromEntries(costRows.map((r) => [r.workOrderId, Number(r.total)]));

  // Lifetime Maintenance Spend is the exact same real Cost Entries just
  // summed once more across every Work Order tied to this Asset — never a
  // stored Asset field, so it can never drift from the entries behind it.
  const lifetimeSpend = Object.values(costByWorkOrderId).reduce((sum, v) => sum + v, 0);

  res.json({
    ...asset.toJSON(),
    property,
    location,
    workOrders: workOrders.map((wo) => ({ ...wo.toJSON(), cost: costByWorkOrderId[wo.id] ?? 0 })),
    lifetimeSpend,
  });
}

export async function updateAsset(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid asset id." });
  }

  const asset = await findOwnedAsset(req.params.id, req.companyIds);
  if (!asset) return res.status(404).json({ error: "Asset not found." });
  if (!(await requirePropertyAccess(req, res, asset.property.companyId, asset.propertyId))) return;
  if (!requireCapability(req, res, asset.property.companyId, CAPABILITIES.ASSET_EDIT)) return;

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
  if (!(await requirePropertyAccess(req, res, asset.property.companyId, asset.propertyId))) return;
  if (!requireCapability(req, res, asset.property.companyId, CAPABILITIES.ASSET_EDIT)) return;

  asset.archivedAt = new Date();
  await asset.save();
  res.json(asset);
}
