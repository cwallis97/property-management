import { Op } from "sequelize";
import {
  sequelize,
  Vendor,
  WorkOrder,
  WorkOrderVendor,
  WorkOrderCostEntry,
  Property,
  Location,
  WorkType,
  VENDOR_STATUSES,
} from "../models/index.js";
import { CAPABILITIES, requireCapability } from "../authorization/capabilities.js";
import { getAccessiblePropertyIds } from "../authorization/propertyAccess.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

async function findOwnedVendor(vendorId, companyIds) {
  return Vendor.findOne({ where: { id: vendorId, companyId: { [Op.in]: companyIds } } });
}

// Shared by workOrderController (Work-Order-level assignment) and
// workOrderCostController (cost-entry-level attribution) — the one place
// "is this a valid Vendor this caller may use" is decided, so the two
// callers can never drift on what counts as valid. An inactive Vendor is
// never a valid NEW assignment (mirrors resolveLocationId/resolveAssetId/
// resolveWorkTypeId's identical "reject archived for new assignment, but
// existing references stay perfectly valid" pattern) — nothing here ever
// touches an existing WorkOrderVendor row or WorkOrderCostEntry.vendorId,
// so already-recorded history is never affected by a Vendor going inactive.
export async function resolveVendorId(vendorId, companyIds) {
  if (vendorId === undefined || vendorId === null) {
    return { vendor: null };
  }
  if (!isValidUUID(vendorId)) {
    return { error: { status: 400, body: { error: "Invalid vendorId." } } };
  }

  const vendor = await findOwnedVendor(vendorId, companyIds);
  if (!vendor) return { error: { status: 404, body: { error: "Vendor not found." } } };
  if (vendor.status !== "active") {
    return { error: { status: 400, body: { error: "Cannot assign an inactive vendor." } } };
  }

  return { vendor };
}

function validateScalarFields(body, { partial }) {
  const values = {};

  if (body.name !== undefined) {
    if (!body.name || typeof body.name !== "string") {
      return { error: { status: 400, body: { error: "name must be a non-empty string." } } };
    }
    values.name = body.name;
  } else if (!partial) {
    return { error: { status: 400, body: { error: "name is required." } } };
  }

  for (const field of ["category", "contactName", "phone", "email", "notes"]) {
    if (body[field] !== undefined) {
      if (body[field] !== null && typeof body[field] !== "string") {
        return { error: { status: 400, body: { error: `${field} must be a string or null.` } } };
      }
      values[field] = body[field];
    }
  }

  if (body.status !== undefined) {
    if (!VENDOR_STATUSES.includes(body.status)) {
      return { error: { status: 400, body: { error: `status must be one of: ${VENDOR_STATUSES.join(", ")}` } } };
    }
    values.status = body.status;
  }

  return { values };
}

// Portfolio-wide, company-scoped — every Vendor (active and inactive) the
// caller's company owns. Active/Inactive filtering stays a frontend
// concern, same convention as Assets/Work Orders.
export async function listVendorsForCompany(req, res) {
  const vendors = await Vendor.findAll({
    where: { companyId: { [Op.in]: req.companyIds } },
    order: [["name", "ASC"]],
  });
  res.json(vendors);
}

export async function createVendor(req, res) {
  const { error, values } = validateScalarFields(req.body, { partial: false });
  if (error) return res.status(error.status).json(error.body);
  if (!requireCapability(req, res, req.companyIds[0], CAPABILITIES.VENDOR_CREATE)) return;

  // A Vendor always belongs to exactly one of the caller's own companies —
  // req.companyIds[0] mirrors the same "current company" assumption
  // req.companyIds already encodes elsewhere in this codebase (a user with
  // multiple companies isn't yet a real scenario this app distinguishes
  // between at creation time).
  const vendor = await Vendor.create({
    companyId: req.companyIds[0],
    name: values.name,
    category: values.category ?? null,
    contactName: values.contactName ?? null,
    phone: values.phone ?? null,
    email: values.email ?? null,
    notes: values.notes ?? null,
    status: values.status ?? undefined,
  });
  res.status(201).json(vendor);
}

export async function updateVendor(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid vendor id." });
  }

  const vendor = await findOwnedVendor(req.params.id, req.companyIds);
  if (!vendor) return res.status(404).json({ error: "Vendor not found." });
  if (!requireCapability(req, res, vendor.companyId, CAPABILITIES.VENDOR_EDIT)) return;

  const { error, values } = validateScalarFields(req.body, { partial: true });
  if (error) return res.status(error.status).json(error.body);

  Object.assign(vendor, values);
  await vendor.save();
  res.json(vendor);
}

// Enriched the same way getAsset is: the bare Vendor plus its full
// operational history, computed fresh every time from the real
// WorkOrderVendor participation rows and WorkOrderCostEntry attributions —
// never a second, separately-tracked history or spend total.
export async function getVendor(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid vendor id." });
  }

  const vendor = await findOwnedVendor(req.params.id, req.companyIds);
  if (!vendor) return res.status(404).json({ error: "Vendor not found." });

  // The Vendor directory itself (findOwnedVendor above) is deliberately
  // NOT Property-restricted — identity/contact/category is Company-level
  // per Property Access V1's Vendor rule. Everything below IS restricted:
  // a Vendor's derived Work History / Actual Spend / Properties Worked are
  // Property-scoped aggregates, and must never show a restricted member
  // costs or Work Orders at a Property they can't otherwise see.
  const accessiblePropertyIds = await getAccessiblePropertyIds(req, vendor.companyId);

  const links = await WorkOrderVendor.findAll({ where: { vendorId: vendor.id }, attributes: ["workOrderId"] });
  const linkedWorkOrderIds = links.map((l) => l.workOrderId);

  const workOrders = linkedWorkOrderIds.length
    ? await WorkOrder.findAll({
        where: {
          id: { [Op.in]: linkedWorkOrderIds },
          archivedAt: null,
          ...(accessiblePropertyIds ? { propertyId: { [Op.in]: accessiblePropertyIds } } : {}),
        },
        attributes: ["id", "title", "status", "priority", "dueDate", "completedAt", "createdAt", "category", "propertyId", "locationId"],
        include: [
          { model: Property, as: "property", attributes: ["id", "name"] },
          { model: Location, as: "location", attributes: ["id", "name"] },
          { model: WorkType, as: "workType", attributes: ["id", "label"] },
        ],
        order: [["createdAt", "DESC"]],
      })
    : [];

  // Every aggregate below is computed from this already-access-filtered
  // id list, not the raw links above — this is what keeps costRows,
  // actualSpend, and (via `workOrders` itself, further down) Properties
  // Worked all in sync with the same restriction, rather than three
  // separately-applied filters that could drift.
  const workOrderIds = workOrders.map((wo) => wo.id);

  const [costRows, actualSpendResult] = await Promise.all([
    // This Vendor's attributable cost, per Work Order — grouped by
    // work_order_id AND filtered to this vendor's own cost entries, so a
    // Work Order that (in a future multi-vendor world) has cost entries
    // split across several Vendors only ever shows THIS Vendor's share.
    workOrderIds.length
      ? WorkOrderCostEntry.findAll({
          where: { workOrderId: { [Op.in]: workOrderIds }, vendorId: vendor.id },
          attributes: ["workOrderId", [sequelize.fn("SUM", sequelize.col("amount")), "total"]],
          group: ["workOrderId"],
          raw: true,
        })
      : [],
    // Actual Vendor Spend is normally the direct sum of every cost entry
    // ever attributed to this Vendor, independent of the Work Order list
    // above (see resolveVendorId's comment: a Work Order's current Vendor
    // assignment changing never touches existing cost-entry attribution).
    // For a restricted member that whole-Vendor sum would leak spend at
    // inaccessible Properties, so it's scoped down to the same
    // access-filtered workOrderIds instead — an unrestricted caller still
    // gets the true lifetime total.
    accessiblePropertyIds
      ? workOrderIds.length
        ? WorkOrderCostEntry.sum("amount", { where: { workOrderId: { [Op.in]: workOrderIds }, vendorId: vendor.id } })
        : 0
      : WorkOrderCostEntry.sum("amount", { where: { vendorId: vendor.id } }),
  ]);

  const costByWorkOrderId = Object.fromEntries(costRows.map((r) => [r.workOrderId, Number(r.total)]));

  res.json({
    ...vendor.toJSON(),
    workOrders: workOrders.map((wo) => ({ ...wo.toJSON(), vendorSpend: costByWorkOrderId[wo.id] ?? 0 })),
    propertiesWorked: [...new Map(workOrders.map((wo) => [wo.property.id, wo.property.name])).entries()].map(([id, name]) => ({ id, name })),
    actualSpend: actualSpendResult != null ? Number(actualSpendResult) : 0,
    mostRecentWorkAt: workOrders[0]?.createdAt ?? null,
  });
}
