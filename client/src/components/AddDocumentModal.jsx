import { useEffect, useRef, useState } from "react";
import { IconX } from "./icons";
import SearchableSelect from "./SearchableSelect";
import { DOCUMENT_CATEGORIES } from "../utils/documents";
import { createDocument, getProperties, getPortfolioAssets, getPortfolioWorkOrders, getVendors } from "../utils/api";
import { usePropertyScope } from "../context/PropertyScopeContext";

const ATTACHMENT_TYPES = [
  { value: "propertyId", label: "Property" },
  { value: "assetId", label: "Asset" },
  { value: "workOrderId", label: "Work Order" },
  { value: "vendorId", label: "Vendor" },
];

const ACCEPTED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const ACCEPTED_ACCEPT_ATTR = ".pdf,.png,.jpg,.jpeg";

// Same modal shell/UX conventions as CreateAssetModal/CreateVendorModal.
//
// `attachment` is a single-key object ({ propertyId } | { assetId } |
// { workOrderId } | { vendorId }) when opened from an entity's own page —
// already known, never re-asked. When null (opened from the global
// Documents page), a small self-contained "Belongs to" picker appears
// instead, reusing the same portfolio-wide list endpoints Portfolio
// Assets/Work Orders/Vendors already fetch elsewhere in the app — no new
// backend query, no generic folder system, just "pick the type, then pick
// the record."
export default function AddDocumentModal({ attachment, onClose, onCreated }) {
  const { propertyId: scopePropertyId } = usePropertyScope();
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("other");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Only relevant when attachment is null (global upload).
  const [targetType, setTargetType] = useState("propertyId");
  const [targetId, setTargetId] = useState(null);
  const [targetOptions, setTargetOptions] = useState([]);
  const [targetOptionsStatus, setTargetOptionsStatus] = useState("idle");

  useEffect(() => {
    if (attachment) return;
    let cancelled = false;
    setTargetOptionsStatus("loading");
    setTargetId(null);

    const fetchers = {
      propertyId: () => getProperties().then((rows) => rows.map((r) => ({ value: r.id, label: r.name, sublabel: null }))),
      assetId: () =>
        getPortfolioAssets().then((rows) => rows.map((r) => ({ value: r.id, label: r.name, sublabel: r.property?.name ?? null }))),
      workOrderId: () =>
        getPortfolioWorkOrders().then((rows) => rows.map((r) => ({ value: r.id, label: r.title, sublabel: r.property?.name ?? null }))),
      vendorId: () =>
        getVendors().then((rows) =>
          rows.filter((v) => v.status === "active").map((r) => ({ value: r.id, label: r.name, sublabel: r.category || null }))
        ),
    };

    fetchers[targetType]()
      .then((options) => {
        if (cancelled) return;
        setTargetOptions(options);
        setTargetOptionsStatus("ready");
        // Preselect the current Property scope, but only for the Property
        // target type — for Asset/Work Order/Vendor there's no single
        // unambiguous record scope should imply, so those stay unselected.
        // Only preselects an id actually present in the just-fetched
        // (access-restricted) options, so a stale/inaccessible scope value
        // can never be silently offered here.
        if (targetType === "propertyId" && scopePropertyId && options.some((o) => o.value === scopePropertyId)) {
          setTargetId(scopePropertyId);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setTargetOptionsStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [attachment, targetType]);

  function handleFileChosen(chosen) {
    if (!chosen) return;
    if (!ACCEPTED_MIME_TYPES.includes(chosen.type)) {
      setError("File must be a PDF, PNG, or JPG.");
      return;
    }
    setFile(chosen);
    setError(null);
    // Defaults the name from the filename (extension stripped), but stays
    // fully editable — never overwrites a name the user already typed.
    if (!name.trim()) {
      setName(chosen.name.replace(/\.[^/.]+$/, ""));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    const resolvedAttachment = attachment ?? (targetId ? { [targetType]: targetId } : null);
    if (!resolvedAttachment) {
      setError("Choose what this document belongs to.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name.trim());
    formData.append("category", category);
    if (notes.trim()) formData.append("notes", notes.trim());
    for (const [key, value] of Object.entries(resolvedAttachment)) {
      formData.append(key, value);
    }

    try {
      const created = await createDocument(formData);
      onCreated(created);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-gray-900/40 px-4 py-8 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Add Document</h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-subtle hover:text-ink-secondary"
            aria-label="Close"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => handleFileChosen(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-sm font-medium text-ink-secondary transition hover:border-line-strong hover:text-ink-secondary"
            >
              {file ? file.name : "Choose a file (PDF, PNG, or JPG)"}
            </button>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Well Pump #1 Warranty"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {DOCUMENT_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                    category === c.value ? "bg-accent text-accent-ink" : "bg-surface-subtle text-ink-secondary hover:bg-line"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {!attachment && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Belongs to</label>
              <div className="mb-2 flex gap-1.5">
                {ATTACHMENT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTargetType(t.value)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                      targetType === t.value ? "bg-accent text-accent-ink" : "bg-surface-subtle text-ink-secondary hover:bg-line"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <SearchableSelect
                value={targetId}
                onChange={setTargetId}
                options={targetOptions}
                placeholder={
                  targetOptionsStatus === "loading"
                    ? "Loading..."
                    : `Select a ${ATTACHMENT_TYPES.find((t) => t.value === targetType).label}`
                }
              />
            </div>
          )}

          <div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-secondary placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Uploading..." : "Add Document"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
