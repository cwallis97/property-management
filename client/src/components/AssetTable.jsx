import { useMemo, useState } from "react";
import { IconSearch } from "./icons";

export const statusBadge = {
  critical:
    "bg-red-50 text-red-600 ring-1 ring-inset ring-red-100 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20",
  "needs-attention":
    "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20",
  operational:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20",
};

// initialQuery seeds the search box below on mount — used when arriving
// here from an Overview metric (e.g. "Critical Assets" seeds "critical",
// which the existing status-text search already matches exactly). This
// component fully remounts whenever its parent tab becomes active again, so
// seeding on mount is sufficient; nothing needs to keep it in sync after.
//
// showPropertyContext folds Property + Location into a subtitle under the
// Asset name (dropping the standalone Location and Installed columns) for
// the portfolio-wide queue, where every row already needs to make its
// property obvious and install dates would just be clutter. Property-level
// Assets (the default) render exactly as before.
export default function AssetTable({ rows, initialQuery = "", showPropertyContext = false, onRowClick }) {
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState({ key: "name", direction: "asc" });

  const columns = useMemo(
    () =>
      showPropertyContext
        ? [
            { key: "name", label: "Asset" },
            { key: "category", label: "Category" },
            { key: "status", label: "Status" },
          ]
        : [
            { key: "name", label: "Asset" },
            { key: "category", label: "Category" },
            { key: "locationPath", label: "Location" },
            { key: "status", label: "Status" },
            { key: "installDate", label: "Installed" },
          ],
    [showPropertyContext]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.name, row.category, row.locationPath, row.propertyName, row.status]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q))
    );
  }, [rows, query]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const aVal = (a[sort.key] ?? "").toString().toLowerCase();
      const bVal = (b[sort.key] ?? "").toString().toLowerCase();
      if (aVal < bVal) return sort.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sort.direction === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filtered, sort]);

  function toggleSort(key) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-5 py-4">
        <IconSearch className="h-4 w-4 text-ink-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter assets by name, category, or location..."
          className="w-full max-w-sm border-none bg-transparent text-sm text-ink-secondary placeholder:text-ink-muted focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs font-medium uppercase tracking-wide text-ink-muted">
              {columns.map((column) => (
                <th key={column.key} className="px-5 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className="flex items-center gap-1 hover:text-ink-secondary"
                  >
                    {column.label}
                    {sort.key === column.key && (sort.direction === "asc" ? "↑" : "↓")}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.id) : undefined}
                className={`border-b border-surface-subtle last:border-0 ${
                  onRowClick ? "cursor-pointer transition hover:bg-surface-subtle" : ""
                }`}
              >
                <td className="px-5 py-3 font-medium text-ink">
                  {row.name}
                  {showPropertyContext && (
                    <p className="mt-0.5 truncate text-xs font-normal text-ink-muted">
                      {row.propertyName}
                      {row.locationPath && row.locationPath !== "Property-level" && ` · ${row.locationPath}`}
                    </p>
                  )}
                </td>
                <td className="px-5 py-3 text-ink-secondary">{row.category}</td>
                {!showPropertyContext && <td className="px-5 py-3 text-ink-secondary">{row.locationPath}</td>}
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                      statusBadge[row.status] || "bg-surface-subtle text-ink-secondary ring-1 ring-inset ring-line"
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
                {!showPropertyContext && <td className="px-5 py-3 text-ink-secondary">{row.installDate}</td>}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-5 py-10 text-center text-sm text-ink-muted">
                  No assets match your filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
