import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import CreatePropertyModal from "../components/CreatePropertyModal";
import { IconBuilding, IconAlertTriangle, IconPlus } from "../components/icons";
import { getProperties } from "../utils/api";
import { usePropertyScope } from "../context/PropertyScopeContext";
import { useAuth } from "../context/AuthContext";
import { CAPABILITIES } from "../utils/capabilities";

const VIEWS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

// Same segmented-control visual language as VendorViewFilter/
// DocumentViewFilter — Property's Active/Archived/All is its own value set,
// kept as its own small local control.
function PropertyViewFilter({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-subtle p-1">
      {VIEWS.map((view) => (
        <button
          key={view.value}
          type="button"
          onClick={() => onChange(view.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            value === view.value ? "bg-surface text-ink shadow-sm" : "text-ink-secondary hover:text-ink-secondary"
          }`}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}

const EMPTY_STATE_COPY = {
  active: { title: "No active properties", description: "Properties added to your company will show up here." },
  archived: { title: "No archived properties", description: "Properties you archive will show up here for historical reference." },
  all: { title: "No properties yet", description: "Properties added to your company will show up here." },
};

export default function Portfolio() {
  const navigate = useNavigate();
  const { clearPropertyScope } = usePropertyScope();
  const { hasCapability } = useAuth();
  const [view, setView] = useState("active");
  const [properties, setProperties] = useState([]);
  const [status, setStatus] = useState("loading"); // "loading" | "error" | "ready"
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Portfolio is inherently the all-properties view — arriving here is a
  // clear, deliberate signal to reset scope, unlike simply navigating to
  // Dashboard or another global page, which should keep whatever Property
  // scope was already active.
  useEffect(() => {
    clearPropertyScope();
  }, [clearPropertyScope]);

  useEffect(() => {
    let cancelled = false;

    setStatus("loading");
    getProperties({ status: view })
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
  }, [view]);

  return (
    <div>
      <PageHeader
        title="Portfolio"
        description="All properties across your organization."
      />

      {status === "ready" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <PropertyViewFilter value={view} onChange={setView} />
          {hasCapability(CAPABILITIES.PROPERTY_CREATE) && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
            >
              <IconPlus className="h-4 w-4" />
              Add Property
            </button>
          )}
        </div>
      )}

      {status === "loading" && (
        <div className="flex items-center justify-center rounded-2xl border border-line bg-surface py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
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
        <EmptyState icon={IconBuilding} title={EMPTY_STATE_COPY[view].title} description={EMPTY_STATE_COPY[view].description} />
      )}

      {status === "ready" && properties.length > 0 && (
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {properties.map((property) => (
            <Link
              key={property.id}
              to={`/portfolio/${property.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-surface-subtle"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-subtle text-ink-muted">
                  <IconBuilding className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {property.name}
                    {property.status === "archived" && (
                      <span className="ml-2 rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted ring-1 ring-inset ring-line">
                        Archived
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-ink-secondary">
                    {property.address || "No address on file"}
                  </p>
                </div>
              </div>
              {property.type && (
                <span className="shrink-0 rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-medium text-ink-secondary">
                  {property.type}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreatePropertyModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(created) => {
            setShowCreateModal(false);
            navigate(`/portfolio/${created.id}`);
          }}
        />
      )}
    </div>
  );
}
