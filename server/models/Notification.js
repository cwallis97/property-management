import { DataTypes, Model } from "sequelize";

// Canonical, stable notification-type keys — never a human-readable
// string. UI wording (client/src/utils/notifications.js) may change freely
// without ever touching stored rows or this list's meaning. One mutation
// may produce several notifications of different types.
//
//   work_order.assigned          — you are the new assignee
//   work_order.reassigned        — you were the previous assignee; it moved
//                                  (metadata carries previous → new; if new
//                                  is null the copy says "no longer assigned")
//   work_order.reopened          — a Work Order assigned to you went
//                                  completed → not-completed
//   work_order.urgent_created    — an urgent Work Order was created on a
//                                  Property you manage
//   membership.role_changed      — your role changed
//   membership.property_access_changed — your Property access changed
//
// work_order.overdue is deliberately DEFERRED to a future Production Jobs
// V1 milestone (there is no scheduler/background-worker infrastructure
// today; an overdue notification created only when the assignee next opens
// the app is semantically weaker than a real time-triggered one). The
// dedupe_key column exists now so it can be added cleanly later.
export const NOTIFICATION_TYPES = [
  "work_order.assigned",
  "work_order.reassigned",
  "work_order.reopened",
  "work_order.urgent_created",
  "membership.role_changed",
  "membership.property_access_changed",
];

export class Notification extends Model {}

export function initNotificationModel(sequelize) {
  Notification.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      companyId: { type: DataTypes.UUID, allowNull: false, field: "company_id" },
      // Primary "who" — role/Company/Property Access are all Membership
      // concepts. recipientUserId is a denormalised convenience so the
      // inbox query spans every Membership a User has in one WHERE.
      recipientMembershipId: { type: DataTypes.UUID, allowNull: false, field: "recipient_membership_id" },
      recipientUserId: { type: DataTypes.UUID, allowNull: false, field: "recipient_user_id" },
      type: { type: DataTypes.STRING, allowNull: false, validate: { isIn: [NOTIFICATION_TYPES] } },
      // Rendered, human-readable, captured once at write time. "Water Leak
      // reassigned" / "Riverbend · Unit 12" — never a canonical key, never
      // a UUID, never re-derived from a live (mutable) row on read.
      title: { type: DataTypes.STRING, allowNull: false },
      body: { type: DataTypes.STRING, allowNull: true },
      entityType: { type: DataTypes.STRING, allowNull: true, field: "entity_type" },
      entityId: { type: DataTypes.UUID, allowNull: true, field: "entity_id" },
      propertyId: { type: DataTypes.UUID, allowNull: true, field: "property_id" },
      actorName: { type: DataTypes.STRING, allowNull: true, field: "actor_name" },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      // NULL for ordinary mutation-triggered events (they can legitimately
      // recur). Reserved for idempotent/time-driven events; a partial
      // unique index enforces at-most-one per (recipient, dedupe_key).
      dedupeKey: { type: DataTypes.STRING, allowNull: true, field: "dedupe_key" },
      // null = unread, a timestamp = read. Reading a notification NEVER
      // resolves the underlying issue — a Work Order stays overdue on the
      // Dashboard until it is actually fixed.
      readAt: { type: DataTypes.DATE, allowNull: true, field: "read_at" },
    },
    {
      sequelize,
      modelName: "Notification",
      tableName: "notifications",
      underscored: true,
      // Mutated once (read_at) after creation, but no independent
      // "updated" semantics worth a column — same append-ish discipline
      // as AuditEvent, minus the strict immutability.
      timestamps: true,
      updatedAt: false,
    }
  );
  return Notification;
}
