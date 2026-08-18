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
          className="absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 cursor-default rounded-xl border border-gray-200 bg-white p-3 text-left shadow-lg"
        >
          <p className="truncate text-sm font-medium text-gray-900">{wo.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                priorityBadge[wo.priority] || "bg-gray-50 text-gray-500"
              }`}
            >
              {wo.priority}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                statusBadge[wo.status] || "bg-gray-50 text-gray-500"
              }`}
            >
              {statusLabel[wo.status] || wo.status}
            </span>
          </div>
          {(locationLabel || assetLabel) && (
            <p className="mt-1.5 truncate text-xs text-gray-500">
              {locationLabel}
              {locationLabel && assetLabel && " · "}
              {assetLabel}
            </p>
          )}
          <Link
            to={`/portfolio/${propertyId}/work-orders/${wo.id}`}
            state={{ backLabel: "Map", backTo: `/portfolio/${propertyId}`, backTabState: { tab: "map" } }}
            className="mt-2 block text-xs font-medium text-blue-600 hover:underline"
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
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
        <h2 className="text-base font-semibold text-gray-900">Set Up Property Map</h2>
        <p className="mt-2 max-w-md text-sm text-gray-500">
          Upload the overhead site plan, property map, or aerial image your team already uses.
        </p>
        <p className="mt-1 text-xs text-gray-400">Accepted: PDF, PNG, JPG</p>

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
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload Site Plan"}
        </button>
        {uploadError && <p className="mt-3 text-sm text-red-600">{uploadError}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setReportIssueMode((v) => !v);
            setPendingPoint(null);
            setSelectedWorkOrderId(null);
          }}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            reportIssueMode ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-700 hover:bg-gray-50"
          }`}
        >
          <IconPlus className="h-4 w-4" />
          {reportIssueMode ? "Click the map to report…" : "Report Issue"}
        </button>

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
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Replace site plan"}
        </button>
      </div>

      {uploadError && <p className="mb-3 text-sm text-red-600">{uploadError}</p>}

      <SitePlanCanvas
        fileStatus={fileStatus}
        fileUrl={fileUrl}
        fileObjectType={fileObjectType}
        height="70vh"
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
