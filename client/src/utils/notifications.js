import { IconWrench, IconBuilding, IconUser } from "../components/icons";

// Icon per notification type. Titles and bodies are rendered server-side
// (human-readable snapshots) — the client never formats a canonical key.
const TYPE_ICON = {
  "work_order.assigned": IconWrench,
  "work_order.reassigned": IconWrench,
  "work_order.reopened": IconWrench,
  "work_order.urgent_created": IconWrench,
  "membership.role_changed": IconUser,
  "membership.property_access_changed": IconBuilding,
};

export function notificationIcon(type) {
  return TYPE_ICON[type] || IconWrench;
}

// "just now" / "4 min ago" / "1 hr ago" / "Yesterday" / "3 days ago", then
// an absolute date once it's older than a week.
export function formatRelativeTime(value) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day} days ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Where a notification takes the user. Returns { to } or null — a null
// means "mark read, don't navigate" (e.g. a role change has no meaningful
// detail surface). Navigation is re-checked by the server at click time:
// a Work Order the recipient has since lost access to just lands on that
// page's own not-found state, and the notification row itself always
// renders regardless.
export function notificationTarget(n) {
  switch (n.type) {
    case "work_order.assigned":
    case "work_order.reassigned":
    case "work_order.reopened":
    case "work_order.urgent_created":
      return n.propertyId && n.entityId ? { to: `/portfolio/${n.propertyId}/work-orders/${n.entityId}` } : null;
    case "membership.property_access_changed":
      return { to: "/portfolio" };
    case "membership.role_changed":
    default:
      return null;
  }
}
