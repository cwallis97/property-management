// Restrained, single-tone badges reusing the app's existing pastel
// bg-50/text-600 pill language (same pattern as AssetTable's status badges)
// rather than introducing new colors. Only "high"/"urgent" get warm colors —
// the rest stay neutral, so the table doesn't read as a rainbow.
const priorityBadge = {
  urgent: "bg-red-50 text-red-600 ring-1 ring-inset ring-red-100",
  high: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100",
  medium: "bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-100",
  low: "bg-gray-50 text-gray-400 ring-1 ring-inset ring-gray-100",
};

const statusBadge = {
  open: "bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-100",
  assigned: "bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100",
  in_progress: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100",
  waiting: "bg-purple-50 text-purple-600 ring-1 ring-inset ring-purple-100",
  completed: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100",
};

const statusLabel = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In Progress",
  waiting: "Waiting",
  completed: "Completed",
};

export default function WorkOrderTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wide text-gray-400">
            <th className="px-5 py-3">Work Order</th>
            <th className="px-5 py-3">Where</th>
            <th className="px-5 py-3">Priority</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-50 last:border-0">
              <td className="px-5 py-3 font-medium text-gray-900">{row.title}</td>
              <td className="px-5 py-3">
                <p className="text-gray-700">{row.wherePrimary}</p>
                {row.whereSecondary && <p className="text-xs text-gray-400">{row.whereSecondary}</p>}
              </td>
              <td className="px-5 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                    priorityBadge[row.priority] || "bg-gray-50 text-gray-500"
                  }`}
                >
                  {row.priority}
                </span>
              </td>
              <td className="px-5 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    statusBadge[row.status] || "bg-gray-50 text-gray-500"
                  }`}
                >
                  {statusLabel[row.status] || row.status}
                </span>
              </td>
              <td className="px-5 py-3">
                <span className={row.overdue ? "font-medium text-red-600" : "text-gray-500"}>{row.ageLabel}</span>
                {row.overdue && <span className="ml-1.5 text-[11px] font-medium text-red-600">Overdue</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
