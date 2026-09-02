import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import SectionSpinner from "../components/SectionSpinner";
import MaintenanceSpendReport from "../components/MaintenanceSpendReport";
import DateRangeControl from "../components/DateRangeControl";
import { statusBadge } from "../components/WorkOrderTable";
import { IconAlertTriangle, IconWrench, IconChevronDown } from "../components/icons";
import { getWorkTypes } from "../utils/api";
import { useOperationalReport } from "../utils/operationalReport";
import { usePropertyScope } from "../context/PropertyScopeContext";
import { useDateRangeFilter } from "../utils/useDateRangeFilter";
import { WORK_ORDER_CATEGORIES } from "../utils/workOrders";

const REPORTS_TABS = [
  { key: "work-orders", label: "Work Orders" },
  { key: "spend", label: "Maintenance Spend" },
];

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting", label: "Waiting" },
  { value: "completed", label: "Completed" },
];

const SORT_ACCESSORS = {
  date: (wo) => new Date(wo.createdAt).getTime(),
  spend: (wo) => wo.spend,
  status: (wo) => wo.statusLabel,
  category: (wo) => wo.categoryLabel ?? "",
};

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

function SortHeader({ label, sortKey, sortBy, sortDir, onSort, className = "" }) {
  const isActive = sortBy === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 text-left text-xs font-medium uppercase tracking-wide text-ink-muted transition hover:text-ink-secondary ${className}`}
    >
      {label}
      {isActive && <IconChevronDown className={`h-3 w-3 transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`} />}
    </button>
  );
}

// Reports' primary experience: immediate, filterable rows — "Show me all
// Water / Line Repair Work Orders this year" in one filtering action, no
// drill-click required. This is the same /api/reports/work-orders dataset
// Property Site Map's Analyze mode renders spatially — table here, map
// there, never two independent computations of the same numbers.
function WorkOrdersReport({ restored }) {
  const { propertyId: scopePropertyId, property: scopeProperty } = usePropertyScope();

  const dateRange = useDateRangeFilter(restored);
  const [category, setCategory] = useState(restored?.category ?? "");
  const [workTypeId, setWorkTypeId] = useState(restored?.workTypeId ?? "");
  const [status, setStatus] = useState(restored?.status ?? "");
  const [sortBy, setSortBy] = useState(restored?.sortBy ?? "date");
  const [sortDir, setSortDir] = useState(restored?.sortDir ?? "desc");

  const [workTypes, setWorkTypes] = useState([]);
  useEffect(() => {
    let cancelled = false;
    getWorkTypes()
      .then((rows) => {
        if (!cancelled) setWorkTypes(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleWorkTypes = useMemo(() => (category ? workTypes.filter((wt) => wt.category === category) : workTypes), [workTypes, category]);

  const filterParams = useMemo(
    () => ({
      propertyId: scopePropertyId || undefined,
      startDate: dateRange.startDate || undefined,
      endDate: dateRange.endDate || undefined,
      category: category || undefined,
      workTypeId: workTypeId || undefined,
      status: status || undefined,
    }),
    [scopePropertyId, dateRange.startDate, dateRange.endDate, category, workTypeId, status]
  );

  const { data, status: dataStatus } = useOperationalReport(filterParams, { enabled: dateRange.isValid });

  const sortedWorkOrders = useMemo(() => {
    if (!data) return [];
    const accessor = SORT_ACCESSORS[sortBy] ?? SORT_ACCESSORS.date;
    const rows = [...data.workOrders].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [data, sortBy, sortDir]);

  function handleSort(key) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(key === "date" || key === "spend" ? "desc" : "asc");
    }
  }

  const workOrdersState = { ...dateRange.toState(), category, workTypeId, status, sortBy, sortDir };
  const backTabState = { tab: "work-orders", workOrdersState };

  const analyzeHandoffState = { ...dateRange.toState(), category, workTypeId, status, selectedHotspotKey: null };

  const hasActiveFilters = category || workTypeId || status || dateRange.rangeKey !== "last_12_months";

  function clearFilters() {
    dateRange.setRangeKey("last_12_months");
    setCategory("");
    setWorkTypeId("");
    setStatus("");
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeControl
            rangeKey={dateRange.rangeKey}
            setRangeKey={dateRange.setRangeKey}
            customStart={dateRange.customStart}
            setCustomStart={dateRange.setCustomStart}
            customEnd={dateRange.customEnd}
            setCustomEnd={dateRange.setCustomEnd}
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            error={dateRange.error}
          />

          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setWorkTypeId("");
            }}
            aria-label="Category"
            className="h-8 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink"
          >
            <option value="">All Categories</option>
            {WORK_ORDER_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={workTypeId}
            onChange={(e) => setWorkTypeId(e.target.value)}
            aria-label="Work Type"
            className="h-8 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink"
          >
            <option value="">All Work Types</option>
            {visibleWorkTypes.map((wt) => (
              <option key={wt.id} value={wt.id}>
                {wt.label}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Status"
            className="h-8 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} className="text-sm font-medium text-ink-muted transition hover:text-ink-secondary">
              Reset
            </button>
          )}
        </div>

        {scopePropertyId ? (
          <Link
            to={`/portfolio/${scopePropertyId}`}
            state={{ tab: "map", mapMode: "analyze", analyzeFilters: analyzeHandoffState }}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-secondary transition hover:bg-surface-subtle hover:text-ink"
          >
            View on Site Map →
          </Link>
        ) : (
          <span
            title="Select a single property (Property scope, top of the sidebar) to view these Work Orders on the map."
            className="cursor-not-allowed rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-muted opacity-50"
          >
            View on Site Map →
          </span>
        )}
      </div>

      <p className="mb-4 text-xs text-ink-muted">
        Property: <span className="font-medium text-ink-secondary">{scopeProperty?.name ?? "All Properties"}</span> — change via the scope selector at the top of the sidebar.
      </p>

      {!dateRange.isValid && dateRange.rangeKey === "custom" && (
        <p className="rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-center text-sm text-ink-secondary">{dateRange.error}</p>
      )}

      {dataStatus === "loading" && <SectionSpinner />}
      {dataStatus === "error" && <EmptyState icon={IconAlertTriangle} title="Couldn't load Work Orders" description="Something went wrong. Please try again." />}

      {(dataStatus === "ready" || dataStatus === "refreshing") && data && (
        <div className={`space-y-4 transition-opacity ${dataStatus === "refreshing" ? "pointer-events-none opacity-50" : ""}`} aria-busy={dataStatus === "refreshing"}>
          <div className="relative grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-3 sm:divide-y-0">
            <StatTile label="Matching Work Orders" value={data.summary.workOrderCount} />
            <StatTile label="Total Spend" value={formatMoney(data.summary.totalSpend)} />
            <StatTile label="Locations Represented" value={data.summary.locationsRepresented} />
            {dataStatus === "refreshing" && (
              <div className="absolute right-3 top-3 h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true" />
            )}
          </div>
          {scopePropertyId && (
            <p className="text-xs text-ink-muted">
              {data.summary.mappedCount} mapped · {data.summary.unmappedCount} unmapped
            </p>
          )}

          {sortedWorkOrders.length === 0 ? (
            <EmptyState icon={IconWrench} title="No Work Orders match these filters" description="Adjust the date range, category, work type, or status." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full min-w-[840px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 border-b border-line bg-surface-subtle">
                  <tr>
                    {!scopePropertyId && <th className="px-4 py-2.5 text-left font-medium uppercase tracking-wide text-ink-muted text-xs">Property</th>}
                    <th className="px-4 py-2.5 text-left font-medium uppercase tracking-wide text-ink-muted text-xs">Location</th>
                    <th className="px-4 py-2.5 text-left font-medium uppercase tracking-wide text-ink-muted text-xs">Work Order</th>
                    <th className="px-4 py-2.5 text-left">
                      <SortHeader label="Category" sortKey="category" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-ink-muted">Work Type</th>
                    <th className="px-4 py-2.5 text-left">
                      <SortHeader label="Status" sortKey="status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-2.5 text-left">
                      <SortHeader label="Date" sortKey="date" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-2.5 text-right">
                      <SortHeader label="Spend" sortKey="spend" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="justify-end" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sortedWorkOrders.map((wo) => (
                    <tr key={wo.id} className="transition hover:bg-surface-subtle">
                      {!scopePropertyId && (
                        <td className="px-4 py-2.5 text-ink-secondary">
                          <Link to={`/portfolio/${wo.propertyId}/work-orders/${wo.id}`} state={{ backLabel: "Reports", backTo: "/reports", backTabState }} className="block truncate">
                            {wo.propertyName}
                          </Link>
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-ink-secondary">
                        <Link to={`/portfolio/${wo.propertyId}/work-orders/${wo.id}`} state={{ backLabel: "Reports", backTo: "/reports", backTabState }} className="block truncate">
                          {wo.locationLabel}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-ink">
                        <Link to={`/portfolio/${wo.propertyId}/work-orders/${wo.id}`} state={{ backLabel: "Reports", backTo: "/reports", backTabState }} className="block max-w-xs truncate">
                          {wo.title}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-ink-secondary">
                        <Link to={`/portfolio/${wo.propertyId}/work-orders/${wo.id}`} state={{ backLabel: "Reports", backTo: "/reports", backTabState }} className="block truncate">
                          {wo.categoryLabel ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-ink-secondary">
                        <Link to={`/portfolio/${wo.propertyId}/work-orders/${wo.id}`} state={{ backLabel: "Reports", backTo: "/reports", backTabState }} className="block truncate">
                          {wo.workTypeLabel ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <Link to={`/portfolio/${wo.propertyId}/work-orders/${wo.id}`} state={{ backLabel: "Reports", backTo: "/reports", backTabState }} className="inline-block">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadge[wo.status] || "bg-surface-subtle text-ink-secondary"}`}>
                            {wo.statusLabel}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-ink-secondary tabular-nums">
                        <Link to={`/portfolio/${wo.propertyId}/work-orders/${wo.id}`} state={{ backLabel: "Reports", backTo: "/reports", backTabState }} className="block">
                          {formatShortDate(wo.createdAt)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-ink tabular-nums">
                        <Link to={`/portfolio/${wo.propertyId}/work-orders/${wo.id}`} state={{ backLabel: "Reports", backTo: "/reports", backTabState }} className="block">
                          {formatMoney(wo.spend)}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Reports() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.state?.tab ?? "work-orders");

  return (
    <div>
      <PageHeader title="Reports" description="One authorized Work Order dataset — as organized rows here, and spatially on each Property's Site Map." />

      <div className="mb-6 flex gap-6 border-b border-line">
        {REPORTS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`border-b-2 pb-3 text-sm font-medium transition ${
              activeTab === tab.key ? "border-accent text-ink" : "border-transparent text-ink-secondary hover:text-ink-secondary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "work-orders" && <WorkOrdersReport restored={location.state?.workOrdersState ?? null} />}
      {activeTab === "spend" && <MaintenanceSpendReport />}
    </div>
  );
}
