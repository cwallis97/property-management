import { Op, QueryTypes } from "sequelize";
import { sequelize, WorkType, Location, Property } from "../models/index.js";
import { WORK_ORDER_CATEGORIES } from "../models/WorkType.js";
import { WORK_ORDER_STATUSES } from "../models/WorkOrder.js";
import { getAccessiblePropertyIds } from "../authorization/propertyAccess.js";
import { CAPABILITIES, requireCapability } from "../authorization/capabilities.js";

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

const STATUS_LABELS = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In Progress",
  waiting: "Waiting",
  completed: "Completed",
};

function isValidUUID(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function isValidDateOnly(value) {
  if (typeof value !== "string" || !DATE_ONLY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Shared by every report endpoint below: Property/Category/Work Type are
// the same concepts and the same validation everywhere a report accepts
// them, so this is the one place that logic lives. Deliberately does NOT
// include date range — Maintenance Spend filters dates on Cost Entries
// (ce.cost_date) while the Work Orders Report filters dates on the Work
// Order itself (wo.created_at); these are genuinely different questions
// ("money incurred in this window" vs. "repairs reported in this window"),
// not an accidental split, so each endpoint parses its own date fields
// rather than pretending there's one shared date filter underneath both.
// See getWorkOrdersReport's own comment for the full reasoning.
function parseCommonFilters(query, companyIds) {
  const filters = { companyIds };

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
    // not) — not a UUID, handled specially in each WHERE-clause builder so
    // that spend/counts never dead-end just because it lacks a Work Type.
    if (query.workTypeId !== "unspecified" && !isValidUUID(query.workTypeId)) {
      return { error: "Invalid workTypeId." };
    }
    filters.workTypeId = query.workTypeId;
  }

  return { filters };
}

// Validates the full Maintenance Spend filter set (adds the cost-date range
// on top of the shared Property/Category/Work Type filters above).
function parseFilters(query, companyIds) {
  const { error, filters } = parseCommonFilters(query, companyIds);
  if (error) return { error };

  if (query.startDate !== undefined && query.startDate !== "") {
    if (!isValidDateOnly(query.startDate)) return { error: "startDate must be a valid date in YYYY-MM-DD format." };
    filters.startDate = query.startDate;
  }
  if (query.endDate !== undefined && query.endDate !== "") {
    if (!isValidDateOnly(query.endDate)) return { error: "endDate must be a valid date in YYYY-MM-DD format." };
    filters.endDate = query.endDate;
  }

  return { filters };
}

// This is the actual tenant/security boundary every report endpoint shares
// and must reuse verbatim, never reimplement: financial data is treated
// like any other authorization-sensitive surface (see the Property Access
// architecture report's explicit "Reports like financial authorization"
// framing) — a restricted member's aggregates must never include an
// inaccessible Property's cost entries, and an explicit request for one
// must fail loudly rather than silently returning a plausible-looking zero
// (which would read as "no spend" instead of "not allowed"). Returns
// { error } or { accessiblePropertyIds } (null = every Property in the
// caller's companies, same convention as getAccessiblePropertyIds itself).
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
  if (!requireCapability(req, res, req.companyIds[0], CAPABILITIES.REPORTS_READ)) return;

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
  if (!requireCapability(req, res, req.companyIds[0], CAPABILITIES.REPORTS_READ)) return;

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

// ---------------------------------------------------------------------
// Work Orders Report — the ONE shared dataset behind both Reports'
// spreadsheet-first "Work Orders" tab and Property Site Map's "History"
// mode. Same filters, same query, same authorization, same numbers —
// Reports renders these rows as a table; Site Map renders the same rows
// spatially (plus the hotspot grouping below). Neither surface computes
// its own count/spend independently; both call this endpoint.
//
// A deliberately different query shape from Maintenance Spend above, for a
// deliberate reason: Maintenance Spend answers "where did money leave the
// building" (cost-entry-first, INNER JOIN — a Work Order with no cost
// entry in the window simply isn't part of that question). This endpoint
// answers "what repairs happened, and separately, what did they cost"
// (Work-Order-first, LEFT JOIN) — a repair with $0 recorded cost is still
// a repair and must still count, which an INNER JOIN from cost entries can
// never produce. These are two real, different, both-correct answers to
// "how much did water repairs cost this year" and are not reconciled into
// one shared query on purpose — see docs/Product-Bible.md.
//
// Date basis: wo.created_at (when the repair was reported) — never
// ce.cost_date. Spend shown per Work Order is that Work Order's FULL
// recorded cost (every Cost Entry it has, regardless of the Cost Entry's
// own date) — never a period-sliced amount — so a Work Order's spend here
// is always explainable as "the sum of this Work Order's Cost Entries,"
// full stop, with no second hidden date filter silently narrowing it.
//
// Cost aggregation happens in a pre-aggregated subquery (one row per
// work_order_id) joined via LEFT JOIN — this is what guarantees a Work
// Order is never double-counted regardless of how many Cost Entries it
// has, and that a zero-Cost-Entry Work Order still appears with spend 0
// (COALESCE) rather than being silently dropped the way an INNER JOIN
// would drop it.
//
// propertyId is OPTIONAL, unlike the earlier Spatial-Reporting-only design
// — Reports' Work Orders tab needs a Company-wide "All Properties" view
// (matching Maintenance Spend's existing convention), while Site Map's
// History mode always passes its own Property's id. When present, it's
// still validated against the caller's own Companies exactly as before
// (404, never a distinguishable error) — that check only applies when a
// specific Property was actually requested.
function parseWorkOrdersReportFilters(query, companyIds) {
  const { error, filters } = parseCommonFilters(query, companyIds);
  if (error) return { error };

  if (query.startDate !== undefined && query.startDate !== "") {
    if (!isValidDateOnly(query.startDate)) return { error: "startDate must be a valid date in YYYY-MM-DD format." };
    filters.startDate = query.startDate;
  }
  if (query.endDate !== undefined && query.endDate !== "") {
    if (!isValidDateOnly(query.endDate)) return { error: "endDate must be a valid date in YYYY-MM-DD format." };
    filters.endDate = query.endDate;
  }
  if (query.status !== undefined && query.status !== "") {
    if (!WORK_ORDER_STATUSES.includes(query.status)) {
      return { error: `status must be one of: ${WORK_ORDER_STATUSES.join(", ")}` };
    }
    filters.status = query.status;
  }

  return { filters };
}

function buildWorkOrdersReportWhereClause(filters, accessiblePropertyIds) {
  const conditions = ["p.company_id IN (:companyIds)", "wo.archived_at IS NULL"];
  const replacements = { companyIds: filters.companyIds };

  if (accessiblePropertyIds) {
    conditions.push("p.id IN (:accessiblePropertyIds)");
    replacements.accessiblePropertyIds = accessiblePropertyIds;
  }
  if (filters.propertyId) {
    conditions.push("wo.property_id = :propertyId");
    replacements.propertyId = filters.propertyId;
  }
  if (filters.startDate) {
    conditions.push("wo.created_at >= :startDate");
    replacements.startDate = filters.startDate;
  }
  if (filters.endDate) {
    // wo.created_at is a full timestamp — an inclusive end DATE means
    // "through the end of that calendar day," not midnight at its start.
    conditions.push("wo.created_at < (:endDate::date + INTERVAL '1 day')");
    replacements.endDate = filters.endDate;
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
  if (filters.status) {
    conditions.push("wo.status = :status");
    replacements.status = filters.status;
  }

  return { whereSql: conditions.join(" AND "), replacements };
}

// Hotspot grouping key: the Work Order's own Location, falling back to its
// Asset's Location when it has none — the same fallback
// utils/workOrders.js#resolveWorkOrderContext already applies on the
// frontend elsewhere, so a Work Order attached to an Asset (but not
// directly to a Location) still groups with the physical place it
// actually is. A Work Order with neither collapses into one synthetic
// "Unspecified Location" bucket — real analytical signal (these ARE
// repairs, they still count toward the report total), just not tied to a
// single named place.
//
// Every matching Work Order belongs to EXACTLY one group (its resolved
// Location id, or the null/"unspecified" bucket) — a true partition, which
// is what makes the reconciliation invariant
// (sum(hotspot.workOrderCount) === summary.workOrderCount) hold by
// construction, not by coincidence. Grouping is safe even Company-wide
// (propertyId omitted): a Location always belongs to exactly one Property,
// so two different Properties' Locations never collide into one group
// merely by sharing a display name.
export async function getWorkOrdersReport(req, res) {
  if (!requireCapability(req, res, req.companyIds[0], CAPABILITIES.REPORTS_READ)) return;

  const { error, filters } = parseWorkOrdersReportFilters(req.query, req.companyIds);
  if (error) return res.status(400).json({ error });

  // Only when a specific Property was actually requested: this app's
  // single-resource convention (getProperty, getWorkOrderHistory, etc.) —
  // a propertyId that doesn't resolve to one of the caller's own Companies
  // 404s explicitly, the same "looks identical to nonexistent" convention
  // requirePropertyAccess itself already documents. Omitted entirely, this
  // step is skipped — a Company-wide request has no single Property to
  // validate, and out-of-Company noise is already excluded by
  // buildWorkOrdersReportWhereClause's own `p.company_id IN (...)` filter,
  // the same convention Maintenance Spend's buildWhereClause already uses.
  if (filters.propertyId) {
    const property = await Property.findOne({ where: { id: filters.propertyId, companyId: { [Op.in]: req.companyIds } } });
    if (!property) return res.status(404).json({ error: "Property not found." });
  }

  const { error: accessError, accessiblePropertyIds } = await resolveAccessScope(req, filters);
  if (accessError) return res.status(404).json({ error: accessError });
  if (accessiblePropertyIds && accessiblePropertyIds.length === 0) {
    return res.json({
      summary: { workOrderCount: 0, totalSpend: 0, mappedCount: 0, unmappedCount: 0, locationsRepresented: 0 },
      hotspots: [],
      workOrders: [],
    });
  }

  const { whereSql, replacements } = buildWorkOrdersReportWhereClause(filters, accessiblePropertyIds);

  // resolved_location_id: wo.location_id, or (when null) the linked
  // Asset's location_id. COALESCE(costs.total, 0) is what keeps a
  // zero-Cost-Entry Work Order in the result set with spend 0 rather than
  // disappearing — the LEFT JOIN never excludes it. p.name is only used
  // for Reports' "All Properties" table (a Property column); Site Map's
  // History mode already knows its own Property and simply ignores it.
  const rows = await sequelize.query(
    `
    SELECT
      wo.id, wo.title, wo.status, wo.category, wo.work_type_id, wo.created_at, wo.completed_at,
      wo.map_x, wo.map_y, wo.property_id,
      p.name AS property_name,
      COALESCE(wo.location_id, a.location_id) AS resolved_location_id,
      COALESCE(costs.total, 0) AS spend
    FROM work_orders wo
    JOIN properties p ON p.id = wo.property_id
    LEFT JOIN assets a ON a.id = wo.asset_id
    LEFT JOIN (
      SELECT work_order_id, SUM(amount) AS total
      FROM work_order_cost_entries
      GROUP BY work_order_id
    ) costs ON costs.work_order_id = wo.id
    WHERE ${whereSql}
    ORDER BY wo.created_at ASC, wo.id ASC
    `,
    { replacements, type: QueryTypes.SELECT }
  );

  const workTypeIds = [...new Set(rows.map((r) => r.work_type_id).filter(Boolean))];
  const workTypes = workTypeIds.length ? await WorkType.findAll({ where: { id: workTypeIds }, attributes: ["id", "label"] }) : [];
  const workTypeLabelById = Object.fromEntries(workTypes.map((w) => [w.id, w.label]));

  const locationIds = [...new Set(rows.map((r) => r.resolved_location_id).filter(Boolean))];
  const locations = locationIds.length ? await Location.findAll({ where: { id: locationIds }, attributes: ["id", "name"] }) : [];
  const locationNameById = Object.fromEntries(locations.map((l) => [l.id, l.name]));

  const workOrders = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    statusLabel: STATUS_LABELS[r.status] ?? r.status,
    category: r.category,
    categoryLabel: r.category ? CATEGORY_LABELS[r.category] ?? r.category : null,
    workTypeId: r.work_type_id,
    workTypeLabel: r.work_type_id ? workTypeLabelById[r.work_type_id] ?? "Unknown Work Type" : null,
    propertyId: r.property_id,
    propertyName: r.property_name,
    locationId: r.resolved_location_id,
    locationLabel: r.resolved_location_id ? locationNameById[r.resolved_location_id] ?? "Unknown Location" : "Unspecified Location",
    createdAt: r.created_at,
    completedAt: r.completed_at,
    mapX: r.map_x,
    mapY: r.map_y,
    spend: Number(r.spend),
  }));

  const workOrderCount = workOrders.length;
  // Sum once over the same de-duplicated per-Work-Order rows the response
  // itself returns — never a second, independently-computed SQL SUM — so
  // summary.totalSpend is mechanically guaranteed to equal
  // sum(workOrders[].spend), which is exactly the reconciliation invariant
  // this endpoint is required to hold.
  const totalSpend = workOrders.reduce((sum, wo) => sum + wo.spend, 0);
  const mappedCount = workOrders.filter((wo) => wo.mapX != null && wo.mapY != null).length;
  const unmappedCount = workOrderCount - mappedCount;

  // Group into hotspots. Map keyed by resolved_location_id, with `null`
  // (via a stable sentinel string, since Map treats null as a real key
  // fine but a raw JS object wouldn't) representing the single
  // "Unspecified Location" bucket.
  const groups = new Map();
  for (const wo of workOrders) {
    const key = wo.locationId ?? "__unspecified__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(wo);
  }

  const hotspots = [...groups.entries()].map(([key, members]) => {
    const locationId = key === "__unspecified__" ? null : key;
    const spend = members.reduce((sum, wo) => sum + wo.spend, 0);
    // Deterministic representative marker position: the EARLIEST matching
    // Work Order (by created_at, id tiebreak — the SQL above is already
    // sorted this way) in this group that has coordinates. Deliberately
    // never "most recent" (would make the marker visibly jump every time a
    // new repair is logged) and never an average (could place the marker
    // somewhere physically meaningless if the underlying coordinates were
    // ever imprecise) — see docs/Product-Bible.md's Spatial Reporting
    // entry for the full rationale. A group with zero mapped members still
    // becomes a real hotspot row with mapX/mapY left null: analytically
    // real, just not spatially placed (never dropped).
    //
    // "Unspecified Location" is a grab-bag of otherwise-unrelated physical
    // places, not one real place — it never gets a single representative
    // marker (that would fabricate geography this data doesn't actually
    // know). Its own mapped members still render individually on the map
    // from the authoritative `workOrders` array; they're simply never
    // collapsed into one fake shared point.
    const representative = locationId ? members.find((wo) => wo.mapX != null && wo.mapY != null) : null;

    return {
      locationId,
      locationLabel: locationId ? locationNameById[locationId] ?? "Unknown Location" : "Unspecified Location",
      workOrderCount: members.length,
      spend,
      mapX: representative ? representative.mapX : null,
      mapY: representative ? representative.mapY : null,
      workOrderIds: members.map((wo) => wo.id),
    };
  });

  // Ranking: repair count first (the plain-language meaning of "hotspot"),
  // spend as tiebreak, then label for full determinism — never a random or
  // insertion-order-dependent tie among equal-count/equal-spend groups.
  hotspots.sort((a, b) => b.workOrderCount - a.workOrderCount || b.spend - a.spend || a.locationLabel.localeCompare(b.locationLabel));

  // Real named Locations only — the "Unspecified Location" bucket isn't an
  // actual place, so it never counts toward "Locations represented."
  const locationsRepresented = hotspots.filter((h) => h.locationId !== null).length;

  res.json({
    summary: { workOrderCount, totalSpend, mappedCount, unmappedCount, locationsRepresented },
    hotspots,
    workOrders,
  });
}
