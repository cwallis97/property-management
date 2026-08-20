import { useEffect, useMemo, useState } from "react";
import { IconX } from "./icons";
import SearchableSelect from "./SearchableSelect";
import { getLocationPath } from "../utils/hierarchy";
import { getLocations, updateAsset } from "../utils/api";

// Same status set / visual language as CreateAssetModal.
const STATUSES = [
  { value: "operational", label: "Operational" },
  { value: "needs-attention", label: "Needs Attention" },
  { value: "critical", label: "Critical" },
];

// Same modal shell as CreateAssetModal — Property is shown as static,
// read-only context rather than a field: updateAsset's backend contract
// never accepts a propertyId, so an Asset's Property is architecturally
// immutable after creation. Unlike CreateAssetModal (opened from within
// Property Detail, which already has the Property's Locations loaded),
// this is opened from Asset Detail — its own routed page with no such list
// on hand — so it fetches the Property's Locations itself.
export default function EditAssetModal({ asset, onClose, onUpdated }) {
  const [name, setName] = useState(asset.name);
  const [category, setCategory] = useState(asset.category ?? "");
  const [status, setStatus] = useState(asset.status);
  const [locationId, setLocationId] = useState(asset.locationId ?? null);
  const [installDate, setInstallDate] = useState(asset.installDate ?? "");
  const [notes, setNotes] = useState(asset.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [locations, setLocations] = useState([]);
  useEffect(() => {
    getLocations(asset.propertyId)
      .then(setLocations)
      .catch(() => {
        // The location picker just won't populate — every other field
        // still works, and the current location stays selected by id even
        // without a resolved label until this loads.
      });
  }, [asset.propertyId]);

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, submitting]);

  // Never allows a cross-property Location — locations is always fetched
  // for this Asset's own propertyId, same guarantee CreateAssetModal gets
  // for free from its caller already having loaded that Property's list.
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

    try {
      const updated = await updateAsset(asset.id, {
        name: name.trim(),
        category: category.trim() || null,
        status,
        locationId,
        installDate: installDate || null,
        notes: notes.trim() || null,
      });
      onUpdated(updated);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-gray-900/40 px-4 py-8 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Edit Asset</h2>
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
            <label className="mb-1.5 block text-sm font-medium text-ink">Property</label>
            <p className="rounded-lg border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink-secondary">{asset.property?.name}</p>
          </div>

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
              {submitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
