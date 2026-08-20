import { Op } from "sequelize";
import { WorkOrder, WorkOrderNote, Property, User } from "../models/index.js";
import { CAPABILITIES, requireCapability } from "../authorization/capabilities.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_LENGTH = 4000;

function isValidUUID(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

// Archived work orders are already invisible to every other endpoint
// (getWorkOrder/updateWorkOrder both exclude them) — Notes follow the same
// rule for consistency: an archived work order's notes are inaccessible
// too, since there's no route in the app that could ever reach them anyway.
async function findOwnedWorkOrder(workOrderId, companyIds) {
  return WorkOrder.findOne({
    where: { id: workOrderId, archivedAt: null },
    include: { model: Property, as: "property", where: { companyId: { [Op.in]: companyIds } }, attributes: ["companyId"] },
  });
}

function serializeNote(note) {
  const author = note.author;
  return {
    id: note.id,
    body: note.body,
    createdAt: note.createdAt,
    author: author ? { id: author.id, name: author.displayName || author.email } : null,
  };
}

export async function listWorkOrderNotes(req, res) {
  if (!isValidUUID(req.params.workOrderId)) {
    return res.status(400).json({ error: "Invalid work order id." });
  }

  const workOrder = await findOwnedWorkOrder(req.params.workOrderId, req.companyIds);
  if (!workOrder) return res.status(404).json({ error: "Work order not found." });

  const notes = await WorkOrderNote.findAll({
    where: { workOrderId: workOrder.id },
    include: { model: User, as: "author", attributes: ["id", "displayName", "email"] },
    order: [["createdAt", "ASC"]],
  });

  res.json(notes.map(serializeNote));
}

export async function createWorkOrderNote(req, res) {
  if (!isValidUUID(req.params.workOrderId)) {
    return res.status(400).json({ error: "Invalid work order id." });
  }

  const workOrder = await findOwnedWorkOrder(req.params.workOrderId, req.companyIds);
  if (!workOrder) return res.status(404).json({ error: "Work order not found." });
  if (!requireCapability(req, res, workOrder.property.companyId, CAPABILITIES.WORK_ORDER_NOTE_CREATE)) return;

  const { body } = req.body;
  if (typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ error: "body is required." });
  }
  if (body.length > MAX_BODY_LENGTH) {
    return res.status(400).json({ error: `body must be ${MAX_BODY_LENGTH} characters or fewer.` });
  }

  // Author identity always comes from the authenticated session — never
  // from client input.
  const note = await WorkOrderNote.create({
    workOrderId: workOrder.id,
    authorUserId: req.user.id,
    body,
  });

  const noteWithAuthor = await WorkOrderNote.findByPk(note.id, {
    include: { model: User, as: "author", attributes: ["id", "displayName", "email"] },
  });

  res.status(201).json(serializeNote(noteWithAuthor));
}
