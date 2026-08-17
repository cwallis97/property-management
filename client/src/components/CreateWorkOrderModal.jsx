import { useEffect, useMemo, useState } from "react";
import { IconX } from "./icons";
import SearchableSelect from "./SearchableSelect";
import { getLocationPath } from "../utils/hierarchy";
import { createWorkOrder } from "../utils/api";

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export default function CreateWorkOrderModal({ propertyId, locations, assets, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationId, setLocationId] = useState(null);
  const [assetId, setAssetId] = useState(null);
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, submitting]);

  // Picking an Asset that has its own Location determines the Location —
  // the field locks to that value instead of asking the user to redundantly
  // (and possibly contradictorily) pick it again. Clearing the Asset (or
  // picking a property-level one) hands the field back for manual choice.
  const selectedAsset = assets.find((a) => a.id === assetId) ?? null;
  const locationLocked = Boolean(selectedAsset?.locationId);
  const effectiveLocationId = locationLocked ? selectedAsset.locationId : locationId;

  const locationOptions = useMemo(() => {
    const options = [{ value: null, label: "Property-level", sublabel: "No specific location" }];
    for (const location of locations) {
      const path = getLocationPath(location.id, locations);
      const breadcrumb = path.slice(0, -1).join(" › ");
      options.push({ value: location.id, label: location.name, sublabel: breadcrumb || location.type });
    }
    return options;
  }, [locations]);

  // Scoped to the currently effective Location so a contradictory pairing
  // can't be selected in the first place: property-level assets are always
  // eligible, plus assets actually at that Location.
  const assetOptions = useMemo(() => {
    const relevant = effectiveLocationId
      ? assets.filter((a) => !a.locationId || a.locationId === effectiveLocationId)
      : assets;
    const options = [{ value: null, label: "No asset", sublabel: null }];
    for (const asset of relevant) {
      const location = asset.locationId ? locations.find((l) => l.id === asset.locationId) : null;
      options.push({ value: asset.id, label: asset.name, sublabel: location ? location.name : "Property-level" });
    }
    return options;
  }, [assets, locations, effectiveLocationId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    if (!title.trim()) {
      setError("What's wrong? is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = { title: title.trim(), priority };
    if (description.trim()) payload.description = description.trim();
    if (effectiveLocationId) payload.locationId = effectiveLocationId;
    if (assetId) payload.assetId = assetId;
    if (dueDate) payload.dueDate = dueDate;

    try {
      const created = await createWorkOrder(propertyId, payload);
      onCreated(created);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-gray-900/40 px-4 py-8 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Create Work Order</h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-50 hover:text-gray-600"
            aria-label="Close"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-900">What's wrong?</label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Water leak near Unit 101"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          <div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details if useful (optional)"
              rows={2}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-900">Where</label>
            <SearchableSelect
              value={effectiveLocationId}
              onChange={setLocationId}
              options={locationOptions}
              placeholder="Select a location"
              disabled={locationLocked}
              disabledHint={locationLocked ? `Set automatically because ${selectedAsset.name} is located here.` : null}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-900">Asset</label>
            <SearchableSelect
              value={assetId}
              onChange={setAssetId}
              options={assetOptions}
              placeholder="Select an asset (optional)"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-900">Priority</label>
            <div className="flex gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium transition ${
                    priority === p.value
                      ? "bg-gray-900 text-white"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-900">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Work Order"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
