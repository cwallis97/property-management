import { Op } from "sequelize";
import {
  sequelize,
  WorkOrder,
  Location,
  Asset,
  Property,
  WorkType,
  WorkOrderCostEntry,
  WorkOrderVendor,
  Membership,
  User,
  WORK_ORDER_STATUSES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_CATEGORIES,
} from "../models/index.js";
import { resolveVendorId } from "./vendorController.js";
import { CAPABILITIES, requireCapability, hasCapability } from "../authorization/capabilities.js";
import { getAccessiblePropertyIds, requirePropertyAccess, membershipHasPropertyAccess } from "../authorization/propertyAccess.js";
import { WORK_ORDER_ACTIONS, canPerformWorkOrderAction } from "../authorization/workOrderActions.js";
import { recordAuditEvent, resolveActor } from "../services/auditService.js";

// The ONLY field an assigned Technician (no WORK_ORDER_EDIT) may ever
// submit to updateWorkOrder — see workOrderActions.js. A request from a
// non-full-editor containing any OTHER key is rejected in its entirety
// (never partially applied), so a crafted payload can never smuggle a
// privileged field alongside an allowed one.
const ASSIGNEE_EDITABLE_FIELDS = new Set(["status"]);

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

function isValidPhotoUrls(value) {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isValidMapCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
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

// Selects the parent Property's companyId (not just an empty join filter)
// so callers can run a capability check against it without a second query.
async function findOwnedWorkOrder(workOrderId, companyIds, { includeArchived = false } = {}) {
  const where = { id: workOrderId };
  if (!includeArchived) where.archivedAt = null;

  return WorkOrder.findOne({
    where,
    include: { model: Property, as: "property", where: { companyId: { [Op.in]: companyIds } }, attributes: ["companyId"] },
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

// Validates a candidate workTypeId: must exist, be visible to the caller's
// company (global or company-owned), and not be archived — mirrors
// resolveLocationId/resolveAssetId's shape. Archived WorkTypes remain
// perfectly valid on WorkOrders that already reference them (nothing here
// touches existing rows); this only guards NEW assignments.
async function resolveWorkTypeId(workTypeId, companyIds) {
  if (workTypeId === undefined || workTypeId === null) {
    return { workType: null };
  }
  if (!isValidUUID(workTypeId)) {
    return { error: { status: 400, body: { error: "Invalid workTypeId." } } };
  }

  const workType = await WorkType.findOne({
    where: { id: workTypeId, [Op.or]: [{ companyId: null }, { companyId: { [Op.in]: companyIds } }] },
  });
  if (!workType) return { error: { status: 404, body: { error: "Work type not found." } } };
  if (workType.archivedAt) {
    return { error: { status: 400, body: { error: "Cannot assign an archived work type." } } };
  }

  return { workType };
}

// Validates a candidate assignedMembershipId: must exist and belong to the
// caller's own company (scoping to companyIds — the caller's companies —
// is what makes cross-company assignment impossible, the same idiom
// resolveVendorId/resolveLocationId already use for their own target
// entities), and — the actual authorization-sensitive check —
// membershipHasPropertyAccess must confirm this specific member already
// has Property Access to THIS Work Order's Property. That's a business-
// rule rejection (400, like resolveVendorId's "inactive vendor" rule),
// not a tenant-boundary check, so it doesn't need the 404-only-ever
// convention requirePropertyAccess uses elsewhere. Being assigned NEVER
// grants access — this only ever narrows to members who already have it.
// Returns { error } or { membership: Membership|null }.
async function resolveAssignedMembershipId(assignedMembershipId, property, companyIds) {
  if (assignedMembershipId === undefined || assignedMembershipId === null) {
    return { membership: null };
  }
  if (!isValidUUID(assignedMembershipId)) {
    return { error: { status: 400, body: { error: "Invalid assignedMembershipId." } } };
  }

  const membership = await Membership.findOne({
    where: { id: assignedMembershipId, companyId: { [Op.in]: companyIds } },
    include: { model: User, as: "user", attributes: ["id", "email", "displayName"] },
  });
  if (!membership) return { error: { status: 404, body: { error: "Member not found." } } };

  const allowed = await membershipHasPropertyAccess(membership, property.id);
  if (!allowed) {
    return { error: { status: 400, body: { error: "This member does not have access to this property." } } };
  }

  return { membership };
}

// {membershipId, name} | null — deliberately not the full Membership row
// (no role, no accessMode, no email here). This is the identical minimum
// shape membershipController's own serializeMember already exposes as
// "name" (displayName, falling back to email) — nothing new invented.
function serializeAssignee(membership) {
  if (!membership) return null;
  const user = membership.user;
  return { membershipId: membership.id, name: user.displayName || user.email };
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

  if (body.category !== undefined) {
    if (body.category !== null && !WORK_ORDER_CATEGORIES.includes(body.category)) {
      return { error: { status: 400, body: { error: `category must be one of: ${WORK_ORDER_CATEGORIES.join(", ")}` } } };
    }
    values.category = body.category;
  }

  if (body.photoUrls !== undefined) {
    if (!isValidPhotoUrls(body.photoUrls)) {
      return { error: { status: 400, body: { error: "photoUrls must be an array of strings." } } };
    }
    values.photoUrls = body.photoUrls;
  }

  // A lone coordinate is meaningless, so mapX/mapY are always both-or-
  // neither: either both are valid numbers in [0, 100], or both are
  // explicitly null (clearing a position), or neither key is present.
  if (body.mapX !== undefined || body.mapY !== undefined) {
    const bothNull = body.mapX === null && body.mapY === null;
    const bothValid = isValidMapCoordinate(body.mapX) && isValidMapCoordinate(body.mapY);
    if (!bothNull && !bothValid) {
      return {
        error: { status: 400, body: { error: "mapX and mapY must both be numbers between 0 and 100, or both null." } },
      };
    }
    values.mapX = body.mapX;
    values.mapY = body.mapY;
  }

  return { values };
}

export async function listWorkOrdersForProperty(req, res) {
  if (!isValidUUID(req.params.propertyId)) {
    return res.status(400).json({ error: "Invalid property id." });
  }

  const property = await findOwnedProperty(req.params.propertyId, req.companyIds);
  if (!property) return res.status(404).json({ error: "Property not found." });
  if (!(await requirePropertyAccess(req, res, property.companyId, property.id))) return;

  const workOrders = await WorkOrder.findAll({
    where: { propertyId: property.id, archivedAt: null },
    include: { model: Membership, as: "assignee", include: { model: User, as: "user", attributes: ["id", "email", "displayName"] } },
    order: [["createdAt", "ASC"]],
  });
  res.json(workOrders.map((wo) => ({ ...wo.toJSON(), assignee: serializeAssignee(wo.assignee) })));
}

// Portfolio-wide operational queue: every non-archived Work Order across
// every Property the caller's company(ies) own, regardless of status or
// whether it has any cost entries — this is "what needs attention", not a
// financial report, so it must never inner-join on cost entries the way
// Reports' maintenance-spend endpoint does. Mirrors dashboardController's
// proven shape (resolve owned Property ids first, then one flat
// WorkOrder.findAll scoped to those ids — never one query per Property).
// Property/Location/Asset names are eager-loaded for display convenience
// only; the propertyIds pre-filter above is the actual tenant boundary, not
// these includes. Active/Completed/All filtering, sorting, and attention
// logic all stay a frontend concern, exactly like a single property's list.
export async function listWorkOrdersForCompany(req, res) {
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

  const workOrders = await WorkOrder.findAll({
    where: { propertyId: { [Op.in]: propertyIds }, archivedAt: null },
    include: [
      { model: Property, as: "property", attributes: ["id", "name"] },
      { model: Location, as: "location", attributes: ["id", "name"] },
      {
        model: Asset,
        as: "asset",
        attributes: ["id", "name", "locationId"],
        include: [{ model: Location, as: "location", attributes: ["id", "name"] }],
      },
      { model: Membership, as: "assignee", include: { model: User, as: "user", attributes: ["id", "email", "displayName"] } },
    ],
    order: [["createdAt", "ASC"]],
  });

  // My Work (client-side, same convention as every other Work Order
  // filter — Active/Completed/All, Property Scope) needs assignee reduced
  // to the same minimal {membershipId, name} shape every other Work Order
  // response uses, not the raw eager-loaded Membership/User rows.
  res.json(workOrders.map((wo) => ({ ...wo.toJSON(), assignee: serializeAssignee(wo.assignee) })));
}

export async function createWorkOrder(req, res) {
  if (!isValidUUID(req.params.propertyId)) {
    return res.status(400).json({ error: "Invalid property id." });
  }

  const property = await findOwnedProperty(req.params.propertyId, req.companyIds);
  if (!property) return res.status(404).json({ error: "Property not found." });
  if (!(await requirePropertyAccess(req, res, property.companyId, property.id))) return;
  if (!requireCapability(req, res, property.companyId, CAPABILITIES.WORK_ORDER_CREATE)) return;
  if (property.status === "archived") {
    return res.status(400).json({ error: "Cannot add a work order to an archived property. Restore it first." });
  }

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

  const { workType, error: workTypeError } = await resolveWorkTypeId(req.body.workTypeId, req.companyIds);
  if (workTypeError) return res.status(workTypeError.status).json(workTypeError.body);

  const finalCategory = values.category ?? null;
  if (workType && finalCategory && workType.category !== finalCategory) {
    return res.status(400).json({ error: "workTypeId must belong to the selected category." });
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
    category: finalCategory,
    workTypeId: workType ? workType.id : null,
    photoUrls: values.photoUrls ?? undefined,
    mapX: values.mapX ?? null,
    mapY: values.mapY ?? null,
  });
  res.status(201).json(workOrder);
}

// An array, honestly reflecting the schema (see WorkOrderVendor's
// migration) even though V1's UI only ever writes one row — never a
// separate "the" vendor field to keep in sync with the join table. Only
// `current` rows — this answers "who is presently assigned," not "who has
// ever been assigned" (that's Vendor Detail's Work History, derived the
// other direction, unfiltered by `current`).
async function getVendorsForWorkOrder(workOrderId) {
  const links = await WorkOrderVendor.findAll({ where: { workOrderId, current: true }, include: [{ association: "vendor" }] });
  return links.map((l) => l.vendor);
}

// Same enriched-response idiom as getVendorsForWorkOrder — resolves the
// current assignedMembershipId (if any) into the minimal display shape,
// never the raw Membership/User rows.
async function getAssigneeForWorkOrder(assignedMembershipId) {
  if (!assignedMembershipId) return null;
  const membership = await Membership.findByPk(assignedMembershipId, {
    include: { model: User, as: "user", attributes: ["id", "email", "displayName"] },
  });
  return serializeAssignee(membership);
}

export async function getWorkOrder(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid work order id." });
  }

  const workOrder = await findOwnedWorkOrder(req.params.id, req.companyIds);
  if (!workOrder) return res.status(404).json({ error: "Work order not found." });
  if (!(await requirePropertyAccess(req, res, workOrder.property.companyId, workOrder.propertyId))) return;

  // totalCost is always derived from the real cost entries, never a
  // stored/editable number — a single aggregate query alongside the normal
  // lookup, not a second source of truth to keep in sync.
  const [workType, totalCostResult, vendors, assignee] = await Promise.all([
    workOrder.workTypeId ? WorkType.findByPk(workOrder.workTypeId) : null,
    WorkOrderCostEntry.sum("amount", { where: { workOrderId: workOrder.id } }),
    getVendorsForWorkOrder(workOrder.id),
    getAssigneeForWorkOrder(workOrder.assignedMembershipId),
  ]);

  res.json({
    ...workOrder.toJSON(),
    workType,
    vendors,
    assignee,
    // Same string-vs-number caution as the cost entries themselves: don't
    // trust the driver's aggregate result type, normalize explicitly.
    totalCost: totalCostResult != null ? Number(totalCostResult) : 0,
  });
}

export async function updateWorkOrder(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid work order id." });
  }

  const workOrder = await findOwnedWorkOrder(req.params.id, req.companyIds);
  if (!workOrder) return res.status(404).json({ error: "Work order not found." });
  if (!(await requirePropertyAccess(req, res, workOrder.property.companyId, workOrder.propertyId))) return;

  // Full editors (Admin/Manager) proceed exactly as before this milestone —
  // this block only ever adds a SECOND, much narrower path to "allowed",
  // never widens the first. A non-full-editor must be the current assignee
  // acting on a not-yet-completed Work Order, AND the request body must
  // contain nothing outside ASSIGNEE_EDITABLE_FIELDS — checked BEFORE any
  // field is applied, so a forbidden field anywhere in the body fails the
  // entire request rather than being silently dropped.
  const isFullEditor = hasCapability(req, workOrder.property.companyId, CAPABILITIES.WORK_ORDER_EDIT);
  if (!isFullEditor) {
    const outOfScope = Object.keys(req.body).filter((f) => !ASSIGNEE_EDITABLE_FIELDS.has(f));
    const canActAsAssignee = canPerformWorkOrderAction(
      req,
      workOrder,
      WORK_ORDER_ACTIONS.UPDATE_STATUS,
      CAPABILITIES.WORK_ORDER_EDIT
    );
    if (outOfScope.length > 0 || !canActAsAssignee) {
      return res.status(403).json({ error: "You do not have permission to do that." });
    }
  }
  // Audit metadata only — never an authorization decision itself. Only
  // status_changed can actually occur through both tiers (assignment stays
  // full-editor-only by construction, since assignedMembershipId isn't in
  // ASSIGNEE_EDITABLE_FIELDS), but computed once here for reuse below.
  const authorizationPath = isFullEditor ? "full_editor" : "assigned_technician";

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

  const { workTypeId } = req.body;
  let finalWorkTypeId = workOrder.workTypeId;
  let resolvedWorkTypeForConsistency = null;

  if (workTypeId !== undefined) {
    const { workType, error } = await resolveWorkTypeId(workTypeId, req.companyIds);
    if (error) return res.status(error.status).json(error.body);
    finalWorkTypeId = workType ? workType.id : null;
    resolvedWorkTypeForConsistency = workType;
  }

  const finalCategory = values.category !== undefined ? values.category : workOrder.category;

  // Same "only re-check when something relevant changed" rule as
  // location/asset above.
  if ((workTypeId !== undefined || values.category !== undefined) && finalWorkTypeId && finalCategory) {
    const relevantWorkType = resolvedWorkTypeForConsistency ?? (await WorkType.findByPk(finalWorkTypeId));
    if (relevantWorkType && relevantWorkType.category !== finalCategory) {
      return res.status(400).json({ error: "workTypeId must belong to the selected category." });
    }
  }

  // V1's "one Vendor" UI is enforced here, not in the schema — a present
  // vendorId REPLACES whatever WorkOrderVendor row(s) already exist for
  // this Work Order (null clears the assignment entirely). This never
  // touches WorkOrderCostEntry.vendorId on any existing cost entry — a
  // Work Order's current Vendor assignment and a cost entry's own Vendor
  // attribution are independent, so changing/removing the former can never
  // corrupt already-recorded financial history.
  const { vendorId } = req.body;
  let resolvedVendor = null;
  if (vendorId !== undefined) {
    const { vendor, error } = await resolveVendorId(vendorId, req.companyIds);
    if (error) return res.status(error.status).json(error.body);
    resolvedVendor = vendor;
  }

  // Operational ownership — who this Work Order belongs to, never who may
  // access its Property (see resolveAssignedMembershipId's own comment).
  // A present assignedMembershipId REPLACES whatever the current value is
  // (null clears it) — same "generic update" shape every other scalar
  // field on this endpoint already uses, no separate assignment endpoint.
  // previousAssignedMembershipId is captured before any mutation, purely
  // for the audit before/after snapshot below.
  const previousAssignedMembershipId = workOrder.assignedMembershipId;
  const { assignedMembershipId } = req.body;
  let assigneeAfterForAudit;
  if (assignedMembershipId !== undefined) {
    const { membership, error } = await resolveAssignedMembershipId(assignedMembershipId, property, req.companyIds);
    if (error) return res.status(error.status).json(error.body);
    workOrder.assignedMembershipId = membership ? membership.id : null;
    assigneeAfterForAudit = serializeAssignee(membership);
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
  if (values.category !== undefined) workOrder.category = values.category;
  if (workTypeId !== undefined) workOrder.workTypeId = finalWorkTypeId;
  if (values.photoUrls !== undefined) workOrder.photoUrls = values.photoUrls;
  if (values.mapX !== undefined) {
    workOrder.mapX = values.mapX;
    workOrder.mapY = values.mapY;
  }
  if (locationId !== undefined) workOrder.locationId = finalLocationId;
  if (assetId !== undefined) workOrder.assetId = finalAssetId;
  workOrder.completedAt = finalCompletedAt;

  // Real changes only — a request that resubmits the same status or the
  // same assignee is a no-op and must not create an audit event (see
  // auditService.js's own no-op-suppression rule, applied identically at
  // every one of this milestone's mutation points).
  const assignmentChanged = assignedMembershipId !== undefined && previousAssignedMembershipId !== workOrder.assignedMembershipId;
  const statusChanged = values.status !== undefined && previousStatus !== finalStatus;

  // Work Order assignment/status changes must commit atomically with their
  // AuditEvent rows — if the audit insert fails, the whole request fails
  // and workOrder.save() rolls back too, rather than ever silently
  // succeeding without the audit trail this milestone promises. Only
  // workOrder.save() itself needs to be inside this transaction (it's the
  // one statement these two audited fields are written by); the
  // WorkOrderVendor swap below is a separate, pre-existing, already
  // non-transactional step (Vendor changes are not an audited V1 event)
  // and is deliberately left exactly where it already was, unaffected by
  // this change.
  const actor = resolveActor(req, workOrder.property.companyId);
  await sequelize.transaction(async (t) => {
    await workOrder.save({ transaction: t });

    if (assignmentChanged) {
      const beforeAssignee = await getAssigneeForWorkOrder(previousAssignedMembershipId);
      await recordAuditEvent({
        transaction: t,
        companyId: workOrder.property.companyId,
        propertyId: workOrder.propertyId,
        actor,
        action: "work_order.assignment_changed",
        entityType: "work_order",
        entityId: workOrder.id,
        entityLabel: workOrder.title,
        before: beforeAssignee,
        after: assigneeAfterForAudit,
      });
    }

    if (statusChanged) {
      await recordAuditEvent({
        transaction: t,
        companyId: workOrder.property.companyId,
        propertyId: workOrder.propertyId,
        actor,
        action: "work_order.status_changed",
        entityType: "work_order",
        entityId: workOrder.id,
        entityLabel: workOrder.title,
        before: { status: previousStatus },
        after: { status: finalStatus },
        metadata: { authorizationPath },
      });
    }
  });

  // Never deletes a WorkOrderVendor row — marks the previously-current one
  // false instead, so a Vendor's Work History keeps this Work Order even
  // after someone else is assigned. Reassigning back to a Vendor who had a
  // (now-historical) row here creates a fresh row rather than reviving the
  // old one; each assignment period is its own historical record.
  if (vendorId !== undefined) {
    await WorkOrderVendor.update({ current: false }, { where: { workOrderId: workOrder.id, current: true } });
    if (resolvedVendor) {
      await WorkOrderVendor.create({ workOrderId: workOrder.id, vendorId: resolvedVendor.id, current: true });
    }
  }

  // Same enriched shape as getWorkOrder — WorkOrderDetail applies whatever
  // this returns directly to its state, so it needs workType/totalCost/
  // vendors/assignee here too or they'd disappear from the page after any
  // edit.
  const [workType, totalCostResult, vendors, assignee] = await Promise.all([
    workOrder.workTypeId ? WorkType.findByPk(workOrder.workTypeId) : null,
    WorkOrderCostEntry.sum("amount", { where: { workOrderId: workOrder.id } }),
    getVendorsForWorkOrder(workOrder.id),
    getAssigneeForWorkOrder(workOrder.assignedMembershipId),
  ]);

  res.json({
    ...workOrder.toJSON(),
    workType,
    vendors,
    assignee,
    totalCost: totalCostResult != null ? Number(totalCostResult) : 0,
  });
}

// Server-authoritative "who may this Work Order be assigned to" — never
// computed by the frontend. Same tenant/property resolution getWorkOrder
// itself uses, gated on WORK_ORDER_EDIT specifically because that's the
// exact authorization level required to actually perform an assignment
// (see updateWorkOrder). Deliberately NOT a reuse of GET /api/members
// (Users & Roles' own listing): that endpoint is gated on users.manage
// (Admin/Owner only — a Manager who can edit this Work Order couldn't
// call it) and returns far more than a picker needs (email, accessMode,
// full property grant list). This returns only {membershipId, name} for
// members who actually have Property Access to this Work Order's
// Property — no role restriction (Owner/Admin/Manager/Technician are all
// eligible candidates; the only real constraint is Property Access).
export async function getAssignableMembers(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid work order id." });
  }

  const workOrder = await findOwnedWorkOrder(req.params.id, req.companyIds);
  if (!workOrder) return res.status(404).json({ error: "Work order not found." });
  if (!(await requirePropertyAccess(req, res, workOrder.property.companyId, workOrder.propertyId))) return;
  if (!requireCapability(req, res, workOrder.property.companyId, CAPABILITIES.WORK_ORDER_EDIT)) return;

  const memberships = await Membership.findAll({
    where: { companyId: workOrder.property.companyId },
    include: { model: User, as: "user", attributes: ["id", "email", "displayName"] },
  });

  const eligible = [];
  for (const membership of memberships) {
    if (await membershipHasPropertyAccess(membership, workOrder.propertyId)) {
      eligible.push(serializeAssignee(membership));
    }
  }

  // Stable, predictable ordering for a picker — alphabetical, not
  // Membership creation order.
  eligible.sort((a, b) => a.name.localeCompare(b.name));

  res.json(eligible);
}

export async function archiveWorkOrder(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid work order id." });
  }

  const workOrder = await findOwnedWorkOrder(req.params.id, req.companyIds);
  if (!workOrder) return res.status(404).json({ error: "Work order not found." });
  if (!(await requirePropertyAccess(req, res, workOrder.property.companyId, workOrder.propertyId))) return;
  if (!requireCapability(req, res, workOrder.property.companyId, CAPABILITIES.WORK_ORDER_EDIT)) return;

  workOrder.archivedAt = new Date();
  await workOrder.save();
  res.json(workOrder);
}
