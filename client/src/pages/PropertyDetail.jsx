import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import LocationList from "../components/LocationList";
import AssetTable from "../components/AssetTable";
import WorkOrderTable from "../components/WorkOrderTable";
import CreateWorkOrderModal from "../components/CreateWorkOrderModal";
import { IconBuilding, IconAlertTriangle, IconBox, IconWrench, IconPlus } from "../components/icons";
import { getProperty, getLocations, getAssets, getWorkOrders } from "../utils/api";
import { formatAge, isOverdue, compareByAttention } from "../utils/workOrders";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "locations", label: "Locations" },
  { key: "assets", label: "Assets" },
  { key: "work-orders", label: "Work Orders" },
];

function SectionSpinner() {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
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

  const urgentCount = workOrderRows.filter((row) => row.priority === "urgent" && row.status !== "completed").length;
  const overdueCount = workOrderRows.filter((row) => row.overdue).length;

  if (propertyStatus === "loading") {
    return (
      <div>
        <PageHeader title="Property" description="Loading property details..." />
        <SectionSpinner />
      </div>
    );
  }

  if (propertyStatus === "not-found") {
    return (
      <div>
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
    <div>
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

      {activeTab === "overview" &&
        (property.sitePlanUrl ? (
          <a
            href={property.sitePlanUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            View site plan
          </a>
        ) : (
          <EmptyState
            icon={IconBuilding}
            title="No additional details"
            description="Site plan and other property details will appear here once added."
          />
        ))}

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
              <div className="mb-4 flex items-center justify-end">
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
                  <WorkOrderTable
                    rows={workOrderRows}
                    onRowClick={(id) => navigate(`/portfolio/${propertyId}/work-orders/${id}`)}
                  />
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
