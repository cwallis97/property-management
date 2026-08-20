import { useEffect, useState } from "react";
import SectionSpinner from "./SectionSpinner";
import AddDocumentModal from "./AddDocumentModal";
import EditDocumentModal from "./EditDocumentModal";
import { IconPlus } from "./icons";
import { documentCategoryLabel } from "../utils/documents";
import { getDocuments, archiveDocument, openDocumentFile } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { CAPABILITIES } from "../utils/capabilities";

function formatShortDate(value) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Embedded in Property/Asset/Work Order/Vendor Detail — "when I'm looking
// at an Asset, I can see documents belonging to that Asset without going
// to Documents and searching manually." `attachment` is a single-key
// object ({ propertyId } | { assetId } | { workOrderId } | { vendorId }),
// passed straight through to both the list fetch and AddDocumentModal.
// Shows only documents attached DIRECTLY to this record — a Document on
// an Asset does not also appear on that Asset's Property page, matching
// exactly how the attachment filter works server-side.
export default function EntityDocuments({ attachment, title = "Documents" }) {
  const { hasCapability } = useAuth();
  const canManage = hasCapability(CAPABILITIES.DOCUMENT_MANAGE);
  const [documents, setDocuments] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | error | ready
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getDocuments(attachment)
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
    // attachment is a fresh object every render from the caller's JSX —
    // compare by value, not reference, so this only refetches when the
    // actual target id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(attachment)]);

  // Archived Documents are excluded from this default view — same
  // convention as Active/Completed/All elsewhere; the global Documents
  // page (not this compact section) is where an Archived filter belongs.
  const visibleDocuments = documents.filter((d) => !d.archivedAt);

  async function handleArchive(doc) {
    if (!window.confirm(`Archive "${doc.name}"? It stays in history but leaves this list.`)) return;
    const updated = await archiveDocument(doc.id);
    setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition hover:text-gray-900"
          >
            <IconPlus className="h-3.5 w-3.5" />
            Add Document
          </button>
        )}
      </div>

      {status === "loading" && <SectionSpinner />}
      {status === "error" && <p className="text-sm text-red-600">Couldn't load documents. Please try again.</p>}

      {status === "ready" && visibleDocuments.length === 0 && <p className="text-sm text-gray-400">No documents yet.</p>}

      {status === "ready" && visibleDocuments.length > 0 && (
        <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
          {visibleDocuments.map((doc) => (
            <div
              key={doc.id}
              onClick={() => openDocumentFile(doc.id)}
              className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{doc.name}</p>
                <p className="text-xs text-gray-400">
                  {documentCategoryLabel[doc.category] || doc.category} · {formatShortDate(doc.createdAt)}
                </p>
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setEditingDocument(doc)}
                    className="text-xs font-medium text-gray-500 transition hover:text-gray-900"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleArchive(doc)}
                    className="text-xs font-medium text-gray-500 transition hover:text-red-600"
                  >
                    Archive
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddDocumentModal
          attachment={attachment}
          onClose={() => setShowAddModal(false)}
          onCreated={(created) => {
            setDocuments((prev) => [created, ...prev]);
            setShowAddModal(false);
          }}
        />
      )}

      {editingDocument && (
        <EditDocumentModal
          document={editingDocument}
          onClose={() => setEditingDocument(null)}
          onUpdated={(updated) => {
            setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
            setEditingDocument(null);
          }}
        />
      )}
    </div>
  );
}
