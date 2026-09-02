import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import EmptyState from "./EmptyState";
import SectionSpinner from "./SectionSpinner";
import { statusBadge, statusLabel } from "./WorkOrderTable";
import { IconAlertTriangle, IconWrench } from "./icons";
import { getMaintenanceSpendSummary, getMaintenanceSpendWorkOrders } from "../utils/api";
import { usePropertyScope } from "../context/PropertyScopeContext";
import { RANGE_OPTIONS, resolveDateRange } from "../utils/reportDateRange";

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatShortDate(value) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatTile({ label, value }) {
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}

// The financial breakdown Category -> Work Type -> Work Orders drill —
// preserved exactly as it was, now a secondary Reports tab rather than the
// entire Reports experience. Filters on Cost Entry date (ce.cost_date),
// deliberately distinct from the Work Orders tab / Site Map Analyze's
// Work-Order-date basis (see reportController.js#getWorkOrdersReport's own
// comment) — for that reason this report does not offer a "View on Site
// Map" handoff of its own; that lives on the Work Orders tab, whose
// filters are guaranteed to match Analyze mode's exactly.
//
// Property filtering is the global Property Scope selector (Sidebar), not
// a second control here. Entering Reports while Riverbend is selected
// begins the report in Riverbend context for free (filterParams reads
// scopePropertyId directly); changing scope while this tab stays mounted
// re-filters immediately. Because a Category/Work Type drill-down is only
// meaningful within the property context it was drilled into, an actual
// scope CHANGE (not the initial mount, which may be restoring a real
// "back" state — see the ref below) resets the drill back to the root
// breakdown, the same way goToRoot() already does when a user clicks
// "Maintenance Spend" in the breadcrumb.
export default function MaintenanceSpendReport() {
  const location = useLocation();
  // Returning from a Work Order opened out of this report restores exactly
  // where the user left off — same router-state pattern already used for
  // every other "back to origin" flow in the app, not a URL/query-param
  // scheme or browser history. Property is no longer part of this restored
  // state: it's tracked globally now, and nothing on the round trip to a
  // Work Order and back ever changes scope, so it's already exactly what
  // it was when the user left.
  const restored = location.state?.reportState ?? null;
  const { propertyId: scopePropertyId } = usePropertyScope();

  const [rangeKey, setRangeKey] = useState(restored?.rangeKey ?? "last_12_months");
  const [category, setCategory] = useState(restored?.category ?? null);
  const [categoryLabelText, setCategoryLabelText] = useState(restored?.categoryLabel ?? null);
  const [workTypeId, setWorkTypeId] = useState(restored?.workTypeId ?? null);
  const [workTypeLabelText, setWorkTypeLabelText] = useState(restored?.workTypeLabel ?? null);

  const [data, setData] = useState(null);
  const [dataStatus, setDataStatus] = useState("loading"); // loading | error | ready

  const [workOrders, setWorkOrders] = useState([]);
  const [workOrdersStatus, setWorkOrdersStatus] = useState("idle"); // idle | loading | error | ready

  const { startDate, endDate } = useMemo(() => resolveDateRange(rangeKey), [rangeKey]);

  const filterParams = useMemo(
    () => ({ startDate, endDate, propertyId: scopePropertyId || undefined, category: category || undefined, workTypeId: workTypeId || undefined }),
    [startDate, endDate, scopePropertyId, category, workTypeId]
  );

  useEffect(() => {
    let cancelled = false;
    setDataStatus("loading");
    getMaintenanceSpendSummary(filterParams)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setDataStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setDataStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, scopePropertyId, category, workTypeId]);

  useEffect(() => {
    if (!workTypeId) {
      setWorkOrders([]);
      setWorkOrdersStatus("idle");
      return;
    }
    let cancelled = false;
    setWorkOrdersStatus("loading");
    getMaintenanceSpendWorkOrders(filterParams)
      .then((rows) => {
        if (cancelled) return;
        setWorkOrders(rows);
        setWorkOrdersStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setWorkOrdersStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workTypeId, startDate, endDate, scopePropertyId, category]);

  function goToRoot() {
    setCategory(null);
    setCategoryLabelText(null);
    setWorkTypeId(null);
    setWorkTypeLabelText(null);
  }

  // Skips the very first run so a real "back to Maintenance Spend" restore
  // (which legitimately sets category/workTypeId from router state on
  // mount, while scopePropertyId happens to settle to its initial value at
  // the same moment) is never immediately clobbered. Only an actual, later
  // change to global scope resets the drill-down.
  const isFirstScopeRender = useRef(true);
  useEffect(() => {
    if (isFirstScopeRender.current) {
      isFirstScopeRender.current = false;
      return;
    }
    goToRoot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopePropertyId]);

  function selectCategory(row) {
    setCategory(row.key);
    setCategoryLabelText(row.label);
    setWorkTypeId(null);
    setWorkTypeLabelText(null);
  }

  function selectWorkType(row) {
    setWorkTypeId(row.key);
    setWorkTypeLabelText(row.label);
  }

  // Carried into WorkOrderDetail's router state so "← Back to Maintenance
  // Spend" restores this exact scope — filters and drill depth
  // (Property itself is implicit via global scope, not part of this).
  const reportState = {
    rangeKey,
    category,
    categoryLabel: categoryLabelText,
    workTypeId,
    workTypeLabel: workTypeLabelText,
  };

  const breakdownLabel = category ? "Work Type" : "Category";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-lg border border-line bg-surface-subtle p-1">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRangeKey(option.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                rangeKey === option.value ? "bg-surface text-ink shadow-sm" : "text-ink-secondary hover:text-ink-secondary"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {dataStatus === "loading" && <SectionSpinner />}

      {dataStatus === "error" && (
        <EmptyState icon={IconAlertTriangle} title="Couldn't load Maintenance Spend" description="Something went wrong. Please try again." />
      )}

      {dataStatus === "ready" && data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <StatTile label="Total Maintenance Spend" value={formatMoney(data.summary.totalSpend)} />
            <StatTile label="Work Orders With Cost" value={data.summary.workOrdersWithCost} />
            <StatTile label="Average Cost / Work Order" value={formatMoney(data.summary.averageCostPerWorkOrder)} />
          </div>

          {(category || workTypeId) && (
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm">
              <button type="button" onClick={goToRoot} className="text-ink-secondary transition hover:text-ink">
                Maintenance Spend
              </button>
              {category && (
                <>
                  <span className="text-ink-muted">›</span>
                  {workTypeId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setWorkTypeId(null);
                        setWorkTypeLabelText(null);
                      }}
                      className="text-ink-secondary transition hover:text-ink"
                    >
                      {categoryLabelText}
                    </button>
                  ) : (
                    <span className="font-medium text-ink">{categoryLabelText}</span>
                  )}
                </>
              )}
              {workTypeId && (
                <>
                  <span className="text-ink-muted">›</span>
                  <span className="font-medium text-ink">{workTypeLabelText}</span>
                </>
              )}
            </nav>
          )}

          {!workTypeId && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-ink">{breakdownLabel} Breakdown</h2>
              {data.breakdown.length === 0 ? (
                <EmptyState icon={IconWrench} title="No recorded spend in this range" description="Adjust the date range or property scope to see Maintenance Spend." />
              ) : (
                <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
                  {data.breakdown.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => (category ? selectWorkType(row) : selectCategory(row))}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-surface-subtle"
                    >
                      <span className="truncate text-sm font-medium text-ink">{row.label}</span>
                      <span className="flex shrink-0 items-center gap-4 text-sm">
                        <span className="text-ink-muted">{row.workOrders} work order{row.workOrders === 1 ? "" : "s"}</span>
                        <span className="w-24 text-right font-medium text-ink">{formatMoney(row.spend)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {workTypeId && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-ink">Work Orders</h2>

              {workOrdersStatus === "loading" && <SectionSpinner />}
              {workOrdersStatus === "error" && (
                <EmptyState icon={IconAlertTriangle} title="Couldn't load Work Orders" description="Something went wrong. Please try again." />
              )}

              {workOrdersStatus === "ready" && workOrders.length === 0 && (
                <EmptyState icon={IconWrench} title="No Work Orders in this range" description="Nothing recorded cost here for the current filters." />
              )}

              {workOrdersStatus === "ready" && workOrders.length > 0 && (
                <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
                  {workOrders.map((wo) => (
                    <Link
                      key={wo.id}
                      to={`/portfolio/${wo.propertyId}/work-orders/${wo.id}`}
                      state={{ backLabel: "Maintenance Spend", backTo: "/reports", backTabState: { tab: "spend", reportState } }}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-4 transition hover:bg-surface-subtle"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{wo.title}</p>
                        <p className="truncate text-xs text-ink-secondary">
                          {wo.propertyName}
                          {wo.locationName && ` · ${wo.locationName}`}
                          {" · Reported "}
                          {formatShortDate(wo.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadge[wo.status] || "bg-surface-subtle text-ink-secondary"}`}
                        >
                          {statusLabel[wo.status] || wo.status}
                        </span>
                        <span className="text-right">
                          <span className="block text-[10px] uppercase tracking-wide text-ink-muted">Spend in Period</span>
                          <span className="font-medium text-ink">{formatMoney(wo.spendInPeriod)}</span>
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
