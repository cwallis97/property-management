// Centralized Audit Log display config — the one place canonical action
// keys (e.g. "work_order.status_changed") get translated into human
// wording. A normal operator should never see a raw action key or a JSON
// blob; every consumer of AuditEvent data (the list table, the detail
// modal, filter labels) reads through this config instead of switch/case
// formatting scattered across components — that's the whole point of
// centralizing it here, and what makes adding a V2 event a one-entry
// change instead of a hunt through multiple files.
import { statusLabel } from "../components/WorkOrderTable";

const COST_TYPE_LABEL = { labor: "Labor", material: "Material", vendor: "Vendor", equipment: "Equipment", other: "Other" };
const ROLE_LABEL = { owner: "Owner", admin: "Admin", manager: "Manager", technician: "Technician" };
const ACCESS_MODE_LABEL = { all: "All Properties", restricted: "Restricted" };

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// Same local-component parsing WorkOrderDetail's own formatDueDate uses for
// a DATEONLY string ("YYYY-MM-DD") — avoids a UTC/local timezone shift
// silently rendering the wrong calendar day.
function formatCostDate(dateOnlyStr) {
  if (!dateOnlyStr) return null;
  const [y, m, d] = dateOnlyStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// addedProperties/removedProperties are always [{id, name}], per the
// server's own point-in-time name-snapshot design (see membershipController's
// resolvePropertyNameMap) — never re-resolved from a live Property lookup,
// so a later-renamed or deleted Property still reads correctly here.
function formatPropertyAccessDelta(metadata) {
  const added = metadata?.addedProperties ?? [];
  const removed = metadata?.removedProperties ?? [];
  const parts = [];
  if (added.length > 0) parts.push(`Added ${added.map((p) => p.name).join(", ")}`);
  if (removed.length > 0) parts.push(`Removed ${removed.map((p) => p.name).join(", ")}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// category groups map 1:1 to entityType — deliberately (see
// auditEventController.js) — "category" is just the human-facing name for
// filtering by entityType, not a second taxonomy to keep in sync.
export const AUDIT_CATEGORIES = [
  { value: "work_order", label: "Work Orders" },
  { value: "membership", label: "Access & Roles" },
  { value: "property", label: "Properties" },
];

// sentence(event) -> the verb phrase after the actor's name, e.g. actorName
// + " " + sentence(event) reads as a full clause ("Chris Wallis changed
// Water Leak - Lot 17's status") — used by the global, Company-wide Audit
// Log, where the entity itself isn't already implicit from context.
// contextualLabel(event) -> a short standalone phrase with NO entity name
// ("Changed status") — used by a contextual, single-entity timeline (e.g.
// Work Order History), where the entity is already obvious from where the
// reader is. detail(event) -> the before/after line, shared by BOTH
// surfaces unchanged, or null when the action name alone already fully
// describes what happened (archive/restore, note/cost creation).
export const AUDIT_EVENT_CONFIG = {
  "work_order.status_changed": {
    category: "work_order",
    label: "Status changed",
    sentence: (e) => `changed ${e.entityLabel ?? "a work order"}'s status`,
    contextualLabel: () => "Changed status",
    detail: (e) => `${statusLabel[e.before?.status] ?? e.before?.status} → ${statusLabel[e.after?.status] ?? e.after?.status}`,
  },
  "work_order.assignment_changed": {
    category: "work_order",
    label: "Assignment changed",
    sentence: (e) => `changed ${e.entityLabel ?? "a work order"}'s assignment`,
    contextualLabel: () => "Changed assignment",
    detail: (e) => `${e.before?.name ?? "Unassigned"} → ${e.after?.name ?? "Unassigned"}`,
  },
  "work_order.note_created": {
    category: "work_order",
    label: "Note added",
    sentence: (e) => `added a note to ${e.entityLabel ?? "a work order"}`,
    contextualLabel: () => "Added a note",
    detail: () => null,
  },
  "work_order.cost_created": {
    category: "work_order",
    label: "Cost added",
    sentence: (e) => {
      const type = COST_TYPE_LABEL[e.metadata?.type] ?? e.metadata?.type ?? "cost";
      const amount = e.metadata?.amount != null ? formatMoney(e.metadata.amount) : null;
      return amount ? `added a ${amount} ${type} cost to ${e.entityLabel ?? "a work order"}` : `added a ${type} cost to ${e.entityLabel ?? "a work order"}`;
    },
    contextualLabel: (e) => {
      const type = COST_TYPE_LABEL[e.metadata?.type] ?? e.metadata?.type ?? "cost";
      const amount = e.metadata?.amount != null ? formatMoney(e.metadata.amount) : null;
      return amount ? `Added a ${amount} ${type} cost` : `Added a ${type} cost`;
    },
    detail: (e) => {
      const date = formatCostDate(e.metadata?.costDate);
      const vendor = e.metadata?.vendorName ? `Vendor: ${e.metadata.vendorName}` : null;
      return [date, vendor].filter(Boolean).join(" · ") || null;
    },
  },
  "membership.role_changed": {
    category: "membership",
    label: "Role changed",
    sentence: (e) => `changed ${e.entityLabel ?? "a member"}'s role`,
    detail: (e) => `${ROLE_LABEL[e.before?.role] ?? e.before?.role} → ${ROLE_LABEL[e.after?.role] ?? e.after?.role}`,
  },
  "membership.property_access_changed": {
    category: "membership",
    label: "Property access changed",
    sentence: (e) => `changed ${e.entityLabel ?? "a member"}'s Property Access`,
    detail: (e) => formatPropertyAccessDelta(e.metadata) ?? `${ACCESS_MODE_LABEL[e.before?.accessMode]} → ${ACCESS_MODE_LABEL[e.after?.accessMode]}`,
  },
  "property.archived": {
    category: "property",
    label: "Property archived",
    sentence: (e) => `archived ${e.entityLabel ?? "a property"}`,
    detail: () => null,
  },
  "property.restored": {
    category: "property",
    label: "Property restored",
    sentence: (e) => `restored ${e.entityLabel ?? "a property"}`,
    detail: () => null,
  },
};

// Every formatter below falls back to the raw action key when this
// frontend build doesn't recognize it (e.g. mid-deploy, or a future V2
// event added server-side first) — never crashes the table, just shows
// the canonical key rather than a blank row.
export function formatAuditEventLabel(event) {
  const config = AUDIT_EVENT_CONFIG[event.action];
  return config ? config.label : event.action;
}

// Used by a contextual, single-entity timeline (Work Order History) —
// short, standalone, no entity name (see AUDIT_EVENT_CONFIG's own
// comment). Only ever called with work_order.* events in V1 (the
// contextual endpoint returns nothing else), but falls back to the raw
// key the same way every other formatter here does, rather than assuming.
export function formatContextualAuditEventLabel(event) {
  const config = AUDIT_EVENT_CONFIG[event.action];
  return config?.contextualLabel ? config.contextualLabel(event) : event.action;
}

export function formatAuditEventSentence(event) {
  const config = AUDIT_EVENT_CONFIG[event.action];
  return config ? config.sentence(event) : event.action;
}

export function formatAuditEventDetail(event) {
  const config = AUDIT_EVENT_CONFIG[event.action];
  return config ? config.detail(event) : null;
}
