import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "./EmptyState";
import SectionSpinner from "./SectionSpinner";
import { IconAlertTriangle, IconBuilding } from "./icons";
import { getProperties, updateProperty } from "../utils/api";
import { usePropertyScope } from "../context/PropertyScopeContext";

const VIEWS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

// Same segmented-control visual language as Portfolio/Vendors/Documents —
// just Active/Archived here, not All: this is an administrative access
// point to both groups, not a general browsing view.
function PropertyLifecycleFilter({ value, onChange }) {
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

// Administrative home for Property lifecycle — deliberately separate from
// Property Detail, which stays focused on day-to-day operation. Archive/
// Restore are restrained row-level text actions here (same convention as
// DocumentTable's Edit/Archive), never a prominent button, so the action
// reads as management rather than an everyday operational control.
export default function SettingsProperties() {
  const { propertyId: scopePropertyId, clearPropertyScope } = usePropertyScope();

  const [view, setView] = useState("active");
  const [properties, setProperties] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | error | ready
  const [pendingId, setPendingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getProperties({ status: view })
      .then((data) => {
        if (cancelled) return;
        setProperties(data);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  async function handleArchive(property) {
    const message = `Archive "${property.name}"? It will be removed from active operations. Its Locations, Assets, Work Orders, Documents, Costs, and historical records all remain fully preserved — this does not permanently delete the property.`;
    if (!window.confirm(message)) return;

    setPendingId(property.id);
    try {
      await updateProperty(property.id, { status: "archived" });
      setProperties((prev) => prev.filter((p) => p.id !== property.id));
      if (scopePropertyId === property.id) clearPropertyScope();
    } catch (err) {
      window.alert(err.message || "Something went wrong. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleRestore(property) {
    if (!window.confirm(`Restore "${property.name}" to active operations?`)) return;

    setPendingId(property.id);
    try {
      await updateProperty(property.id, { status: "active" });
      setProperties((prev) => prev.filter((p) => p.id !== property.id));
    } catch (err) {
      window.alert(err.message || "Something went wrong. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">Properties</h2>
          <p className="mt-0.5 text-sm text-ink-secondary">Archive a property to remove it from active operations, or restore one back.</p>
        </div>
        <PropertyLifecycleFilter value={view} onChange={setView} />
      </div>

      {status === "loading" && <SectionSpinner />}

      {status === "error" && (
        <EmptyState icon={IconAlertTriangle} title="Couldn't load properties" description="Something went wrong. Please try again." />
      )}

      {status === "ready" && properties.length === 0 && (
        <EmptyState
          icon={IconBuilding}
          title={view === "active" ? "No active properties" : "No archived properties"}
          description={
            view === "active"
              ? "Properties you archive will move out of this list."
              : "Properties you archive will show up here for historical reference."
          }
        />
      )}

      {status === "ready" && properties.length > 0 && (
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {properties.map((property) => (
            <div
              key={property.id}
              className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="min-w-0">
                <Link to={`/portfolio/${property.id}`} className="truncate text-sm font-medium text-ink hover:underline">
                  {property.name}
                </Link>
                <p className="truncate text-xs text-ink-secondary">{property.address || "No address on file"}</p>
              </div>
              {/* Below sm, this drops to its own trailing row (self-end) with
                  a bit of tap-target padding rather than squeezing against
                  the name/address column; at sm+ it sits back inline as a
                  plain text action, unchanged from before. */}
              <button
                type="button"
                disabled={pendingId === property.id}
                onClick={() => (view === "active" ? handleArchive(property) : handleRestore(property))}
                className={`-mr-2 shrink-0 self-end rounded-md px-2 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 sm:mr-0 sm:self-auto sm:px-0 sm:py-0 ${
                  view === "active" ? "text-ink-secondary hover:text-red-600 dark:hover:text-red-400" : "text-ink-secondary hover:text-ink"
                }`}
              >
                {view === "active" ? "Archive Property" : "Restore Property"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
