import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import { IconBuilding, IconAlertTriangle } from "../components/icons";
import { getProperties } from "../utils/api";

export default function Portfolio() {
  const [properties, setProperties] = useState([]);
  const [status, setStatus] = useState("loading"); // "loading" | "error" | "ready"
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    setStatus("loading");
    getProperties()
      .then((data) => {
        if (cancelled) return;
        setProperties(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="Portfolio"
        description="All properties across your organization."
      />

      {status === "loading" && (
        <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
        </div>
      )}

      {status === "error" && (
        <EmptyState
          icon={IconAlertTriangle}
          title="Couldn't load properties"
          description={error || "Something went wrong while loading your portfolio. Please try again."}
        />
      )}

      {status === "ready" && properties.length === 0 && (
        <EmptyState
          icon={IconBuilding}
          title="No properties yet"
          description="Properties added to your company will show up here."
          actionLabel="Add Property"
        />
      )}

      {status === "ready" && properties.length > 0 && (
        <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
          {properties.map((property) => (
            <Link
              key={property.id}
              to={`/portfolio/${property.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-gray-50"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
                  <IconBuilding className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{property.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {property.address || "No address on file"}
                  </p>
                </div>
              </div>
              {property.type && (
                <span className="shrink-0 rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500">
                  {property.type}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
