// Restrained, single-tone badges reusing the app's existing pastel
// bg-50/text-600 pill language (same pattern as AssetTable's status badges)
// rather than introducing new colors. Only "high"/"urgent" get warm colors —
// the rest stay neutral, so the table doesn't read as a rainbow.
// Exported so the Work Order detail page can reuse the exact same badge
// language instead of redefining it.
export const priorityBadge = {
  urgent:
    "bg-red-50 text-red-600 ring-1 ring-inset ring-red-100 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20",
  high:
    "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20",
  medium: "bg-surface-subtle text-ink-secondary ring-1 ring-inset ring-line",
  low: "bg-surface-subtle text-ink-muted ring-1 ring-inset ring-line",
};

export const statusBadge = {
  open: "bg-surface-subtle text-ink-secondary ring-1 ring-inset ring-line",
  assigned:
    "bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20",
  in_progress:
    "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20",
  waiting:
    "bg-purple-50 text-purple-600 ring-1 ring-inset ring-purple-100 dark:bg-purple-500/10 dark:text-purple-400 dark:ring-purple-500/20",
  completed:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20",
};

export const statusLabel = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In Progress",
  waiting: "Waiting",
  completed: "Completed",
};

// showPropertyContext folds the Property (and its Where label) into a
// subtitle under the Work Order title, in place of the standalone "Where"
// column — used by the portfolio-wide queue, where every row already needs
// to make its property obvious. Property-level Work Orders (the default)
// render exactly as before: property context is already implicit there, so
// adding it would only add visual weight with no new information.
export default function WorkOrderTable({ rows, onRowClick, showPropertyContext = false }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs font-medium uppercase tracking-wide text-ink-muted">
            <th className="px-5 py-3">Work Order</th>
            {!showPropertyContext && <th className="px-5 py-3">Where</th>}
            <th className="px-5 py-3">Priority</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row.id)}
              className="cursor-pointer border-b border-surface-subtle transition hover:bg-surface-subtle last:border-0"
            >
              <td className="px-5 py-3 font-medium text-ink">
                {row.title}
                {showPropertyContext && (
                  <p className="mt-0.5 truncate text-xs font-normal text-ink-muted">
                    {row.propertyName}
                    {row.wherePrimary && row.wherePrimary !== "Property-level" && ` · ${row.wherePrimary}`}
                    {row.whereSecondary && ` · ${row.whereSecondary}`}
                  </p>
                )}
              </td>
              {!showPropertyContext && (
                <td className="px-5 py-3">
                  <p className="text-ink-secondary">{row.wherePrimary}</p>
                  {row.whereSecondary && <p className="text-xs text-ink-muted">{row.whereSecondary}</p>}
                </td>
              )}
              <td className="px-5 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                    priorityBadge[row.priority] || "bg-surface-subtle text-ink-secondary"
                  }`}
                >
                  {row.priority}
                </span>
              </td>
              <td className="px-5 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    statusBadge[row.status] || "bg-surface-subtle text-ink-secondary"
                  }`}
                >
                  {statusLabel[row.status] || row.status}
                </span>
              </td>
              <td className="px-5 py-3">
                <span className={row.overdue ? "font-medium text-red-600 dark:text-red-400" : "text-ink-secondary"}>{row.ageLabel}</span>
                {row.overdue && <span className="ml-1.5 text-[11px] font-medium text-red-600 dark:text-red-400">Overdue</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
