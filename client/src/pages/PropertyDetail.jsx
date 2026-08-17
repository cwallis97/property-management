import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import { IconBuilding, IconBox, IconAlertTriangle } from "../components/icons";
import { getProperty } from "../utils/api";

export default function PropertyDetail() {
  const { propertyId } = useParams();
  const [property, setProperty] = useState(null);
  const [status, setStatus] = useState("loading"); // "loading" | "error" | "not-found" | "ready"
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    setStatus("loading");
    getProperty(propertyId)
      .then((data) => {
        if (cancelled) return;
        setProperty(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 404) {
          setStatus("not-found");
        } else {
          setError(err.message);
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  if (status === "loading") {
    return (
      <div>
        <PageHeader title="Property" description="Loading property details..." />
        <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
        </div>
      </div>
    );
  }

  if (status === "not-found") {
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

  if (status === "error") {
    return (
      <div>
        <PageHeader title="Property" description="Property details will appear here." />
        <EmptyState
          icon={IconAlertTriangle}
          title="Couldn't load this property"
          description={error || "Something went wrong while loading this property. Please try again."}
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

      <EmptyState
        icon={IconBox}
        title="No assets yet"
        description="Location and asset tracking for this property hasn't been built yet."
      />
    </div>
  );
}
