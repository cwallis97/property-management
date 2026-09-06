import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SectionSpinner from "./SectionSpinner";
import EmptyState from "./EmptyState";
import SitePlanCanvas from "./SitePlanCanvas";
import CreateWorkOrderModal from "./CreateWorkOrderModal";
import { IconAlertTriangle, IconPlus } from "./icons";
import { statusLabel } from "./WorkOrderTable";
import { getSitePlan, uploadSitePlan } from "../utils/api";
import { useSitePlanFile } from "../utils/useSitePlanFile";
import { needsAttention, resolveWorkOrderContext } from "../utils/workOrders";
import { useAuth } from "../context/AuthContext";
import { CAPABILITIES } from "../utils/capabilities";

const ACCEPTED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const ACCEPTED_ACCEPT_ATTR = ".pdf,.png,.jpg,.jpeg";

// Markers derive their tone entirely from the real WorkOrder's own
// status/priority — there is no second source of truth to keep in sync.
// Completed Work Orders never reach here at all (see spatialWorkOrders'
// filter below), so this only ever distinguishes the one urgent-attention
// treatment from normal operational work.
function markerTone(workOrder) {
  if (needsAttention(workOrder)) return "urgent";
  return "operational";
}

function priorityLabel(priority) {
  return priority ? priority.charAt(0).toUpperCase() + priority.slice(1) : null;
}

// "Sep 3" for the current year, "Sep 3, 2024" otherwise — the same
// convention Reports and Analyze use for a reported date.
function formatReported(value) {
  const d = new Date(value);
  const opts = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

export default function SitePlanMap({ propertyId, locations, assets, workOrders, onWorkOrderCreated }) {
  const { hasCapability } = useAuth();
  const canUploadSitePlan = hasCapability(CAPABILITIES.SITE_PLAN_UPLOAD);
  const canCreateWorkOrder = hasCapability(CAPABILITIES.WORK_ORDER_CREATE);
  const [sitePlanStatus, setSitePlanStatus] = useState("loading"); // loading | none | error | ready
  const [sitePlan, setSitePlan] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const [reportIssueMode, setReportIssueMode] = useState(false);
  const [pendingPoint, setPendingPoint] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState(null);

  const fileInputRef = useRef(null);
  const replaceInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    setSitePlanStatus("loading");
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

  async function handleFileChosen(file) {
    if (!file) return;
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      setUploadError("File must be a PDF, PNG, or JPG.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const created = await uploadSitePlan(propertyId, file);
      setSitePlan(created);
      setSitePlanStatus("ready");
      setReportIssueMode(false);
      setPendingPoint(null);
      setSelectedWorkOrderId(null);
    } catch (err) {
      setUploadError(err.message || "Something went wrong while uploading. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handlePick(x, y) {
    setPendingPoint({ x, y });
    setReportIssueMode(false);
    setSelectedWorkOrderId(null);
    setShowCreateModal(true);
  }

  function handleModalClose() {
    setShowCreateModal(false);
    setPendingPoint(null);
  }

  function handleModalCreated(created) {
    onWorkOrderCreated(created);
    setShowCreateModal(false);
    setPendingPoint(null);
  }

  // The default Map view is current operations — completed Work Orders are
  // excluded the same way they're excluded from Active/Dashboard, but their
  // mapX/mapY are never cleared (see workOrderController's update logic), so
  // reopening one makes it reappear here automatically. A future dedicated
  // historical-map milestone will let users intentionally bring completed
  // spatial history back into view.
  const spatialWorkOrders = workOrders.filter((wo) => wo.mapX != null && wo.mapY != null && wo.status !== "completed");

  const markers = spatialWorkOrders.map((wo) => {
    const isSelected = selectedWorkOrderId === wo.id;
    const { locationLabel, assetLabel } = resolveWorkOrderContext(wo, locations, assets);
    const metaLine = [locationLabel, statusLabel[wo.status] || wo.status, priorityLabel(wo.priority)]
      .filter(Boolean)
      .join(" · ");
    return {
      id: wo.id,
      x: wo.mapX,
      y: wo.mapY,
      tone: markerTone(wo),
      selected: isSelected,
      // HOVER = preview: title + one compact metadata line. Deliberately
      // lighter than the click inspector (no assignment / asset / action).
      preview: {
        title: wo.title,
        meta: metaLine,
        sub: `Reported ${formatReported(wo.createdAt)}`,
      },
      tooltip: wo.title,
      ariaLabel: `${wo.title} — ${statusLabel[wo.status] || wo.status}`,
      // CLICK = inspect: select it; SitePlanCanvas renders `detail` in an
      // UNSCALED card anchored beside this marker — no map resize, no
      // re-fit, no transform change. A second click clears it.
      onClick: () => setSelectedWorkOrderId(isSelected ? null : wo.id),
      detail: isSelected ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-ink">{wo.title}</p>
            <button
              type="button"
              onClick={() => setSelectedWorkOrderId(null)}
              aria-label="Close detail card"
              className="-mr-1 -mt-0.5 shrink-0 rounded p-0.5 text-lg leading-none text-ink-muted transition hover:text-ink"
            >
              ×
            </button>
          </div>
          <p className="mt-0.5 text-xs text-ink-secondary">{metaLine}</p>
          <div className="mt-2 space-y-0.5 text-xs text-ink-secondary">
            <p>Reported {formatReported(wo.createdAt)}</p>
            <p>Assigned to {wo.assignee?.name || "Unassigned"}</p>
            {assetLabel && <p>Asset: {assetLabel}</p>}
          </div>
          <Link
            to={`/portfolio/${propertyId}/work-orders/${wo.id}`}
            state={{ backLabel: "Map", backTo: `/portfolio/${propertyId}`, backTabState: { tab: "map" } }}
            className="mt-2 block text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            View Work Order →
          </Link>
        </>
      ) : undefined,
    };
  });

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
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface px-6 py-24 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-subtle text-ink-muted">
          <IconPlus className="h-5 w-5" />
        </div>
        <h2 className="text-sm font-semibold text-ink">Set Up Property Map</h2>
        <p className="mt-1.5 max-w-sm text-sm text-ink-secondary">
          {canUploadSitePlan
            ? "Upload the overhead site plan, property map, or aerial image your team already uses."
            : "No site plan has been uploaded for this property yet."}
        </p>

        {canUploadSitePlan && (
          <>
            <p className="mt-1 text-xs text-ink-muted">Accepted: PDF, PNG, JPG</p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => handleFileChosen(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload Site Plan"}
            </button>
            {uploadError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{uploadError}</p>}
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {canCreateWorkOrder ? (
          <button
            type="button"
            onClick={() => {
              setReportIssueMode((v) => !v);
              setPendingPoint(null);
              setSelectedWorkOrderId(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              reportIssueMode ? "bg-accent text-accent-ink" : "border border-line text-ink-secondary hover:bg-surface-subtle"
            }`}
          >
            <IconPlus className="h-4 w-4" />
            {reportIssueMode ? "Click the map to report…" : "Report Issue"}
          </button>
        ) : (
          <span />
        )}

        {canUploadSitePlan && (
          <>
            <input
              ref={replaceInputRef}
              type="file"
              accept={ACCEPTED_ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => handleFileChosen(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => replaceInputRef.current?.click()}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Replace site plan"}
            </button>
          </>
        )}
      </div>

      {uploadError && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{uploadError}</p>}

      {/* HOVER = light preview tooltip · CLICK = a compact unscaled
          inspector card anchored beside the marker (rendered by
          SitePlanCanvas, outside its zoom/pan transform). Selecting,
          switching, or clearing a marker never resizes, re-fits, or
          otherwise moves the Site Plan. Analyze mode keeps its own
          analytical side panel — deliberate and unchanged. */}
      <div className="relative">
        <SitePlanCanvas
          fileStatus={fileStatus}
          fileUrl={fileUrl}
          fileObjectType={fileObjectType}
          height="72vh"
          pickMode={reportIssueMode}
          onPick={handlePick}
          onBackgroundClick={() => setSelectedWorkOrderId(null)}
          pendingPoint={pendingPoint}
          markers={markers}
        />
      </div>

      {showCreateModal && (
        <CreateWorkOrderModal
          propertyId={propertyId}
          locations={locations}
          assets={assets}
          initialMapPosition={pendingPoint}
          onClose={handleModalClose}
          onCreated={handleModalCreated}
        />
      )}
    </div>
  );
}
