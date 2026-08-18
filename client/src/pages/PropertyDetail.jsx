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
import { IconBuilding, IconAlertTriangle, IconBox, IconWrench, IconPlus } from "../components/icons";
import { getProperty, getLocations, getAssets, getWorkOrders } from "../utils/api";
import { formatAge, isOverdue, needsAttention, compareByAttention, filterWorkOrdersByView } from "../utils/workOrders";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "map", label: "Map" },
  { key: "locations", label: "Locations" },
  { key: "assets", label: "Assets" },
  { key: "work-orders", label: "Work Orders" },
];

// One divided stat cell inside a single shared strip — same visual pattern
// as the Dashboard's Portfolio Pulse strip, scoped to this property.
function OverviewStat({ label, value, accent }) {
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${accent ? "text-red-600" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

export default function PropertyDetail() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Returning from a Work Order's detail page passes back which tab to
  // land on (see WorkOrderDetail's back link), so the user doesn't lose
  // their place after finishing an action.
  const [activeTab, setActiveTab] = useState(location.state?.tab ?? "overview");
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Same return-to-origin pattern as activeTab: opening a completed Work
  // Order from the Completed view and clicking back should land back on
  // Completed, not silently reset to the Active default.
  const [workOrdersView, setWorkOrdersView] = useState(location.state?.workOrdersView ?? "active");

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
  }, [propertyId]);

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

  // What the table actually renders — filtered separately from the summary
  // counts above, using the one shared Active/Completed/All definition.
  const visibleWorkOrderRows = useMemo(
    () => filterWorkOrdersByView(workOrderRows, workOrdersView),
    [workOrderRows, workOrdersView]
  );

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

      <div className="mb-6 flex gap-6 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`border-b-2 pb-3 text-sm font-medium transition ${
              activeTab === tab.key
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white sm:grid-cols-3 sm:divide-y-0">
              <OverviewStat label="Active Work Orders" value={overview.activeCount} />
              <OverviewStat label="Needs Attention" value={overview.attentionCount} accent={overview.attentionCount > 0} />
              <OverviewStat label="Overdue" value={overview.overdueCount} accent={overview.overdueCount > 0} />
              <OverviewStat label="Critical Assets" value={overview.criticalAssetCount} accent={overview.criticalAssetCount > 0} />
              <OverviewStat label="Assets Needing Attention" value={overview.attentionAssetCount} />
              <OverviewStat label="Locations" value={locations.length} />
            </div>

            <div>
              <h2 className="mb-3 text-sm font-semibold text-gray-900">Top Issues</h2>
              {overview.topIssues.length === 0 ? (
                <EmptyState
                  icon={IconWrench}
                  title="Nothing needs attention"
                  description="No open Work Orders at this property right now."
                />
              ) : (
                <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
                  {overview.topIssues.map((row) => (
                    <Link
                      key={row.id}
                      to={`/portfolio/${propertyId}/work-orders/${row.id}`}
                      state={{ backLabel: "Overview", backTo: `/portfolio/${propertyId}`, backTabState: { tab: "overview" } }}
                      className="block px-5 py-4 transition hover:bg-gray-50"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{row.title}</p>
                          <p className="truncate text-xs text-gray-500">
                            {row.wherePrimary}
                            {row.whereSecondary && ` · ${row.whereSecondary}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                              priorityBadge[row.priority] || "bg-gray-50 text-gray-500"
                            }`}
                          >
                            {row.priority}
                          </span>
                          {row.overdue && (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-600 ring-1 ring-inset ring-red-100">
                              Overdue
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                              statusBadge[row.status] || "bg-gray-50 text-gray-500"
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
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-900">Locations</h2>
              <p className="mt-0.5 text-xs text-gray-400">
                {locations.length} location{locations.length === 1 ? "" : "s"}
              </p>

              {topLevelLocations.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {topLevelLocations.slice(0, 6).map((loc) => {
                    const childCount = locations.filter((l) => l.parentLocationId === loc.id).length;
                    return (
                      <li key={loc.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-gray-700">{loc.name}</span>
                        {childCount > 0 && <span className="shrink-0 text-xs text-gray-400">{childCount}</span>}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-gray-400">No locations added yet.</p>
              )}

              <button
                type="button"
                onClick={() => setActiveTab("locations")}
                className="mt-4 text-xs font-medium text-gray-500 transition hover:text-gray-900"
              >
                View all locations →
              </button>
            </div>

            {property.sitePlanUrl && (
              <a
                href={property.sitePlanUrl}
                target="_blank"
                rel="noreferrer"
                className="block text-sm font-medium text-blue-600 hover:underline"
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

          {locationsStatus === "ready" && locations.length === 0 && (
            <EmptyState
              icon={IconBuilding}
              title="No locations yet"
              description="Buildings, floors, units, and other locations added to this property will show up here."
            />
          )}

          {locationsStatus === "ready" && locations.length > 0 && <LocationList locations={locations} />}
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

          {assetsStatus === "ready" && assets.length === 0 && (
            <EmptyState
              icon={IconBox}
              title="No assets yet"
              description="Equipment and physical assets tracked for this property will show up here."
            />
          )}

          {assetsStatus === "ready" && assets.length > 0 && <AssetTable rows={assetRows} />}
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
                <WorkOrderViewFilter value={workOrdersView} onChange={setWorkOrdersView} />
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
                >
                  <IconPlus className="h-4 w-4" />
                  Create Work Order
                </button>
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
                    <div className="mb-4 flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm">
                      <span className="font-medium text-gray-700">Needs attention:</span>
                      {urgentCount > 0 && <span className="text-red-600">{urgentCount} urgent</span>}
                      {overdueCount > 0 && <span className="text-amber-700">{overdueCount} overdue</span>}
                    </div>
                  )}

                  {visibleWorkOrderRows.length === 0 ? (
                    <EmptyState
                      icon={IconWrench}
                      title={workOrdersView === "completed" ? "No completed work orders yet" : "Nothing active right now"}
                      description={
                        workOrdersView === "completed"
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
                            backTabState: { tab: "work-orders", workOrdersView },
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
    </div>
  );
}
