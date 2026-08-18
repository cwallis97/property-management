import { Op } from "sequelize";
import { Property, Location, Asset, WorkOrder } from "../models/index.js";

// Portfolio-wide operational summary for the authenticated user's Company.
// Four flat, company-scoped queries regardless of how many Properties exist
// — never one query per Property — so this stays cheap as a portfolio
// grows. Company is derived exclusively from req.companyIds (set by
// requireAuth); nothing here accepts a client-supplied company/property id.
//
// Only current, active-scope data is returned (non-archived Locations/
// Assets, non-completed non-archived WorkOrders) — this is a "what needs
// attention right now" snapshot, not a historical export.
//
// Deliberately returns raw fields rather than pre-computed booleans like
// "overdue" or "needsAttention": those are derived on the frontend using
// the same isOverdue()/attentionRank() logic already used on
// PropertyDetail/WorkOrderDetail, so the dashboard can never disagree with
// those pages about what counts as overdue or urgent.
export async function getDashboardSummary(req, res) {
  const properties = await Property.findAll({
    where: { companyId: { [Op.in]: req.companyIds } },
    attributes: ["id", "name"],
    order: [["name", "ASC"]],
  });

  if (properties.length === 0) {
    return res.json({ properties: [], locations: [], assets: [], workOrders: [] });
  }

  const propertyIds = properties.map((p) => p.id);

  const [locations, assets, workOrders] = await Promise.all([
    Location.findAll({
      where: { propertyId: { [Op.in]: propertyIds }, archivedAt: null },
      attributes: ["id", "name", "parentLocationId", "propertyId"],
    }),
    Asset.findAll({
      where: { propertyId: { [Op.in]: propertyIds }, archivedAt: null },
      attributes: ["id", "name", "status", "locationId", "propertyId"],
    }),
    WorkOrder.findAll({
      where: {
        propertyId: { [Op.in]: propertyIds },
        archivedAt: null,
        status: { [Op.ne]: "completed" },
      },
      attributes: [
        "id",
        "propertyId",
        "locationId",
        "assetId",
        "title",
        "status",
        "priority",
        "dueDate",
        "createdAt",
      ],
      order: [["createdAt", "ASC"]],
    }),
  ]);

  res.json({ properties, locations, assets, workOrders });
}
