import { QueryTypes } from "sequelize";
import { sequelize, WorkType } from "../models/index.js";
import { WORK_ORDER_CATEGORIES } from "../models/WorkType.js";
import { getAccessiblePropertyIds } from "../authorization/propertyAccess.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Mirrors the frontend's utils/workOrders.js categoryLabel map — kept
// local rather than shared, matching this codebase's existing
// per-controller duplication pattern for small, static lookup tables.
const CATEGORY_LABELS = {
  water: "Water",
  sewer: "Sewer",
  electrical: "Electrical",
  roads: "Roads",
  concrete: "Concrete",
  trees_landscaping: "Trees/Landscaping",
  buildings_facilities: "Buildings/Facilities",
  general_other: "General/Other",
};

function isValidUUID(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function isValidDateOnly(value) {
  if (typeof value !== "string" || !DATE_ONLY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Validates the shared filter set every Maintenance Spend query accepts.
// Every filter is optional; an invalid non-empty value is rejected
// outright rather than silently ignored. Returns { error } or { filters }.
function parseFilters(query, companyIds) {
  const filters = { companyIds };

  if (query.startDate !== undefined && query.startDate !== "") {
    if (!isValidDateOnly(query.startDate)) return { error: "startDate must be a valid date in YYYY-MM-DD format." };
    filters.startDate = query.startDate;
  }
  if (query.endDate !== undefined && query.endDate !== "") {
    if (!isValidDateOnly(query.endDate)) return { error: "endDate must be a valid date in YYYY-MM-DD format." };
    filters.endDate = query.endDate;
  }
  if (query.propertyId !== undefined && query.propertyId !== "") {
    if (!isValidUUID(query.propertyId)) return { error: "Invalid propertyId." };
    filters.propertyId = query.propertyId;
  }
  if (query.category !== undefined && query.category !== "") {
    // "uncategorized" is the same kind of real, drillable bucket as
    // "unspecified" work types below — not a real category value.
    if (query.category !== "uncategorized" && !WORK_ORDER_CATEGORIES.includes(query.category)) {
      return { error: `category must be one of: ${WORK_ORDER_CATEGORIES.join(", ")}` };
    }
    filters.category = query.category;
  }
  if (query.workTypeId !== undefined && query.workTypeId !== "") {
    // "unspecified" is a real, drillable bucket (category set, work type
    // not) — not a UUID, handled specially in buildWhereClause below so
    // that spend never dead-ends just because it lacks a Work Type.
    if (query.workTypeId !== "unspecified" && !isValidUUID(query.workTypeId)) {
      return { error: "Invalid workTypeId." };
    }
    filters.workTypeId = query.workTypeId;
  }

  return { filters };
}

// Financial data is treated like any other authorization-sensitive surface
// (see the Property Access architecture report's explicit "Reports like
// financial authorization" framing) — a restricted member's aggregates must
// never include an inaccessible Property's cost entries, and an explicit
// request for one must fail loudly rather than silently returning a
// plausible-looking zero (which would read as "no spend" instead of "not
// allowed"). Returns { error } or { accessiblePropertyIds } (null = every
// Property in the caller's companies, same convention as
// getAccessiblePropertyIds itself).
async function resolveAccessScope(req, filters) {
  const accessiblePropertyIds = await getAccessiblePropertyIds(req, req.companyIds[0]);
  if (accessiblePropertyIds && filters.propertyId && !accessiblePropertyIds.includes(filters.propertyId)) {
    return { error: "Property not found." };
  }
  return { accessiblePropertyIds };
}

// Every query joins cost entries -> work orders -> properties and scopes
// strictly to the caller's own companies, mirroring the exact ownership-
// chain idiom every other controller already uses (Property.companyId),
// just expressed in raw SQL because this is real aggregation, not a
// single-row lookup. A propertyId/category/workTypeId that doesn't belong
// to (or doesn't exist for) the caller's companies simply matches zero
// rows here — never a distinguishable error, so nothing about another
// company's data is ever leaked. All dates filter on cost_date — the date
// the expense was incurred — never work_orders.created_at/completed_at or
// the cost entry's own created_at (system-entry timestamp only).
function buildWhereClause(filters, accessiblePropertyIds) {
  // Sequelize expands an array replacement into a parenthesized list for
  // IN (:param) — that's the supported form; ANY(:param) would require an
  // actual Postgres array literal, which plain replacements don't produce.
  const conditions = ["p.company_id IN (:companyIds)", "wo.archived_at IS NULL"];
  const replacements = { companyIds: filters.companyIds };

  // null = unrestricted (every Property in the caller's companies) — see
  // getAccessiblePropertyIds. A restricted member's accessiblePropertyIds
  // is always a real array here (resolveAccessScope already rejected an
  // explicit out-of-scope propertyId filter before this is ever called).
  if (accessiblePropertyIds) {
    conditions.push("p.id IN (:accessiblePropertyIds)");
    replacements.accessiblePropertyIds = accessiblePropertyIds;
  }

  if (filters.startDate) {
    conditions.push("ce.cost_date >= :startDate");
    replacements.startDate = filters.startDate;
  }
  if (filters.endDate) {
    conditions.push("ce.cost_date <= :endDate");
    replacements.endDate = filters.endDate;
  }
  if (filters.propertyId) {
    conditions.push("wo.property_id = :propertyId");
    replacements.propertyId = filters.propertyId;
  }
  if (filters.category === "uncategorized") {
    conditions.push("wo.category IS NULL");
  } else if (filters.category) {
    conditions.push("wo.category = :category");
    replacements.category = filters.category;
  }
  if (filters.workTypeId === "unspecified") {
    conditions.push("wo.work_type_id IS NULL");
  } else if (filters.workTypeId) {
    conditions.push("wo.work_type_id = :workTypeId");
    replacements.workTypeId = filters.workTypeId;
  }

  return { whereSql: conditions.join(" AND "), replacements };
}

// Summary + one level of ranked breakdown (Category, or Work Type when a
// Category is selected). Both the summary and the breakdown are computed
// from the exact same filtered row set, so the breakdown rows always sum
// to the summary total shown above them — including a synthetic
// "Uncategorized"/"Unspecified Work Type" bucket so no dollar is ever
// silently dropped just because it lacks classification.
export async function getMaintenanceSpendSummary(req, res) {
  const { error, filters } = parseFilters(req.query, req.companyIds);
  if (error) return res.status(400).json({ error });

  const { error: accessError, accessiblePropertyIds } = await resolveAccessScope(req, filters);
  if (accessError) return res.status(404).json({ error: accessError });
  // A restricted member with zero grants (not reachable through the normal
  // management endpoint, which refuses to save that state, but defensive
  // regardless) has nothing to aggregate — short-circuit rather than ever
  // sending an empty IN (...) list to Postgres.
  if (accessiblePropertyIds && accessiblePropertyIds.length === 0) {
    return res.json({ summary: { totalSpend: 0, workOrdersWithCost: 0, averageCostPerWorkOrder: 0 }, breakdown: [] });
  }

  const { whereSql, replacements } = buildWhereClause(filters, accessiblePropertyIds);

  const [summaryRow] = await sequelize.query(
    `
    SELECT
      COALESCE(SUM(ce.amount), 0) AS total_spend,
      COUNT(DISTINCT wo.id) AS work_orders_with_cost
    FROM work_order_cost_entries ce
    JOIN work_orders wo ON wo.id = ce.work_order_id
    JOIN properties p ON p.id = wo.property_id
    WHERE ${whereSql}
    `,
    { replacements, type: QueryTypes.SELECT }
  );

  // Postgres NUMERIC aggregates come back through the driver as strings to
  // avoid float precision loss — parse explicitly before any arithmetic.
  const totalSpend = Number(summaryRow.total_spend);
  const workOrdersWithCost = Number(summaryRow.work_orders_with_cost);
  const averageCostPerWorkOrder = workOrdersWithCost > 0 ? totalSpend / workOrdersWithCost : 0;

  let breakdown = [];

  if (!filters.workTypeId && filters.category) {
    // Work Type level, scoped to the selected Category.
    const rows = await sequelize.query(
      `
      SELECT wo.work_type_id AS group_key, SUM(ce.amount) AS spend, COUNT(DISTINCT wo.id) AS work_orders
      FROM work_order_cost_entries ce
      JOIN work_orders wo ON wo.id = ce.work_order_id
      JOIN properties p ON p.id = wo.property_id
      WHERE ${whereSql}
      GROUP BY wo.work_type_id
      ORDER BY spend DESC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    const workTypeIds = rows.map((r) => r.group_key).filter(Boolean);
    const workTypes = workTypeIds.length ? await WorkType.findAll({ where: { id: workTypeIds }, attributes: ["id", "label"] }) : [];
    const labelById = Object.fromEntries(workTypes.map((w) => [w.id, w.label]));

    breakdown = rows.map((r) => ({
      key: r.group_key ?? "unspecified",
      label: r.group_key ? labelById[r.group_key] ?? "Unknown Work Type" : "Unspecified Work Type",
      spend: Number(r.spend),
      workOrders: Number(r.work_orders),
    }));
  } else if (!filters.workTypeId) {
    // Category level (portfolio- or property-wide).
    const rows = await sequelize.query(
      `
      SELECT COALESCE(wo.category, 'uncategorized') AS group_key, SUM(ce.amount) AS spend, COUNT(DISTINCT wo.id) AS work_orders
      FROM work_order_cost_entries ce
      JOIN work_orders wo ON wo.id = ce.work_order_id
      JOIN properties p ON p.id = wo.property_id
      WHERE ${whereSql}
      GROUP BY group_key
      ORDER BY spend DESC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    breakdown = rows.map((r) => ({
      key: r.group_key,
      label: r.group_key === "uncategorized" ? "Uncategorized" : CATEGORY_LABELS[r.group_key] ?? r.group_key,
      spend: Number(r.spend),
      workOrders: Number(r.work_orders),
    }));
  }
  // When workTypeId is set, breakdown stays empty — the frontend renders
  // the Work Order list (getMaintenanceSpendWorkOrders) at that depth
  // instead of a further ranked breakdown.

  res.json({ summary: { totalSpend, workOrdersWithCost, averageCostPerWorkOrder }, breakdown });
}

// The leaf drill-down level: the actual Work Orders behind a Category/Work
// Type/date/property scope. spendInPeriod is that Work Order's cost
// entries within THIS filter's date range only — not its lifetime total —
// so these rows always sum back to the breakdown row that led here.
// WorkOrderDetail remains the authority for a Work Order's full lifetime
// cost; this endpoint deliberately does not return that number.
export async function getMaintenanceSpendWorkOrders(req, res) {
  const { error, filters } = parseFilters(req.query, req.companyIds);
  if (error) return res.status(400).json({ error });

  const { error: accessError, accessiblePropertyIds } = await resolveAccessScope(req, filters);
  if (accessError) return res.status(404).json({ error: accessError });
  if (accessiblePropertyIds && accessiblePropertyIds.length === 0) {
    return res.json([]);
  }

  const { whereSql, replacements } = buildWhereClause(filters, accessiblePropertyIds);

  const rows = await sequelize.query(
    `
    SELECT
      wo.id, wo.title, wo.property_id, wo.location_id, wo.status, wo.completed_at, wo.created_at, wo.map_x, wo.map_y,
      p.name AS property_name,
      l.name AS location_name,
      SUM(ce.amount) AS spend_in_period
    FROM work_order_cost_entries ce
    JOIN work_orders wo ON wo.id = ce.work_order_id
    JOIN properties p ON p.id = wo.property_id
    LEFT JOIN locations l ON l.id = wo.location_id
    WHERE ${whereSql}
    GROUP BY wo.id, p.name, l.name
    ORDER BY spend_in_period DESC
    `,
    { replacements, type: QueryTypes.SELECT }
  );

  res.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      propertyId: r.property_id,
      propertyName: r.property_name,
      locationName: r.location_name,
      status: r.status,
      completedAt: r.completed_at,
      createdAt: r.created_at,
      mapX: r.map_x,
      mapY: r.map_y,
      spendInPeriod: Number(r.spend_in_period),
    }))
  );
}
