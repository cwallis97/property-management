import { Op } from "sequelize";
import { Repair, Pin, Property, SEVERITY_LEVELS, REPAIR_STATUSES } from "../models/index.js";

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

async function findOwnedRepair(repairId, companyIds) {
  return Repair.findOne({
    where: { id: repairId },
    include: {
      model: Pin,
      as: "pin",
      attributes: [],
      include: {
        model: Property,
        as: "property",
        where: { companyId: { [Op.in]: companyIds } },
        attributes: [],
      },
    },
  });
}

export async function listRepairsForPin(req, res) {
  const pin = await findOwnedPin(req.params.pinId, req.companyIds);
  if (!pin) return res.status(404).json({ error: "Pin not found." });

  const repairs = await Repair.findAll({
    where: { pinId: pin.id },
    order: [["repairDate", "DESC"]],
  });
  res.json(repairs);
}

export async function createRepair(req, res) {
  const pin = await findOwnedPin(req.params.pinId, req.companyIds);
  if (!pin) return res.status(404).json({ error: "Pin not found." });

  const {
    description,
    cost,
    vendor,
    invoiceUrl,
    photoUrls,
    warrantyInfo,
    chargebackAmount,
    reimbursementAmount,
    severity,
    status,
    repairDate,
  } = req.body;

  if (!description || typeof description !== "string") {
    return res.status(400).json({ error: "description is required." });
  }
  if (severity !== undefined && !SEVERITY_LEVELS.includes(severity)) {
    return res.status(400).json({ error: `severity must be one of: ${SEVERITY_LEVELS.join(", ")}` });
  }
  if (status !== undefined && !REPAIR_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${REPAIR_STATUSES.join(", ")}` });
  }

  const repair = await Repair.create({
    pinId: pin.id,
    description,
    cost: cost ?? 0,
    vendor: vendor ?? null,
    invoiceUrl: invoiceUrl ?? null,
    photoUrls: photoUrls ?? [],
    warrantyInfo: warrantyInfo ?? null,
    chargebackAmount: chargebackAmount ?? null,
    reimbursementAmount: reimbursementAmount ?? null,
    severity: severity ?? "low",
    status: status ?? "open",
    repairDate: repairDate ?? new Date().toISOString().slice(0, 10),
  });
  res.status(201).json(repair);
}

export async function getRepair(req, res) {
  const repair = await findOwnedRepair(req.params.id, req.companyIds);
  if (!repair) return res.status(404).json({ error: "Repair not found." });
  res.json(repair);
}

export async function updateRepair(req, res) {
  const repair = await findOwnedRepair(req.params.id, req.companyIds);
  if (!repair) return res.status(404).json({ error: "Repair not found." });

  const fields = [
    "description",
    "cost",
    "vendor",
    "invoiceUrl",
    "photoUrls",
    "warrantyInfo",
    "chargebackAmount",
    "reimbursementAmount",
    "repairDate",
  ];
  for (const field of fields) {
    if (req.body[field] !== undefined) repair[field] = req.body[field];
  }

  if (req.body.severity !== undefined) {
    if (!SEVERITY_LEVELS.includes(req.body.severity)) {
      return res.status(400).json({ error: `severity must be one of: ${SEVERITY_LEVELS.join(", ")}` });
    }
    repair.severity = req.body.severity;
  }
  if (req.body.status !== undefined) {
    if (!REPAIR_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ error: `status must be one of: ${REPAIR_STATUSES.join(", ")}` });
    }
    repair.status = req.body.status;
  }

  await repair.save();
  res.json(repair);
}

export async function deleteRepair(req, res) {
  const repair = await findOwnedRepair(req.params.id, req.companyIds);
  if (!repair) return res.status(404).json({ error: "Repair not found." });

  await repair.destroy();
  res.status(204).send();
}
