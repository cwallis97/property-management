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
  // Distinguishes a grouped hotspot marker (Site Map Analyze) from an
  // individual Work Order pin — a distinct hue, not just a size change, so
  // it reads correctly even for a viewer who can't distinguish size alone.
  hotspot: "bg-violet-600 ring-violet-700",
  hotspotSelected: "bg-violet-800 ring-violet-900",
  defaultSelected: "bg-blue-800 ring-blue-900",
};

// Selected-marker treatment — a heavy contrasting halo ring, layered on
// TOP of the tone shift so selection never depends on color alone (see
// Site Map Analyze's selectedHotspotKey). Applied via marker.selected.
const MARKER_SELECTED_CLASS = "z-10 ring-4 ring-accent ring-offset-2 ring-offset-surface";

// Optional per-marker size tier — additive to the existing fixed-size
// dot (still the default). Site Map Analyze uses this so a
// higher-repair-count hotspot reads as visually more prominent, never
// relying on color/tone alone to communicate that (see marker.badge below
// for the actual accessible count).
const MARKER_SIZE_CLASS = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-6 w-6",
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

  const canZoomOut = transform.scale > MIN_SCALE;
  const canZoomIn = transform.scale < MAX_SCALE;
  const canReset = transform.scale !== 1 || transform.x !== 0 || transform.y !== 0;

  return (
    <div className="relative">
      {/* One cohesive toolbar, not three separate floating buttons — same
          segmented-pill language as this app's other compact controls
          (date-range presets, mode toggles), just overlaid on the canvas. */}
      <div className="absolute right-3 top-3 z-10 flex items-center overflow-hidden rounded-lg border border-line bg-surface/95 shadow-sm backdrop-blur-sm">
        <button
          type="button"
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          disabled={!canZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
          className="flex h-8 w-8 items-center justify-center text-base font-medium text-ink-secondary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
        >
          −
        </button>
        <div className="h-5 w-px bg-line" aria-hidden="true" />
        <button
          type="button"
          onClick={() => zoomBy(ZOOM_STEP)}
          disabled={!canZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
          className="flex h-8 w-8 items-center justify-center text-base font-medium text-ink-secondary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
        <div className="h-5 w-px bg-line" aria-hidden="true" />
        <button
          type="button"
          onClick={resetView}
          disabled={!canReset}
          title="Fit to view"
          aria-label="Fit to view"
          className="px-2.5 text-xs font-medium text-ink-secondary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
        >
          Fit
        </button>
      </div>

      <div
        className="flex items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-subtle"
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
                title={marker.label || undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  marker.onClick?.();
                }}
                style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 transition hover:z-10 hover:scale-110 focus-visible:z-10 focus-visible:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${
                  MARKER_SIZE_CLASS[marker.size] || MARKER_SIZE_CLASS.sm
                } ${MARKER_TONE_CLASS[marker.tone] || MARKER_TONE_CLASS.default} ${marker.selected ? MARKER_SELECTED_CLASS : ""}`}
                aria-label={marker.badge ? `${marker.label || "Location"}: ${marker.badge} matching Work Orders` : marker.label || "Marker"}
              >
                {/* Numeric count badge — the accessible, always-visible signal
                    behind a hotspot's size/color; never encoded via color alone. */}
                {marker.badge != null && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-ink px-1 text-[10px] font-semibold leading-none text-page shadow dark:border-page"
                  >
                    {marker.badge > 99 ? "99+" : marker.badge}
                  </span>
                )}
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
