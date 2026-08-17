import { Op } from "sequelize";
import {
  WorkOrder,
  Location,
  Asset,
  Property,
  WORK_ORDER_STATUSES,
  WORK_ORDER_PRIORITIES,
} from "../models/index.js";

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

// completedAt must be a genuine ISO-8601 timestamp (date, "T", time,
// optional fractional seconds, and a "Z" or +HH:MM/-HH:MM offset) — not just
// any string JavaScript's Date happens to parse.
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

function isValidISODateTime(value) {
  if (typeof value !== "string" || !ISO_DATETIME_RE.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function isValidCost(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isValidPhotoUrls(value) {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

async function findOwnedProperty(propertyId, companyIds) {
  return Property.findOne({ where: { id: propertyId, companyId: { [Op.in]: companyIds } } });
}

// Mirrors locationController/assetController's ownership helpers (kept
// local rather than shared, matching this codebase's existing
// per-controller duplication pattern).
async function findOwnedLocation(locationId, companyIds, { includeArchived = false } = {}) {
  const where = { id: locationId };
  if (!includeArchived) where.archivedAt = null;

  return Location.findOne({
    where,
    include: { model: Property, as: "property", where: { companyId: { [Op.in]: companyIds } }, attributes: [] },
  });
}

async function findOwnedAsset(assetId, companyIds, { includeArchived = false } = {}) {
  const where = { id: assetId };
  if (!includeArchived) where.archivedAt = null;

  return Asset.findOne({
    where,
    include: { model: Property, as: "property", where: { companyId: { [Op.in]: companyIds } }, attributes: [] },
  });
}

async function findOwnedWorkOrder(workOrderId, companyIds, { includeArchived = false } = {}) {
  const where = { id: workOrderId };
  if (!includeArchived) where.archivedAt = null;

  return WorkOrder.findOne({
    where,
    include: { model: Property, as: "property", where: { companyId: { [Op.in]: companyIds } }, attributes: [] },
  });
}

// Validates a candidate locationId against a property: must exist, belong to
// the caller's company, not be archived, and belong to the same property.
// Returns { error } or { location: Location|null }.
async function resolveLocationId(locationId, property, companyIds) {
  if (locationId === undefined || locationId === null) {
    return { location: null };
  }
  if (!isValidUUID(locationId)) {
    return { error: { status: 400, body: { error: "Invalid locationId." } } };
  }

  const location = await findOwnedLocation(locationId, companyIds, { includeArchived: true });
  if (!location) return { error: { status: 404, body: { error: "Location not found." } } };
  if (location.archivedAt) {
    return { error: { status: 400, body: { error: "Cannot assign a work order to an archived location." } } };
  }
  if (location.propertyId !== property.id) {
    return { error: { status: 400, body: { error: "locationId must belong to the same property." } } };
  }

  return { location };
}

// Same shape as resolveLocationId, for assetId.
async function resolveAssetId(assetId, property, companyIds) {
  if (assetId === undefined || assetId === null) {
    return { asset: null };
  }
  if (!isValidUUID(assetId)) {
    return { error: { status: 400, body: { error: "Invalid assetId." } } };
  }

  const asset = await findOwnedAsset(assetId, companyIds, { includeArchived: true });
  if (!asset) return { error: { status: 404, body: { error: "Asset not found." } } };
  if (asset.archivedAt) {
    return { error: { status: 400, body: { error: "Cannot assign a work order to an archived asset." } } };
  }
  if (asset.propertyId !== property.id) {
    return { error: { status: 400, body: { error: "assetId must belong to the same property." } } };
  }

  return { asset };
}

// Shared scalar-field validation for create/update. Returns { error } or
// { values } containing only the fields that were present in the body.
function validateScalarFields(body) {
  const values = {};

  if (body.title !== undefined) {
    if (!body.title || typeof body.title !== "string") {
      return { error: { status: 400, body: { error: "title must be a non-empty string." } } };
    }
    values.title = body.title;
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      return { error: { status: 400, body: { error: "description must be a string or null." } } };
    }
    values.description = body.description;
  }

  if (body.status !== undefined) {
    if (!WORK_ORDER_STATUSES.includes(body.status)) {
      return { error: { status: 400, body: { error: `status must be one of: ${WORK_ORDER_STATUSES.join(", ")}` } } };
    }
    values.status = body.status;
  }

  if (body.priority !== undefined) {
    if (!WORK_ORDER_PRIORITIES.includes(body.priority)) {
      return {
        error: { status: 400, body: { error: `priority must be one of: ${WORK_ORDER_PRIORITIES.join(", ")}` } } ,
      };
    }
    values.priority = body.priority;
  }

  if (body.dueDate !== undefined) {
    if (body.dueDate !== null && !isValidDateOnly(body.dueDate)) {
      return { error: { status: 400, body: { error: "dueDate must be a valid date in YYYY-MM-DD format." } } };
    }
    values.dueDate = body.dueDate;
  }

  if (body.completedAt !== undefined) {
    if (body.completedAt !== null && !isValidISODateTime(body.completedAt)) {
      return { error: { status: 400, body: { error: "completedAt must be a valid ISO-8601 timestamp." } } };
    }
    values.completedAt = body.completedAt;
  }

  if (body.cost !== undefined) {
    if (body.cost !== null && !isValidCost(body.cost)) {
      return { error: { status: 400, body: { error: "cost must be a non-negative number." } } };
    }
    values.cost = body.cost;
  }

  if (body.photoUrls !== undefined) {
    if (!isValidPhotoUrls(body.photoUrls)) {
      return { error: { status: 400, body: { error: "photoUrls must be an array of strings." } } };
    }
    values.photoUrls = body.photoUrls;
  }

  return { values };
}

export async function listWorkOrdersForProperty(req, res) {
  if (!isValidUUID(req.params.propertyId)) {
    return res.status(400).json({ error: "Invalid property id." });
  }

  const property = await findOwnedProperty(req.params.propertyId, req.companyIds);
  if (!property) return res.status(404).json({ error: "Property not found." });

  const workOrders = await WorkOrder.findAll({
    where: { propertyId: property.id, archivedAt: null },
    order: [["createdAt", "ASC"]],
  });
  res.json(workOrders);
}

export async function createWorkOrder(req, res) {
  if (!isValidUUID(req.params.propertyId)) {
    return res.status(400).json({ error: "Invalid property id." });
  }

  const property = await findOwnedProperty(req.params.propertyId, req.companyIds);
  if (!property) return res.status(404).json({ error: "Property not found." });

  if (!req.body.title || typeof req.body.title !== "string") {
    return res.status(400).json({ error: "title is required." });
  }

  const { error: scalarError, values } = validateScalarFields(req.body);
  if (scalarError) return res.status(scalarError.status).json(scalarError.body);

  const { location, error: locationError } = await resolveLocationId(req.body.locationId, property, req.companyIds);
  if (locationError) return res.status(locationError.status).json(locationError.body);

  const { asset, error: assetError } = await resolveAssetId(req.body.assetId, property, req.companyIds);
  if (assetError) return res.status(assetError.status).json(assetError.body);

  if (location && asset && asset.locationId && asset.locationId !== location.id) {
    return res.status(400).json({ error: "locationId and assetId refer to different locations." });
  }

  // A non-completed work order must never retain a completedAt: reject an
  // explicit non-null value outright, and otherwise force it to null. A
  // completed work order uses the explicit value if one was given,
  // otherwise defaults to now.
  const completedAtProvided = Object.prototype.hasOwnProperty.call(values, "completedAt");
  const finalStatus = values.status ?? "open";

  let resolvedCompletedAt;
  if (finalStatus === "completed") {
    resolvedCompletedAt = completedAtProvided && values.completedAt !== null ? values.completedAt : new Date();
  } else {
    if (completedAtProvided && values.completedAt !== null) {
      return res.status(400).json({ error: "completedAt can only be set when status is completed." });
    }
    resolvedCompletedAt = null;
  }

  const workOrder = await WorkOrder.create({
    propertyId: property.id,
    locationId: location ? location.id : null,
    assetId: asset ? asset.id : null,
    title: values.title,
    description: values.description ?? null,
    status: values.status ?? undefined,
    priority: values.priority ?? undefined,
    dueDate: values.dueDate ?? null,
    completedAt: resolvedCompletedAt,
    cost: values.cost ?? null,
    photoUrls: values.photoUrls ?? undefined,
  });
  res.status(201).json(workOrder);
}

export async function getWorkOrder(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid work order id." });
  }

  const workOrder = await findOwnedWorkOrder(req.params.id, req.companyIds);
  if (!workOrder) return res.status(404).json({ error: "Work order not found." });

  res.json(workOrder);
}

export async function updateWorkOrder(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid work order id." });
  }

  const workOrder = await findOwnedWorkOrder(req.params.id, req.companyIds);
  if (!workOrder) return res.status(404).json({ error: "Work order not found." });

  const { error: scalarError, values } = validateScalarFields(req.body);
  if (scalarError) return res.status(scalarError.status).json(scalarError.body);

  const property = { id: workOrder.propertyId };
  const { locationId, assetId } = req.body;

  let finalLocationId = workOrder.locationId;
  let finalAssetId = workOrder.assetId;
  let resolvedAssetForConsistency = null;

  if (locationId !== undefined) {
    const { location, error } = await resolveLocationId(locationId, property, req.companyIds);
    if (error) return res.status(error.status).json(error.body);
    finalLocationId = location ? location.id : null;
  }

  if (assetId !== undefined) {
    const { asset, error } = await resolveAssetId(assetId, property, req.companyIds);
    if (error) return res.status(error.status).json(error.body);
    finalAssetId = asset ? asset.id : null;
    resolvedAssetForConsistency = asset;
  }

  // Only re-check consistency when the relationship could have changed —
  // i.e. this request touched locationId and/or assetId.
  if ((locationId !== undefined || assetId !== undefined) && finalLocationId && finalAssetId) {
    const relevantAsset = resolvedAssetForConsistency ?? (await Asset.findByPk(finalAssetId));
    if (relevantAsset && relevantAsset.locationId && relevantAsset.locationId !== finalLocationId) {
      return res.status(400).json({ error: "locationId and assetId refer to different locations." });
    }
  }

  // Same completion invariant as createWorkOrder, plus: staying completed
  // across an unrelated edit (no completedAt in this request) preserves the
  // existing timestamp rather than bumping it to now.
  const previousStatus = workOrder.status;
  const previousCompletedAt = workOrder.completedAt;
  const completedAtProvided = Object.prototype.hasOwnProperty.call(values, "completedAt");
  const finalStatus = values.status ?? previousStatus;

  let finalCompletedAt;
  if (finalStatus === "completed") {
    if (completedAtProvided && values.completedAt !== null) {
      finalCompletedAt = values.completedAt;
    } else if (previousStatus === "completed" && !completedAtProvided) {
      finalCompletedAt = previousCompletedAt;
    } else {
      finalCompletedAt = new Date();
    }
  } else {
    if (completedAtProvided && values.completedAt !== null) {
      return res.status(400).json({ error: "completedAt can only be set when status is completed." });
    }
    finalCompletedAt = null;
  }

  if (values.title !== undefined) workOrder.title = values.title;
  if (values.description !== undefined) workOrder.description = values.description;
  if (values.status !== undefined) workOrder.status = values.status;
  if (values.priority !== undefined) workOrder.priority = values.priority;
  if (values.dueDate !== undefined) workOrder.dueDate = values.dueDate;
  if (values.cost !== undefined) workOrder.cost = values.cost;
  if (values.photoUrls !== undefined) workOrder.photoUrls = values.photoUrls;
  if (locationId !== undefined) workOrder.locationId = finalLocationId;
  if (assetId !== undefined) workOrder.assetId = finalAssetId;
  workOrder.completedAt = finalCompletedAt;

  await workOrder.save();
  res.json(workOrder);
}

export async function archiveWorkOrder(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid work order id." });
  }

  const workOrder = await findOwnedWorkOrder(req.params.id, req.companyIds);
  if (!workOrder) return res.status(404).json({ error: "Work order not found." });

  workOrder.archivedAt = new Date();
  await workOrder.save();
  res.json(workOrder);
}
