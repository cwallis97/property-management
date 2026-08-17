import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import LocationList from "../components/LocationList";
import { IconBuilding, IconAlertTriangle } from "../components/icons";
import { getProperty, getLocations } from "../utils/api";

function SectionSpinner() {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
    </div>
  );
}

export default function PropertyDetail() {
  const { propertyId } = useParams();

  const [property, setProperty] = useState(null);
  const [propertyStatus, setPropertyStatus] = useState("loading"); // "loading" | "error" | "not-found" | "ready"
  const [propertyError, setPropertyError] = useState(null);

  const [locations, setLocations] = useState([]);
  const [locationsStatus, setLocationsStatus] = useState("loading"); // "loading" | "error" | "ready"
  const [locationsError, setLocationsError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    // Both requests only need propertyId, which is already known from the
    // route — fire them together rather than waiting on one another, and
    // track their outcomes independently so a Locations failure never
    // blocks a successfully loaded Property (or vice versa).
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

    return () => {
      cancelled = true;
    };
  }, [propertyId]);

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

      {property.sitePlanUrl && (
        <a
          href={property.sitePlanUrl}
          target="_blank"
          rel="noreferrer"
          className="mb-6 inline-block text-sm font-medium text-blue-600 hover:underline"
        >
          View site plan
        </a>
      )}

      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <IconBuilding className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">Locations</h2>
        </div>

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
    </div>
  );
}
