import { Op } from "sequelize";
import { WorkOrder, WorkOrderCostEntry, Property, User, Vendor, WORK_ORDER_COST_TYPES } from "../models/index.js";
import { resolveVendorId } from "./vendorController.js";
import { CAPABILITIES, requireCapability } from "../authorization/capabilities.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidUUID(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function isValidAmount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// Same format-plus-round-trip check as workOrderController's isValidDateOnly
// (kept local rather than shared, matching this codebase's existing
// per-controller duplication pattern) — rejects calendar-invalid dates like
// "2026-02-30" rather than silently normalizing them.
function isValidDateOnly(value) {
  if (typeof value !== "string" || !DATE_ONLY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

// Same rule as WorkOrderNote: an archived work order's cost entries are
// inaccessible too, since nothing in the app can ever reach them anyway.
async function findOwnedWorkOrder(workOrderId, companyIds) {
  return WorkOrder.findOne({
    where: { id: workOrderId, archivedAt: null },
    include: { model: Property, as: "property", where: { companyId: { [Op.in]: companyIds } }, attributes: ["companyId"] },
  });
}

function serializeCostEntry(entry) {
  const createdBy = entry.createdBy;
  const vendor = entry.vendor;
  return {
    id: entry.id,
    type: entry.type,
    // Sequelize returns DECIMAL as a string to avoid float precision loss
    // on the way out of Postgres — normalize to a number here so every
    // caller (including the totalCost sum below) works with real numbers,
    // not string concatenation.
    amount: Number(entry.amount),
    note: entry.note,
    costDate: entry.costDate,
    createdAt: entry.createdAt,
    createdBy: createdBy ? { id: createdBy.id, name: createdBy.displayName || createdBy.email } : null,
    // Independent of `type` — see WorkOrderCostEntry.js. Which Vendor (if
    // any) actually received this specific dollar amount, never inferred
    // from the Work Order's own Vendor assignment.
    vendor: vendor ? { id: vendor.id, name: vendor.name } : null,
  };
}

export async function listWorkOrderCosts(req, res) {
  if (!isValidUUID(req.params.workOrderId)) {
    return res.status(400).json({ error: "Invalid work order id." });
  }

  const workOrder = await findOwnedWorkOrder(req.params.workOrderId, req.companyIds);
  if (!workOrder) return res.status(404).json({ error: "Work order not found." });

  const entries = await WorkOrderCostEntry.findAll({
    where: { workOrderId: workOrder.id },
    include: [
      { model: User, as: "createdBy", attributes: ["id", "displayName", "email"] },
      { model: Vendor, as: "vendor", attributes: ["id", "name"] },
    ],
    order: [["createdAt", "ASC"]],
  });

  res.json(entries.map(serializeCostEntry));
}

export async function createWorkOrderCost(req, res) {
  if (!isValidUUID(req.params.workOrderId)) {
    return res.status(400).json({ error: "Invalid work order id." });
  }

  const workOrder = await findOwnedWorkOrder(req.params.workOrderId, req.companyIds);
  if (!workOrder) return res.status(404).json({ error: "Work order not found." });
  if (!requireCapability(req, res, workOrder.property.companyId, CAPABILITIES.WORK_ORDER_COST_CREATE)) return;

  const { type, amount, note, costDate } = req.body;
  if (!WORK_ORDER_COST_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${WORK_ORDER_COST_TYPES.join(", ")}` });
  }
  if (!isValidAmount(amount)) {
    return res.status(400).json({ error: "amount must be a non-negative number." });
  }
  if (note !== undefined && note !== null && typeof note !== "string") {
    return res.status(400).json({ error: "note must be a string." });
  }
  if (costDate !== undefined && costDate !== null && !isValidDateOnly(costDate)) {
    return res.status(400).json({ error: "costDate must be a valid date in YYYY-MM-DD format." });
  }

  // Independent of `type` — a cost entry may name the Vendor who actually
  // received this money regardless of how it's classified. Optional: most
  // cost entries (internal labor, property-purchased materials) have no
  // Vendor at all. Same resolveVendorId validation as Work-Order-level
  // assignment, so an inactive/foreign Vendor can never be attributed here
  // either.
  const { vendorId } = req.body;
  const { vendor, error: vendorError } = await resolveVendorId(vendorId, req.companyIds);
  if (vendorError) return res.status(vendorError.status).json(vendorError.body);

  // Author identity always comes from the authenticated session — never
  // from client input. Costs are intentionally allowed on a Work Order in
  // any status, including completed — completion and financial
  // reconciliation are related but separate concerns. costDate defaults to
  // today when omitted, but is always present — Reports will filter on it,
  // so no cost entry may have an unknown expense date.
  const entry = await WorkOrderCostEntry.create({
    workOrderId: workOrder.id,
    createdByUserId: req.user.id,
    type,
    amount,
    note: note || null,
    costDate: costDate || todayDateOnly(),
    vendorId: vendor ? vendor.id : null,
  });

  const entryWithAuthor = await WorkOrderCostEntry.findByPk(entry.id, {
    include: [
      { model: User, as: "createdBy", attributes: ["id", "displayName", "email"] },
      { model: Vendor, as: "vendor", attributes: ["id", "name"] },
    ],
  });

  res.status(201).json(serializeCostEntry(entryWithAuthor));
}
