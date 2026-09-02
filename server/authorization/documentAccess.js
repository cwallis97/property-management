import { Op } from "sequelize";
import { Asset, WorkOrder } from "../models/index.js";

// The ONE definition of "which Documents may a member with this exact set
// of accessible Properties see." A Document has no direct property_id in
// every case (see the model's CHECK constraint — exactly one of
// property/asset/workOrder/vendor is set), so this resolves the Asset- and
// Work-Order-attached cases through their own Property, and — per Property
// Access V1's deliberate exception — treats every Vendor-attached Document
// as Company-level visible regardless of Property Access.
//
// Shared verbatim by documentController.listDocuments and the Global
// Search controller so the two can never drift on the rule. Both callers
// resolve `accessiblePropertyIds` their own way (documentController via
// getAccessiblePropertyIds for the caller's single current company;
// Global Search via the union of active accessible Properties across every
// Membership) — this module only owns the shape of the predicate, never
// where the Property set comes from.

// Assets and Work Orders that sit on one of the given Properties — the id
// lists the Document predicate below needs. Deliberately not archived-
// filtered on the Asset/Work Order itself: a Document's visibility follows
// its attachment target's *Property*, exactly as documentController has
// always resolved it. Callers that also need these lists in raw SQL (the
// search controller) can use them directly.
export async function resolveDocumentAttachmentIds(accessiblePropertyIds) {
  const [assets, workOrders] = await Promise.all([
    Asset.findAll({ where: { propertyId: { [Op.in]: accessiblePropertyIds } }, attributes: ["id"] }),
    WorkOrder.findAll({ where: { propertyId: { [Op.in]: accessiblePropertyIds } }, attributes: ["id"] }),
  ]);
  return { assetIds: assets.map((a) => a.id), workOrderIds: workOrders.map((w) => w.id) };
}

// Returns the Sequelize `Op.or` array to AND into a Document query's
// WHERE, or `null` when `accessiblePropertyIds === null` (unrestricted —
// no Document-level narrowing needed at all).
export async function buildDocumentAccessOr(accessiblePropertyIds) {
  if (accessiblePropertyIds === null) return null;
  const { assetIds, workOrderIds } = await resolveDocumentAttachmentIds(accessiblePropertyIds);
  return [
    { propertyId: { [Op.in]: accessiblePropertyIds } },
    { assetId: { [Op.in]: assetIds } },
    { workOrderId: { [Op.in]: workOrderIds } },
    { vendorId: { [Op.ne]: null } },
  ];
}
