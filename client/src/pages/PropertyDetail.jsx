import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import SectionSpinner from "../components/SectionSpinner";
import Breadcrumb from "../components/Breadcrumb";
import LocationList from "../components/LocationList";
import SitePlanMap from "../components/SitePlanMap";
import AssetTable from "../components/AssetTable";
import WorkOrderTable, { priorityBadge, statusBadge, statusLabel } from "../components/WorkOrderTable";
import WorkOrderViewFilter from "../components/WorkOrderViewFilter";
import CreateWorkOrderModal from "../components/CreateWorkOrderModal";
import CreateAssetModal from "../components/CreateAssetModal";
import CreateLocationModal from "../components/CreateLocationModal";
import EntityDocuments from "../components/EntityDocuments";
import { IconBuilding, IconAlertTriangle, IconBox, IconWrench, IconPlus } from "../components/icons";
import { getProperty, getLocations, getAssets, getWorkOrders } from "../utils/api";
import { usePropertyScope } from "../context/PropertyScopeContext";
import { useAuth } from "../context/AuthContext";
import { CAPABILITIES } from "../utils/capabilities";
import { formatAge, isOverdue, needsAttention, compareByAttention, filterWorkOrdersByView } from "../utils/workOrders";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "map", label: "Map" },
  { key: "locations", label: "Locations" },
  { key: "assets", label: "Assets" },
  { key: "work-orders", label: "Work Orders" },
  { key: "documents", label: "Documents" },
];

// One divided stat cell inside a single shared strip — same visual pattern
// as the Dashboard's Portfolio Pulse strip, scoped to this property. When a
// metric represents a specific subset of real records (Active Work Orders,
// Critical Assets, ...) and there's actually something behind it, the cell
// itself becomes the navigation target — no separate button, no added
// visual weight, just a restrained hover/focus treatment on the existing
// cell. A zero-value metric never becomes clickable, so it never implies
// there's something to go look at.
function OverviewStat({ label, value, accent, onClick }) {
  const isActionable = typeof onClick === "function" && Number(value) > 0;
  const content = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${accent ? "text-red-600 dark:text-red-400" : "text-ink"}`}>{value}</p>
    </>
  );

  if (!isActionable) {
    return <div className="px-4 py-3.5 sm:px-5">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full cursor-pointer px-4 py-3.5 text-left transition hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-line-strong sm:px-5"
    >
      {content}
    </button>
  );
}

export default function PropertyDetail() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { propertyId: scopePropertyId, setPropertyScope } = usePropertyScope();
  const { hasCapability } = useAuth();
  // Returning from a Work Order's detail page passes back which tab to
  // land on (see WorkOrderDetail's back link), so the user doesn't lose
  // their place after finishing an action.
  const [activeTab, setActiveTab] = useState(location.state?.tab ?? "overview");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateAssetModal, setShowCreateAssetModal] = useState(false);
  const [showCreateLocationModal, setShowCreateLocationModal] = useState(false);
  // Same return-to-origin pattern as activeTab: opening a completed Work
  // Order from the Completed view and clicking back should land back on
  // Completed, not silently reset to the Active default.
  const [workOrdersView, setWorkOrdersView] = useState(location.state?.workOrdersView ?? "active");
  // Additive on top of the Active/Completed/All view above, not a fourth
  // view value — Needs Attention/Overdue aren't a "view" of the queue the
  // way Active/Completed/All are (see WorkOrderViewFilter/
  // filterWorkOrdersByView, also shared by Portfolio Work Orders), they're
  // Overview's alert metrics narrowing into it. Restored on return from a
  // Work Order the same way workOrdersView already is.
  const [workOrdersAttentionFilter, setWorkOrdersAttentionFilter] = useState(
    location.state?.workOrdersAttentionFilter ?? null
  );
  // Seeds AssetTable's own search box (which already filters by status text,
  // including "critical" and "needs-attention" verbatim) when arriving from
  // an Overview metric. AssetTable fully remounts every time this tab
  // becomes active (see the conditional render below), so this only needs
  // to hold the value at the moment of navigation, not stay in sync after.
  const [assetsInitialQuery, setAssetsInitialQuery] = useState("");

  // Tab switching is local state, not a route change, so AppShell's
  // scrollable <main> keeps whatever scroll position the previous tab left
  // it at. Without this, a scrolled-down view of one tab can land the next
  // tab's content mid-page, pushing the breadcrumb/name/address/tab nav
  // above the visible viewport. Scroll that identity block back into view
  // on every tab change so it's always what the user sees first.
  const identityRef = useRef(null);
  useEffect(() => {
    identityRef.current?.scrollIntoView({ block: "start" });
  }, [activeTab]);

  const [property, setProperty] = useState(null);
  const [propertyStatus, setPropertyStatus] = useState("loading"); // "loading" | "error" | "not-found" | "ready"
  const [propertyError, setPropertyError] = useState(null);

  const [locations, setLocations] = useState([]);
  const [locationsStatus, setLocationsStatus] = useState("loading"); // "loading" | "error" | "ready"
  const [locationsError, setLocationsError] = useState(null);

  const [assets, setAssets] = useState([]);
  const [assetsStatus, setAssetsStatus] = useState("loading"); // "loading" | "error" | "ready"
  const [assetsError, setAssetsError] = useState(null);

  const [workOrders, setWorkOrders] = useState([]);
  const [workOrdersStatus, setWorkOrdersStatus] = useState("loading"); // "loading" | "error" | "ready"
  const [workOrdersError, setWorkOrdersError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    // All four requests only need propertyId, which is already known from
    // the route — fire them together rather than chaining them, and track
    // each outcome independently so a failure in one never blocks the
    // others from displaying.
    setPropertyStatus("loading");
    getProperty(propertyId)
      .then((data) => {
        if (cancelled) return;
        setProperty(data);
        setPropertyStatus("ready");
        // Entering Property Detail establishes it as the app's active
        // scope — the URL is the source of truth here, so this always
        // overwrites whatever scope was previously set, even a stale one
        // restored from a prior session.
        setPropertyScope({ id: data.id, name: data.name });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 404) {
          setPropertyStatus("not-found");
        } else {
          setPropertyError(err.message);
          setPropertyStatus("error");
        }
      });

    setLocationsStatus("loading");
    getLocations(propertyId)
      .then((data) => {
        if (cancelled) return;
        setLocations(data);
        setLocationsStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setLocationsError(err.message);
        setLocationsStatus("error");
      });

    setAssetsStatus("loading");
    getAssets(propertyId)
      .then((data) => {
        if (cancelled) return;
        setAssets(data);
        setAssetsStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setAssetsError(err.message);
        setAssetsStatus("error");
      });

    setWorkOrdersStatus("loading");
    getWorkOrders(propertyId)
      .then((data) => {
        if (cancelled) return;
        setWorkOrders(data);
        setWorkOrdersStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setWorkOrdersError(err.message);
        setWorkOrdersStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [propertyId, setPropertyScope]);

  // The reverse of the effect above: that one sets scope TO this route's
  // Property once it loads (so afterward scopePropertyId === propertyId,
  // and this effect is a no-op). This one reacts when scope later diverges
  // from the route for a DIFFERENT reason — the user changed the global
  // selector while still sitting on this page — and treats that as a
  // request to switch context entirely: jump straight to the newly
  // selected Property's own Detail page, or back to the Portfolio
  // directory if scope cleared to All Properties. Gated on
  // propertyStatus === "ready" specifically so this can never fire before
  // the effect above has had its first chance to reconcile scope with the
  // route (e.g. arriving here with a stale scope value left over from
  // wherever the user was before) — without that gate this would
  // misfire once on mount and immediately navigate away from a page that
  // hasn't even finished loading yet. replace: true intentionally does not
  // add a browser-history entry — this is a side effect of changing a
  // filter-like control, not a deliberate click, so Back should return to
  // wherever the user was before landing on this Property, not bounce
  // through every Property the selector happened to pass through.
  useEffect(() => {
    if (propertyStatus !== "ready") return;
    if (!scopePropertyId) {
      navigate("/portfolio", { replace: true });
    } else if (scopePropertyId !== propertyId) {
      navigate(`/portfolio/${scopePropertyId}`, { replace: true });
    }
  }, [scopePropertyId, propertyStatus, propertyId, navigate]);

  // Resolves each asset's locationId to a display label using the
  // already-loaded Locations list — no per-asset requests. If Locations
  // hasn't finished loading (or failed), assigned assets fall back to a
  // neutral placeholder rather than showing nothing or crashing.
  const assetRows = useMemo(() => {
    const nameById = locationsStatus === "ready" ? new Map(locations.map((l) => [l.id, l.name])) : null;

    return assets.map((asset) => {
      let locationLabel;
      if (!asset.locationId) {
        locationLabel = "Property-level";
      } else if (!nameById) {
        locationLabel = "—";
      } else {
        locationLabel = nameById.get(asset.locationId) ?? "—";
      }

      return {
        id: asset.id,
        name: asset.name,
        category: asset.category || "—",
        locationPath: locationLabel,
        status: asset.status,
        installDate: asset.installDate || "",
      };
    });
  }, [assets, locations, locationsStatus]);

  // Resolves each work order's Location/Asset relationship into a display
  // label using only the already-loaded Locations/Assets — no per-row
  // requests. Note that an asset or location referenced by a work order may
  // have since been archived (archiving doesn't clear the reference), so it
  // may not be present in these active-only lists; that falls back to "—"
  // rather than crashing, same pattern used for Assets' Location lookup.
  //
  // The resulting rows are sorted attention-first (see compareByAttention)
  // rather than left in API order. `.map()` always returns a brand-new
  // array, so sorting it never mutates `workOrders`, the raw API response.
  const workOrderRows = useMemo(() => {
    const locationById = locationsStatus === "ready" ? new Map(locations.map((l) => [l.id, l])) : null;
    const assetById = assetsStatus === "ready" ? new Map(assets.map((a) => [a.id, a])) : null;

    const rows = workOrders.map((wo) => {
      let wherePrimary;
      let whereSecondary = null;

      if (wo.assetId) {
        const asset = assetById?.get(wo.assetId);
        if (asset) {
          wherePrimary = asset.name;
          const locId = wo.locationId ?? asset.locationId;
          if (locId) {
            const location = locationById?.get(locId);
            whereSecondary = location ? location.name : "—";
          }
        } else {
          wherePrimary = "—";
        }
      } else if (wo.locationId) {
        const location = locationById?.get(wo.locationId);
        wherePrimary = location ? location.name : "—";
      } else {
        wherePrimary = "Property-level";
      }

      // Open/in-progress work orders show time-since-opened (a live,
      // growing value). Completed ones instead show how long they took to
      // resolve (createdAt -> completedAt, a fixed value) — both computed
      // purely from real fields, nothing invented.
      const createdAtDate = new Date(wo.createdAt);
      const endTime = wo.status === "completed" && wo.completedAt ? new Date(wo.completedAt) : new Date();
      const ageMs = endTime - createdAtDate;
      const rawAge = formatAge(ageMs);

      return {
        id: wo.id,
        title: wo.title,
        wherePrimary,
        whereSecondary,
        priority: wo.priority,
        status: wo.status,
        ageLabel: wo.status === "completed" ? `Resolved in ${rawAge}` : rawAge,
        overdue: isOverdue(wo),
        createdAtMs: createdAtDate.getTime(),
      };
    });

    return rows.sort(compareByAttention);
  }, [workOrders, locations, locationsStatus, assets, assetsStatus]);

  // Always computed from the FULL work order set, never the Active/
  // Completed/All view filter below — this represents current operational
  // urgency, not "whatever happens to be on screen." Switching to Completed
  // must never make this summary misleadingly show zero attention items.
  const urgentCount = workOrderRows.filter((row) => row.priority === "urgent" && row.status !== "completed").length;
  const overdueCount = workOrderRows.filter((row) => row.overdue).length;

  // Same needsAttention/isOverdue calls the summary counts above and
  // Overview's stats already use — id sets, not a re-derivation of either
  // rule, so this can never disagree with what "Needs Attention"/"Overdue"
  // mean anywhere else in the app.
  const attentionWorkOrderIds = useMemo(
    () => new Set(workOrders.filter(needsAttention).map((wo) => wo.id)),
    [workOrders]
  );
  const overdueWorkOrderIds = useMemo(
    () => new Set(workOrders.filter(isOverdue).map((wo) => wo.id)),
    [workOrders]
  );

  // What the table actually renders — filtered separately from the summary
  // counts above, using the one shared Active/Completed/All definition, then
  // optionally narrowed further by an Overview metric's attention filter.
  const visibleWorkOrderRows = useMemo(() => {
    const viewFiltered = filterWorkOrdersByView(workOrderRows, workOrdersView);
    if (workOrdersAttentionFilter === "needsAttention") {
      return viewFiltered.filter((row) => attentionWorkOrderIds.has(row.id));
    }
    if (workOrdersAttentionFilter === "overdue") {
      return viewFiltered.filter((row) => overdueWorkOrderIds.has(row.id));
    }
    return viewFiltered;
  }, [workOrderRows, workOrdersView, workOrdersAttentionFilter, attentionWorkOrderIds, overdueWorkOrderIds]);

  // Overview command-center numbers — all derived from the same four
  // requests this page already made, using the exact same needsAttention/
  // isOverdue rules as everywhere else. No second definition of "attention."
  const overview = useMemo(() => {
    const activeWorkOrders = workOrders.filter((wo) => wo.status !== "completed");
    const attentionWorkOrders = workOrders.filter(needsAttention);
    const topIssues = workOrderRows.filter((row) => row.status !== "completed").slice(0, 5);

    return {
      activeCount: activeWorkOrders.length,
      attentionCount: attentionWorkOrders.length,
      overdueCount,
      criticalAssetCount: assets.filter((a) => a.status === "critical").length,
      attentionAssetCount: assets.filter((a) => a.status === "needs-attention").length,
      topIssues,
    };
  }, [workOrders, workOrderRows, assets, overdueCount]);

  const topLevelLocations = useMemo(
    () => locations.filter((l) => !l.parentLocationId),
    [locations]
  );

  if (propertyStatus === "loading") {
    return (
      <div>
        <Breadcrumb items={[{ label: "Portfolio", to: "/portfolio" }, { label: "Property" }]} />
        <PageHeader title="Property" description="Loading property details..." />
        <SectionSpinner />
      </div>
    );
  }

  if (propertyStatus === "not-found") {
    return (
      <div>
        <Breadcrumb items={[{ label: "Portfolio", to: "/portfolio" }, { label: "Property" }]} />
        <PageHeader title="Property" description="Property details will appear here." />
        <EmptyState
          icon={IconBuilding}
          title="Property not found"
          description="This property may have been removed, or the link is out of date."
        />
      </div>
    );
  }

  if (propertyStatus === "error") {
    return (
      <div>
        <Breadcrumb items={[{ label: "Portfolio", to: "/portfolio" }, { label: "Property" }]} />
        <PageHeader title="Property" description="Property details will appear here." />
        <EmptyState
          icon={IconAlertTriangle}
          title="Couldn't load this property"
          description={propertyError || "Something went wrong while loading this property. Please try again."}
        />
      </div>
    );
  }

  return (
    <div ref={identityRef}>
      <Breadcrumb items={[{ label: "Portfolio", to: "/portfolio" }, { label: property.name }]} />
      <PageHeader
        title={property.name}
        description={property.address || "No address on file"}
      />

      {property.status === "archived" && (
        <p className="mb-6 flex items-center gap-2 text-sm text-ink-secondary">
          <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-ink-secondary ring-1 ring-inset ring-line">
            Archived
          </span>
          Removed from active operations. Locations, Assets, Work Orders, Documents, and history remain fully preserved. Manage this from Settings → Properties.
        </p>
      )}

      <div className="mb-6 flex gap-6 border-b border-line">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setActiveTab(tab.key);
              // A plain tab click is always the tab's normal default state —
              // only an Overview metric click should arrive pre-filtered.
              if (tab.key === "assets") setAssetsInitialQuery("");
              if (tab.key === "work-orders") setWorkOrdersAttentionFilter(null);
            }}
            className={`border-b-2 pb-3 text-sm font-medium transition ${
              activeTab === tab.key
                ? "border-accent text-ink"
                : "border-transparent text-ink-secondary hover:text-ink-secondary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-3 sm:divide-y-0">
              <OverviewStat
                label="Active Work Orders"
                value={overview.activeCount}
                onClick={() => {
                  setWorkOrdersView("active");
                  setWorkOrdersAttentionFilter(null);
                  setActiveTab("work-orders");
                }}
              />
              <OverviewStat
                label="Needs Attention"
                value={overview.attentionCount}
                accent={overview.attentionCount > 0}
                onClick={() => {
                  setWorkOrdersView("active");
                  setWorkOrdersAttentionFilter("needsAttention");
                  setActiveTab("work-orders");
                }}
              />
              <OverviewStat
                label="Overdue"
                value={overview.overdueCount}
                accent={overview.overdueCount > 0}
                onClick={() => {
                  setWorkOrdersView("active");
                  setWorkOrdersAttentionFilter("overdue");
                  setActiveTab("work-orders");
                }}
              />
              <OverviewStat
                label="Critical Assets"
                value={overview.criticalAssetCount}
                accent={overview.criticalAssetCount > 0}
                onClick={() => {
                  setAssetsInitialQuery("critical");
                  setActiveTab("assets");
                }}
              />
              <OverviewStat
                label="Assets Needing Attention"
                value={overview.attentionAssetCount}
                onClick={() => {
                  setAssetsInitialQuery("needs-attention");
                  setActiveTab("assets");
                }}
              />
              <OverviewStat label="Locations" value={locations.length} />
            </div>

            <div>
              <h2 className="mb-3 text-sm font-semibold text-ink">Top Issues</h2>
              {overview.topIssues.length === 0 ? (
                <EmptyState
                  icon={IconWrench}
                  title="Nothing needs attention"
                  description="No open Work Orders at this property right now."
                />
              ) : (
                <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
                  {overview.topIssues.map((row) => (
                    <Link
                      key={row.id}
                      to={`/portfolio/${propertyId}/work-orders/${row.id}`}
                      state={{ backLabel: "Overview", backTo: `/portfolio/${propertyId}`, backTabState: { tab: "overview" } }}
                      className="block px-5 py-4 transition hover:bg-surface-subtle"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{row.title}</p>
                          <p className="truncate text-xs text-ink-secondary">
                            {row.wherePrimary}
                            {row.whereSecondary && ` · ${row.whereSecondary}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                              priorityBadge[row.priority] || "bg-surface-subtle text-ink-secondary"
                            }`}
                          >
                            {row.priority}
                          </span>
                          {row.overdue && (
                            <span className="rounded-full bg-red-50 dark:bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 ring-1 ring-inset ring-red-100 dark:ring-red-500/20">
                              Overdue
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                              statusBadge[row.status] || "bg-surface-subtle text-ink-secondary"
                            }`}
                          >
                            {statusLabel[row.status] || row.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Reserved spatial slot — today this is a real, useful summary of
              the property's Locations built from data already on this page;
              it occupies the same conceptual space a future site map will
              eventually take over, without faking a map now. */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">Locations</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                {locations.length} location{locations.length === 1 ? "" : "s"}
              </p>

              {topLevelLocations.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {topLevelLocations.slice(0, 6).map((loc) => {
                    const childCount = locations.filter((l) => l.parentLocationId === loc.id).length;
                    return (
                      <li key={loc.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-ink-secondary">{loc.name}</span>
                        {childCount > 0 && <span className="shrink-0 text-xs text-ink-muted">{childCount}</span>}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-ink-muted">No locations added yet.</p>
              )}

              <button
                type="button"
                onClick={() => setActiveTab("locations")}
                className="mt-4 text-xs font-medium text-ink-secondary transition hover:text-ink"
              >
                View all locations →
              </button>
            </div>

            {property.sitePlanUrl && (
              <a
                href={property.sitePlanUrl}
                target="_blank"
                rel="noreferrer"
                className="block text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                View site plan
              </a>
            )}
          </div>
        </div>
      )}

      {activeTab === "map" && (
        <SitePlanMap
          propertyId={propertyId}
          locations={locations}
          assets={assets}
          workOrders={workOrders}
          onWorkOrderCreated={(created) => setWorkOrders((prev) => [...prev, created])}
        />
      )}

      {activeTab === "locations" && (
        <div>
          {locationsStatus === "loading" && <SectionSpinner />}

          {locationsStatus === "error" && (
            <EmptyState
              icon={IconAlertTriangle}
              title="Couldn't load locations"
              description={locationsError || "Something went wrong while loading locations. Please try again."}
            />
          )}

          {locationsStatus === "ready" && (
            <>
              <div className="mb-4 flex justify-end">
                {hasCapability(CAPABILITIES.LOCATION_MANAGE) &&
                  (property.status === "active" ? (
                    <button
                      type="button"
                      onClick={() => setShowCreateLocationModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
                    >
                      <IconPlus className="h-4 w-4" />
                      Add Location
                    </button>
                  ) : (
                    <p className="text-xs text-ink-muted">Restore this property to add new locations.</p>
                  ))}
              </div>

              {locations.length === 0 && (
                <EmptyState
                  icon={IconBuilding}
                  title="No locations yet"
                  description="Sites, lots, common areas, and other physical locations added to this property will show up here."
                />
              )}

              {locations.length > 0 && <LocationList locations={locations} />}
            </>
          )}
        </div>
      )}

      {activeTab === "assets" && (
        <div>
          {assetsStatus === "loading" && <SectionSpinner />}

          {assetsStatus === "error" && (
            <EmptyState
              icon={IconAlertTriangle}
              title="Couldn't load assets"
              description={assetsError || "Something went wrong while loading assets. Please try again."}
            />
          )}

          {assetsStatus === "ready" && (
            <>
              <div className="mb-4 flex justify-end">
                {hasCapability(CAPABILITIES.ASSET_CREATE) &&
                  (property.status === "active" ? (
                    <button
                      type="button"
                      onClick={() => setShowCreateAssetModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
                    >
                      <IconPlus className="h-4 w-4" />
                      Add Asset
                    </button>
                  ) : (
                    <p className="text-xs text-ink-muted">Restore this property to add new assets.</p>
                  ))}
              </div>

              {assets.length === 0 && (
                <EmptyState
                  icon={IconBox}
                  title="No assets yet"
                  description="Equipment and physical assets tracked for this property will show up here."
                />
              )}

              {assets.length > 0 && (
                <AssetTable
                  rows={assetRows}
                  initialQuery={assetsInitialQuery}
                  onRowClick={(id) =>
                    navigate(`/portfolio/${propertyId}/assets/${id}`, {
                      state: {
                        backLabel: "Assets",
                        backTo: `/portfolio/${propertyId}`,
                        backTabState: { tab: "assets" },
                      },
                    })
                  }
                />
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "work-orders" && (
        <div>
          {workOrdersStatus === "loading" && <SectionSpinner />}

          {workOrdersStatus === "error" && (
            <EmptyState
              icon={IconAlertTriangle}
              title="Couldn't load work orders"
              description={workOrdersError || "Something went wrong while loading work orders. Please try again."}
            />
          )}

          {workOrdersStatus === "ready" && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <WorkOrderViewFilter value={workOrdersView} onChange={setWorkOrdersView} />
                  {workOrdersAttentionFilter && (
                    <button
                      type="button"
                      onClick={() => setWorkOrdersAttentionFilter(null)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition hover:bg-accent-hover"
                    >
                      {workOrdersAttentionFilter === "overdue" ? "Overdue" : "Needs Attention"}
                      <span aria-hidden="true">✕</span>
                    </button>
                  )}
                </div>
                {hasCapability(CAPABILITIES.WORK_ORDER_CREATE) &&
                  (property.status === "active" ? (
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
                    >
                      <IconPlus className="h-4 w-4" />
                      Create Work Order
                    </button>
                  ) : (
                    <p className="text-xs text-ink-muted">Restore this property to create new work orders.</p>
                  ))}
              </div>

              {workOrders.length === 0 && (
                <EmptyState
                  icon={IconWrench}
                  title="No work orders yet"
                  description="Maintenance requests and repair tasks for this property will show up here."
                />
              )}

              {workOrders.length > 0 && (
                <div>
                  {(urgentCount > 0 || overdueCount > 0) && (
                    <div className="mb-4 flex items-center gap-4 rounded-xl border border-line bg-surface-subtle px-4 py-2.5 text-sm">
                      <span className="font-medium text-ink-secondary">Needs attention:</span>
                      {urgentCount > 0 && <span className="text-red-600 dark:text-red-400">{urgentCount} urgent</span>}
                      {overdueCount > 0 && <span className="text-amber-700 dark:text-amber-400">{overdueCount} overdue</span>}
                    </div>
                  )}

                  {visibleWorkOrderRows.length === 0 ? (
                    <EmptyState
                      icon={IconWrench}
                      title={
                        workOrdersAttentionFilter
                          ? workOrdersAttentionFilter === "overdue"
                            ? "Nothing overdue right now"
                            : "Nothing needs attention right now"
                          : workOrdersView === "completed"
                          ? "No completed work orders yet"
                          : "Nothing active right now"
                      }
                      description={
                        workOrdersAttentionFilter
                          ? "Clear the filter above to see the rest of this view."
                          : workOrdersView === "completed"
                          ? "Work orders will show up here once they're marked complete."
                          : "Every work order here is completed. Check Completed or All to see them."
                      }
                    />
                  ) : (
                    <WorkOrderTable
                      rows={visibleWorkOrderRows}
                      onRowClick={(id) =>
                        navigate(`/portfolio/${propertyId}/work-orders/${id}`, {
                          state: {
                            backLabel: "Work Orders",
                            backTo: `/portfolio/${propertyId}`,
                            backTabState: { tab: "work-orders", workOrdersView, workOrdersAttentionFilter },
                          },
                        })
                      }
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "documents" && <EntityDocuments attachment={{ propertyId }} />}

      {showCreateModal && (
        <CreateWorkOrderModal
          propertyId={propertyId}
          locations={locations}
          assets={assets}
          onClose={() => setShowCreateModal(false)}
          onCreated={(created) => {
            setWorkOrders((prev) => [...prev, created]);
            setShowCreateModal(false);
          }}
        />
      )}

      {showCreateAssetModal && (
        <CreateAssetModal
          propertyId={propertyId}
          locations={locations}
          onClose={() => setShowCreateAssetModal(false)}
          onCreated={(created) => {
            setAssets((prev) => [...prev, created]);
            setShowCreateAssetModal(false);
          }}
        />
      )}

      {showCreateLocationModal && (
        <CreateLocationModal
          propertyId={propertyId}
          locations={locations}
          onClose={() => setShowCreateLocationModal(false)}
          onCreated={(created) => {
            setLocations((prev) => [...prev, created]);
            setShowCreateLocationModal(false);
          }}
        />
      )}
    </div>
  );
}
