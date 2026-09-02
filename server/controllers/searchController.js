import { QueryTypes } from "sequelize";
import { sequelize } from "../models/index.js";
import { resolveSearchScope } from "../authorization/searchScope.js";
import { resolveDocumentAttachmentIds } from "../authorization/documentAccess.js";

// Global Search V1 — one endpoint, GET /api/search?q=…, that finds the
// core operational records a caller is authorized to see and their useful
// human-facing metadata, across ALL of the caller's active accessible
// Properties (it deliberately ignores the frontend Property Scope).
//
// Every entity is queried with its authorization already IN the SQL WHERE
// — resolveSearchScope() resolves the active accessible Property set and
// the People-visible Company set up front, and nothing here ever
// broad-queries then filters unauthorized rows in JavaScript. Archived
// Properties (and everything beneath them) and archived records are
// excluded by default.
//
// Matching (pg_trgm, PostgreSQL only): case-insensitive, partial/infix,
// multi-word (every token must appear), plus a conservative word-
// similarity fuzzy fallback for typos. Ranking is a deterministic integer
// score — exact > prefix > word-prefix > substring-in-name >
// substring-in-secondary-text > fuzzy-only — never anything opaque.

const SEARCHABLE_TYPES = ["property", "location", "work_order", "asset", "vendor", "document", "user"];

// Tiebreak only, for equal text scores across types — deterministic.
const TYPE_WEIGHT = { property: 6, location: 5, asset: 4, work_order: 3, vendor: 3, document: 2, user: 2 };

const WORK_ORDER_STATUS_LABELS = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In Progress",
  waiting: "Waiting",
  completed: "Completed",
};
const ROLE_LABELS = { owner: "Owner", admin: "Admin", manager: "Manager", technician: "Technician" };

const MAX_QUERY_LENGTH = 100;
const MAX_TOKENS = 6;
const PROBE_LIMIT = 26; // per type, autocomplete mode — one over the count ceiling of 25

function titleCase(value) {
  return String(value || "").replace(/(^|[\s_-])([a-z])/g, (_, sep, ch) => (sep === "_" || sep === "-" ? " " : sep) + ch.toUpperCase());
}

// Escape LIKE/ILIKE metacharacters so user input is always matched
// literally (Postgres' default LIKE escape character is backslash).
function escapeLike(value) {
  return value.replace(/[\\%_]/g, (c) => "\\" + c);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenize(qLower) {
  const tokens = qLower.split(/\s+/).filter((t) => t.length >= 2).slice(0, MAX_TOKENS);
  return tokens.length ? tokens : [qLower];
}

// `primary` = the entity's name/title SQL expression (never null).
// `searchText` = a lower()'d concatenation of the name plus its useful
// secondary/related text. Evaluated only on rows the WHERE already
// matched, so the CASE cost is bounded by LIMIT. The parent Property name
// is deliberately NOT folded into any entity's searchText — a Property is
// its own search hit, and folding its name into every Location/Asset/Work
// Order would turn a bare "riverbend" into a dump of everything on it.
// Cross-Property search still works because you match an entity by ITS
// own text (a Work Order by its title), and every result carries Property
// context so you always know where it lives.
function scoreSql(primary, searchText) {
  return `CASE
    WHEN lower(${primary}) = :qLower THEN 100
    WHEN ${primary} ILIKE :qPrefixLike THEN 85
    WHEN ${primary} ~* :qWordStartRe THEN 65
    WHEN ${primary} ILIKE :qSubLike THEN 45
    WHEN ${searchText} LIKE :qSubLike THEN 22
    WHEN :qLower <% ${primary} THEN 12
    ELSE 8
  END`;
}

// A row matches when EITHER every token appears in the (indexed) name,
// OR the query is word-similar to the name (typo fallback, also indexed),
// OR every token appears somewhere in the full search text (secondary/
// related fields — a sequential scan today, deliberately un-indexed at
// this scale; revisit by measurement).
function matchSql(primary, searchText, tokenCount) {
  const primaryTokens = Array.from({ length: tokenCount }, (_, i) => `${primary} ILIKE :t${i}`).join(" AND ");
  const textTokens = Array.from({ length: tokenCount }, (_, i) => `${searchText} LIKE :t${i}`).join(" AND ");
  return `(
    (${primaryTokens})
    OR (:qLower <% ${primary})
    OR (${textTokens})
  )`;
}

function baseTextParams(qLower, tokens) {
  const params = {
    qLower,
    qPrefixLike: escapeLike(qLower) + "%",
    qSubLike: "%" + escapeLike(qLower) + "%",
    qWordStartRe: "\\m" + escapeRegex(qLower),
  };
  tokens.forEach((t, i) => {
    params["t" + i] = "%" + escapeLike(t) + "%";
  });
  return params;
}

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
function safeInList(ids) {
  return ids.length ? ids : [ZERO_UUID];
}

// ── per-entity queries ──────────────────────────────────────────────────

async function searchProperties({ activePropertyIds, textParams, tokens, limit, offset }) {
  if (!activePropertyIds.length) return [];
  const primary = "p.name";
  const searchText = "lower(p.name || ' ' || coalesce(p.address, ''))";
  const rows = await sequelize.query(
    `SELECT p.id, p.name, p.address, ${scoreSql(primary, searchText)} AS score
     FROM properties p
     WHERE p.id IN (:activePropertyIds)
       AND ${matchSql(primary, searchText, tokens.length)}
     ORDER BY score DESC, p.created_at DESC, p.id
     LIMIT :limit OFFSET :offset`,
    { replacements: { activePropertyIds, limit, offset, ...textParams }, type: QueryTypes.SELECT }
  );
  return rows.map((r) => ({
    type: "property",
    id: r.id,
    title: r.name,
    subtitle: "Property",
    context: r.address || null,
    propertyId: r.id,
    propertyName: r.name,
    score: Number(r.score),
  }));
}

async function searchLocations({ activePropertyIds, textParams, tokens, limit, offset }) {
  if (!activePropertyIds.length) return [];
  const primary = "l.name";
  const searchText = "lower(l.name || ' ' || l.type)";
  const rows = await sequelize.query(
    `SELECT l.id, l.name, l.type, l.property_id, p.name AS property_name, ${scoreSql(primary, searchText)} AS score
     FROM locations l
     JOIN properties p ON p.id = l.property_id
     WHERE l.property_id IN (:activePropertyIds)
       AND l.archived_at IS NULL
       AND ${matchSql(primary, searchText, tokens.length)}
     ORDER BY score DESC, l.created_at DESC, l.id
     LIMIT :limit OFFSET :offset`,
    { replacements: { activePropertyIds, limit, offset, ...textParams }, type: QueryTypes.SELECT }
  );
  return rows.map((r) => ({
    type: "location",
    id: r.id,
    title: r.name,
    subtitle: "Location",
    context: `${r.property_name} · ${titleCase(r.type)}`,
    propertyId: r.property_id,
    propertyName: r.property_name,
    score: Number(r.score),
  }));
}

async function searchWorkOrders({ activePropertyIds, textParams, tokens, limit, offset }) {
  if (!activePropertyIds.length) return [];
  const primary = "wo.title";
  const searchText =
    "lower(wo.title || ' ' || coalesce(wo.description, '') || ' ' || coalesce(loc.name, '') || ' ' || coalesce(a.name, '') || ' ' || coalesce(wo.category, '') || ' ' || coalesce(wt.label, ''))";
  const rows = await sequelize.query(
    `SELECT wo.id, wo.title, wo.status, wo.property_id, p.name AS property_name, loc.name AS location_name,
       ${scoreSql(primary, searchText)} AS score
     FROM work_orders wo
     JOIN properties p ON p.id = wo.property_id
     LEFT JOIN locations loc ON loc.id = wo.location_id
     LEFT JOIN assets a ON a.id = wo.asset_id
     LEFT JOIN work_types wt ON wt.id = wo.work_type_id
     WHERE wo.property_id IN (:activePropertyIds)
       AND wo.archived_at IS NULL
       AND ${matchSql(primary, searchText, tokens.length)}
     ORDER BY score DESC, wo.created_at DESC, wo.id
     LIMIT :limit OFFSET :offset`,
    { replacements: { activePropertyIds, limit, offset, ...textParams }, type: QueryTypes.SELECT }
  );
  return rows.map((r) => ({
    type: "work_order",
    id: r.id,
    title: r.title,
    subtitle: "Work Order",
    context: `${r.property_name} · ${r.location_name || "No location"} · ${WORK_ORDER_STATUS_LABELS[r.status] || r.status}`,
    propertyId: r.property_id,
    propertyName: r.property_name,
    score: Number(r.score),
  }));
}

async function searchAssets({ activePropertyIds, textParams, tokens, limit, offset }) {
  if (!activePropertyIds.length) return [];
  const primary = "a.name";
  const searchText =
    "lower(a.name || ' ' || coalesce(a.category, '') || ' ' || coalesce(a.notes, '') || ' ' || coalesce(loc.name, ''))";
  const rows = await sequelize.query(
    `SELECT a.id, a.name, a.property_id, p.name AS property_name, loc.name AS location_name,
       ${scoreSql(primary, searchText)} AS score
     FROM assets a
     JOIN properties p ON p.id = a.property_id
     LEFT JOIN locations loc ON loc.id = a.location_id
     WHERE a.property_id IN (:activePropertyIds)
       AND a.archived_at IS NULL
       AND ${matchSql(primary, searchText, tokens.length)}
     ORDER BY score DESC, a.created_at DESC, a.id
     LIMIT :limit OFFSET :offset`,
    { replacements: { activePropertyIds, limit, offset, ...textParams }, type: QueryTypes.SELECT }
  );
  return rows.map((r) => ({
    type: "asset",
    id: r.id,
    title: r.name,
    subtitle: "Asset",
    context: r.location_name ? `${r.property_name} · ${r.location_name}` : r.property_name,
    propertyId: r.property_id,
    propertyName: r.property_name,
    score: Number(r.score),
  }));
}

async function searchVendors({ companyIds, textParams, tokens, limit, offset }) {
  const primary = "v.name";
  const searchText =
    "lower(v.name || ' ' || coalesce(v.category, '') || ' ' || coalesce(v.contact_name, '') || ' ' || coalesce(v.email, '') || ' ' || coalesce(v.phone, ''))";
  const rows = await sequelize.query(
    `SELECT v.id, v.name, v.category, v.status,
       (${scoreSql(primary, searchText)}) - CASE WHEN v.status = 'inactive' THEN 20 ELSE 0 END AS score
     FROM vendors v
     WHERE v.company_id IN (:companyIds)
       AND ${matchSql(primary, searchText, tokens.length)}
     ORDER BY score DESC, v.created_at DESC, v.id
     LIMIT :limit OFFSET :offset`,
    { replacements: { companyIds, limit, offset, ...textParams }, type: QueryTypes.SELECT }
  );
  return rows.map((r) => {
    const parts = ["Vendor"];
    if (r.category) parts.push(r.category);
    if (r.status === "inactive") parts.push("Inactive");
    return {
      type: "vendor",
      id: r.id,
      title: r.name,
      subtitle: "Vendor",
      context: parts.join(" · "),
      propertyId: null,
      propertyName: null,
      score: Number(r.score),
    };
  });
}

async function searchDocuments({ companyIds, activePropertyIds, textParams, tokens, limit, offset }) {
  // Same visibility rule as documentController.listDocuments (see
  // authorization/documentAccess.js): property/asset/work-order-attached
  // Documents are visible only through an accessible active Property;
  // Vendor-attached Documents are always Company-level visible.
  const { assetIds, workOrderIds } = await resolveDocumentAttachmentIds(activePropertyIds);
  const primary = "d.name";
  const searchText =
    "lower(d.name || ' ' || d.original_filename || ' ' || d.category || ' ' || coalesce(d.notes, '') || ' ' || coalesce(dp.name, '') || ' ' || coalesce(a.name, '') || ' ' || coalesce(w.title, '') || ' ' || coalesce(ven.name, ''))";
  const rows = await sequelize.query(
    `SELECT d.id, d.name, d.property_id, d.asset_id, d.work_order_id, d.vendor_id,
       dp.name AS direct_property_name,
       a.name AS asset_name, ap.id AS asset_property_id, ap.name AS asset_property_name,
       w.title AS wo_title, wp.id AS wo_property_id, wp.name AS wo_property_name,
       ven.name AS vendor_name,
       ${scoreSql(primary, searchText)} AS score
     FROM documents d
     LEFT JOIN properties dp ON dp.id = d.property_id
     LEFT JOIN assets a ON a.id = d.asset_id
     LEFT JOIN properties ap ON ap.id = a.property_id
     LEFT JOIN work_orders w ON w.id = d.work_order_id
     LEFT JOIN properties wp ON wp.id = w.property_id
     LEFT JOIN vendors ven ON ven.id = d.vendor_id
     WHERE d.company_id IN (:companyIds)
       AND d.archived_at IS NULL
       AND (
         d.property_id IN (:docPropertyIds)
         OR d.asset_id IN (:docAssetIds)
         OR d.work_order_id IN (:docWorkOrderIds)
         OR d.vendor_id IS NOT NULL
       )
       AND ${matchSql(primary, searchText, tokens.length)}
     ORDER BY score DESC, d.created_at DESC, d.id
     LIMIT :limit OFFSET :offset`,
    {
      replacements: {
        companyIds,
        docPropertyIds: safeInList(activePropertyIds),
        docAssetIds: safeInList(assetIds),
        docWorkOrderIds: safeInList(workOrderIds),
        limit,
        offset,
        ...textParams,
      },
      type: QueryTypes.SELECT,
    }
  );
  return rows.map((r) => {
    let attachmentType;
    let targetLabel;
    let propertyId = null;
    let propertyName = null;
    if (r.property_id) {
      attachmentType = "Property";
      targetLabel = r.direct_property_name;
      propertyId = r.property_id;
      propertyName = r.direct_property_name;
    } else if (r.asset_id) {
      attachmentType = "Asset";
      targetLabel = r.asset_name;
      propertyId = r.asset_property_id;
      propertyName = r.asset_property_name;
    } else if (r.work_order_id) {
      attachmentType = "Work Order";
      targetLabel = r.wo_title;
      propertyId = r.wo_property_id;
      propertyName = r.wo_property_name;
    } else {
      attachmentType = "Vendor";
      targetLabel = r.vendor_name;
    }
    return {
      type: "document",
      id: r.id,
      title: r.name,
      subtitle: "Document",
      context: `Document · ${attachmentType}${targetLabel ? `: ${targetLabel}` : ""}`,
      propertyId,
      propertyName,
      score: Number(r.score),
    };
  });
}

async function searchUsers({ usersManageCompanyIds, textParams, tokens, limit, offset }) {
  const primary = "coalesce(u.display_name, u.email)";
  const searchText = "lower(coalesce(u.display_name, '') || ' ' || u.email)";
  const rows = await sequelize.query(
    `SELECT x.id, x.display_name, x.email, x.role, x.score FROM (
       SELECT DISTINCT ON (u.id) u.id, u.display_name, u.email, m.role, u.created_at,
         ${scoreSql(primary, searchText)} AS score
       FROM users u
       JOIN memberships m ON m.user_id = u.id
       WHERE m.company_id IN (:usersManageCompanyIds)
         AND ${matchSql(primary, searchText, tokens.length)}
       ORDER BY u.id, score DESC
     ) x
     ORDER BY x.score DESC, x.created_at DESC, x.id
     LIMIT :limit OFFSET :offset`,
    { replacements: { usersManageCompanyIds, limit, offset, ...textParams }, type: QueryTypes.SELECT }
  );
  return rows.map((r) => ({
    type: "user",
    id: r.id,
    title: r.display_name || r.email,
    subtitle: "Person",
    context: `Person · ${ROLE_LABELS[r.role] || r.role}`,
    propertyId: null,
    propertyName: null,
    score: Number(r.score),
  }));
}

function stripScore({ score, ...rest }) {
  return rest;
}

// ── handler ────────────────────────────────────────────────────────────

export async function globalSearch(req, res) {
  const rawQ = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!rawQ) return res.status(400).json({ error: "A search query (q) is required." });
  if (rawQ.length < 2) return res.status(400).json({ error: "Search query must be at least 2 characters." });
  const q = rawQ.slice(0, MAX_QUERY_LENGTH);

  const typeParam = req.query.type;
  if (typeParam !== undefined && !SEARCHABLE_TYPES.includes(typeParam)) {
    return res.status(400).json({ error: `type must be one of: ${SEARCHABLE_TYPES.join(", ")}` });
  }

  let limit = parseInt(req.query.limit, 10);
  if (!Number.isFinite(limit)) limit = typeParam ? 20 : 12;
  limit = Math.max(1, Math.min(limit, 50));

  let offset = 0;
  if (typeParam) {
    const parsed = parseInt(req.query.offset, 10);
    if (Number.isFinite(parsed) && parsed > 0) offset = Math.min(parsed, 5000);
  }

  const qLower = q.toLowerCase();
  const tokens = tokenize(qLower);
  const textParams = baseTextParams(qLower, tokens);

  const scope = await resolveSearchScope(req);
  const canSeePeople = scope.usersManageCompanyIds.length > 0;

  const args = { ...scope, textParams, tokens };

  const RUNNERS = {
    property: (opts) => searchProperties({ ...args, ...opts }),
    location: (opts) => searchLocations({ ...args, ...opts }),
    work_order: (opts) => searchWorkOrders({ ...args, ...opts }),
    asset: (opts) => searchAssets({ ...args, ...opts }),
    vendor: (opts) => searchVendors({ ...args, ...opts }),
    document: (opts) => searchDocuments({ ...args, ...opts }),
    user: (opts) => searchUsers({ ...args, ...opts }),
  };

  // ── Filtered mode: one entity type, paginated ──
  if (typeParam) {
    if (typeParam === "user" && !canSeePeople) {
      return res.json({ query: q, results: [], hasMore: false });
    }
    const rows = await RUNNERS[typeParam]({ limit: limit + 1, offset });
    const hasMore = rows.length > limit;
    return res.json({ query: q, results: rows.slice(0, limit).map(stripScore), hasMore });
  }

  // ── Autocomplete / "All results" mode: every authorized type, merged ──
  const types = SEARCHABLE_TYPES.filter((t) => t !== "user" || canSeePeople);
  const settled = await Promise.all(types.map(async (t) => [t, await RUNNERS[t]({ limit: PROBE_LIMIT, offset: 0 })]));

  const counts = {};
  let merged = [];
  let anyOverflowed = false;
  for (const [type, rows] of settled) {
    counts[type] = Math.min(rows.length, 25);
    if (rows.length > 25) anyOverflowed = true;
    merged = merged.concat(rows);
  }

  // Deterministic merge: score, then a fixed per-type weight, then leave
  // the SQL's own (score, created_at DESC, id) order intact for ties
  // (Array.prototype.sort is stable in Node).
  merged.sort((a, b) => b.score - a.score || TYPE_WEIGHT[b.type] - TYPE_WEIGHT[a.type]);

  const results = merged.slice(0, limit);
  const totalMatched = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const hasMore = anyOverflowed || totalMatched > results.length;

  res.json({ query: q, results: results.map(stripScore), counts, hasMore });
}
