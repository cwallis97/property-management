// Generalized Audit / Event History V1 — the one place that writes an
// AuditEvent row. Deliberately small and boring: this module makes no
// authorization decisions (every call site has already passed its own
// requireCapability/requireWorkOrderAction check before ever reaching
// here), never suppresses or swallows an error (a failed insert must
// fail the whole request — see recordAuditEvent's own comment), and never
// accepts a raw req/res or request body — every call site hand-picks the
// exact minimal fields it wants recorded.
import { AuditEvent, ENTITY_TYPES, AUDIT_ACTIONS } from "../models/index.js";

// Resolves the caller's own Membership for a SPECIFIC Company — never a
// bare User id, never an arbitrary/first Membership for a multi-company
// caller. Same idiom as getRoleForCompany/callerMembershipId elsewhere in
// this codebase; kept here as its own small helper (rather than importing
// one of those) because this one also assembles the point-in-time actor
// snapshot (name/email), which those helpers have no reason to do.
//
// Returns null if, somehow, the caller has no Membership in that Company —
// defensive only; every real call site has already resolved companyId
// from a resource it confirmed belongs to one of the caller's own
// Companies, so this should be unreachable in practice.
export function resolveActor(req, companyId) {
  const membership = req.memberships?.find((m) => m.companyId === companyId);
  if (!membership) return null;
  return {
    membershipId: membership.id,
    userId: req.user.id,
    role: membership.role,
    name: req.user.displayName || req.user.email || null,
    email: req.user.email || null,
  };
}

// Every call site must pass a `transaction` — audit rows for the six/eight
// V1 mutation points are always written atomically with the business
// mutation they describe (see each controller's own comment for why).
// Deliberately throws (never catches/swallows) on a missing required
// field or an invalid action/entityType — a bug here must surface loudly
// as a failed, rolled-back request, not a silently-malformed or
// silently-skipped audit row.
export async function recordAuditEvent({
  transaction,
  companyId,
  propertyId = null,
  actor,
  action,
  entityType,
  entityId,
  entityLabel = null,
  before = null,
  after = null,
  metadata = null,
}) {
  if (!transaction) throw new Error("recordAuditEvent requires an explicit transaction.");
  if (!companyId) throw new Error("recordAuditEvent requires companyId.");
  if (!actor || !actor.role) throw new Error("recordAuditEvent requires a resolved actor.");
  if (!AUDIT_ACTIONS.includes(action)) throw new Error(`recordAuditEvent: unknown action "${action}".`);
  if (!ENTITY_TYPES.includes(entityType)) throw new Error(`recordAuditEvent: unknown entityType "${entityType}".`);
  if (!entityId) throw new Error("recordAuditEvent requires entityId.");

  return AuditEvent.create(
    {
      companyId,
      propertyId,
      actorMembershipId: actor.membershipId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      actorName: actor.name,
      actorEmail: actor.email,
      action,
      entityType,
      entityId,
      entityLabel,
      before,
      after,
      metadata,
    },
    { transaction }
  );
}
