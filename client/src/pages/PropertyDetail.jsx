import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import LocationList from "../components/LocationList";
import AssetTable from "../components/AssetTable";
import { IconBuilding, IconAlertTriangle, IconBox } from "../components/icons";
import { getProperty, getLocations, getAssets } from "../utils/api";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "locations", label: "Locations" },
  { key: "assets", label: "Assets" },
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
  const [activeTab, setActiveTab] = useState("overview");

  const [property, setProperty] = useState(null);
  const [propertyStatus, setPropertyStatus] = useState("loading"); // "loading" | "error" | "not-found" | "ready"
  const [propertyError, setPropertyError] = useState(null);

  const [locations, setLocations] = useState([]);
  const [locationsStatus, setLocationsStatus] = useState("loading"); // "loading" | "error" | "ready"
  const [locationsError, setLocationsError] = useState(null);

  const [assets, setAssets] = useState([]);
  const [assetsStatus, setAssetsStatus] = useState("loading"); // "loading" | "error" | "ready"
  const [assetsError, setAssetsError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    // All three requests only need propertyId, which is already known from
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
    </div>
  );
}
