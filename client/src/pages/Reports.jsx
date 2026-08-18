import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import SectionSpinner from "../components/SectionSpinner";
import SearchableSelect from "../components/SearchableSelect";
import { statusBadge, statusLabel } from "../components/WorkOrderTable";
import { IconAlertTriangle, IconWrench } from "../components/icons";
import { getProperties, getMaintenanceSpendSummary, getMaintenanceSpendWorkOrders } from "../utils/api";

const RANGE_OPTIONS = [
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_90_days", label: "Last 90 Days" },
  { value: "ytd", label: "Year to Date" },
  { value: "last_12_months", label: "Last 12 Months" },
  { value: "all_time", label: "All Time" },
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateOnly(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Resolves a preset range into concrete { startDate, endDate } using LOCAL
// calendar days — a single frontend concern, so the backend only ever
// filters on explicit dates and a future Custom Range needs no backend
// change at all. All Time omits both bounds entirely.
function resolveRange(rangeKey) {
  const today = new Date();
  const endDate = toDateOnly(today);

  if (rangeKey === "all_time") return { startDate: null, endDate: null };

  const start = new Date(today);
  if (rangeKey === "last_30_days") start.setDate(start.getDate() - 30);
  else if (rangeKey === "last_90_days") start.setDate(start.getDate() - 90);
  else if (rangeKey === "ytd") {
    start.setMonth(0);
    start.setDate(1);
  } else if (rangeKey === "last_12_months") start.setFullYear(start.getFullYear() - 1);

  return { startDate: toDateOnly(start), endDate };
}

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatShortDate(value) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatTile({ label, value }) {
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

export default function Reports() {
  const location = useLocation();
  // Returning from a Work Order opened out of this report restores exactly
  // where the user left off — same router-state pattern already used for
  // every other "back to origin" flow in the app, not a URL/query-param
  // scheme or browser history.
  const restored = location.state?.reportState ?? null;

  const [rangeKey, setRangeKey] = useState(restored?.rangeKey ?? "last_12_months");
  const [propertyId, setPropertyId] = useState(restored?.propertyId ?? null);
  const [category, setCategory] = useState(restored?.category ?? null);
  const [categoryLabelText, setCategoryLabelText] = useState(restored?.categoryLabel ?? null);
  const [workTypeId, setWorkTypeId] = useState(restored?.workTypeId ?? null);
  const [workTypeLabelText, setWorkTypeLabelText] = useState(restored?.workTypeLabel ?? null);

  const [properties, setProperties] = useState([]);
  useEffect(() => {
    getProperties()
      .then(setProperties)
      .catch(() => {
        // The property filter just won't populate — the report itself
        // still works scoped to All Properties.
      });
  }, []);

  const [data, setData] = useState(null);
  const [dataStatus, setDataStatus] = useState("loading"); // loading | error | ready

  const [workOrders, setWorkOrders] = useState([]);
  const [workOrdersStatus, setWorkOrdersStatus] = useState("idle"); // idle | loading | error | ready

  const { startDate, endDate } = useMemo(() => resolveRange(rangeKey), [rangeKey]);

  const filterParams = useMemo(
    () => ({ startDate, endDate, propertyId: propertyId || undefined, category: category || undefined, workTypeId: workTypeId || undefined }),
    [startDate, endDate, propertyId, category, workTypeId]
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
  }, [startDate, endDate, propertyId, category, workTypeId]);

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
  }, [workTypeId, startDate, endDate, propertyId, category]);

  const propertyOptions = useMemo(() => {
    const options = [{ value: null, label: "All Properties", sublabel: null }];
    for (const p of properties) options.push({ value: p.id, label: p.name, sublabel: null });
    return options;
  }, [properties]);

  function goToRoot() {
    setCategory(null);
    setCategoryLabelText(null);
    setWorkTypeId(null);
    setWorkTypeLabelText(null);
  }

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
  // Spend" restores this exact scope — filters, drill depth, and all.
  const reportState = { rangeKey, propertyId, category, categoryLabel: categoryLabelText, workTypeId, workTypeLabel: workTypeLabelText };

  const breakdownLabel = category ? "Work Type" : "Category";

  return (
    <div>
      <PageHeader title="Maintenance Spend" description="Where maintenance dollars are actually going, traced back to real Work Orders." />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-lg border border-gray-200 bg-gray-50 p-1">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRangeKey(option.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                rangeKey === option.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="w-56">
          <SearchableSelect value={propertyId} onChange={setPropertyId} options={propertyOptions} placeholder="All Properties" />
        </div>
      </div>

      {dataStatus === "loading" && <SectionSpinner />}

      {dataStatus === "error" && (
        <EmptyState icon={IconAlertTriangle} title="Couldn't load Maintenance Spend" description="Something went wrong. Please try again." />
      )}

      {dataStatus === "ready" && data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <StatTile label="Total Maintenance Spend" value={formatMoney(data.summary.totalSpend)} />
            <StatTile label="Work Orders With Cost" value={data.summary.workOrdersWithCost} />
            <StatTile label="Average Cost / Work Order" value={formatMoney(data.summary.averageCostPerWorkOrder)} />
          </div>

          {(category || workTypeId) && (
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm">
              <button type="button" onClick={goToRoot} className="text-gray-500 transition hover:text-gray-900">
                Maintenance Spend
              </button>
              {category && (
                <>
                  <span className="text-gray-300">›</span>
                  {workTypeId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setWorkTypeId(null);
                        setWorkTypeLabelText(null);
                      }}
                      className="text-gray-500 transition hover:text-gray-900"
                    >
                      {categoryLabelText}
                    </button>
                  ) : (
                    <span className="font-medium text-gray-900">{categoryLabelText}</span>
                  )}
                </>
              )}
              {workTypeId && (
                <>
                  <span className="text-gray-300">›</span>
                  <span className="font-medium text-gray-900">{workTypeLabelText}</span>
                </>
              )}
            </nav>
          )}

          {!workTypeId && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-gray-900">{breakdownLabel} Breakdown</h2>
              {data.breakdown.length === 0 ? (
                <EmptyState icon={IconWrench} title="No recorded spend in this range" description="Adjust the date range or property filter to see Maintenance Spend." />
              ) : (
                <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
                  {data.breakdown.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => (category ? selectWorkType(row) : selectCategory(row))}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-gray-50"
                    >
                      <span className="truncate text-sm font-medium text-gray-900">{row.label}</span>
                      <span className="flex shrink-0 items-center gap-4 text-sm">
                        <span className="text-gray-400">{row.workOrders} work order{row.workOrders === 1 ? "" : "s"}</span>
                        <span className="w-24 text-right font-medium text-gray-900">{formatMoney(row.spend)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {workTypeId && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-gray-900">Work Orders</h2>

              {workOrdersStatus === "loading" && <SectionSpinner />}
              {workOrdersStatus === "error" && (
                <EmptyState icon={IconAlertTriangle} title="Couldn't load Work Orders" description="Something went wrong. Please try again." />
              )}

              {workOrdersStatus === "ready" && workOrders.length === 0 && (
                <EmptyState icon={IconWrench} title="No Work Orders in this range" description="Nothing recorded cost here for the current filters." />
              )}

              {workOrdersStatus === "ready" && workOrders.length > 0 && (
                <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
                  {workOrders.map((wo) => (
                    <Link
                      key={wo.id}
                      to={`/portfolio/${wo.propertyId}/work-orders/${wo.id}`}
                      state={{ backLabel: "Maintenance Spend", backTo: "/reports", backTabState: { reportState } }}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-4 transition hover:bg-gray-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{wo.title}</p>
                        <p className="truncate text-xs text-gray-500">
                          {wo.propertyName}
                          {wo.locationName && ` · ${wo.locationName}`}
                          {" · Reported "}
                          {formatShortDate(wo.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadge[wo.status] || "bg-gray-50 text-gray-500"}`}
                        >
                          {statusLabel[wo.status] || wo.status}
                        </span>
                        <span className="text-right">
                          <span className="block text-[10px] uppercase tracking-wide text-gray-400">Spend in Period</span>
                          <span className="font-medium text-gray-900">{formatMoney(wo.spendInPeriod)}</span>
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
