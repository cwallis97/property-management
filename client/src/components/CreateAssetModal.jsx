import { useEffect, useMemo, useState } from "react";
import { IconX, IconChevronDown } from "./icons";
import SearchableSelect from "./SearchableSelect";
import { getLocationPath } from "../utils/hierarchy";
import { createAsset } from "../utils/api";

// Asset.category is intentionally free text at the model level (no fixed
// enum exists, unlike Work Order's Category) — a plain text input, not a
// picker, is the honest reflection of that.
const STATUSES = [
  { value: "operational", label: "Operational" },
  { value: "needs-attention", label: "Needs Attention" },
  { value: "critical", label: "Critical" },
];

// Same modal shell/UX conventions as CreateWorkOrderModal (overlay, header,
// Escape-to-close, Cancel/Submit footer) — deliberately not shared as a
// generic wrapper, matching this codebase's established preference for
// small per-file duplication over cross-cutting abstraction.
// `propertyLabel` + `onChangeProperty` are optional, passed only by the
// global Quick Create launcher (QuickCreateAsset) — same additive header
// treatment as CreateWorkOrderModal. PropertyDetail passes neither.
export default function CreateAssetModal({ propertyId, locations, propertyLabel, onChangeProperty, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("operational");
  const [locationId, setLocationId] = useState(null);
  const [installDate, setInstallDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, submitting]);

  // Never allows a cross-property Location — locations is always this
  // Property's own list, passed down from the page that already loaded it.
  const locationOptions = useMemo(() => {
    const options = [{ value: null, label: "Property-level", sublabel: "No specific location" }];
    for (const location of locations) {
      const path = getLocationPath(location.id, locations);
      const breadcrumb = path.slice(0, -1).join(" › ");
      options.push({ value: location.id, label: location.name, sublabel: breadcrumb || location.type });
    }
    return options;
  }, [locations]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = { name: name.trim(), status };
    if (category.trim()) payload.category = category.trim();
    if (locationId) payload.locationId = locationId;
    if (installDate) payload.installDate = installDate;
    if (notes.trim()) payload.notes = notes.trim();

    try {
      const created = await createAsset(propertyId, payload);
      onCreated(created);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-gray-900/40 px-4 py-8 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">Add Asset</h2>
            {propertyLabel &&
              (onChangeProperty ? (
                <button
                  type="button"
                  onClick={() => !submitting && onChangeProperty()}
                  className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs font-medium text-ink-muted transition hover:text-ink-secondary"
                >
                  <span className="truncate">{propertyLabel}</span>
                  <IconChevronDown className="h-3 w-3 shrink-0" />
                </button>
              ) : (
                <p className="mt-0.5 truncate text-xs text-ink-muted">{propertyLabel}</p>
              ))}
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-subtle hover:text-ink-secondary"
            aria-label="Close"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Name</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rooftop HVAC Unit"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Category</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. HVAC, Plumbing, Appliance (optional)"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Location</label>
            <SearchableSelect
              value={locationId}
              onChange={setLocationId}
              options={locationOptions}
              placeholder="Select a location"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Status</label>
            <div className="flex gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatus(s.value)}
                  className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium transition ${
                    status === s.value ? "bg-accent text-accent-ink" : "bg-surface-subtle text-ink-secondary hover:bg-line"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Install date</label>
            <input
              type="date"
              value={installDate}
              onChange={(e) => setInstallDate(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            />
          </div>

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
              {submitting ? "Adding..." : "Add Asset"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
