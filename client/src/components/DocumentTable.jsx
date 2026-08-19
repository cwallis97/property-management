import { useMemo, useState } from "react";
import { IconSearch } from "./icons";
import { documentCategoryLabel } from "../utils/documents";
import { openDocumentFile } from "../utils/api";

function formatShortDate(value) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const ATTACHMENT_TYPE_LABEL = { property: "Property", asset: "Asset", workOrder: "Work Order", vendor: "Vendor" };

// Same search/sort shell as AssetTable/VendorTable. Row click opens the
// file directly (no Document Detail page); Edit/Archive are separate,
// explicit small actions — same split as EntityDocuments' compact rows.
export default function DocumentTable({ rows, onEdit, onArchive }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "createdAt", direction: "desc" });

  const columns = [
    { key: "name", label: "Document" },
    { key: "category", label: "Category" },
    { key: "attachedTo", label: "Attached To" },
    { key: "propertyName", label: "Property" },
    { key: "createdAt", label: "Uploaded" },
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.name, documentCategoryLabel[row.category], row.attachedTo, row.propertyName]
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
      current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }
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
          placeholder="Filter documents by name, category, or what it's attached to..."
          className="w-full max-w-sm border-none bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wide text-gray-400">
              {columns.map((column) => (
                <th key={column.key} className="px-5 py-3">
                  <button type="button" onClick={() => toggleSort(column.key)} className="flex items-center gap-1 hover:text-gray-600">
                    {column.label}
                    {sort.key === column.key && (sort.direction === "asc" ? "↑" : "↓")}
                  </button>
                </th>
              ))}
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className="cursor-pointer border-b border-gray-50 transition last:border-0 hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900" onClick={() => openDocumentFile(row.id)}>
                  {row.name}
                  {row.archivedAt && (
                    <span className="ml-2 rounded-full bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400 ring-1 ring-inset ring-gray-100">
                      Archived
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-gray-600" onClick={() => openDocumentFile(row.id)}>
                  {documentCategoryLabel[row.category] || row.category}
                </td>
                <td className="px-5 py-3 text-gray-600" onClick={() => openDocumentFile(row.id)}>
                  {row.attachedTo}
                  <span className="ml-1 text-xs text-gray-400">({ATTACHMENT_TYPE_LABEL[row.attachmentType]})</span>
                </td>
                <td className="px-5 py-3 text-gray-600" onClick={() => openDocumentFile(row.id)}>
                  {row.propertyName || "—"}
                </td>
                <td className="px-5 py-3 text-gray-500" onClick={() => openDocumentFile(row.id)}>
                  {formatShortDate(row.createdAt)}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => onEdit(row)} className="text-xs font-medium text-gray-500 hover:text-gray-900">
                      Edit
                    </button>
                    {!row.archivedAt && (
                      <button type="button" onClick={() => onArchive(row)} className="text-xs font-medium text-gray-500 hover:text-red-600">
                        Archive
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-5 py-10 text-center text-sm text-gray-400">
                  No documents match your filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
