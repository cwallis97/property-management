import { Op } from "sequelize";
import { sequelize, Membership, User, WorkOrder, PropertyAccess } from "../models/index.js";
import { CAPABILITIES, hasCapability, requireCapability } from "../authorization/capabilities.js";
import { recordAuditEvent, resolveActor } from "../services/auditService.js";
import { revokeUserSessions } from "../services/sessionRevocation.js";
import { TEXT_LIMITS } from "../validation/text.js";

// SOC 2 Phase 1 — access-lifecycle actions.
//
//   PATCH /api/members/:id/status   — disable / re-enable ONE Membership
//                                     (revoke / restore access to one
//                                     Company). Wired to the Users UI.
//
//   PATCH /api/users/:id/status     — disable / re-enable a User GLOBALLY
//                                     (all Companies). Backend control;
//                                     not surfaced in the Phase 1 UI.
//
// Both are gated on USERS_MANAGE (Owner/Admin) and both audit every
// transition. Disable never deletes: role / accessMode / PropertyAccess
// rows are preserved and restored verbatim on re-enable. Historical
// records (Work Orders, assignments, notes, audit events) stay attributed
// to the Membership/User regardless of its disabled state.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["active", "disabled"];

function isValidUUID(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function parseStatusBody(body) {
  const { status, reason } = body ?? {};
  if (!STATUSES.includes(status)) {
    return { error: `status must be one of: ${STATUSES.join(", ")}` };
  }
  if (reason !== undefined && reason !== null) {
    if (typeof reason !== "string") return { error: "reason must be a string." };
    if (reason.length > TEXT_LIMITS.address) {
      return { error: `reason must be ${TEXT_LIMITS.address} characters or fewer.` };
    }
  }
  return { status, reason: reason ? reason.trim() : null };
}

function memberName(user) {
  return user?.displayName || user?.email || "Unknown";
}

// Count active owner Memberships for a Company whose owning User is also
// not globally disabled — the real "does this Company still have someone
// in charge" question.
async function activeOwnerCount(companyId, { excludingMembershipId } = {}) {
  const where = { companyId, role: "owner", disabledAt: null };
  if (excludingMembershipId) where.id = { [Op.ne]: excludingMembershipId };
  const owners = await Membership.findAll({
    where,
    include: [{ association: "user", attributes: ["id", "disabledAt"], required: true }],
  });
  return owners.filter((m) => m.user.disabledAt == null).length;
}

// ── PATCH /api/members/:id/status ────────────────────────────────────
export async function updateMembershipStatus(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid membership id." });
  }

  // Tenant check first (same idiom as updateMemberRole). req.companyIds
  // only contains Companies the caller is ACTIVE in.
  const membership = await Membership.findOne({
    where: { id: req.params.id, companyId: { [Op.in]: req.companyIds } },
    include: [{ model: User, as: "user", attributes: ["id", "email", "displayName", "disabledAt"] }],
  });
  if (!membership) return res.status(404).json({ error: "Member not found." });

  if (!requireCapability(req, res, membership.companyId, CAPABILITIES.USERS_MANAGE)) return;

  const parsed = parseStatusBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { status, reason } = parsed;
  const wantDisabled = status === "disabled";

  if (wantDisabled) {
    if (membership.role === "owner") {
      return res.status(400).json({ error: "The owner's access can't be disabled." });
    }
    if (membership.userId === req.user.id) {
      return res.status(400).json({ error: "You can't disable your own access." });
    }
    // Defensive / future-proof (there is exactly one owner per Company
    // today and it's already blocked above): never leave a Company with
    // zero people in charge.
    if ((await activeOwnerCount(membership.companyId, { excludingMembershipId: membership.id })) === 0) {
      return res.status(400).json({ error: "A company must always have at least one active owner." });
    }
  }

  const currentlyDisabled = membership.disabledAt != null;
  // Idempotent no-op — no state change, no audit row.
  if (wantDisabled === currentlyDisabled) {
    return res.json(await serializeMemberWithStatus(membership.id));
  }

  const actor = resolveActor(req, membership.companyId);
  const targetName = memberName(membership.user);
  const action = wantDisabled ? "membership.disabled" : "membership.enabled";

  await sequelize.transaction(async (t) => {
    membership.disabledAt = wantDisabled ? new Date() : null;
    await membership.save({ transaction: t });
    await recordAuditEvent({
      transaction: t,
      companyId: membership.companyId,
      actor,
      action,
      entityType: "membership",
      entityId: membership.id,
      entityLabel: targetName,
      before: { disabled: currentlyDisabled },
      after: { disabled: wantDisabled },
      metadata: { targetUserId: membership.userId, reason: reason ?? null },
    });
  });

  const payload = await serializeMemberWithStatus(membership.id);

  if (wantDisabled) {
    // Cheap FYI for the admin — NOT a blocker. Existing assignments are
    // never silently rewritten (see docs/soc2-readiness/access-lifecycle.md).
    payload.openAssignedWorkOrderCount = await WorkOrder.count({
      where: {
        assignedMembershipId: membership.id,
        archivedAt: null,
        status: { [Op.ne]: "completed" },
      },
    });
  }

  res.json(payload);
}

// ── PATCH /api/users/:id/status ─────────────────────────────────────
export async function updateUserStatus(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid user id." });
  }

  const target = await User.findByPk(req.params.id);
  // Enumeration parity: a user the caller has no administrative reach into
  // is indistinguishable from one that doesn't exist.
  if (!target) return res.status(404).json({ error: "User not found." });

  // The caller may act on this User only through a Company where the
  // caller holds USERS_MANAGE AND the target is a member.
  const manageableCompanyIds = req.memberships
    .filter((m) => hasCapability(req, m.companyId, CAPABILITIES.USERS_MANAGE))
    .map((m) => m.companyId);
  if (manageableCompanyIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to do that." });
  }

  const sharedMembership = await Membership.findOne({
    where: { userId: target.id, companyId: { [Op.in]: manageableCompanyIds } },
  });
  if (!sharedMembership) return res.status(404).json({ error: "User not found." });

  const parsed = parseStatusBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { status, reason } = parsed;
  const wantDisabled = status === "disabled";

  if (wantDisabled) {
    if (target.id === req.user.id) {
      return res.status(400).json({ error: "You can't disable your own account." });
    }
    // Disabling a User who owns any Company would orphan that Company —
    // mirrors "the owner's access can't be disabled" at the global level.
    const ownsAnyCompany = await Membership.count({
      where: { userId: target.id, role: "owner", disabledAt: null },
    });
    if (ownsAnyCompany > 0) {
      return res.status(400).json({ error: "This person owns a company and can't be disabled globally. Transfer or remove that ownership first." });
    }
  }

  const currentlyDisabled = target.disabledAt != null;
  if (wantDisabled === currentlyDisabled) {
    return res.json({ id: target.id, email: target.email, name: memberName(target), disabled: currentlyDisabled });
  }

  const actorCompanyId = sharedMembership.companyId;
  const actor = resolveActor(req, actorCompanyId);
  const action = wantDisabled ? "user.disabled" : "user.enabled";

  await sequelize.transaction(async (t) => {
    target.disabledAt = wantDisabled ? new Date() : null;
    await target.save({ transaction: t });
    await recordAuditEvent({
      transaction: t,
      companyId: actorCompanyId,
      actor,
      action,
      entityType: "user",
      entityId: target.id,
      entityLabel: memberName(target),
      before: { disabled: currentlyDisabled },
      after: { disabled: wantDisabled },
      metadata: { reason: reason ?? null },
    });
  });

  // Firebase refresh-token revocation is the SECONDARY layer (the DB
  // switch above is already the authoritative, immediate cut). Done
  // OUTSIDE the transaction — a slow / failing external call must not roll
  // back the disable or hold a DB lock. Its outcome is recorded so the
  // audit trail shows whether the belt-and-braces call actually landed.
  if (wantDisabled) {
    const revocation = await revokeUserSessions(target.firebaseUid);
    await sequelize.transaction(async (t) => {
      await recordAuditEvent({
        transaction: t,
        companyId: actorCompanyId,
        actor,
        action: "refresh_tokens.revoked",
        entityType: "user",
        entityId: target.id,
        entityLabel: memberName(target),
        metadata: { result: revocation },
      });
    });
    return res.json({
      id: target.id,
      email: target.email,
      name: memberName(target),
      disabled: true,
      refreshTokensRevoked: revocation.revoked,
      refreshTokenRevocation: revocation,
    });
  }

  res.json({ id: target.id, email: target.email, name: memberName(target), disabled: false });
}

// Re-reads a Membership with the shape membershipController.serializeMember
// produces, plus the `status` field. Kept here (rather than importing
// serializeMember) because that helper is not exported and this needs the
// disabled flag it doesn't include.
async function serializeMemberWithStatus(membershipId) {
  const m = await Membership.findByPk(membershipId, {
    include: [
      { model: User, as: "user", attributes: ["id", "email", "displayName"] },
      { model: PropertyAccess, as: "propertyAccess", attributes: ["propertyId"] },
    ],
  });
  return {
    membershipId: m.id,
    userId: m.user.id,
    name: m.user.displayName || m.user.email,
    email: m.user.email,
    role: m.role,
    accessMode: m.accessMode,
    propertyIds: m.accessMode === "restricted" ? (m.propertyAccess ?? []).map((pa) => pa.propertyId) : null,
    status: m.disabledAt != null ? "disabled" : "active",
  };
}
