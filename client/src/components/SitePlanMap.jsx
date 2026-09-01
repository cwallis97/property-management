import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SectionSpinner from "./SectionSpinner";
import EmptyState from "./EmptyState";
import SitePlanCanvas from "./SitePlanCanvas";
import CreateWorkOrderModal from "./CreateWorkOrderModal";
import { IconAlertTriangle, IconPlus } from "./icons";
import { priorityBadge, statusBadge, statusLabel } from "./WorkOrderTable";
import { getSitePlan, uploadSitePlan } from "../utils/api";
import { useSitePlanFile } from "../utils/useSitePlanFile";
import { needsAttention, resolveWorkOrderContext } from "../utils/workOrders";
import { useAuth } from "../context/AuthContext";
import { CAPABILITIES } from "../utils/capabilities";

const ACCEPTED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const ACCEPTED_ACCEPT_ATTR = ".pdf,.png,.jpg,.jpeg";

// Markers derive their color entirely from the real WorkOrder's own
// status/priority — there is no second source of truth to keep in sync.
// Completed Work Orders never reach here at all (see spatialWorkOrders'
// filter below), so this only ever distinguishes urgent from everything
// else currently active.
function markerTone(workOrder) {
  if (needsAttention(workOrder)) return "urgent";
  return "default";
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

    return {
      id: wo.id,
      x: wo.mapX,
      y: wo.mapY,
      tone: markerTone(wo),
      label: wo.title,
      onClick: () => setSelectedWorkOrderId(isSelected ? null : wo.id),
      popover: isSelected ? (
        <span
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 cursor-default rounded-xl border border-line bg-surface p-3 text-left shadow-lg"
        >
          <p className="truncate text-sm font-medium text-ink">{wo.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                priorityBadge[wo.priority] || "bg-surface-subtle text-ink-secondary"
              }`}
            >
              {wo.priority}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                statusBadge[wo.status] || "bg-surface-subtle text-ink-secondary"
              }`}
            >
              {statusLabel[wo.status] || wo.status}
            </span>
          </div>
          {(locationLabel || assetLabel) && (
            <p className="mt-1.5 truncate text-xs text-ink-secondary">
              {locationLabel}
              {locationLabel && assetLabel && " · "}
              {assetLabel}
            </p>
          )}
          <Link
            to={`/portfolio/${propertyId}/work-orders/${wo.id}`}
            state={{ backLabel: "Map", backTo: `/portfolio/${propertyId}`, backTabState: { tab: "map" } }}
            className="mt-2 block text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            View Work Order →
          </Link>
        </span>
      ) : null,
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

      <SitePlanCanvas
        fileStatus={fileStatus}
        fileUrl={fileUrl}
        fileObjectType={fileObjectType}
        height="72vh"
        pickMode={reportIssueMode}
        onPick={handlePick}
        pendingPoint={pendingPoint}
        markers={markers}
      />

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
