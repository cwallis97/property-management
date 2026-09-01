// Frontend mirror of server/authorization/capabilities.js — there is no
// shared package between client and server in this repo, so this is kept
// deliberately structured the same way (same capability names, same
// role→capability sets) so the two are easy to compare and keep in sync.
// This is UX only: it decides what to *show*, never what's *allowed* — the
// backend independently re-derives and enforces the caller's real role on
// every request, regardless of anything computed here.

export const CAPABILITIES = {
  SETTINGS_ACCESS: "settings.access",
  PROPERTY_CREATE: "property.create",
  PROPERTY_LIFECYCLE: "property.lifecycle",
  LOCATION_MANAGE: "location.manage",
  ASSET_CREATE: "asset.create",
  ASSET_EDIT: "asset.edit",
  WORK_ORDER_CREATE: "workOrder.create",
  WORK_ORDER_EDIT: "workOrder.edit",
  WORK_ORDER_NOTE_CREATE: "workOrderNote.create",
  WORK_ORDER_COST_CREATE: "workOrderCost.create",
  VENDOR_CREATE: "vendor.create",
  VENDOR_EDIT: "vendor.edit",
  DOCUMENT_MANAGE: "document.manage",
  SITE_PLAN_UPLOAD: "sitePlan.upload",
  USERS_MANAGE: "users.manage",
  AUDIT_LOG_READ: "auditLog.read",
  REPORTS_READ: "reports.read",
};

const ADMIN_CAPABILITIES = new Set(Object.values(CAPABILITIES));

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

const TECHNICIAN_CAPABILITIES = new Set([]);

const ROLE_CAPABILITIES = {
  owner: ADMIN_CAPABILITIES,
  admin: ADMIN_CAPABILITIES,
  manager: MANAGER_CAPABILITIES,
  technician: TECHNICIAN_CAPABILITIES,
};

export function roleHasCapability(role, capability) {
  return ROLE_CAPABILITIES[role]?.has(capability) ?? false;
}
