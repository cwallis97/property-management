// SOC 2 Phase 1 — the ONE place "is this access currently usable" is
// expressed, so every query that resolves memberships (the caller's, or
// someone else's) applies the exact same rule and can never drift.
//
// Two switches, both nullable timestamps (see the add-access-lifecycle
// migration):
//   users.disabled_at        — global account kill switch
//   memberships.disabled_at  — per-Company access revocation
//
// A Membership is only "usable" when BOTH its own disabled_at is null AND
// the User it belongs to is not globally disabled.
//
// The caller's own memberships are already filtered in authMiddleware
// (requireAuth loads only `disabled_at IS NULL` rows and 403s a globally
// disabled user), so downstream authorization code never sees a disabled
// caller-membership. These helpers are for the OTHER direction — resolving
// whether some *other* person's Membership grants them anything right now
// (assignment eligibility, notification recipients, invite duplicate
// checks).

import { Op } from "sequelize";

// Spread into a Sequelize `where` for a `memberships` query to keep only
// active ones: `{ ...ACTIVE_MEMBERSHIP_WHERE, companyId }`.
export const ACTIVE_MEMBERSHIP_WHERE = { disabledAt: null };

// Include fragment that also enforces the global user switch — the
// associated User must exist and not be globally disabled.
export const ACTIVE_USER_INCLUDE = {
  required: true,
  where: { disabledAt: null },
};

export function isUserActive(user) {
  return !!user && user.disabledAt == null;
}

export function isMembershipActive(membership) {
  return !!membership && membership.disabledAt == null;
}

// A Membership row (with its `user` association loaded) grants access
// right now only if the Membership itself is active AND its User is not
// globally disabled.
export function membershipGrantsAccess(membership) {
  return isMembershipActive(membership) && isUserActive(membership.user);
}

// Given a list of membership ids, return the subset that currently grants
// access (own switch off AND owning user's switch off). One query. Used
// by notificationService to centrally drop disabled recipients regardless
// of how a caller resolved them.
export async function filterActiveMembershipIds(Membership, membershipIds, { transaction } = {}) {
  const ids = [...new Set((membershipIds ?? []).filter(Boolean))];
  if (ids.length === 0) return new Set();
  const rows = await Membership.findAll({
    where: { id: { [Op.in]: ids }, disabledAt: null },
    include: [{ association: "user", attributes: ["id", "disabledAt"], required: true }],
    transaction,
  });
  return new Set(rows.filter((m) => isUserActive(m.user)).map((m) => m.id));
}
