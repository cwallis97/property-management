import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import SectionSpinner from "../components/SectionSpinner";
import WorkOrderTable from "../components/WorkOrderTable";
import WorkOrderViewFilter from "../components/WorkOrderViewFilter";
import { IconAlertTriangle, IconWrench } from "../components/icons";
import { getPortfolioWorkOrders } from "../utils/api";
import { usePropertyScope } from "../context/PropertyScopeContext";
import { formatAge, isOverdue, compareByAttention, filterWorkOrdersByView } from "../utils/workOrders";

// Portfolio-wide operational queue: "across all of my properties, what
// maintenance work needs my attention?" — the same Work Orders already
// used everywhere else in PropertyOS, just viewed unscoped from a single
// Property. This is not a report (no financial aggregation, no cost
// entries required for a row to appear) and not another Dashboard (this is
// where an operator actually works through the queue, not just sees where
// attention is needed).
//
// Property filtering is the global Property Scope selector (Sidebar), not
// a second control here — live-follows scope, same as Assets.
export default function WorkOrders() {
  const location = useLocation();
  const navigate = useNavigate();
  // Returning from a Work Order opened out of this queue restores the exact
  // same view/filter — same router-state pattern used by every other
  // "back to origin" flow in the app (PropertyDetail's tab, Reports' drill
  // state), never browser history. Property is no longer part of that
  // restored state — it's tracked globally now, and since nothing on the
  // round trip to a Work Order and back ever changes scope, it's already
  // exactly what it was when the user left.
  const restored = location.state?.portfolioWorkOrdersState ?? null;
  const { propertyId: scopePropertyId } = usePropertyScope();

  const [view, setView] = useState(restored?.view ?? "active");

  const [workOrders, setWorkOrders] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | error | ready
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getPortfolioWorkOrders()
      .then((data) => {
        if (cancelled) return;
        setWorkOrders(data);
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

  // Same Where-resolution rules as PropertyDetail's workOrderRows, adapted
  // to read the immediate Property/Location/Asset names the backend already
  // eager-loads instead of looking them up in a per-property Locations/
  // Assets array — there is no single "current property" here to hold that
  // array for.
  const workOrderRows = useMemo(() => {
    return workOrders.map((wo) => {
      let wherePrimary;
      let whereSecondary = null;

      if (wo.assetId) {
        if (wo.asset) {
          wherePrimary = wo.asset.name;
          const loc = wo.location || wo.asset.location;
          if (loc) whereSecondary = loc.name;
        } else {
          wherePrimary = "—";
        }
      } else if (wo.locationId) {
        wherePrimary = wo.location ? wo.location.name : "—";
      } else {
        wherePrimary = "Property-level";
      }

      const createdAtDate = new Date(wo.createdAt);
      const endTime = wo.status === "completed" && wo.completedAt ? new Date(wo.completedAt) : new Date();
      const rawAge = formatAge(endTime - createdAtDate);

      return {
        id: wo.id,
        propertyId: wo.propertyId,
        propertyName: wo.property?.name ?? "—",
        title: wo.title,
        wherePrimary,
        whereSecondary,
        priority: wo.priority,
        status: wo.status,
        ageLabel: wo.status === "completed" ? `Resolved in ${rawAge}` : rawAge,
        overdue: isOverdue(wo),
        createdAtMs: createdAtDate.getTime(),
        completedAtMs: wo.completedAt ? new Date(wo.completedAt).getTime() : null,
      };
    });
  }, [workOrders]);

  // Property Scope first (the one authoritative "where am I working"
  // signal — see PropertyScopeContext), then the Active/Completed/All
  // toggle. The "Needs attention" strip below is derived from this same
  // scoped set, not the raw portfolio-wide one, so it can never show a
  // count the table beneath it doesn't actually contain — a stale strip
  // disagreeing with its own table is exactly the kind of two-sources-of-
  // truth confusion Property Scope Unification is meant to remove.
  const scopedRows = useMemo(
    () => (scopePropertyId ? workOrderRows.filter((row) => row.propertyId === scopePropertyId) : workOrderRows),
    [workOrderRows, scopePropertyId]
  );

  const urgentCount = scopedRows.filter((row) => row.priority === "urgent" && row.status !== "completed").length;
  const overdueCount = scopedRows.filter((row) => row.overdue).length;

  // Active/All keep the exact shared compareByAttention ranking so this
  // queue and every property's own Work Orders tab never disagree about
  // what's most urgent. Completed is the one explicit exception — most-
  // recently-completed first is more useful for a "what just got resolved"
  // scan — implemented here as a small local sort, not a change to the
  // shared attention algorithm's meaning.
  const visibleRows = useMemo(() => {
    const filtered = filterWorkOrdersByView(scopedRows, view);
    if (view === "completed") {
      return [...filtered].sort((a, b) => (b.completedAtMs ?? 0) - (a.completedAtMs ?? 0));
    }
    return [...filtered].sort(compareByAttention);
  }, [scopedRows, view]);

  const portfolioWorkOrdersState = { view };

  return (
    <div>
      <PageHeader title="Work Orders" description="What needs attention across your portfolio right now." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <WorkOrderViewFilter value={view} onChange={setView} />
      </div>

      {status === "loading" && <SectionSpinner />}

      {status === "error" && (
        <EmptyState
          icon={IconAlertTriangle}
          title="Couldn't load Work Orders"
          description={error || "Something went wrong. Please try again."}
        />
      )}

      {status === "ready" && workOrders.length === 0 && (
        <EmptyState
          icon={IconWrench}
          title="No Work Orders yet"
          description="Maintenance requests and repair tasks across your portfolio will show up here."
        />
      )}

      {status === "ready" && workOrders.length > 0 && (
        <div>
          {(urgentCount > 0 || overdueCount > 0) && (
            <div className="mb-4 flex items-center gap-4 rounded-xl border border-line bg-surface-subtle px-4 py-2.5 text-sm">
              <span className="font-medium text-ink-secondary">Needs attention:</span>
              {urgentCount > 0 && <span className="text-red-600 dark:text-red-400">{urgentCount} urgent</span>}
              {overdueCount > 0 && <span className="text-amber-700 dark:text-amber-400">{overdueCount} overdue</span>}
            </div>
          )}

          {visibleRows.length === 0 ? (
            <EmptyState
              icon={IconWrench}
              title={view === "completed" ? "No completed Work Orders yet" : "Nothing active right now"}
              description={
                view === "completed"
                  ? "Work Orders will show up here once they're marked complete."
                  : "Every matching Work Order is completed. Check Completed or All to see them."
              }
            />
          ) : (
            <WorkOrderTable
              rows={visibleRows}
              showPropertyContext={!scopePropertyId}
              onRowClick={(id) => {
                const row = visibleRows.find((r) => r.id === id);
                if (!row) return;
                navigate(`/portfolio/${row.propertyId}/work-orders/${id}`, {
                  state: {
                    backLabel: "Work Orders",
                    backTo: "/work-orders",
                    backTabState: { portfolioWorkOrdersState },
                  },
                });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
