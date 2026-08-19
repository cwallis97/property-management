import { useMemo, useState } from "react";
import { IconSearch } from "./icons";

const columns = [
  { key: "name", label: "Asset" },
  { key: "category", label: "Category" },
  { key: "locationPath", label: "Location" },
  { key: "status", label: "Status" },
  { key: "installDate", label: "Installed" },
];

const statusBadge = {
  critical: "bg-red-50 text-red-600 ring-1 ring-inset ring-red-100",
  "needs-attention": "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100",
  operational: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100",
};

// initialQuery seeds the search box below on mount — used when arriving
// here from an Overview metric (e.g. "Critical Assets" seeds "critical",
// which the existing status-text search already matches exactly). This
// component fully remounts whenever its parent tab becomes active again, so
// seeding on mount is sufficient; nothing needs to keep it in sync after.
export default function AssetTable({ rows, initialQuery = "" }) {
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState({ key: "name", direction: "asc" });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.name, row.category, row.locationPath, row.status]
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
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
        <IconSearch className="h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter assets by name, category, or location..."
          className="w-full max-w-sm border-none bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wide text-gray-400">
              {columns.map((column) => (
                <th key={column.key} className="px-5 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className="flex items-center gap-1 hover:text-gray-600"
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
              <tr key={row.id} className="border-b border-gray-50 last:border-0">
                <td className="px-5 py-3 font-medium text-gray-900">{row.name}</td>
                <td className="px-5 py-3 text-gray-600">{row.category}</td>
                <td className="px-5 py-3 text-gray-600">{row.locationPath}</td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                      statusBadge[row.status] || "bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-100"
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-500">{row.installDate}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-5 py-10 text-center text-sm text-gray-400">
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
