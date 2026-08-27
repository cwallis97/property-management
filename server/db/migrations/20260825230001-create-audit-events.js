import { DataTypes } from "sequelize";

// Generalized Audit / Event History V1 — one append-only row per
// server-recorded, semantically-meaningful mutation (see auditService.js
// for the write path; no application route ever updates or deletes a row
// here). This is NOT event sourcing and NOT a generic per-column diff log
// — only the explicit V1 mutation points listed in the Product Bible write
// here, with hand-picked before/after/metadata, never a raw request body.
//
// company_id is RESTRICT, deliberately unlike every other direct
// Company-owned table in this schema (Vendor/Document/Invitation all
// CASCADE): an audit trail must never disappear as a side effect of an
// ordinary Company deletion. If full tenant deletion is ever built, it
// must explicitly purge (or archive) AuditEvent rows itself as a
// deliberate step of that workflow — never implicitly via this FK.
//
// property_id is SET NULL (not RESTRICT like Document's own
// property_id) — a Document's existence depends on its Property; an
// AuditEvent's meaning does not (entity_label already preserves a
// point-in-time snapshot), so the audit trail must never block a Property
// from ever being permanently deleted.
//
// actor_membership_id / actor_user_id are SET NULL, mirroring
// WorkOrder.assigned_membership_id's own precedent — no Membership/User
// deletion workflow exists today, but an audit row must outlive one if
// it's ever built. actor_role/actor_name/actor_email are separate,
// nullable point-in-time snapshots (see the model) so a later profile
// rename or role change never rewrites what already happened.
//
// entity_type is a plain VARCHAR, deliberately with NO DB CHECK
// constraint — unlike Invitation.role (a small, rarely-changing set),
// entity_type is expected to grow as more mutation points are
// instrumented in future audit milestones, and a CHECK constraint would
// mean a migration for every new auditable entity. App-level validation
// (ENTITY_TYPES in auditService.js) is the right amount of rigor here.
//
// entity_id is NOT a physical FK — Postgres can't target one column at
// multiple tables without triggers, which this migration deliberately
// does not introduce. Referential integrity for the target is an
// accepted, explicit trade-off of the generalized entityType+entityId
// model over one nullable FK column per entity type.
export async function up({ context: queryInterface }) {
  await queryInterface.createTable("audit_events", {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: queryInterface.sequelize.literal("gen_random_uuid()") },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "companies", key: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    },
    property_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "properties", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    actor_membership_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "memberships", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    actor_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    actor_role: { type: DataTypes.STRING, allowNull: false },
    actor_name: { type: DataTypes.STRING, allowNull: true },
    actor_email: { type: DataTypes.STRING, allowNull: true },
    action: { type: DataTypes.STRING, allowNull: false },
    entity_type: { type: DataTypes.STRING, allowNull: false },
    entity_id: { type: DataTypes.UUID, allowNull: false },
    entity_label: { type: DataTypes.STRING, allowNull: true },
    before: { type: DataTypes.JSONB, allowNull: true },
    after: { type: DataTypes.JSONB, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  // Composite (company_id, created_at, id) — not just (company_id,
  // created_at) — because the read endpoint's keyset cursor orders by
  // created_at DESC, id DESC and needs the id tiebreaker to stay in the
  // index for same-millisecond inserts; a two-column index would leave
  // that tiebreak to an unindexed sort.
  await queryInterface.addIndex("audit_events", ["company_id", "created_at", "id"], { name: "audit_events_company_created_id" });
  await queryInterface.addIndex("audit_events", ["property_id", "created_at"]);
  await queryInterface.addIndex("audit_events", ["entity_type", "entity_id", "created_at"]);
  await queryInterface.addIndex("audit_events", ["actor_membership_id", "created_at"]);
  await queryInterface.addIndex("audit_events", ["action", "created_at"]);
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("audit_events");
}
