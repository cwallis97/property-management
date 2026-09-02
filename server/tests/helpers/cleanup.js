// Centralized fixture teardown — one call per suite (`cleanupCompanies`),
// not hand-ordered destroy() calls scattered across every test file. This
// exists specifically because several FKs in this schema are RESTRICT, not
// CASCADE (WorkOrderNote/WorkOrderCostEntry -> WorkOrder, AuditEvent ->
// Company — both deliberately, to protect real customer history from
// accidental cascade deletes in production), which means deleting rows in
// the wrong order fails loudly rather than quietly. Every suite only ever
// needs to remember the Company ids it created; this discovers and removes
// everything beneath them in the one order that's actually safe.
//
// Deliberately scoped to explicit company ids passed in — never a blanket
// "delete everything QA-prefixed" sweep, which could race with another
// suite's still-running fixtures or (worse) ever touch non-fixture data.
import { Op } from "sequelize";
import {
  AuditEvent,
  Document,
  WorkOrderCostEntry,
  WorkOrderNote,
  WorkOrderVendor,
  WorkOrder,
  PropertyAccess,
  Vendor,
  Property,
  Membership,
  User,
  Company,
} from "../../models/index.js";

export async function cleanupCompanies(companyIds) {
  const ids = (companyIds ?? []).filter(Boolean);
  if (ids.length === 0) return;

  const properties = await Property.findAll({ where: { companyId: { [Op.in]: ids } }, attributes: ["id"] });
  const propertyIds = properties.map((p) => p.id);

  const workOrders = propertyIds.length
    ? await WorkOrder.findAll({ where: { propertyId: { [Op.in]: propertyIds } }, attributes: ["id"] })
    : [];
  const workOrderIds = workOrders.map((w) => w.id);

  const memberships = await Membership.findAll({ where: { companyId: { [Op.in]: ids } }, attributes: ["id", "userId"] });
  const membershipIds = memberships.map((m) => m.id);
  const userIds = [...new Set(memberships.map((m) => m.userId))];

  const vendors = await Vendor.findAll({ where: { companyId: { [Op.in]: ids } }, attributes: ["id"] });
  const vendorIds = vendors.map((v) => v.id);

  // Order matters: children of Work Order before Work Order itself,
  // Work Order before Property (its own FK is CASCADE, but AuditEvent rows
  // referencing it are not implicitly cleaned up by that), everything
  // before Company (RESTRICT).
  await AuditEvent.destroy({ where: { companyId: { [Op.in]: ids } } });
  // Documents' FKs to Property/Asset/Work Order/Vendor are all RESTRICT, so
  // every Document a suite created must go before any of those. companyId
  // is the one direct, always-present column to scope by.
  await Document.destroy({ where: { companyId: { [Op.in]: ids } } });
  if (workOrderIds.length) {
    await WorkOrderCostEntry.destroy({ where: { workOrderId: { [Op.in]: workOrderIds } } });
    await WorkOrderNote.destroy({ where: { workOrderId: { [Op.in]: workOrderIds } } });
    await WorkOrderVendor.destroy({ where: { workOrderId: { [Op.in]: workOrderIds } } });
    await WorkOrder.destroy({ where: { id: { [Op.in]: workOrderIds } } });
  }
  if (membershipIds.length) {
    await PropertyAccess.destroy({ where: { membershipId: { [Op.in]: membershipIds } } });
  }
  if (vendorIds.length) {
    await Vendor.destroy({ where: { id: { [Op.in]: vendorIds } } });
  }
  if (propertyIds.length) {
    await Property.destroy({ where: { id: { [Op.in]: propertyIds } } });
  }
  if (membershipIds.length) {
    await Membership.destroy({ where: { id: { [Op.in]: membershipIds } } });
  }
  if (userIds.length) {
    await User.destroy({ where: { id: { [Op.in]: userIds } } });
  }
  await Company.destroy({ where: { id: { [Op.in]: ids } } });
}
