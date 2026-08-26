// Technician Work Order Actions V1 — a third, independent authorization
// axis alongside capabilities.js (ROLE -> what) and propertyAccess.js
// (MEMBERSHIP -> which Properties). This module answers a narrower
// question neither of those can: "may THIS caller perform THIS specific
// mutation on THIS specific Work Order, right now" — which for a
// Technician depends on facts no static role->capability map can express
// (whether they're the current assignee, whether the Work Order is still
// open). Deliberately a small policy helper, not a generic framework: one
// action enum, one allowlist, one decision function, mirroring the
// existing requireCapability/requirePropertyAccess call-site shape rather
// than inventing new machinery.
//
// Every call site is required to have already run requirePropertyAccess
// for the caller against this Work Order's Property BEFORE reaching this
// module — that's what satisfies "AND Property Access" from the approved
// design; it is deliberately not re-checked here (every existing
// controller already enforces tenant ownership -> Property Access ->
// capability, in that order, and this module only ever replaces the last
// step for a narrower set of actions).
import { hasCapability } from "./capabilities.js";

export const WORK_ORDER_ACTIONS = {
  UPDATE_STATUS: "status",
  ADD_NOTE: "note.create",
  ADD_COST: "cost.create",
};

// The complete, explicit set of actions an assigned Technician (i.e. a
// caller with no full-editor capability for this Work Order's Company) may
// take on a Work Order currently assigned to them. Adding a future
// assignee-safe action means adding one entry here, not threading a new
// role check through a controller.
const ASSIGNEE_ALLOWED_ACTIONS = new Set([
  WORK_ORDER_ACTIONS.UPDATE_STATUS,
  WORK_ORDER_ACTIONS.ADD_NOTE,
  WORK_ORDER_ACTIONS.ADD_COST,
]);

// req.memberships (set by requireAuth) can contain more than one row if a
// User belongs to more than one Company — resolves the caller's Membership
// for THIS Work Order's Company specifically, the same idiom
// getRoleForCompany/getAccessiblePropertyIds already use elsewhere. Never a
// bare User id, never an arbitrary/first Membership.
function callerMembershipId(req, companyId) {
  return req.memberships?.find((m) => m.companyId === companyId)?.id ?? null;
}

// Two independent paths to "yes":
//   1. Full editor — caller holds `fullCapability` for the Work Order's
//      Company (Admin/Manager today). Checked first and short-circuits
//      everything below, so existing Admin/Manager behavior — including on
//      a Completed Work Order — is completely unaffected by this module.
//   2. Assigned Technician — the Work Order is currently assigned to the
//      caller's OWN Membership for that Company, the Work Order is not
//      Completed, and `action` is in the narrow assignee allowlist.
// Completion ends Technician mutation rights for every assignee action
// uniformly (status/notes/costs) — evaluated against workOrder's current,
// freshly-queried status, never a cached/prior value, so a Manager
// reopening a Work Order immediately restores the assignee's rights on the
// very next request with no extra bookkeeping.
export function canPerformWorkOrderAction(req, workOrder, action, fullCapability) {
  const companyId = workOrder.property.companyId;
  if (hasCapability(req, companyId, fullCapability)) return true;
  if (workOrder.status === "completed") return false;
  if (!ASSIGNEE_ALLOWED_ACTIONS.has(action)) return false;
  const membershipId = callerMembershipId(req, companyId);
  return !!membershipId && workOrder.assignedMembershipId === membershipId;
}

// Inline guard, same shape as requireCapability/requirePropertyAccess —
// checks, responds itself on failure, returns a boolean so call sites read
// `if (!requireWorkOrderAction(...)) return;`.
export function requireWorkOrderAction(req, res, workOrder, action, fullCapability) {
  if (canPerformWorkOrderAction(req, workOrder, action, fullCapability)) return true;
  res.status(403).json({ error: "You do not have permission to do that." });
  return false;
}
