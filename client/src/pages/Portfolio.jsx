import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { IconBuilding } from "../components/icons";
import { properties } from "../mock/properties";

export default function Portfolio() {
  return (
    <div>
      <PageHeader
        title="Portfolio"
        description="All properties across your organization."
      />
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
                <p className="truncate text-xs text-gray-500">{property.address}</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500">
              {property.type}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
