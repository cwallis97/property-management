// ROLE → CAPABILITIES, deliberately kept as one small, readable map rather
// than scattering `if (role === "admin")` checks across every controller.
// Adding a future role (Regional Manager, Property Manager, Leasing Agent,
// Maintenance Supervisor) means adding one entry here, not hunting down
// every place a role might have been compared directly — that's the whole
// point of separating ROLE (what kind of user) from CAPABILITY (what they
// may actually do). This module answers only the second question.
//
// Not a database-driven permission matrix — there is no product need for
// that yet (no custom roles, no per-Company permission overrides), and
// building one now would be solving a problem V1 doesn't have. A
// code-defined map is easy to read today and easy to extend by adding
// entries, which is the actual near-term need.
//
// V1 mostly covers mutations — every other read (GET) endpoint in this app
// remains open to any authenticated member of the owning Company, and
// "Technician can view Properties/Locations/Assets/Work Orders/Documents/
// Site Plans" falls out of that unchanged behavior for free. REPORTS_READ
// (added for Reports & Site Map Analytics V1) is the first read-side
// capability: portfolio/Property-wide financial aggregation is materially
// more sensitive than reading an individual record, so it's gated
// explicitly rather than inheriting the default-open read convention.
// Technician's own per-Work-Order cost visibility (through a Work Order
// they can already read) is untouched by this — REPORTS_READ only governs
// the aggregate reporting endpoints themselves.

export const CAPABILITIES = {
  SETTINGS_ACCESS: "settings.access",
  PROPERTY_CREATE: "property.create",
  PROPERTY_LIFECYCLE: "property.lifecycle", // archive / restore / permanent delete
  LOCATION_MANAGE: "location.manage", // create / edit / archive
  ASSET_CREATE: "asset.create",
  ASSET_EDIT: "asset.edit", // edit / archive
  WORK_ORDER_CREATE: "workOrder.create",
  WORK_ORDER_EDIT: "workOrder.edit", // status, vendor, description, complete/reopen, archive
  WORK_ORDER_NOTE_CREATE: "workOrderNote.create",
  WORK_ORDER_COST_CREATE: "workOrderCost.create",
  VENDOR_CREATE: "vendor.create",
  VENDOR_EDIT: "vendor.edit",
  DOCUMENT_MANAGE: "document.manage", // create / edit / replace file / archive
  SITE_PLAN_UPLOAD: "sitePlan.upload",
  USERS_MANAGE: "users.manage", // list Company members, change a member's role
  // Dedicated, not reused from USERS_MANAGE/SETTINGS_ACCESS — audit-log
  // visibility is a conceptually distinct, security-sensitive concern
  // (who may see the Company's change history) from "who may manage
  // members" or "who may edit Company settings." Keeping it separate now
  // costs one map entry and leaves room for a future role (an Auditor,
  // for instance) that can read history without managing anything else.
  AUDIT_LOG_READ: "auditLog.read",
  // Portfolio/Property-wide reporting (Maintenance Spend, the Work Orders
  // report / Site Map Analyze) — deliberately its own capability, not reused
  // from AUDIT_LOG_READ (a different concern: change history vs. financial
  // aggregation) or USERS_MANAGE. Owner/Admin/Manager only; Technician's
  // read access to an individual Work Order's own costs is untouched.
  REPORTS_READ: "reports.read",
};

// Admin/Owner: broad operational access plus Company/Property
// administration. "owner" is the role auto-assigned to whoever first
// creates a Company (see requireAuth) — the product has not designed a
// distinct Owner tier yet, so it's treated as Admin for authorization.
const ADMIN_CAPABILITIES = new Set(Object.values(CAPABILITIES));

// Manager: the same day-to-day operational capabilities as Admin, minus
// Company/Property-level administration (Settings, creating Properties,
// archiving/restoring them). The spec is explicit that Company/property
// lifecycle administration defaults to Admin-only absent a strong reason
// otherwise, and nothing in this codebase gives one.
const MANAGER_CAPABILITIES = new Set([
  CAPABILITIES.LOCATION_MANAGE,
  CAPABILITIES.ASSET_CREATE,
  CAPABILITIES.ASSET_EDIT,
  CAPABILITIES.WORK_ORDER_CREATE,
  CAPABILITIES.WORK_ORDER_EDIT,
  CAPABILITIES.WORK_ORDER_NOTE_CREATE,
  CAPABILITIES.WORK_ORDER_COST_CREATE,
  CAPABILITIES.VENDOR_CREATE,
  CAPABILITIES.VENDOR_EDIT,
  CAPABILITIES.DOCUMENT_MANAGE,
  CAPABILITIES.SITE_PLAN_UPLOAD,
  CAPABILITIES.REPORTS_READ,
]);

// Technician: deliberately zero mutation capabilities in V1 — read access
// to everything within the Company is already unconditional (every GET
// endpoint), so Technician can already see Properties/Locations/Assets/
// Work Orders/Documents/Site Plans without anything further. Work
// Assignment/My Work (a near-term, not-yet-built milestone) is what will
// eventually define which specific Work Orders a technician may act on;
// granting broad mutation rights now, before that exists, would mean
// walking them back later rather than growing them deliberately.
const TECHNICIAN_CAPABILITIES = new Set([]);

export const ROLE_CAPABILITIES = {
  owner: ADMIN_CAPABILITIES,
  admin: ADMIN_CAPABILITIES,
  manager: MANAGER_CAPABILITIES,
  technician: TECHNICIAN_CAPABILITIES,
};

export function roleHasCapability(role, capability) {
  return ROLE_CAPABILITIES[role]?.has(capability) ?? false;
}

// req.memberships (set by requireAuth) can contain more than one row if a
// user ever belongs to more than one Company — "the caller's role" is only
// ever meaningful relative to ONE specific Company, never globally, so this
// always resolves against the companyId the resource in question actually
// belongs to (never a client-supplied company or role).
export function getRoleForCompany(req, companyId) {
  return req.memberships?.find((m) => m.companyId === companyId)?.role ?? null;
}

export function hasCapability(req, companyId, capability) {
  return roleHasCapability(getRoleForCompany(req, companyId), capability);
}

// Inline guard for use inside a controller action, after the target
// resource (and therefore its owning companyId) has already been resolved
// and confirmed to belong to the caller's own Company — authorization is
// deliberately checked AFTER tenant ownership, never instead of it, so a
// company mismatch always surfaces as 404 (resource doesn't exist for you)
// rather than 403 (exists, but you're not allowed) and never leaks whether
// a resource exists in a company the caller isn't a member of at all.
// Returns true/false so the caller can `if (!requireCapability(...)) return;`.
export function requireCapability(req, res, companyId, capability) {
  if (hasCapability(req, companyId, capability)) return true;
  res.status(403).json({ error: "You do not have permission to do that." });
  return false;
}
