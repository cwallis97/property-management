import { Link } from "react-router-dom";
import { statusBadge, statusLabel } from "./WorkOrderTable";
import { analyzeMoney, analyzeDate } from "../utils/analyzeFormat";

// The ONE Work Order row for Site Map Analyze — used by both the selected
// hotspot's Work Orders list and the global "Matching Work Orders" section,
// so the two can never drift into different layouts. Horizontal padding is
// the row's own (`px-3`); the caller supplies only the list container +
// dividers.
export default function AnalyzeWorkOrderRow({ workOrder, to, state }) {
  const wo = workOrder;
  return (
    <Link
      to={to}
      state={state}
      className="flex items-center justify-between gap-3 px-3 py-2.5 transition hover:bg-surface-subtle"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm text-ink">{wo.title}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-muted">
          {wo.locationLabel}
          {" · "}
          {analyzeDate(wo.createdAt)}
          {wo.mapX == null && " · unmapped"}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2.5">
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            statusBadge[wo.status] || "bg-surface-subtle text-ink-secondary"
          }`}
        >
          {statusLabel[wo.status] || wo.status}
        </span>
        <span className="tabular-nums text-xs text-ink-secondary">{analyzeMoney(wo.spend)}</span>
      </span>
    </Link>
  );
}
