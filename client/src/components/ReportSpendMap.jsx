import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SectionSpinner from "./SectionSpinner";
import EmptyState from "./EmptyState";
import SitePlanCanvas from "./SitePlanCanvas";
import { IconAlertTriangle, IconWrench } from "./icons";
import { statusBadge, statusLabel } from "./WorkOrderTable";
import { getSitePlan } from "../utils/api";
import { useSitePlanFile } from "../utils/useSitePlanFile";

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Report-specific spatial view: the SAME Work Orders already returned by
// the Maintenance Spend Work Order drill (identical financial filters,
// identical spendInPeriod), just plotted on that property's existing Site
// Plan instead of listed in a table. This intentionally reuses the generic
// SitePlanCanvas primitive rather than SitePlanMap, because SitePlanMap is
// hard-coupled to "current operations" concerns (Report Issue mode, and a
// completed-Work-Order exclusion) that don't apply to historical spend
// reporting — a completed Work Order's spend is exactly as real here as an
// active one's. There is no new backend endpoint, no new SQL, and no new
// spatial record: matchingWorkOrders is the exact row set the List view
// already fetched, just rendered differently.
export default function ReportSpendMap({ propertyId, matchingWorkOrders, reportState }) {
  const [sitePlanStatus, setSitePlanStatus] = useState("loading"); // loading | none | error | ready
  const [sitePlan, setSitePlan] = useState(null);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setSitePlanStatus("loading");
    setSelectedWorkOrderId(null);
    getSitePlan(propertyId)
      .then((data) => {
        if (cancelled) return;
        setSitePlan(data);
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

  if (sitePlanStatus === "loading") return <SectionSpinner />;

  if (sitePlanStatus === "error") {
    return (
      <EmptyState
        icon={IconAlertTriangle}
        title="Couldn't load the site map"
        description="Something went wrong while loading this property's site plan. Please try again."
      />
    );
  }

  if (sitePlanStatus === "none") {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface px-6 py-24 text-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-subtle text-ink-muted">
          <IconWrench className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-ink">No Site Plan for this property</h3>
        <p className="mt-2 max-w-sm text-sm text-ink-secondary">
          A Site Plan is required to view Maintenance Spend spatially. Upload one from this property's Map tab.
        </p>
        <Link
          to={`/portfolio/${propertyId}`}
          state={{ tab: "map" }}
          className="mt-6 inline-flex items-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
        >
          Go to Property Map
        </Link>
      </div>
    );
  }

  // Financial truth is untouched: matchingWorkOrders is every Work Order the
  // report counted, whether it has a map position or not. Spatial truth is
  // strictly a subset — mapping never redefines which Work Orders "count."
  const mappedWorkOrders = matchingWorkOrders.filter((wo) => wo.mapX != null && wo.mapY != null);

  const markers = mappedWorkOrders.map((wo) => {
    const isSelected = selectedWorkOrderId === wo.id;
    return {
      id: wo.id,
      x: wo.mapX,
      y: wo.mapY,
      tone: wo.status === "completed" ? "completed" : "default",
      label: wo.title,
      onClick: () => setSelectedWorkOrderId(isSelected ? null : wo.id),
      popover: isSelected ? (
        <span
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 cursor-default rounded-xl border border-line bg-surface p-3 text-left shadow-lg"
        >
          <p className="truncate text-sm font-medium text-ink">{wo.title}</p>
          {wo.locationName && <p className="mt-1 truncate text-xs text-ink-secondary">{wo.locationName}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                statusBadge[wo.status] || "bg-surface-subtle text-ink-secondary"
              }`}
            >
              {statusLabel[wo.status] || wo.status}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-ink-secondary">
            <span className="text-[10px] uppercase tracking-wide text-ink-muted">Spend in Period </span>
            <span className="font-medium text-ink">{formatMoney(wo.spendInPeriod)}</span>
          </p>
          <Link
            to={`/portfolio/${wo.propertyId}/work-orders/${wo.id}`}
            state={{ backLabel: "Maintenance Spend", backTo: "/reports", backTabState: { reportState } }}
            className="mt-2 block text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            View Work Order →
          </Link>
        </span>
      ) : null,
    };
  });

  return (
    <div>
      <p className="mb-3 text-sm text-ink-secondary">
        <span className="font-medium text-ink">
          {mappedWorkOrders.length} of {matchingWorkOrders.length}
        </span>{" "}
        matching Work Order{matchingWorkOrders.length === 1 ? "" : "s"} {mappedWorkOrders.length === 1 ? "is" : "are"} mapped.
      </p>

      {matchingWorkOrders.length > 0 && mappedWorkOrders.length === 0 ? (
        <EmptyState
          icon={IconWrench}
          title="None of these matching Work Orders have a mapped location yet"
          description="Spend totals above still include all of them — mapping is just a spatial view, not a filter on the report."
        />
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <SitePlanCanvas fileStatus={fileStatus} fileUrl={fileUrl} fileObjectType={fileObjectType} height="70vh" markers={markers} />
        </div>
      )}
    </div>
  );
}
