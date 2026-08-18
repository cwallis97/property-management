// Shared by PropertyDetail's Work Orders table, the Work Order detail page,
// and the portfolio Dashboard, so age/overdue/attention logic lives in
// exactly one place and can never disagree between those screens.
import { getLocationPath } from "./hierarchy";

// The single definition of "active" — everything except completed. Used by
// WorkOrderDetail's status-selector and by the Active/Completed/All queue
// filter below; never redefine this list a second time.
export const ACTIVE_WORK_ORDER_STATUSES = ["open", "assigned", "in_progress", "waiting"];

// The shared filter behind the Active/Completed/All view control — used
// wherever Work Orders are shown as an operational queue, so "what counts
// as active" can never drift between screens.
export function filterWorkOrdersByView(rows, view) {
  if (view === "completed") return rows.filter((row) => row.status === "completed");
  if (view === "active") return rows.filter((row) => ACTIVE_WORK_ORDER_STATUSES.includes(row.status));
  return rows;
}

// Same manufactured-housing-first V1 list as server/models/WorkType.js's
// WORK_ORDER_CATEGORIES — the values must match exactly. Shared by the
// Create Work Order category picker and WorkOrderDetail's display, so the
// two can never show different labels for the same value.
export const WORK_ORDER_CATEGORIES = [
  { value: "water", label: "Water" },
  { value: "sewer", label: "Sewer" },
  { value: "electrical", label: "Electrical" },
  { value: "roads", label: "Roads" },
  { value: "concrete", label: "Concrete" },
  { value: "trees_landscaping", label: "Trees/Landscaping" },
  { value: "buildings_facilities", label: "Buildings/Facilities" },
  { value: "general_other", label: "General/Other" },
];

export const categoryLabel = Object.fromEntries(WORK_ORDER_CATEGORIES.map((c) => [c.value, c.label]));

export function formatAge(ms) {
  const minutes = Math.floor(Math.max(ms, 0) / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// Only ever true when dueDate actually exists and has actually passed while
// the work order is still incomplete — never inferred or assumed.
export function isOverdue(workOrder) {
  if (!workOrder.dueDate || workOrder.status === "completed") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${workOrder.dueDate}T00:00:00`);
  return due < today;
}

// "Needs attention" = urgent (and still active) OR overdue. This is the
// same boolean WorkOrderDetail's Attention callout already uses; reusing it
// here (rather than a second inline expression) is what keeps the
// dashboard's count consistent with that page's.
export function needsAttention(workOrder) {
  return (workOrder.priority === "urgent" && workOrder.status !== "completed") || isOverdue(workOrder);
}

// "What needs my attention first?" — completed work orders never rank
// ahead of active ones, regardless of their priority/dueDate. `row` must
// have { status, priority, overdue, createdAtMs }.
export function attentionRank(row) {
  if (row.status === "completed") return 6;
  if (row.priority === "urgent" && row.overdue) return 0;
  if (row.priority === "urgent") return 1;
  if (row.overdue) return 2;
  if (row.priority === "high") return 3;
  if (row.priority === "medium") return 4;
  return 5; // low
}

export function compareByAttention(a, b) {
  const rankDiff = attentionRank(a) - attentionRank(b);
  if (rankDiff !== 0) return rankDiff;
  return a.createdAtMs - b.createdAtMs; // within the same group, older first
}

// Resolves a work order's Location/Asset relationship into two independent
// display values (matching WorkOrderDetail's information card): asset's
// own location is used when the work order has no explicit locationId of
// its own, full ancestor breadcrumb via getLocationPath, "—" fallback if
// the referenced Location/Asset has since been archived (and so is absent
// from the active-only `locations`/`assets` arrays passed in). Nothing here
// assumes any particular hierarchy shape.
export function resolveWorkOrderContext(workOrder, locations, assets) {
  const asset = workOrder.assetId ? assets.find((a) => a.id === workOrder.assetId) : null;
  const assetLabel = !workOrder.assetId ? null : asset ? asset.name : "—";

  const locationId = workOrder.locationId ?? asset?.locationId ?? null;
  const locationLabel = locationId ? getLocationPath(locationId, locations).join(" › ") || "—" : null;

  return { locationLabel, assetLabel };
}
