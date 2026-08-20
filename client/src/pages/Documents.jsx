import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import SectionSpinner from "../components/SectionSpinner";
import SearchableSelect from "../components/SearchableSelect";
import DocumentTable from "../components/DocumentTable";
import AddDocumentModal from "../components/AddDocumentModal";
import EditDocumentModal from "../components/EditDocumentModal";
import { IconAlertTriangle, IconFolder, IconPlus } from "../components/icons";
import { DOCUMENT_CATEGORIES } from "../utils/documents";
import { getDocuments, archiveDocument, getProperties } from "../utils/api";
import { usePropertyScope } from "../context/PropertyScopeContext";
import { useAuth } from "../context/AuthContext";
import { CAPABILITIES } from "../utils/capabilities";

const VIEWS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

// Same segmented-control visual language as WorkOrderViewFilter/
// AssetViewFilter/VendorViewFilter — Document's Active/Archived/All is its
// own value set, kept as its own small local control.
function DocumentViewFilter({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
      {VIEWS.map((view) => (
        <button
          key={view.value}
          type="button"
          onClick={() => onChange(view.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            value === view.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}

// "Find the operational document I'm looking for" — a clean index, not a
// file-management product. Every row traces back to the exact same
// Document records EntityDocuments shows on each entity's own page; there
// is no separate "global" data source.
export default function Documents() {
  // Seeded from the app's current Property scope on first mount, then fully
  // independent local state — matches the same rule as Portfolio Assets/
  // Work Orders. Unlike those two, Documents' portfolio-wide list endpoint
  // already accepts a server-side propertyId filter, so this refetches
  // rather than filtering an already-fetched array client-side.
  const { propertyId: scopePropertyId } = usePropertyScope();
  const { hasCapability } = useAuth();
  const canManage = hasCapability(CAPABILITIES.DOCUMENT_MANAGE);

  const [view, setView] = useState("active");
  const [category, setCategory] = useState(null);
  const [propertyFilterId, setPropertyFilterId] = useState(scopePropertyId ?? null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);

  const [properties, setProperties] = useState([]);
  useEffect(() => {
    getProperties()
      .then(setProperties)
      .catch(() => {
        // The property filter just won't populate — the list itself still
        // works unfiltered.
      });
  }, []);

  const [documents, setDocuments] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | error | ready

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getDocuments(propertyFilterId ? { propertyId: propertyFilterId } : {})
      .then((data) => {
        if (cancelled) return;
        setDocuments(data);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [propertyFilterId]);

  const rows = useMemo(
    () =>
      documents.map((doc) => ({
        id: doc.id,
        name: doc.name,
        category: doc.category,
        attachedTo: doc.attachment.label,
        attachmentType: doc.attachment.type,
        propertyName: doc.property?.name ?? null,
        createdAt: doc.createdAt,
        archivedAt: doc.archivedAt,
      })),
    [documents]
  );

  const visibleRows = useMemo(() => {
    let list = rows;
    if (view === "active") list = list.filter((r) => !r.archivedAt);
    else if (view === "archived") list = list.filter((r) => r.archivedAt);
    if (category) list = list.filter((r) => r.category === category);
    return list;
  }, [rows, view, category]);

  const categoryOptions = useMemo(
    () => [{ value: null, label: "All Categories", sublabel: null }, ...DOCUMENT_CATEGORIES.map((c) => ({ value: c.value, label: c.label, sublabel: null }))],
    []
  );

  const propertyOptions = useMemo(() => {
    const options = [{ value: null, label: "All Properties", sublabel: null }];
    for (const p of properties) options.push({ value: p.id, label: p.name, sublabel: null });
    return options;
  }, [properties]);

  function handleCreated(created) {
    // The current filter (when set) only matches Documents attached
    // directly to that Property — same narrower meaning the backend query
    // param already has everywhere else (EntityDocuments included). Only
    // optimistically prepend if the new Document actually satisfies that,
    // so the list never shows something a refetch wouldn't.
    const matchesFilter = !propertyFilterId || (created.attachment?.type === "property" && created.attachment.id === propertyFilterId);
    if (matchesFilter) setDocuments((prev) => [created, ...prev]);
    setShowAddModal(false);
  }

  function handleUpdated(updated) {
    setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    setEditingDocument(null);
  }

  async function handleArchive(row) {
    if (!window.confirm(`Archive "${row.name}"? It stays in history but leaves the Active list.`)) return;
    const updated = await archiveDocument(row.id);
    setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  function editingDocumentFull() {
    return documents.find((d) => d.id === editingDocument?.id) ?? null;
  }

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Warranties, invoices, inspection reports, permits, and other operational files."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <DocumentViewFilter value={view} onChange={setView} />
          <div className="w-48">
            <SearchableSelect value={category} onChange={setCategory} options={categoryOptions} placeholder="All Categories" />
          </div>
          <div className="w-48">
            <SearchableSelect
              value={propertyFilterId}
              onChange={setPropertyFilterId}
              options={propertyOptions}
              placeholder="All Properties"
            />
          </div>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            <IconPlus className="h-4 w-4" />
            Add Document
          </button>
        )}
      </div>

      {status === "loading" && <SectionSpinner />}

      {status === "error" && (
        <EmptyState icon={IconAlertTriangle} title="Couldn't load Documents" description="Something went wrong. Please try again." />
      )}

      {status === "ready" && documents.length === 0 && (
        <EmptyState
          icon={IconFolder}
          title="No documents yet"
          description="Warranties, invoices, inspection reports, permits, and other operational files can be attached to a Property, Asset, Work Order, or Vendor."
        />
      )}

      {status === "ready" && documents.length > 0 && visibleRows.length === 0 && (
        <EmptyState icon={IconFolder} title="Nothing here right now" description="Adjust the filters above." />
      )}

      {status === "ready" && visibleRows.length > 0 && (
        <DocumentTable rows={visibleRows} onEdit={setEditingDocument} onArchive={handleArchive} />
      )}

      {showAddModal && <AddDocumentModal attachment={null} onClose={() => setShowAddModal(false)} onCreated={handleCreated} />}

      {editingDocument && editingDocumentFull() && (
        <EditDocumentModal document={editingDocumentFull()} onClose={() => setEditingDocument(null)} onUpdated={handleUpdated} />
      )}
    </div>
  );
}
