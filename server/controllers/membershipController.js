import { Op, fn, col } from "sequelize";
import { sequelize, Membership, User, Property, PropertyAccess, WorkOrder, MEMBERSHIP_ACCESS_MODES } from "../models/index.js";
import { CAPABILITIES, requireCapability } from "../authorization/capabilities.js";
import { recordAuditEvent, resolveActor } from "../services/auditService.js";
import { createNotifications } from "../services/notificationService.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

const ROLE_LABELS = { owner: "Owner", admin: "Admin", manager: "Manager", technician: "Technician" };

// Human-readable one-liner for a "Your Property access changed"
// notification body. `added`/`removed` are Property name arrays.
function summarizeAccessChange(added, removed) {
  if (added.length === 1 && removed.length === 0) return `${added[0]} added`;
  if (removed.length === 1 && added.length === 0) return `${removed[0]} removed`;
  const parts = [];
  if (added.length) parts.push(`${added.length} ${added.length === 1 ? "Property" : "Properties"} added`);
  if (removed.length) parts.push(`${removed.length} ${removed.length === 1 ? "Property" : "Properties"} removed`);
  return parts.join(" · ") || "Access updated";
}

// A member's role may only ever be changed TO one of these via this
// endpoint — "owner" is deliberately excluded from both directions: it can
// never be assigned (no ownership transfer in V1) and, separately below, a
// Membership that's already "owner" can never be changed away from it
// either. Same single-company assumption used throughout this app
// (Property Scope, Vendor creation, etc.) — members are always listed/
// edited relative to req.companyIds[0], not a company picker.
const EDITABLE_ROLES = ["admin", "manager", "technician"];

// propertyIds is only meaningful (and only ever non-null) for a
// "restricted" Membership — null reads as "not applicable, this member has
// All Properties," matching getAccessiblePropertyIds' own null-means-
// unrestricted convention. Deliberately not dumping raw PropertyAccess row
// ids/timestamps — the client only ever needs the granted Property ids
// themselves to render "N of M Properties" and pre-select the edit modal.
// Point-in-time Property name snapshots for the Property Access audit
// event's added/removed lists — a plain id-keyed lookup, not a second
// source of truth: these names are captured once, at write time, into the
// AuditEvent's own metadata JSONB, so a Property later renamed (or even
// permanently deleted) never rewrites what an old event already says.
async function resolvePropertyNameMap(ids) {
  if (ids.length === 0) return {};
  const rows = await Property.findAll({ where: { id: { [Op.in]: ids } }, attributes: ["id", "name"] });
  return Object.fromEntries(rows.map((p) => [p.id, p.name]));
}

function serializeMember(membership) {
  const user = membership.user;
  return {
    membershipId: membership.id,
    userId: user.id,
    name: user.displayName || user.email,
    email: user.email,
    role: membership.role,
    accessMode: membership.accessMode,
    propertyIds: membership.accessMode === "restricted" ? (membership.propertyAccess ?? []).map((pa) => pa.propertyId) : null,
    // SOC 2 Phase 1 — "active" | "disabled". A disabled Membership keeps
    // its role / accessMode / propertyIds (they are restored verbatim on
    // re-enable) but grants none of it while disabled.
    status: membership.disabledAt != null ? "disabled" : "active",
  };
}

// Role and Property-Access edits are rejected on a disabled Membership —
// re-enable it first. Disabling deliberately preserves the configuration
// as-is, and letting it be edited while inert is a confusing state with
// no product value in Phase 1.
function rejectIfDisabled(membership, res) {
  if (membership.disabledAt != null) {
    res.status(409).json({ error: "This member's access is disabled. Re-enable them before changing their role or access." });
    return true;
  }
  return false;
}

export async function listCompanyMembers(req, res) {
  const companyId = req.companyIds[0];
  if (!requireCapability(req, res, companyId, CAPABILITIES.USERS_MANAGE)) return;

  const members = await Membership.findAll({
    where: { companyId },
    include: [
      { model: User, as: "user", attributes: ["id", "email", "displayName"] },
      { model: PropertyAccess, as: "propertyAccess", attributes: ["propertyId"] },
    ],
    order: [["createdAt", "ASC"]],
  });

  // Open-assignment count per member in ONE grouped query — shown so an
  // admin about to disable someone can see what's still assigned to them
  // (SOC 2 Phase 1). Never a blocker on disable; just information.
  const membershipIds = members.map((m) => m.id);
  const openByMembership = {};
  if (membershipIds.length) {
    const rows = await WorkOrder.findAll({
      attributes: ["assignedMembershipId", [fn("COUNT", col("id")), "count"]],
      where: {
        assignedMembershipId: { [Op.in]: membershipIds },
        archivedAt: null,
        status: { [Op.ne]: "completed" },
      },
      group: ["assignedMembershipId"],
      raw: true,
    });
    for (const r of rows) openByMembership[r.assignedMembershipId] = Number(r.count);
  }

  res.json(
    members.map((m) => ({
      ...serializeMember(m),
      openAssignedWorkOrderCount: openByMembership[m.id] ?? 0,
    }))
  );
}

export async function updateMemberRole(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid membership id." });
  }

  // Tenant check first, exactly like every other controller in this app:
  // resolve the target row scoped to companies the caller actually belongs
  // to, so a cross-Company id always 404s rather than ever reaching the
  // authorization check below.
  const membership = await Membership.findOne({
    where: { id: req.params.id, companyId: { [Op.in]: req.companyIds } },
    include: [
      { model: User, as: "user", attributes: ["id", "email", "displayName"] },
      { model: PropertyAccess, as: "propertyAccess", attributes: ["propertyId"] },
    ],
  });
  if (!membership) return res.status(404).json({ error: "Member not found." });

  if (!requireCapability(req, res, membership.companyId, CAPABILITIES.USERS_MANAGE)) return;
  if (rejectIfDisabled(membership, res)) return;

  const { role } = req.body;
  if (!EDITABLE_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${EDITABLE_ROLES.join(", ")}` });
  }

  // Owner protection — the schema has no separate "primary owner" flag
  // beyond role itself, and today exactly one Membership is ever created
  // with role "owner" (at Company auto-provisioning). Treating that role as
  // immutable through this endpoint is the smallest rule that can never
  // leave a Company without an owner or demote it by accident. Ownership
  // transfer is a deliberately separate, unbuilt feature.
  if (membership.role === "owner") {
    return res.status(400).json({ error: "The owner's role cannot be changed." });
  }

  // Self-protection — an Admin changing their own role through this same
  // UI could accidentally lock themselves out of Settings mid-session.
  // Every other capability check already re-derives role from the
  // database on every request, so this isn't a security backstop, only a
  // deliberate guard against an easy, avoidable mistake.
  if (membership.userId === req.user.id) {
    return res.status(400).json({ error: "You cannot change your own role." });
  }

  // Captured before mutation, and compared after, purely for no-op
  // suppression below — resubmitting the same role must never create an
  // audit event (see auditService.js's own no-op-suppression rule).
  const previousRole = membership.role;
  membership.role = role;
  const roleChanged = previousRole !== role;
  const actor = resolveActor(req, membership.companyId);
  const targetName = membership.user.displayName || membership.user.email;

  // Both transaction branches below record the same AuditEvent + the same
  // "Your role changed" Notification for the affected member — one helper
  // so the two can never drift. No-op suppressed (roleChanged); actor and
  // target can never be the same Membership here (self-role-change is
  // rejected upstream), but createNotifications' actor filter is a
  // harmless no-op regardless.
  const recordRoleChange = async (t) => {
    if (!roleChanged) return;
    await recordAuditEvent({
      transaction: t,
      companyId: membership.companyId,
      actor,
      action: "membership.role_changed",
      entityType: "membership",
      entityId: membership.id,
      entityLabel: targetName,
      before: { role: previousRole },
      after: { role },
    });
    await createNotifications({
      transaction: t,
      companyId: membership.companyId,
      actorMembershipId: actor?.membershipId ?? null,
      recipients: [{ membershipId: membership.id, userId: membership.userId }],
      type: "membership.role_changed",
      title: "Your role changed",
      body: `You are now ${ROLE_LABELS[role] ?? role}`,
      entityType: "membership",
      entityId: membership.id,
      metadata: { previousRole, newRole: role },
    });
  };

  // Promoting to Admin means "always accessMode = all" per Property Access
  // V1 (see propertyAccess.js) — force it here rather than leaving a
  // restricted Admin as a state this app can reach but never intentionally
  // create. Any existing grants are cleaned up in the same transaction so
  // accessMode='all' with leftover PropertyAccess rows never happens.
  // Either branch now always runs inside a transaction (the plain branch
  // previously didn't need one — a single membership.save() is already
  // atomic by itself — but now must be, so its AuditEvent insert commits
  // together with the role change rather than as a separate, unprotected
  // write).
  if (role === "admin" && membership.accessMode === "restricted") {
    await sequelize.transaction(async (t) => {
      membership.accessMode = "all";
      await membership.save({ transaction: t });
      await PropertyAccess.destroy({ where: { membershipId: membership.id }, transaction: t });
      await recordRoleChange(t);
    });
    membership.propertyAccess = [];
  } else {
    await sequelize.transaction(async (t) => {
      await membership.save({ transaction: t });
      await recordRoleChange(t);
    });
  }

  res.json(serializeMember(membership));
}

// Owner and Admin are always unrestricted (see propertyAccess.js) — this
// endpoint only ever operates on Manager/Technician Memberships. Mirrors
// updateMemberRole's exact tenant-check-then-capability-then-guard
// ordering and self/owner protections, extended to Admin as well (an Admin
// restricting themselves down to "restricted" would be exactly the kind
// of accidental-Settings-lockout updateMemberRole's self-protection
// already guards against for role changes).
export async function updateMemberPropertyAccess(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid membership id." });
  }

  const membership = await Membership.findOne({
    where: { id: req.params.id, companyId: { [Op.in]: req.companyIds } },
    include: [
      { model: User, as: "user", attributes: ["id", "email", "displayName"] },
      { model: PropertyAccess, as: "propertyAccess", attributes: ["propertyId"] },
    ],
  });
  if (!membership) return res.status(404).json({ error: "Member not found." });

  if (!requireCapability(req, res, membership.companyId, CAPABILITIES.USERS_MANAGE)) return;
  if (rejectIfDisabled(membership, res)) return;

  if (membership.role === "owner" || membership.role === "admin") {
    return res.status(400).json({ error: "Owner and Admin always have access to every property." });
  }
  if (membership.userId === req.user.id) {
    return res.status(400).json({ error: "You cannot change your own property access." });
  }

  const { accessMode, propertyIds } = req.body;
  if (!MEMBERSHIP_ACCESS_MODES.includes(accessMode)) {
    return res.status(400).json({ error: `accessMode must be one of: ${MEMBERSHIP_ACCESS_MODES.join(", ")}` });
  }

  // Captured before any mutation — used by both branches below for no-op
  // suppression and for the audit event's before/added-removed snapshot.
  const previousAccessMode = membership.accessMode;
  const previousPropertyIds = (membership.propertyAccess ?? []).map((pa) => pa.propertyId);
  const actor = resolveActor(req, membership.companyId);
  const targetName = membership.user.displayName || membership.user.email;

  if (accessMode === "all") {
    // Switching FROM restricted TO all: the member's previous explicit
    // grants are being superseded by blanket access, so they're the
    // meaningful "removed" set here — there's nothing crisp to call
    // "added" (they already had every Property available in principle).
    const accessChanged = previousAccessMode !== "all";

    await sequelize.transaction(async (t) => {
      membership.accessMode = "all";
      await membership.save({ transaction: t });
      // Stale grants left behind after switching back to "all" would mean
      // accessMode and PropertyAccess rows could silently disagree about
      // this Membership's real access if it's later switched back to
      // "restricted" — removing them now keeps the state a reader could
      // reconstruct just from accessMode, no PropertyAccess history to
      // account for.
      await PropertyAccess.destroy({ where: { membershipId: membership.id }, transaction: t });

      if (accessChanged) {
        const nameMap = await resolvePropertyNameMap(previousPropertyIds);
        const removedNames = previousPropertyIds.map((id) => nameMap[id] ?? null).filter(Boolean);
        await recordAuditEvent({
          transaction: t,
          companyId: membership.companyId,
          actor,
          action: "membership.property_access_changed",
          entityType: "membership",
          entityId: membership.id,
          entityLabel: targetName,
          before: { accessMode: previousAccessMode },
          after: { accessMode: "all" },
          metadata: {
            addedProperties: [],
            removedProperties: previousPropertyIds.map((id) => ({ id, name: nameMap[id] ?? null })),
          },
        });
        await createNotifications({
          transaction: t,
          companyId: membership.companyId,
          actorMembershipId: actor?.membershipId ?? null,
          recipients: [{ membershipId: membership.id, userId: membership.userId }],
          type: "membership.property_access_changed",
          title: "Your Property access changed",
          body: "You now have access to all properties",
          entityType: "membership",
          entityId: membership.id,
          metadata: { addedCount: 0, removedCount: removedNames.length, accessMode: "all" },
        });
      }
    });
    membership.propertyAccess = [];
    return res.json(serializeMember(membership));
  }

  // restricted — zero-property is explicitly rejected (not merely
  // discouraged in the UI): a Company member with zero accessible
  // Properties has no real product use case in V1, and allowing it here
  // would mean a single click could fully lock a member out with no
  // in-app path back for them.
  if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
    return res.status(400).json({ error: "Select at least one property, or choose All Properties." });
  }

  const uniqueIds = [...new Set(propertyIds)];
  if (uniqueIds.some((id) => !isValidUUID(id))) {
    return res.status(400).json({ error: "Invalid property id." });
  }

  // Deliberately not filtered to status: "active" — a Property already
  // archived (or later archived after this grant is created) remains a
  // valid, intentional grant; see propertyAccess.js and the archive/
  // restore QA scenarios for why grants must survive archive/restore
  // untouched.
  const owned = await Property.findAll({
    where: { id: { [Op.in]: uniqueIds }, companyId: membership.companyId },
    attributes: ["id"],
  });
  if (owned.length !== uniqueIds.length) {
    return res.status(400).json({ error: "One or more properties are invalid." });
  }

  // restricted -> restricted: a real set diff. all -> restricted: nothing
  // crisp to call "removed" (see the mirror-image comment in the "all"
  // branch above) — the new set is entirely "added" from the reader's
  // perspective, since there was no previous explicit scope to diff
  // against.
  const sortedPrev = [...previousPropertyIds].sort();
  const sortedNext = [...uniqueIds].sort();
  const accessChanged = previousAccessMode !== "restricted" || sortedPrev.join(",") !== sortedNext.join(",");

  let addedIds = uniqueIds;
  let removedIds = [];
  if (previousAccessMode === "restricted") {
    const prevSet = new Set(previousPropertyIds);
    const nextSet = new Set(uniqueIds);
    addedIds = uniqueIds.filter((id) => !prevSet.has(id));
    removedIds = previousPropertyIds.filter((id) => !nextSet.has(id));
  }

  await sequelize.transaction(async (t) => {
    membership.accessMode = "restricted";
    await membership.save({ transaction: t });
    // Atomic replace, not a diff — the caller (the Edit Property Access
    // modal) always submits the complete intended set, exactly like
    // updateWorkOrder's vendorId "replace whatever exists" semantics.
    await PropertyAccess.destroy({ where: { membershipId: membership.id }, transaction: t });
    await PropertyAccess.bulkCreate(
      uniqueIds.map((propertyId) => ({ membershipId: membership.id, propertyId })),
      { transaction: t }
    );

    if (accessChanged) {
      const nameMap = await resolvePropertyNameMap([...new Set([...addedIds, ...removedIds])]);
      const addedNames = addedIds.map((id) => nameMap[id] ?? null).filter(Boolean);
      const removedNames = removedIds.map((id) => nameMap[id] ?? null).filter(Boolean);
      await recordAuditEvent({
        transaction: t,
        companyId: membership.companyId,
        actor,
        action: "membership.property_access_changed",
        entityType: "membership",
        entityId: membership.id,
        entityLabel: targetName,
        before: { accessMode: previousAccessMode },
        after: { accessMode: "restricted" },
        metadata: {
          addedProperties: addedIds.map((id) => ({ id, name: nameMap[id] ?? null })),
          removedProperties: removedIds.map((id) => ({ id, name: nameMap[id] ?? null })),
        },
      });
      await createNotifications({
        transaction: t,
        companyId: membership.companyId,
        actorMembershipId: actor?.membershipId ?? null,
        recipients: [{ membershipId: membership.id, userId: membership.userId }],
        type: "membership.property_access_changed",
        title: "Your Property access changed",
        body: summarizeAccessChange(addedNames, removedNames),
        entityType: "membership",
        entityId: membership.id,
        metadata: { addedCount: addedNames.length, removedCount: removedNames.length, accessMode: "restricted" },
      });
    }
  });

  membership.propertyAccess = uniqueIds.map((propertyId) => ({ propertyId }));
  res.json(serializeMember(membership));
}
