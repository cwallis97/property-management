import { Op } from "sequelize";
import { AuditEvent, Property } from "../models/index.js";
import { CAPABILITIES, requireCapability } from "../authorization/capabilities.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function isValidUUID(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function clampLimit(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

// Opaque only in the sense of "not something a caller needs to hand-build
// correctly" — not a security boundary (the cursor only ever narrows a
// read the caller is already authorized for). {createdAt, id} is the exact
// keyset the ORDER BY below uses, so decode/encode are each other's
// mirror image.
function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt, id: row.id })).toString("base64url");
}

function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime()) || !isValidUUID(parsed.id)) return null;
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function serializeAuditEvent(event) {
  return {
    id: event.id,
    createdAt: event.createdAt,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    entityLabel: event.entityLabel,
    propertyId: event.propertyId,
    propertyName: event.property ? event.property.name : null,
    actor: {
      membershipId: event.actorMembershipId,
      userId: event.actorUserId,
      role: event.actorRole,
      name: event.actorName,
      email: event.actorEmail,
    },
    before: event.before,
    after: event.after,
    metadata: event.metadata,
  };
}

// Server-authorized Company context — never an implicit req.companyIds[0]
// assumption baked into the security model. Mirrors createProperty's own
// "optional explicit id, always validated against req.companyIds" pattern:
// a caller may omit companyId (today's single-Company-per-session UX,
// preserved for free) or pass one explicitly, but either way the ONLY
// thing that ever grants access is req.companyIds.includes(...) — never
// array order, never trust of the value itself.
export async function listAuditEvents(req, res) {
  const { query } = req;
  const targetCompanyId = query.companyId || req.companyIds[0];
  if (!targetCompanyId || !req.companyIds.includes(targetCompanyId)) {
    return res.status(403).json({ error: "You are not a member of that company." });
  }
  if (!requireCapability(req, res, targetCompanyId, CAPABILITIES.AUDIT_LOG_READ)) return;

  const andConditions = [{ companyId: targetCompanyId }];

  if (query.action !== undefined) {
    andConditions.push({ action: query.action });
  }
  if (query.entityType !== undefined) {
    andConditions.push({ entityType: query.entityType });
  }
  if (query.entityId !== undefined) {
    if (!isValidUUID(query.entityId)) return res.status(400).json({ error: "Invalid entityId." });
    andConditions.push({ entityId: query.entityId });
  }
  if (query.propertyId !== undefined) {
    if (!isValidUUID(query.propertyId)) return res.status(400).json({ error: "Invalid propertyId." });
    andConditions.push({ propertyId: query.propertyId });
  }
  if (query.actorMembershipId !== undefined) {
    if (!isValidUUID(query.actorMembershipId)) return res.status(400).json({ error: "Invalid actorMembershipId." });
    andConditions.push({ actorMembershipId: query.actorMembershipId });
  }
  if (query.from !== undefined || query.to !== undefined) {
    const range = {};
    if (query.from !== undefined) {
      const from = new Date(query.from);
      if (Number.isNaN(from.getTime())) return res.status(400).json({ error: "Invalid from date." });
      range[Op.gte] = from;
    }
    if (query.to !== undefined) {
      const to = new Date(query.to);
      if (Number.isNaN(to.getTime())) return res.status(400).json({ error: "Invalid to date." });
      range[Op.lte] = to;
    }
    andConditions.push({ createdAt: range });
  }

  const cursor = decodeCursor(query.cursor);
  if (query.cursor && !cursor) return res.status(400).json({ error: "Invalid cursor." });
  if (cursor) {
    andConditions.push({
      [Op.or]: [
        { createdAt: { [Op.lt]: cursor.createdAt } },
        { [Op.and]: [{ createdAt: cursor.createdAt }, { id: { [Op.lt]: cursor.id } }] },
      ],
    });
  }

  const limit = clampLimit(query.limit);

  // Fetch one extra row past the page size — its presence (not its
  // content) is all that's needed to know whether a next page exists,
  // without a separate COUNT query.
  const rows = await AuditEvent.findAll({
    where: { [Op.and]: andConditions },
    include: { model: Property, as: "property", attributes: ["id", "name"] },
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"],
    ],
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeCursor(page[page.length - 1]) : null;

  res.json({ events: page.map(serializeAuditEvent), nextCursor });
}
