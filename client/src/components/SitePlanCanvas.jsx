import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import SectionSpinner from "./SectionSpinner";
import EmptyState from "./EmptyState";
import { IconAlertTriangle } from "./icons";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.3;
const PDF_RENDER_SCALE = 2; // raster resolution multiplier for page 1, not a UI zoom level

// Canvas gets the same responsive-aspect-ratio treatment as the <img> case
// ("canvas { max-width: 100%; height: auto }" is a well-established
// pattern for preserving a canvas's intrinsic bitmap aspect ratio).
const CONTENT_STYLE = { display: "block", maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto" };

const MARKER_TONE_CLASS = {
  urgent: "bg-red-500 ring-red-600",
  default: "bg-blue-600 ring-blue-700",
  completed: "bg-gray-400 ring-gray-500",
  pending: "bg-gray-900 ring-gray-900 animate-pulse",
};

function clampScale(scale) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

// Shared by the full Property Map tab and the Create Work Order modal's
// "Mark Location on Map" step, so neither duplicates PDF/image rendering,
// zoom/pan, or click-to-normalized-coordinate math. This component only
// knows how to display a site plan and report normalized clicks/markers —
// it has no idea what a marker represents (Work Order, or anything else).
export default function SitePlanCanvas({
  fileStatus,
  fileUrl,
  fileObjectType,
  height = "70vh",
  pickMode = false,
  onPick,
  pendingPoint,
  markers = [],
}) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const draggingRef = useRef(null); // { startX, startY, originX, originY } while panning

  const contentRef = useRef(null);
  const canvasRef = useRef(null);

  // Renders PDF page 1 onto the <canvas> once both the worker-backed pdfjs
  // pipeline and the fetched blob are ready. Images skip this entirely —
  // they're just an <img src={fileUrl}>.
  useEffect(() => {
    if (fileObjectType !== "pdf" || fileStatus !== "ready" || !fileUrl) return;
    let cancelled = false;

    (async () => {
      const doc = await pdfjsLib.getDocument(fileUrl).promise;
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    })();

    return () => {
      cancelled = true;
    };
  }, [fileObjectType, fileStatus, fileUrl]);

  const resetView = () => setTransform({ scale: 1, x: 0, y: 0 });

  const zoomBy = (factor) => {
    setTransform((prev) => {
      const nextScale = clampScale(prev.scale * factor);
      return nextScale === MIN_SCALE ? { scale: MIN_SCALE, x: 0, y: 0 } : { ...prev, scale: nextScale };
    });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
  };

  const handleViewportPointerDown = (e) => {
    if (pickMode || transform.scale === MIN_SCALE) return;
    draggingRef.current = { startX: e.clientX, startY: e.clientY, originX: transform.x, originY: transform.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleViewportPointerMove = (e) => {
    if (!draggingRef.current) return;
    const { startX, startY, originX, originY } = draggingRef.current;
    setTransform((prev) => ({ ...prev, x: originX + (e.clientX - startX), y: originY + (e.clientY - startY) }));
  };

  const handleViewportPointerUp = () => {
    draggingRef.current = null;
  };

  function handleContentClick(e) {
    if (!pickMode || !onPick || !contentRef.current) return;
    const rect = contentRef.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    onPick(x, y);
  }

  const canPan = transform.scale > MIN_SCALE;

  if (fileStatus === "loading") return <SectionSpinner />;

  if (fileStatus === "error") {
    return <EmptyState icon={IconAlertTriangle} title="Couldn't load the uploaded file" description="Please try replacing the site plan." />;
  }

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
        <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-sm font-medium text-ink-secondary shadow-sm transition hover:bg-surface-subtle">
          −
        </button>
        <button type="button" onClick={() => zoomBy(ZOOM_STEP)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-sm font-medium text-ink-secondary shadow-sm transition hover:bg-surface-subtle">
          +
        </button>
        <button type="button" onClick={resetView} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-secondary shadow-sm transition hover:bg-surface-subtle">
          Reset view
        </button>
      </div>

      <div
        className="flex items-center justify-center overflow-hidden rounded-xl bg-surface-subtle"
        style={{ height, cursor: pickMode ? "crosshair" : canPan ? "grab" : "default" }}
        onWheel={handleWheel}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onPointerLeave={handleViewportPointerUp}
      >
        <div style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
          <div ref={contentRef} onClick={handleContentClick} className="relative inline-block select-none">
            {fileObjectType === "image" ? (
              <img src={fileUrl} alt="Property site plan" style={CONTENT_STYLE} draggable={false} />
            ) : (
              <canvas ref={canvasRef} style={CONTENT_STYLE} />
            )}

            {markers.map((marker) => (
              <button
                key={marker.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  marker.onClick?.();
                }}
                style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ${
                  MARKER_TONE_CLASS[marker.tone] || MARKER_TONE_CLASS.default
                }`}
                aria-label={marker.label || "Marker"}
              >
                {marker.popover}
              </button>
            ))}

            {pendingPoint && (
              <span
                style={{ left: `${pendingPoint.x}%`, top: `${pendingPoint.y}%` }}
                className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${MARKER_TONE_CLASS.pending}`}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
