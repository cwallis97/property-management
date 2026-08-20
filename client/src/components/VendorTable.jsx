import { useMemo, useState } from "react";
import { IconSearch } from "./icons";

export const statusBadge = {
  active:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20",
  inactive: "bg-surface-subtle text-ink-secondary ring-1 ring-inset ring-line",
};

// Same shell/UX conventions as AssetTable (search box, sortable columns,
// status badges) — Vendor isn't Property-scoped, so there's no
// showPropertyContext equivalent here; every row already belongs to one
// flat, portfolio-wide list.
export default function VendorTable({ rows, initialQuery = "", onRowClick }) {
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState({ key: "name", direction: "asc" });

  const columns = [
    { key: "name", label: "Vendor" },
    { key: "category", label: "Services" },
    { key: "status", label: "Status" },
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.name, row.category, row.contactName, row.phone, row.email]
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
          placeholder="Filter vendors by name, contact, or service..."
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
                  {(row.contactName || row.phone) && (
                    <p className="mt-0.5 truncate text-xs font-normal text-ink-muted">
                      {row.contactName}
                      {row.contactName && row.phone && " · "}
                      {row.phone}
                    </p>
                  )}
                </td>
                <td className="px-5 py-3 text-ink-secondary">{row.category || "—"}</td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                      statusBadge[row.status] || "bg-surface-subtle text-ink-secondary ring-1 ring-inset ring-line"
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-5 py-10 text-center text-sm text-ink-muted">
                  No vendors match your filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
