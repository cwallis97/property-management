import { Op } from "sequelize";
import { WorkOrder, WorkOrderCostEntry, Property, User, WORK_ORDER_COST_TYPES } from "../models/index.js";

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
    include: { model: Property, as: "property", where: { companyId: { [Op.in]: companyIds } }, attributes: [] },
  });
}

function serializeCostEntry(entry) {
  const createdBy = entry.createdBy;
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
    include: { model: User, as: "createdBy", attributes: ["id", "displayName", "email"] },
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
  });

  const entryWithAuthor = await WorkOrderCostEntry.findByPk(entry.id, {
    include: { model: User, as: "createdBy", attributes: ["id", "displayName", "email"] },
  });

  res.status(201).json(serializeCostEntry(entryWithAuthor));
}
