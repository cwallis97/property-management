import { useEffect, useMemo, useState } from "react";
import { IconX } from "./icons";
import SearchableSelect from "./SearchableSelect";
import SitePlanCanvas from "./SitePlanCanvas";
import { getLocationPath } from "../utils/hierarchy";
import { createWorkOrder, getSitePlan, getWorkTypes } from "../utils/api";
import { useSitePlanFile } from "../utils/useSitePlanFile";
import { WORK_ORDER_CATEGORIES } from "../utils/workOrders";

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export default function CreateWorkOrderModal({ propertyId, locations, assets, initialMapPosition, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationId, setLocationId] = useState(null);
  const [assetId, setAssetId] = useState(null);
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [category, setCategory] = useState(null);
  const [workTypeId, setWorkTypeId] = useState(null);
  const [workTypes, setWorkTypes] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getWorkTypes()
      .then((data) => {
        if (!cancelled) setWorkTypes(data);
      })
      .catch(() => {
        // Classification is optional — if the list fails to load, the
        // category buttons still work, there just won't be a Work Type
        // picker underneath. Never blocks creating a Work Order.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Site-plan-awareness is independent of how this modal was opened — the
  // plain "Create Work Order" button and the map's "Report Issue" flow both
  // use this same modal, so it fetches this itself rather than requiring
  // every caller to know/pass it.
  const [sitePlan, setSitePlan] = useState(null);
  const [sitePlanStatus, setSitePlanStatus] = useState("loading"); // loading | none | ready
  const [mapStepOpen, setMapStepOpen] = useState(Boolean(initialMapPosition));
  const [mapPosition, setMapPosition] = useState(initialMapPosition ?? null);
  const [nudgedForPosition, setNudgedForPosition] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSitePlan(propertyId)
      .then((data) => {
        if (cancelled) return;
        setSitePlan(data);
        setSitePlanStatus("ready");
      })
      .catch(() => {
        // No site plan (404) or a transient fetch error — either way the
        // map step just doesn't appear; it should never block creating a
        // Work Order.
        if (!cancelled) setSitePlanStatus("none");
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const { status: fileStatus, fileUrl, fileObjectType } = useSitePlanFile(propertyId, sitePlanStatus === "ready" ? sitePlan : null);

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

  // Only meaningful once a category is chosen — a Work Type without a
  // Category doesn't mean anything.
  const workTypeOptions = useMemo(() => {
    const options = [{ value: null, label: "No work type", sublabel: null }];
    for (const workType of workTypes.filter((w) => w.category === category)) {
      options.push({ value: workType.id, label: workType.label, sublabel: null });
    }
    return options;
  }, [workTypes, category]);

  function handleCategoryClick(value) {
    setCategory((prev) => (prev === value ? null : value));
    setWorkTypeId(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    if (!title.trim()) {
      setError("What's wrong? is required.");
      return;
    }

    // Soft enforcement: when this property has a site plan, nudge once for
    // a map position rather than silently allowing every physical Work
    // Order to skip it — but never hard-block, since mapX/mapY are
    // deliberately optional at the data level.
    if (sitePlanStatus === "ready" && !mapPosition && !nudgedForPosition) {
      setMapStepOpen(true);
      setNudgedForPosition(true);
      setError("This property has a site plan — mark the location on the map, or click Create Work Order again to skip.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = { title: title.trim(), priority };
    if (description.trim()) payload.description = description.trim();
    if (effectiveLocationId) payload.locationId = effectiveLocationId;
    if (assetId) payload.assetId = assetId;
    if (dueDate) payload.dueDate = dueDate;
    if (category) payload.category = category;
    if (workTypeId) payload.workTypeId = workTypeId;
    if (mapPosition) {
      payload.mapX = mapPosition.x;
      payload.mapY = mapPosition.y;
    }

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
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Create Work Order</h2>
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
            <label className="mb-1.5 block text-sm font-medium text-ink">What's wrong?</label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Water leak near Unit 101"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            />
          </div>

          <div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details if useful (optional)"
              rows={2}
              className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-secondary placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {WORK_ORDER_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => handleCategoryClick(c.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                    category === c.value ? "bg-accent text-accent-ink" : "bg-surface-subtle text-ink-secondary hover:bg-line"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {category && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Work Type</label>
              <SearchableSelect
                value={workTypeId}
                onChange={setWorkTypeId}
                options={workTypeOptions}
                placeholder="Select a work type (optional)"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Where</label>
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
            <label className="mb-1.5 block text-sm font-medium text-ink">Asset</label>
            <SearchableSelect
              value={assetId}
              onChange={setAssetId}
              options={assetOptions}
              placeholder="Select an asset (optional)"
            />
          </div>

          {sitePlanStatus === "ready" && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-sm font-medium text-ink">Location on map</label>
                {mapPosition && (
                  <button
                    type="button"
                    onClick={() => setMapPosition(null)}
                    className="text-xs font-medium text-ink-muted transition hover:text-ink-secondary"
                  >
                    Clear
                  </button>
                )}
              </div>

              {!mapStepOpen ? (
                <button
                  type="button"
                  onClick={() => setMapStepOpen(true)}
                  className="w-full rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-sm font-medium text-ink-secondary transition hover:border-line-strong hover:text-ink-secondary"
                >
                  Mark Location on Map
                </button>
              ) : (
                <>
                  <p className="mb-1.5 text-xs text-ink-muted">Click the map to set the exact position.</p>
                  <SitePlanCanvas
                    fileStatus={fileStatus}
                    fileUrl={fileUrl}
                    fileObjectType={fileObjectType}
                    height="260px"
                    pickMode
                    onPick={(x, y) => setMapPosition({ x, y })}
                    pendingPoint={mapPosition}
                  />
                </>
              )}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Priority</label>
            <div className="flex gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium transition ${
                    priority === p.value
                      ? "bg-accent text-accent-ink"
                      : "bg-surface-subtle text-ink-secondary hover:bg-line"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
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
              {submitting ? "Creating..." : "Create Work Order"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
