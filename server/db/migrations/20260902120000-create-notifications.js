import { DataTypes, Op } from "sequelize";

// Notification Center V1 — a dedicated, Company-scoped inbox row: "who
// personally needs to know that responsibility, urgency, or access
// materially changed for them?" This is NOT AuditEvent (which answers
// "what happened in the organization?") and is never a query over it —
// one mutation produces zero, one, or several Notifications. Deliberately
// small: human-readable title/body snapshots, entity/Property context, a
// little metadata JSONB, and a dedupe_key for future time-driven events.
// No generalized before/after payloads — AuditEvent already owns that role.
//
// company_id is ON DELETE CASCADE (unlike AuditEvent's RESTRICT) — a
// notification has no value once its Company is gone, same reasoning as
// Vendor/Document. recipient_membership_id / recipient_user_id are both
// CASCADE too: a notification only ever means anything to the exact
// Membership it was addressed to. property_id is SET NULL — a deleted
// Property must never keep a recipient from reading their own inbox.
export async function up({ context: queryInterface }) {
  await queryInterface.createTable("notifications", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: queryInterface.sequelize.literal("gen_random_uuid()"),
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "companies", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    // Primary recipient identity — role, Company, and Property Access are
    // all Membership concepts, and every trigger reasons in Membership
    // terms.
    recipient_membership_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "memberships", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    // Denormalised so the inbox query is one WHERE across every Membership
    // a User has, without joining memberships on every read.
    recipient_user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    type: { type: DataTypes.STRING, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    body: { type: DataTypes.STRING, allowNull: true },
    entity_type: { type: DataTypes.STRING, allowNull: true },
    entity_id: { type: DataTypes.UUID, allowNull: true },
    property_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "properties", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    // Point-in-time snapshot (e.g. the name a Work Order was reassigned
    // to) — never re-derived from a mutable display name on read.
    actor_name: { type: DataTypes.STRING, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
    // NULL for ordinary mutation-triggered events (they can legitimately
    // recur). Set for idempotent/time-driven events (work_order.overdue,
    // deferred to Production Jobs V1) via the partial unique index below.
    dedupe_key: { type: DataTypes.STRING, allowNull: true },
    read_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  // The inbox keyset — recipient_user_id spans every Membership; ordered
  // (created_at DESC, id DESC) with the id tiebreak in the index for
  // same-millisecond inserts, same reasoning as audit_events.
  await queryInterface.addIndex("notifications", ["recipient_user_id", "created_at", "id"], {
    name: "notifications_recipient_user_created_id",
  });

  // Unread count — a small partial index, since "unread" is by far the
  // hottest filter and shrinks as things are read.
  await queryInterface.addIndex("notifications", ["recipient_membership_id"], {
    name: "notifications_recipient_unread",
    where: { read_at: null },
  });

  // Idempotency for future time-driven events — at most one notification
  // per (recipient Membership, dedupe_key). Partial, so ordinary
  // NULL-keyed rows are never constrained.
  await queryInterface.addIndex("notifications", ["recipient_membership_id", "dedupe_key"], {
    name: "notifications_recipient_dedupe_key",
    unique: true,
    where: { dedupe_key: { [Op.ne]: null } },
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("notifications");
}
