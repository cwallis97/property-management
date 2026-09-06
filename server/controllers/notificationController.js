import { Op } from "sequelize";
import { Notification, Company, Property } from "../models/index.js";
import { clampLimit, encodeCursor, decodeCursor, cursorWhereClause, isValidUUID } from "./auditEventController.js";

// Notification Center V1 — every endpoint is strictly recipient-self-
// scoped: the caller only ever sees / mutates notifications addressed to
// one of their OWN Memberships. The filter is `recipient_user_id =
// req.user.id` (spans every Membership the caller has, never
// req.companyIds[0]); each row carries its own Company + Property context
// so a multi-company user can tell where each belongs. There is no
// Admin / organization-wide notification surface.
//
// Serialization reads ONLY the notification's own snapshot columns (+ the
// Company/Property name for display). It never joins or re-checks the
// linked entity's current accessibility — a notification about a Property
// a member has since lost access to stays fully readable, and the Center
// never errors because entity_id no longer resolves.

const NOTIFICATION_LIST_LIMIT = 20;

function serializeNotification(n) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    entityType: n.entityType,
    entityId: n.entityId,
    propertyId: n.propertyId,
    propertyName: n.property ? n.property.name : null,
    companyId: n.companyId,
    companyName: n.company ? n.company.name : null,
    actorName: n.actorName,
    metadata: n.metadata ?? null,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}

async function unreadCountFor(userId) {
  return Notification.count({ where: { recipientUserId: userId, readAt: null } });
}

// GET /api/notifications?filter=all|unread&limit=&cursor=
export async function listNotifications(req, res) {
  const filter = req.query.filter === "unread" ? "unread" : "all";
  const limit = clampLimit(req.query.limit, { defaultLimit: NOTIFICATION_LIST_LIMIT });

  const where = { recipientUserId: req.user.id };
  if (filter === "unread") where.readAt = null;

  const cursor = decodeCursor(req.query.cursor);
  const andConditions = [];
  if (cursor) andConditions.push(cursorWhereClause(cursor));
  if (andConditions.length) where[Op.and] = andConditions;

  const rows = await Notification.findAll({
    where,
    include: [
      { model: Company, as: "company", attributes: ["id", "name"] },
      { model: Property, as: "property", attributes: ["id", "name"] },
    ],
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"],
    ],
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  res.json({
    notifications: page.map(serializeNotification),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
    unreadCount: await unreadCountFor(req.user.id),
  });
}

// GET /api/notifications/unread-count  — the lightweight endpoint the
// Header polls every 60s while the tab is visible.
export async function getUnreadCount(req, res) {
  res.json({ count: await unreadCountFor(req.user.id) });
}

// PATCH /api/notifications/:id/read
export async function markNotificationRead(req, res) {
  if (!isValidUUID(req.params.id)) return res.status(400).json({ error: "Invalid notification id." });

  // Scoped to the caller's own — a notification addressed to another
  // Membership is indistinguishable from nonexistent (404, never 403).
  const notification = await Notification.findOne({
    where: { id: req.params.id, recipientUserId: req.user.id },
  });
  if (!notification) return res.status(404).json({ error: "Notification not found." });

  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }

  res.json({ id: notification.id, readAt: notification.readAt, unreadCount: await unreadCountFor(req.user.id) });
}

// POST /api/notifications/read-all   body: optional { before } ISO string
// — only rows created at/before `before` are marked read, so a
// notification that arrives between the client's last fetch and this
// click isn't silently marked read.
export async function markAllNotificationsRead(req, res) {
  const where = { recipientUserId: req.user.id, readAt: null };

  if (req.body && req.body.before !== undefined) {
    const before = new Date(req.body.before);
    if (Number.isNaN(before.getTime())) return res.status(400).json({ error: "before must be a valid timestamp." });
    where.createdAt = { [Op.lte]: before };
  }

  const [updated] = await Notification.update({ readAt: new Date() }, { where });
  res.json({ updated, unreadCount: await unreadCountFor(req.user.id) });
}
