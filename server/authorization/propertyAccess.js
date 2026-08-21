// Property Access V1 — a second, additive layer of restriction INSIDE the
// Company boundary every controller already enforces via req.companyIds.
// This module answers "which Properties may this member see/operate
// within," never "which Company" (that's still req.companyIds, untouched)
// and never "what may they do" (that's still capabilities.js, untouched).
//
// Deliberately a separate file from capabilities.js — ROLE -> CAPABILITY
// and Property-level access are two independent axes (see the Property
// Access architecture report), and keeping them in separate modules
// mirrors that they can be reasoned about, and eventually evolve,
// independently.
import { PropertyAccess } from "../models/index.js";

// Returns:
//   null       -> unrestricted: every Property in this Company is
//                 accessible (today's behavior for every existing
//                 Membership, and always true for owner/admin).
//   string[]   -> restricted: only these Property ids are accessible
//                 (may be empty in theory, though the management endpoint
//                 refuses to ever save that state — see membershipController).
//
// Returning null rather than "every Property id in the Company" lets every
// call site branch cheaply: unrestricted callers add nothing to their
// query; restricted callers add one Op.in filter. For the common case
// (accessMode === "all", true for every Membership until an Admin
// deliberately restricts one) this costs zero extra queries — accessMode
// is already present on the Membership rows requireAuth loads into
// req.memberships for every request.
export async function getAccessiblePropertyIds(req, companyId) {
  const membership = req.memberships?.find((m) => m.companyId === companyId);
  // Defensive, not expected in practice: every caller resolves companyId
  // from req.companyIds (which is itself derived from req.memberships)
  // before ever reaching here, so a companyId with no matching membership
  // is an impossible/bug state. Fail closed (no access) rather than open.
  if (!membership) return [];
  if (membership.accessMode !== "restricted") return null;

  const grants = await PropertyAccess.findAll({
    where: { membershipId: membership.id },
    attributes: ["propertyId"],
  });
  return grants.map((g) => g.propertyId);
}

// Inline guard for the common "I already resolved exactly one Property
// (via the existing findOwnedProperty/company-ownership check) and need to
// confirm this caller may also operate within it" case — mirrors
// requireCapability's shape (checks, responds itself, returns a boolean) so
// call sites read the same way: `if (!(await requirePropertyAccess(...)))
// return;`. Always 404s, matching this app's established "an inaccessible
// resource looks identical to a nonexistent one" convention (see
// requireCapability's own comment) — Property Access is never allowed to
// leak, via a 403 vs 404 distinction, whether a Property exists at all
// within a Company the caller is legitimately a member of.
export async function requirePropertyAccess(req, res, companyId, propertyId) {
  const accessibleIds = await getAccessiblePropertyIds(req, companyId);
  if (accessibleIds === null || accessibleIds.includes(propertyId)) return true;
  res.status(404).json({ error: "Property not found." });
  return false;
}
