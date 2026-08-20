import { useEffect, useMemo, useState } from "react";
import { IconX } from "./icons";
import SearchableSelect from "./SearchableSelect";
import { getLocationPath } from "../utils/hierarchy";
import { createLocation } from "../utils/api";

// Same modal shell/UX conventions as CreateAssetModal/CreateWorkOrderModal.
// Type is free text, matching Location.type's actual backend shape (no
// fixed taxonomy) — the placeholder suggests manufactured-housing-relevant
// examples without forcing one rigid vocabulary. `locations` is always this
// Property's own already-loaded, non-archived list, so the parent picker can
// never offer a cross-property or archived option.
export default function CreateLocationModal({ propertyId, locations, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [parentLocationId, setParentLocationId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, submitting]);

  const parentOptions = useMemo(() => {
    const options = [{ value: null, label: "No parent", sublabel: "Top-level location" }];
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
    if (!type.trim()) {
      setError("Type is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = { name: name.trim(), type: type.trim() };
    if (parentLocationId) payload.parentLocationId = parentLocationId;

    try {
      const created = await createLocation(propertyId, payload);
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
          <h2 className="text-base font-semibold text-ink">Add Location</h2>
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
            <label className="mb-1.5 block text-sm font-medium text-ink">Name</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lot 12, North Common Area, Pump House"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Type</label>
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="e.g. Site, Common Area, Building, Utility Area"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Parent Location</label>
            <SearchableSelect
              value={parentLocationId}
              onChange={setParentLocationId}
              options={parentOptions}
              placeholder="No parent"
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
              {submitting ? "Adding..." : "Add Location"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
