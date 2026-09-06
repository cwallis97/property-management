import { Notification, Membership } from "../models/index.js";
import { filterActiveMembershipIds } from "../authorization/activeMembership.js";

// The one place that writes Notification rows. Mirrors auditService.js:
// makes no authorization decisions (every call site has already resolved
// and authorized the mutation), requires an explicit `transaction` so
// notification inserts commit atomically with the business change they
// describe, and never accepts a raw request body.
//
// Two guarantees are centralized here so no trigger re-implements them:
//   1. ACTOR / SELF-SUPPRESSION — the Membership that just performed a
//      synchronous action is removed from the recipient set. Chris
//      assigning a Work Order to Chris gets no "assigned to you"; a
//      Manager creating an urgent Work Order is not in its recipient set
//      even though they are a Manager.
//   2. RECIPIENT DE-DUPLICATION — at most one row per recipient Membership
//      per call (a Membership that matches a resolver twice gets one
//      notification).
//   3. DISABLED-RECIPIENT EXCLUSION (SOC 2 Phase 1) — a Membership that is
//      itself disabled, or whose User is globally disabled, never gets a
//      new Notification, regardless of how the caller resolved the
//      recipient set. The canonical check lives in
//      authorization/activeMembership.js.
//
// `recipients` is `[{ membershipId, userId }]`. `dedupeKey`, when given,
// makes the insert idempotent via the partial unique index
// (recipient_membership_id, dedupe_key) — used by future time-driven
// events; ordinary mutation events pass none (they can legitimately recur).
export async function createNotifications({
  transaction,
  companyId,
  actorMembershipId = null,
  recipients,
  type,
  title,
  body = null,
  entityType = null,
  entityId = null,
  propertyId = null,
  actorName = null,
  metadata = null,
  dedupeKey = null,
}) {
  if (!transaction) throw new Error("createNotifications requires an explicit transaction.");
  if (!companyId) throw new Error("createNotifications requires companyId.");
  if (!type) throw new Error("createNotifications requires a type.");
  if (!title) throw new Error("createNotifications requires a title.");
  if (!Array.isArray(recipients)) throw new Error("createNotifications requires a recipients array.");

  // Drop disabled recipients centrally — one query, regardless of caller.
  const activeIds = await filterActiveMembershipIds(
    Membership,
    recipients.map((r) => r?.membershipId),
    { transaction }
  );

  const seen = new Set();
  const rows = [];
  for (const r of recipients) {
    if (!r || !r.membershipId || !r.userId) continue;
    if (actorMembershipId && r.membershipId === actorMembershipId) continue; // self-suppression
    if (!activeIds.has(r.membershipId)) continue; // disabled Membership / User
    if (seen.has(r.membershipId)) continue; // de-duplication
    seen.add(r.membershipId);
    rows.push({
      companyId,
      recipientMembershipId: r.membershipId,
      recipientUserId: r.userId,
      type,
      title,
      body,
      entityType,
      entityId,
      propertyId,
      actorName,
      metadata,
      dedupeKey,
    });
  }

  if (rows.length === 0) return 0;

  // ignoreDuplicates -> Postgres INSERT ... ON CONFLICT DO NOTHING, so a
  // dedupeKey collision is a silent no-op rather than a failed request.
  await Notification.bulkCreate(rows, { transaction, ignoreDuplicates: true });
  return rows.length;
}
