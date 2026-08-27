import { DataTypes, Model } from "sequelize";

// The full set of auditable entity categories today — small and expected
// to grow. Deliberately not DB-CHECK-constrained (see this table's
// migration comment); this array is the single source of truth for
// validating entityType at write time.
export const ENTITY_TYPES = ["work_order", "membership", "property"];

// Canonical, stable action keys — never a human-readable string. UI
// wording (client/src/utils/auditEvents.js) may change freely without
// ever touching stored rows or this list's meaning.
export const AUDIT_ACTIONS = [
  "work_order.assignment_changed",
  "work_order.status_changed",
  "work_order.note_created",
  "work_order.cost_created",
  "membership.role_changed",
  "membership.property_access_changed",
  "property.archived",
  "property.restored",
];

export class AuditEvent extends Model {}

export function initAuditEventModel(sequelize) {
  AuditEvent.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      companyId: { type: DataTypes.UUID, allowNull: false, field: "company_id" },
      propertyId: { type: DataTypes.UUID, allowNull: true, field: "property_id" },
      actorMembershipId: { type: DataTypes.UUID, allowNull: true, field: "actor_membership_id" },
      actorUserId: { type: DataTypes.UUID, allowNull: true, field: "actor_user_id" },
      // Snapshots, captured once at write time — never re-derived from the
      // live User/Membership row on read, so a later profile rename or
      // role change never rewrites what an event already says happened.
      // actorRole is required (every actor has a role at the moment they
      // act); actorName/actorEmail are nullable — a future actor type
      // (a system/service actor, for instance) may not have either, and
      // the generalized model shouldn't assume every actor is a human
      // User with an email address.
      actorRole: { type: DataTypes.STRING, allowNull: false, field: "actor_role" },
      actorName: { type: DataTypes.STRING, allowNull: true, field: "actor_name" },
      actorEmail: { type: DataTypes.STRING, allowNull: true, field: "actor_email" },
      action: { type: DataTypes.STRING, allowNull: false, validate: { isIn: [AUDIT_ACTIONS] } },
      entityType: { type: DataTypes.STRING, allowNull: false, field: "entity_type", validate: { isIn: [ENTITY_TYPES] } },
      entityId: { type: DataTypes.UUID, allowNull: false, field: "entity_id" },
      entityLabel: { type: DataTypes.STRING, allowNull: true, field: "entity_label" },
      before: { type: DataTypes.JSONB, allowNull: true },
      after: { type: DataTypes.JSONB, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      sequelize,
      modelName: "AuditEvent",
      tableName: "audit_events",
      underscored: true,
      // No updatedAt — an audit row is never updated by any application
      // path; omitting the column encodes that invariant at the schema
      // level, not just in application logic.
      createdAt: true,
      updatedAt: false,
    }
  );
  return AuditEvent;
}
