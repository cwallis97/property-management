import { useEffect, useMemo, useState } from "react";
import SitePlanCanvas from "./SitePlanCanvas";
import WorkOrderReportFilters from "./WorkOrderReportFilters";
import AnalyzeWorkOrderRow from "./AnalyzeWorkOrderRow";
import { IconAlertTriangle, IconWrench, IconChevronDown, IconArrowLeft } from "./icons";
import { getSitePlan } from "../utils/api";
import { useSitePlanFile } from "../utils/useSitePlanFile";
import { useOperationalReport } from "../utils/operationalReport";
import { buildHotspotMarkers, hotspotKey } from "../utils/hotspotMarkers";
import { useWorkOrderReportFilters } from "../utils/useWorkOrderReportFilters";
import { analyzeMoney, analyzeDate } from "../utils/analyzeFormat";

const MAP_HEIGHT = "72vh";
const LABEL = "text-xs font-semibold uppercase tracking-wide text-ink-muted";

// A fixed-geometry stand-in for the Site Plan while it is loading or
// cannot be shown — same footprint and edge treatment as SitePlanCanvas's
// own viewport, so the page never jumps between states.
function MapFootprint({ children }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-surface-subtle px-6 text-center"
      style={{ height: MAP_HEIGHT }}
    >
      {children}
    </div>
  );
}

function CalmNotice({ icon: Icon, title, children, action }) {
  return (
    <>
      {Icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-ink-muted">
          <Icon className="h-5 w-5" />
        </div>
      )}
      {title && <p className="text-sm font-medium text-ink">{title}</p>}
      {children && <p className="max-w-sm text-sm text-ink-secondary">{children}</p>}
      {action}
    </>
  );
}

// The Property Site Map's "Analyze" mode — the same authoritative
// /api/reports/work-orders dataset Reports' Work Orders tab renders as a
// table, here rendered spatially against this Property's real, uploaded
// Site Plan via the shared SitePlanCanvas primitive. Every surface below
// (summary line, ranked Locations, map markers, hotspot detail, matching
// Work Orders) reads directly from the one `data` object — nothing here
// re-filters, re-sums, or re-derives independently.
//
// Layout: the Site Plan is the dominant surface; a low-chrome rail beside
// it shows EITHER the ranked Locations list OR the selected hotspot's
// detail (never both); the full matching-Work-Order list is a quiet
// collapsible beneath. One vertical rhythm, minimal borders.
export default function SiteMapAnalyze({ propertyId, restored, onBackState }) {
  const filters = useWorkOrderReportFilters(restored);
  const { dateRange } = filters;
  const [selectedHotspotKey, setSelectedHotspotKey] = useState(restored?.selectedHotspotKey ?? null);
  const [showWorkOrders, setShowWorkOrders] = useState(false);

  const filterParams = useMemo(() => ({ propertyId, ...filters.params }), [propertyId, filters.params]);

  const { data, status: dataStatus, retry } = useOperationalReport(filterParams, { enabled: dateRange.isValid });

  // A hotspot selected under the OLD filters may not exist in the new
  // result — never keep the rail pointed at a hotspot that isn't part of
  // the dataset currently on screen.
  useEffect(() => {
    if (!data) return;
    setSelectedHotspotKey((prevKey) =>
      prevKey && data.hotspots.some((h) => hotspotKey(h.locationId) === prevKey) ? prevKey : null
    );
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

  const { status: fileStatus, fileUrl, fileObjectType } = useSitePlanFile(
    propertyId,
    sitePlanStatus === "ready" ? sitePlan : null
  );

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
  // client-side re-match.
  const selectedHotspotWorkOrders = useMemo(() => {
    if (!data || !selectedHotspot) return [];
    const idSet = new Set(selectedHotspot.workOrderIds);
    return data.workOrders.filter((wo) => idSet.has(wo.id));
  }, [data, selectedHotspot]);

  // Most frequent Work Type among this hotspot's own Work Orders — derived
  // client-side from the already-returned rows (no extra request). Ties
  // resolve to the earliest-created (the list is createdAt-ascending).
  const selectedHotspotMostCommonWorkType = useMemo(() => {
    const counts = new Map();
    for (const wo of selectedHotspotWorkOrders) {
      const label = wo.workTypeLabel ?? "Unspecified";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    let best = null;
    let bestCount = 0;
    for (const [label, count] of counts) {
      if (count > bestCount) {
        best = label;
        bestCount = count;
      }
    }
    return best;
  }, [selectedHotspotWorkOrders]);

  const selectedHotspotMostRecent = useMemo(() => {
    if (selectedHotspotWorkOrders.length === 0) return null;
    return selectedHotspotWorkOrders.reduce(
      (latest, wo) => (wo.createdAt > latest ? wo.createdAt : latest),
      selectedHotspotWorkOrders[0].createdAt
    );
  }, [selectedHotspotWorkOrders]);

  const analyzeFilters = { ...filters.toState(), selectedHotspotKey };
  const backState = onBackState
    ? onBackState(analyzeFilters)
    : { backLabel: "Site Map", backTo: `/portfolio/${propertyId}`, backTabState: { tab: "map", mapMode: "analyze", analyzeFilters } };

  const rangeInvalid = !dateRange.isValid && dateRange.rangeKey === "custom";
  // A hard error with no prior result to fall back on → the map area shows
  // the error + Retry. An error while stale data is still on screen → keep
  // the map, surface the failure quietly on the summary line instead.
  const hardError = dataStatus === "error" && !data;

  return (
    <div className="space-y-4">
      <WorkOrderReportFilters filters={filters} />

      {/* Summary — one plain line. Repairs + spend are the answer; the
          mapped ratio is a quiet diagnostic, not a co-equal headline. */}
      {dateRange.isValid && !hardError && (
        <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          {data ? (
            <>
              <span className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                <span>
                  <strong className="font-semibold tabular-nums text-ink">{data.summary.workOrderCount}</strong>{" "}
                  <span className="text-ink-secondary">repairs</span>
                </span>
                <span>
                  <strong className="font-semibold tabular-nums text-ink">{analyzeMoney(data.summary.totalSpend)}</strong>{" "}
                  <span className="text-ink-secondary">spend</span>
                </span>
              </span>
              {data.summary.workOrderCount > 0 && (
                <span className="tabular-nums text-xs text-ink-muted">
                  {data.summary.mappedCount} of {data.summary.workOrderCount} mapped
                </span>
              )}
              {dataStatus === "refreshing" && (
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink-muted" aria-hidden="true" />
                  Updating…
                </span>
              )}
              {dataStatus === "error" && (
                <span className="inline-flex items-center gap-2 text-xs text-ink-muted">
                  Couldn't update
                  <button type="button" onClick={retry} className="font-medium text-ink-secondary underline-offset-2 hover:underline">
                    Retry
                  </button>
                </span>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink-muted" aria-hidden="true" />
              Loading repairs…
            </span>
          )}
        </p>
      )}

      {/* Workspace — Site Plan (dominant) + a low-chrome rail. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative">
          {rangeInvalid ? (
            <MapFootprint>
              <CalmNotice icon={IconAlertTriangle} title="Check the date range">
                {dateRange.error}
              </CalmNotice>
            </MapFootprint>
          ) : hardError ? (
            <MapFootprint>
              <CalmNotice
                icon={IconAlertTriangle}
                title="Couldn't load this data"
                action={
                  <button
                    type="button"
                    onClick={retry}
                    className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle"
                  >
                    Retry
                  </button>
                }
              />
            </MapFootprint>
          ) : sitePlanStatus === "error" || fileStatus === "error" ? (
            <MapFootprint>
              <CalmNotice icon={IconAlertTriangle} title="Couldn't load the Site Plan">
                Something went wrong loading this Property's Site Plan.
              </CalmNotice>
            </MapFootprint>
          ) : sitePlanStatus === "none" ? (
            <MapFootprint>
              <CalmNotice icon={IconWrench} title="No Site Plan uploaded">
                Repairs, spend, and ranked Locations are unaffected — upload a Site Plan from the Active map to see them
                plotted spatially.
              </CalmNotice>
            </MapFootprint>
          ) : sitePlanStatus === "loading" || fileStatus !== "ready" ? (
            <MapFootprint>
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true" />
            </MapFootprint>
          ) : (
            <>
              {data && data.summary.workOrderCount === 0 && (
                <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-lg border border-line bg-surface/95 px-3 py-1.5 text-xs font-medium text-ink-secondary shadow-sm backdrop-blur-sm">
                  No repairs match these filters
                </div>
              )}
              <SitePlanCanvas
                fileStatus={fileStatus}
                fileUrl={fileUrl}
                fileObjectType={fileObjectType}
                height={MAP_HEIGHT}
                markers={markers}
                onBackgroundClick={() => setSelectedHotspotKey(null)}
              />
            </>
          )}
        </div>

        {/* Rail — supporting information beside the map, not a second panel.
            Hidden entirely on a zero-result view (the map already says so —
            no duplicate message here). */}
        {data && data.summary.workOrderCount > 0 && (
          <div className="xl:h-[72vh] xl:overflow-y-auto xl:border-l xl:border-line xl:pl-5">
            {!selectedHotspot ? (
              <div>
                <h2 className={LABEL}>Top Repeat Locations</h2>
                <ul className="mt-2 divide-y divide-line">
                  {data.hotspots.map((h) => {
                    const key = hotspotKey(h.locationId);
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => setSelectedHotspotKey(key)}
                          className="block w-full px-1 py-2.5 text-left transition hover:bg-surface-subtle"
                        >
                          <span className="block truncate text-sm font-medium text-ink">{h.locationLabel}</span>
                          <span className="mt-0.5 block text-xs tabular-nums text-ink-secondary">
                            {h.workOrderCount} repair{h.workOrderCount === 1 ? "" : "s"} · {analyzeMoney(h.spend)}
                            {h.mapX == null && " · not mapped"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="space-y-5">
                <button
                  type="button"
                  onClick={() => setSelectedHotspotKey(null)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-ink-secondary transition hover:text-ink"
                >
                  <IconArrowLeft className="h-4 w-4" />
                  Locations
                </button>

                <div>
                  <h2 className="text-base font-semibold text-ink">{selectedHotspot.locationLabel}</h2>
                  <div className="mt-3 flex gap-8">
                    <div>
                      <div className="text-lg font-semibold tabular-nums text-ink">{selectedHotspot.workOrderCount}</div>
                      <div className={LABEL}>Repairs</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold tabular-nums text-ink">
                        {analyzeMoney(selectedHotspot.spend)}
                      </div>
                      <div className={LABEL}>Spend</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className={LABEL}>Most common</h3>
                  <p className="mt-1 text-sm text-ink">{selectedHotspotMostCommonWorkType || "—"}</p>
                </div>

                <div>
                  <h3 className={LABEL}>Most recent</h3>
                  <p className="mt-1 text-sm text-ink">
                    {selectedHotspotMostRecent ? analyzeDate(selectedHotspotMostRecent) : "—"}
                  </p>
                </div>

                <div>
                  <h3 className={LABEL}>Work Orders</h3>
                  <ul className="mt-1 divide-y divide-line">
                    {selectedHotspotWorkOrders.map((wo) => (
                      <li key={wo.id}>
                        <AnalyzeWorkOrderRow
                          workOrder={wo}
                          to={`/portfolio/${propertyId}/work-orders/${wo.id}`}
                          state={backState}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Full matching set — a quiet collapsible, the only place truly
          unmapped / "Unspecified Location" repairs surface. */}
      {data && (
        <div>
          <button
            type="button"
            onClick={() => setShowWorkOrders((v) => !v)}
            className={`flex items-center gap-1.5 transition hover:text-ink-secondary ${LABEL}`}
          >
            Matching Work Orders ({data.workOrders.length})
            <IconChevronDown className={`h-3.5 w-3.5 transition-transform ${showWorkOrders ? "" : "-rotate-90"}`} />
          </button>
          {showWorkOrders &&
            (data.workOrders.length === 0 ? (
              <p className="mt-3 text-sm text-ink-secondary">No Work Orders match these filters.</p>
            ) : (
              <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
                <ul className="divide-y divide-line">
                  {data.workOrders.map((wo) => (
                    <li key={wo.id}>
                      <AnalyzeWorkOrderRow
                        workOrder={wo}
                        to={`/portfolio/${propertyId}/work-orders/${wo.id}`}
                        state={backState}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
