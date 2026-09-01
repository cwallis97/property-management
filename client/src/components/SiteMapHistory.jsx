import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "./EmptyState";
import SectionSpinner from "./SectionSpinner";
import SitePlanCanvas from "./SitePlanCanvas";
import DateRangeControl from "./DateRangeControl";
import { statusBadge, statusLabel } from "./WorkOrderTable";
import { IconAlertTriangle, IconWrench, IconChevronDown, IconArrowLeft } from "./icons";
import { getSitePlan, getWorkTypes } from "../utils/api";
import { useSitePlanFile } from "../utils/useSitePlanFile";
import { useOperationalReport } from "../utils/operationalReport";
import { buildHotspotMarkers, hotspotKey } from "../utils/hotspotMarkers";
import { useDateRangeFilter, formatRangeLabel } from "../utils/useDateRangeFilter";
import { WORK_ORDER_CATEGORIES, categoryLabel as categoryLabelMap } from "../utils/workOrders";

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting", label: "Waiting" },
  { value: "completed", label: "Completed" },
];
const STATUS_LABEL_BY_VALUE = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatShortDate(value) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// The Property Site Map's "History" mode — the same authoritative
// /api/reports/work-orders dataset Reports' Work Orders tab renders as a
// table, here rendered spatially against this Property's real, uploaded
// Site Plan via the unmodified SitePlanCanvas primitive. Every surface
// below (summary strip, Top Repeat Locations, map markers, hotspot detail,
// matching Work Orders list) reads directly from the one `data` object —
// nothing here re-filters, re-sums, or re-derives independently.
//
// Layout follows one deliberate hierarchy: filters/summary stay compact so
// the real Site Plan can dominate the workspace; the side panel shows
// EITHER the ranked list OR the selected hotspot's detail, never both at
// once (two simultaneous side panels was the exact "competing surfaces"
// jank this pass exists to remove); the Work Order list is a collapsed-by-
// default detail section, not a second table fighting the map for
// attention.
export default function SiteMapHistory({ propertyId, restored, onBackState }) {
  const dateRange = useDateRangeFilter(restored);
  const [category, setCategory] = useState(restored?.category ?? "");
  const [workTypeId, setWorkTypeId] = useState(restored?.workTypeId ?? "");
  const [status, setStatus] = useState(restored?.status ?? "");
  const [selectedHotspotKey, setSelectedHotspotKey] = useState(restored?.selectedHotspotKey ?? null);
  const [showWorkOrders, setShowWorkOrders] = useState(false);

  const [workTypes, setWorkTypes] = useState([]);
  useEffect(() => {
    let cancelled = false;
    getWorkTypes()
      .then((rows) => {
        if (!cancelled) setWorkTypes(rows);
      })
      .catch(() => {
        // Non-fatal — the Work Type filter just stays empty.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleWorkTypes = useMemo(() => (category ? workTypes.filter((wt) => wt.category === category) : workTypes), [workTypes, category]);
  const workTypeLabelById = useMemo(() => Object.fromEntries(workTypes.map((wt) => [wt.id, wt.label])), [workTypes]);

  function handleCategoryChange(next) {
    setCategory(next);
    // Work Type reacts to Category — an invalid combination (a Work Type
    // that belongs to the OLD category) is cleared rather than silently
    // kept, so filters never end up in a state the UI itself wouldn't let
    // you construct directly.
    setWorkTypeId("");
  }

  function clearFilters() {
    dateRange.setRangeKey("last_12_months");
    setCategory("");
    setWorkTypeId("");
    setStatus("");
  }

  const hasActiveFilters = category || workTypeId || status || dateRange.rangeKey !== "last_12_months";

  const filterParams = useMemo(
    () => ({
      propertyId,
      startDate: dateRange.startDate || undefined,
      endDate: dateRange.endDate || undefined,
      category: category || undefined,
      workTypeId: workTypeId || undefined,
      status: status || undefined,
    }),
    [propertyId, dateRange.startDate, dateRange.endDate, category, workTypeId, status]
  );

  const { data, status: dataStatus, retry } = useOperationalReport(filterParams, { enabled: dateRange.isValid });

  // A hotspot selected under the OLD filters may not exist in the new
  // result — never keep the side panel pointed at a hotspot that isn't
  // actually part of the dataset currently on screen.
  useEffect(() => {
    if (!data) return;
    setSelectedHotspotKey((prevKey) => (prevKey && data.hotspots.some((h) => hotspotKey(h.locationId) === prevKey) ? prevKey : null));
  }, [data]);

  const [sitePlanStatus, setSitePlanStatus] = useState("loading");
  const [sitePlan, setSitePlan] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setSitePlanStatus("loading");
    getSitePlan(propertyId)
      .then((d) => {
        if (cancelled) return;
        setSitePlan(d);
        setSitePlanStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setSitePlanStatus(err.status === 404 ? "none" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const { status: fileStatus, fileUrl, fileObjectType } = useSitePlanFile(propertyId, sitePlanStatus === "ready" ? sitePlan : null);

  const markers = useMemo(() => {
    if (!data) return [];
    return buildHotspotMarkers({
      hotspots: data.hotspots,
      workOrders: data.workOrders,
      selectedHotspotKey,
      onSelectHotspot: (key) => setSelectedHotspotKey((prev) => (prev === key ? null : key)),
    });
  }, [data, selectedHotspotKey]);

  const selectedHotspot = data?.hotspots.find((h) => hotspotKey(h.locationId) === selectedHotspotKey) ?? null;

  // Exactly the Work Order ids the server already attributed to this
  // hotspot when it computed hotspot.count/hotspot.spend — never a
  // client-side re-match, so the detail panel's list is guaranteed to be
  // the same set that produced the numbers above it.
  const selectedHotspotWorkOrders = useMemo(() => {
    if (!data || !selectedHotspot) return [];
    const idSet = new Set(selectedHotspot.workOrderIds);
    return data.workOrders.filter((wo) => idSet.has(wo.id));
  }, [data, selectedHotspot]);

  const selectedHotspotTopCategories = useMemo(() => {
    const counts = new Map();
    for (const wo of selectedHotspotWorkOrders) {
      const label = wo.categoryLabel ?? "Uncategorized";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  }, [selectedHotspotWorkOrders]);

  const selectedHotspotMostRecent = useMemo(() => {
    if (selectedHotspotWorkOrders.length === 0) return null;
    return selectedHotspotWorkOrders.reduce((latest, wo) => (wo.createdAt > latest ? wo.createdAt : latest), selectedHotspotWorkOrders[0].createdAt);
  }, [selectedHotspotWorkOrders]);

  const historyFilters = { ...dateRange.toState(), category, workTypeId, status, selectedHotspotKey };
  const backState = onBackState
    ? onBackState(historyFilters)
    : { backLabel: "Site Map", backTo: `/portfolio/${propertyId}`, backTabState: { tab: "map", mapMode: "history", historyFilters } };

  // One subtle line of text answering "what am I looking at" — never a
  // restatement of every control's own label, just the parts that
  // actually narrow the result plus the real resolved date range.
  const activeFilterSummary = useMemo(() => {
    if (!data) return null;
    const parts = [`${data.summary.workOrderCount} repair${data.summary.workOrderCount === 1 ? "" : "s"}`];
    if (category) parts.push(categoryLabelMap[category] ?? category);
    if (workTypeId) parts.push(workTypeLabelById[workTypeId] ?? "Work Type");
    if (status) parts.push(STATUS_LABEL_BY_VALUE[status] ?? status);
    parts.push(formatRangeLabel(dateRange.startDate, dateRange.endDate));
    return parts.join(" · ");
  }, [data, category, workTypeId, status, workTypeLabelById, dateRange.startDate, dateRange.endDate]);

  return (
    <div>
      {/* FILTERS — compact, horizontal, one row on desktop. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <DateRangeControl
          rangeKey={dateRange.rangeKey}
          setRangeKey={dateRange.setRangeKey}
          customStart={dateRange.customStart}
          setCustomStart={dateRange.setCustomStart}
          customEnd={dateRange.customEnd}
          setCustomEnd={dateRange.setCustomEnd}
          error={dateRange.error}
        />

        <select
          value={category}
          onChange={(e) => handleCategoryChange(e.target.value)}
          aria-label="Category"
          className="rounded-lg border border-line bg-surface px-2.5 py-[7px] text-sm text-ink"
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
          className="rounded-lg border border-line bg-surface px-2.5 py-[7px] text-sm text-ink"
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
          className="rounded-lg border border-line bg-surface px-2.5 py-[7px] text-sm text-ink"
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
            Clear filters
          </button>
        )}
      </div>

      {activeFilterSummary && <p className="mb-4 text-xs text-ink-secondary">{activeFilterSummary}</p>}

      {dataStatus === "loading" && <SectionSpinner />}

      {dataStatus === "error" && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-center">
          <IconAlertTriangle className="h-5 w-5 text-ink-muted" />
          <p className="text-sm text-ink-secondary">Something went wrong loading this data.</p>
          <button type="button" onClick={retry} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle">
            Retry
          </button>
        </div>
      )}

      {!dateRange.isValid && dateRange.rangeKey === "custom" && (
        <p className="rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-center text-sm text-ink-secondary">{dateRange.error}</p>
      )}

      {(dataStatus === "ready" || dataStatus === "refreshing") && data && (
        <div className="space-y-4">
          {/* Compact inline summary — deliberately plain text, not a grid of
              bordered cards, so it never outweighs the Site Plan below it. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span>
              <strong className="font-semibold text-ink">{data.summary.workOrderCount}</strong> <span className="text-ink-secondary">Repairs</span>
            </span>
            <span>
              <strong className="font-semibold text-ink">{formatMoney(data.summary.totalSpend)}</strong> <span className="text-ink-secondary">Spend</span>
            </span>
            <span>
              <strong className="font-semibold text-ink">{data.summary.mappedCount}</strong> <span className="text-ink-secondary">Mapped</span>
            </span>
            <span>
              <strong className="font-semibold text-ink">{data.summary.unmappedCount}</strong> <span className="text-ink-secondary">Unmapped</span>
            </span>
            {dataStatus === "refreshing" && (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink-muted" aria-hidden="true" />
                Updating…
              </span>
            )}
          </div>

          {/* MAIN WORKSPACE: the real Site Plan (dominant) + a single side
              panel that is EITHER Top Repeat Locations OR the selected
              hotspot's detail — never both at once. */}
          <div className={`grid grid-cols-1 gap-4 transition-opacity xl:grid-cols-[minmax(0,1fr)_320px] ${dataStatus === "refreshing" ? "opacity-60" : ""}`} aria-busy={dataStatus === "refreshing"}>
            <div className="relative">
              {sitePlanStatus === "loading" && <SectionSpinner />}
              {sitePlanStatus === "error" && (
                <EmptyState icon={IconAlertTriangle} title="Couldn't load the site map" description="Something went wrong while loading this property's site plan. Please try again." />
              )}
              {sitePlanStatus === "none" && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface px-6 py-24 text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-subtle text-ink-muted">
                    <IconWrench className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-ink">No Site Plan uploaded for this Property</h3>
                  <p className="mt-1.5 max-w-sm text-sm text-ink-secondary">Repairs, spend, and Top Repeat Locations below are unaffected — upload a Site Plan from the Active map to see them plotted spatially too.</p>
                </div>
              )}
              {sitePlanStatus === "ready" && (
                <>
                  {data.summary.workOrderCount === 0 && (
                    <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-lg border border-line bg-surface/95 px-3 py-1.5 text-xs font-medium text-ink-secondary shadow-sm backdrop-blur-sm">
                      No repairs match these filters
                    </div>
                  )}
                  <SitePlanCanvas fileStatus={fileStatus} fileUrl={fileUrl} fileObjectType={fileObjectType} height="72vh" markers={markers} />
                </>
              )}
            </div>

            {/* SIDE PANEL — one surface, one job at a time. */}
            <div className="rounded-xl border border-line bg-surface">
              {!selectedHotspot ? (
                <>
                  <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Top Repeat Locations</h2>
                  {data.hotspots.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-ink-secondary">No matching repairs for these filters.</p>
                  ) : (
                    <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
                      {data.hotspots.map((h, index) => {
                        const key = hotspotKey(h.locationId);
                        return (
                          <li key={key}>
                            <button
                              type="button"
                              onClick={() => setSelectedHotspotKey(key)}
                              className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-surface-subtle"
                            >
                              <span className="flex min-w-0 items-baseline gap-2">
                                <span className="shrink-0 text-xs font-medium tabular-nums text-ink-muted">{index + 1}</span>
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium text-ink">{h.locationLabel}</span>
                                  <span className="text-xs text-ink-secondary">
                                    {h.workOrderCount} repair{h.workOrderCount === 1 ? "" : "s"}
                                    {h.mapX == null && " · not mapped"}
                                  </span>
                                </span>
                              </span>
                              <span className="shrink-0 text-sm font-medium tabular-nums text-ink">{formatMoney(h.spend)}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              ) : (
                <div className="p-4">
                  <button
                    type="button"
                    onClick={() => setSelectedHotspotKey(null)}
                    className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-ink-secondary transition hover:text-ink"
                  >
                    <IconArrowLeft className="h-3.5 w-3.5" />
                    Top Repeat Locations
                  </button>

                  <h3 className="text-base font-semibold text-ink">{selectedHotspot.locationLabel}</h3>
                  <dl className="mt-2 flex items-center gap-4 text-sm">
                    <div>
                      <dt className="text-xs text-ink-muted">Repairs</dt>
                      <dd className="font-semibold tabular-nums text-ink">{selectedHotspot.workOrderCount}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-muted">Spend</dt>
                      <dd className="font-semibold tabular-nums text-ink">{formatMoney(selectedHotspot.spend)}</dd>
                    </div>
                  </dl>
                  {selectedHotspotTopCategories.length > 0 && (
                    <p className="mt-2 text-xs text-ink-secondary">Top: {selectedHotspotTopCategories.map(([label, count]) => `${label} (${count})`).join(", ")}</p>
                  )}
                  {selectedHotspotMostRecent && <p className="mt-1 text-xs text-ink-secondary">Most recent: {formatShortDate(selectedHotspotMostRecent)}</p>}

                  <ul className="mt-3 max-h-[400px] divide-y divide-line overflow-y-auto border-t border-line pt-2">
                    {selectedHotspotWorkOrders.map((wo) => (
                      <li key={wo.id}>
                        <Link to={`/portfolio/${propertyId}/work-orders/${wo.id}`} state={backState} className="flex items-center justify-between gap-2 py-2 text-sm transition hover:text-accent">
                          <span className="min-w-0 truncate text-ink">{wo.title}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusBadge[wo.status] || "bg-surface-subtle text-ink-secondary"}`}>
                              {statusLabel[wo.status] || wo.status}
                            </span>
                            <span className="tabular-nums text-ink-secondary">{formatMoney(wo.spend)}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* SECONDARY, collapsed by default: every matching Work Order,
              mapped or not — the same authoritative list, never dropped
              just because it lacks a coordinate. The map is the primary
              surface; this is a detail drawer beneath it, not a second
              table competing for attention. */}
          <div>
            <button type="button" onClick={() => setShowWorkOrders((v) => !v)} className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              Matching Work Orders ({data.workOrders.length})
              <IconChevronDown className={`h-4 w-4 text-ink-muted transition-transform ${showWorkOrders ? "" : "-rotate-90"}`} />
            </button>
            {showWorkOrders && (
              <div className="mt-3">
                {data.workOrders.length === 0 ? (
                  <EmptyState icon={IconWrench} title="No Work Orders match these filters" description="Adjust the date range, category, work type, or status." />
                ) : (
                  <div className="divide-y divide-line rounded-xl border border-line bg-surface">
                    {data.workOrders.map((wo) => (
                      <Link key={wo.id} to={`/portfolio/${propertyId}/work-orders/${wo.id}`} state={backState} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3 transition hover:bg-surface-subtle">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{wo.title}</p>
                          <p className="truncate text-xs text-ink-secondary">
                            {wo.locationLabel}
                            {" · Reported "}
                            {formatShortDate(wo.createdAt)}
                            {wo.mapX == null && " · Unmapped"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadge[wo.status] || "bg-surface-subtle text-ink-secondary"}`}>{statusLabel[wo.status] || wo.status}</span>
                          <span className="text-right">
                            <span className="block text-[10px] uppercase tracking-wide text-ink-muted">Spend</span>
                            <span className="font-medium tabular-nums text-ink">{formatMoney(wo.spend)}</span>
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
