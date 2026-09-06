import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import SectionSpinner from "./SectionSpinner";
import EmptyState from "./EmptyState";
import { IconAlertTriangle } from "./icons";
import {
  MIN_SCALE,
  MAX_SCALE,
  ZOOM_STEP,
  containSize,
  clampPan,
  fitTransform,
  zoomAround,
  canPan as canPanFor,
  isFitted,
  pointerToNormalized,
} from "../utils/sitePlanTransform";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const PDF_RENDER_SCALE = 2; // raster resolution for page 1, not a UI zoom level
const DRAG_THRESHOLD_PX = 3; // movement past this = a pan, not a click

// One analytical tone per purpose — no per-category rainbow. `operational`
// is a normal active Work Order; `urgent` is the single attention
// treatment (a distinct hue AND a persistent hairline ring, so it never
// reads on colour alone); `hotspot` is an Analyze-mode repeat-repair
// cluster. Selection is deliberately NOT a darker colour — it is halo
// geometry only (see PrecisionMarker).
const MARKER_TONE = {
  operational: { dot: "#2563eb", ring: false },
  urgent: { dot: "#dc2626", ring: true },
  hotspot: { dot: "#7c3aed", ring: false },
};

function hexWithAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const CARD_GAP = 14; // clearance between the marker and the anchored card
const CARD_MARGIN = 8; // keep the card this far inside the viewport edges

// Screen position (px, relative to the viewport's top-left) for the
// anchored detail card of a selected marker. Prefers upper-right of the
// marker, flips to the left near the right edge and below near the top
// edge, then clamps fully inside the viewport so it can never clip. The
// gap guarantees the card never covers the precision centre dot itself.
function anchoredCardPosition({ marker, transform, content, viewport, card }) {
  const mx = transform.x + ((content.w * marker.x) / 100) * transform.scale;
  const my = transform.y + ((content.h * marker.y) / 100) * transform.scale;

  let left = mx + CARD_GAP;
  if (left + card.w > viewport.w - CARD_MARGIN) left = mx - CARD_GAP - card.w;
  left = Math.min(Math.max(left, CARD_MARGIN), Math.max(CARD_MARGIN, viewport.w - card.w - CARD_MARGIN));

  let top = my - CARD_GAP - card.h;
  if (top < CARD_MARGIN) top = my + CARD_GAP;
  top = Math.min(Math.max(top, CARD_MARGIN), Math.max(CARD_MARGIN, viewport.h - card.h - CARD_MARGIN));

  return { left, top };
}

// A mapped point. The visible anchor is a tiny (~7px) centre dot at the
// exact normalized coordinate — double-contrast hairline so it holds up on
// any site-plan background in either theme. It never moves and never
// resizes. The interactive hit target is the full 24px button. Hover and
// selection add an outward halo (and, when selected, a ring) that expands
// AWAY from the anchor — the underlying plan point is never covered.
//
// Interaction model, identical in Active and Analyze mode:
//   HOVER  → a compact, counter-scaled preview tooltip (marker.preview)
//   CLICK  → marker stays selected (halo); the caller opens an UNSCALED
//            detail surface outside this transform.
function PrecisionMarker({ marker, scale }) {
  const tone = MARKER_TONE[marker.tone] || MARKER_TONE.operational;
  const preview = marker.preview;

  return (
    <button
      type="button"
      title={marker.tooltip || undefined}
      aria-label={marker.ariaLabel || marker.tooltip || "Map marker"}
      aria-pressed={marker.selected || undefined}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        marker.onClick?.();
      }}
      style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
      className="group absolute z-[1] flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center focus:outline-none"
    >
      <span
        aria-hidden="true"
        style={{
          borderColor: tone.dot,
          backgroundColor: hexWithAlpha(tone.dot, marker.selected ? 0.14 : 0.22),
        }}
        className={`pointer-events-none absolute rounded-full transition-all duration-150 ${
          marker.selected
            ? "h-[22px] w-[22px] border-2"
            : "h-0 w-0 border-0 opacity-0 group-hover:h-[15px] group-hover:w-[15px] group-hover:opacity-100 group-focus-visible:h-[15px] group-focus-visible:w-[15px] group-focus-visible:opacity-100"
        }`}
      />
      <span
        aria-hidden="true"
        style={{
          backgroundColor: tone.dot,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.95), 0 0 0 2px rgba(0,0,0,0.35)${
            tone.ring ? `, 0 0 0 4px ${hexWithAlpha(tone.dot, 0.32)}` : ""
          }`,
        }}
        className="relative h-[7px] w-[7px] rounded-full"
      />
      {preview && (
        <span
          aria-hidden="true"
          style={{
            left: "50%",
            bottom: "100%",
            transform: `translateX(-50%) translateY(-7px) scale(${1 / scale})`,
            transformOrigin: "center bottom",
          }}
          className="pointer-events-none absolute z-10 w-max max-w-[220px] rounded-lg bg-ink px-2 py-1.5 text-left leading-tight text-page opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <span className="block truncate text-[11px] font-semibold">{preview.title}</span>
          {preview.meta && <span className="mt-0.5 block truncate text-[10px] text-page/75">{preview.meta}</span>}
          {preview.sub && <span className="mt-0.5 block truncate text-[10px] text-page/60">{preview.sub}</span>}
        </span>
      )}
    </button>
  );
}

// Shared by the full Property Map tab (Active + Analyze) and the Create
// Work Order modal's "Mark Location on Map" step, so none of them duplicate
// PDF/image rendering, zoom/pan, or click-to-normalized-coordinate math.
// This component only displays a site plan and reports normalized
// clicks/markers — it has no idea what a marker represents.
//
// Geometry model: a fixed-height viewport (overflow hidden) contains a
// transform wrapper (transform-origin 0 0) that is translated + scaled.
// Inside it, the content box is sized in CSS px to CONTAIN the viewport
// (fully visible for any aspect ratio) and the image/canvas fills it
// exactly. Markers are positioned as a percentage of that content box, so
// they resolve pre-transform and then scale/translate identically with the
// plan — drift-free by construction. All the transform math lives in
// utils/sitePlanTransform.js.
export default function SitePlanCanvas({
  fileStatus,
  fileUrl,
  fileObjectType,
  height = "70vh",
  pickMode = false,
  onPick,
  onBackgroundClick,
  pendingPoint,
  markers = [],
}) {
  const [transform, setTransform] = useState({ scale: MIN_SCALE, x: 0, y: 0 });
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState(null); // natural width / height of the plan
  const [isPanning, setIsPanning] = useState(false);

  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const cardRef = useRef(null);
  const dragRef = useRef(null); // { startX, startY, originX, originY, moved } while panning
  const movedRef = useRef(false); // did the last pointer sequence move (→ suppress the click)?

  const [cardSize, setCardSize] = useState({ w: 280, h: 150 });

  const content = useMemo(() => containSize(viewport, aspect), [viewport, aspect]);
  const contentReady = content.w > 1 && content.h > 1;

  // The one selected marker that carries its own detail node — rendered as
  // an unscaled card anchored beside it (outside the transform), never in
  // the transformed subtree, so it doesn't scale with zoom and opening it
  // never touches the map's size or transform.
  const selectedMarker = markers.find((m) => m.selected && m.detail) || null;

  // Measure the viewport box and keep it current across container resizes.
  // Depends on fileStatus because the viewport element only exists in the
  // "ready" render — a first paint in the loading/error state has no ref to
  // observe, so the effect must re-run once the element mounts.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setViewport({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fileStatus]);

  // New file → forget the previous aspect ratio and snap back to Fit.
  useEffect(() => {
    setAspect(null);
    setTransform({ scale: MIN_SCALE, x: 0, y: 0 });
  }, [fileUrl, fileObjectType]);

  // Whenever the geometry changes (resize, first measure, aspect resolves),
  // re-clamp: at Fit this re-centres; when zoomed it keeps the scale but
  // stops the plan being stranded off-screen.
  useEffect(() => {
    if (!contentReady) return;
    setTransform((prev) => clampPan(prev, content, viewport));
  }, [contentReady, content.w, content.h, viewport.w, viewport.h]);

  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    if (img?.naturalWidth && img?.naturalHeight) setAspect(img.naturalWidth / img.naturalHeight);
  }, []);

  // Covers a cached image that finished loading before the handler bound.
  useEffect(() => {
    const img = imgRef.current;
    if (fileObjectType === "image" && img?.complete && img.naturalWidth) {
      setAspect(img.naturalWidth / img.naturalHeight);
    }
  }, [fileObjectType, fileUrl]);

  // PDF page 1 → <canvas>, and its aspect ratio (known up front from the
  // page viewport, so markers never mount against a 0×0 canvas and snap).
  useEffect(() => {
    if (fileObjectType !== "pdf" || fileStatus !== "ready" || !fileUrl) return undefined;
    let cancelled = false;
    (async () => {
      const doc = await pdfjsLib.getDocument(fileUrl).promise;
      const page = await doc.getPage(1);
      const vp = page.getViewport({ scale: PDF_RENDER_SCALE });
      if (cancelled) return;
      setAspect(vp.width / vp.height);
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [fileObjectType, fileStatus, fileUrl]);

  // Measure the anchored card once its content is known, so the flip/clamp
  // math uses its real size. Only re-measures when the selected marker
  // changes (its content, and therefore its size, is otherwise stable).
  useLayoutEffect(() => {
    if (!selectedMarker || !cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    setCardSize((prev) => (Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1 ? prev : { w: r.width, h: r.height }));
  }, [selectedMarker?.id]);

  // Escape closes the anchored inspector (same effect as clicking empty map).
  useEffect(() => {
    if (!selectedMarker) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onBackgroundClick?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedMarker, onBackgroundClick]);

  const pannable = contentReady && canPanFor(transform, content, viewport);

  const applyZoom = (factor) => setTransform((prev) => zoomAround(prev, factor, content, viewport));
  const fitView = () => setTransform(fitTransform(content, viewport));

  const onPointerDown = (e) => {
    movedRef.current = false;
    if (pickMode || !pannable) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: transform.x, originY: transform.y, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture is best-effort */
    }
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    movedRef.current = true;
    setIsPanning(true);
    setTransform((prev) => clampPan({ scale: prev.scale, x: d.originX + dx, y: d.originY + dy }, content, viewport));
  };

  const onPointerUp = (e) => {
    if (dragRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
    }
    dragRef.current = null;
    setIsPanning(false);
  };

  function handleContentClick(e) {
    if (movedRef.current) return; // that was a pan
    if (!contentReady || !contentRef.current) return;
    const point = pointerToNormalized(e.clientX, e.clientY, contentRef.current.getBoundingClientRect());
    if (!point) return; // out-of-image / zero-size guard
    if (pickMode) onPick?.(point.x, point.y);
    else onBackgroundClick?.();
  }

  if (fileStatus === "loading") return <SectionSpinner />;
  if (fileStatus === "error") {
    return (
      <EmptyState
        icon={IconAlertTriangle}
        title="Couldn't load the uploaded file"
        description="Please try replacing the site plan."
      />
    );
  }

  const showToolbar = fileStatus === "ready";
  const cursor = pickMode ? "crosshair" : isPanning ? "grabbing" : pannable ? "grab" : "default";
  const cardPos =
    contentReady && selectedMarker
      ? anchoredCardPosition({ marker: selectedMarker, transform, content, viewport, card: cardSize })
      : null;

  return (
    <div className="relative">
      {showToolbar && (
        <div className="absolute right-3 top-3 z-30 flex items-center overflow-hidden rounded-lg border border-line bg-surface/95 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={() => applyZoom(1 / ZOOM_STEP)}
            disabled={transform.scale <= MIN_SCALE}
            title="Zoom out"
            aria-label="Zoom out"
            className="flex h-8 w-8 items-center justify-center text-base font-medium text-ink-secondary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
          >
            −
          </button>
          <div className="h-5 w-px bg-line" aria-hidden="true" />
          <button
            type="button"
            onClick={() => applyZoom(ZOOM_STEP)}
            disabled={transform.scale >= MAX_SCALE}
            title="Zoom in"
            aria-label="Zoom in"
            className="flex h-8 w-8 items-center justify-center text-base font-medium text-ink-secondary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
          <div className="h-5 w-px bg-line" aria-hidden="true" />
          <button
            type="button"
            onClick={fitView}
            disabled={isFitted(transform)}
            title="Fit to view"
            aria-label="Fit to view"
            className="px-2.5 text-xs font-medium text-ink-secondary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
          >
            Fit
          </button>
        </div>
      )}

      <div
        ref={viewportRef}
        className="relative overflow-hidden rounded-xl border border-line bg-surface-subtle"
        style={{ height, cursor, touchAction: pannable ? "none" : "auto" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {fileStatus === "ready" && !contentReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <SectionSpinner />
          </div>
        )}

        <div
          className="absolute left-0 top-0 will-change-transform"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "0 0",
          }}
        >
          <div
            ref={contentRef}
            onClick={handleContentClick}
            className="relative select-none"
            style={{ width: content.w || 0, height: content.h || 0 }}
          >
            {fileObjectType === "image" ? (
              <img
                ref={imgRef}
                src={fileUrl}
                alt="Property site plan"
                draggable={false}
                onLoad={handleImageLoad}
                style={{ display: "block", width: "100%", height: "100%" }}
              />
            ) : (
              <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
            )}

            {contentReady &&
              markers.map((marker) => <PrecisionMarker key={marker.id} marker={marker} scale={transform.scale} />)}

            {contentReady && pendingPoint && (
              <span
                aria-hidden="true"
                style={{ left: `${pendingPoint.x}%`, top: `${pendingPoint.y}%` }}
                className="absolute z-[2] flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              >
                <span
                  style={{ borderColor: MARKER_TONE.operational.dot }}
                  className="absolute h-4 w-4 rounded-full border-2 border-dashed"
                />
                <span
                  style={{
                    backgroundColor: MARKER_TONE.operational.dot,
                    boxShadow: "0 0 0 1px rgba(255,255,255,0.95), 0 0 0 2px rgba(0,0,0,0.35)",
                  }}
                  className="relative h-[7px] w-[7px] rounded-full"
                />
              </span>
            )}
          </div>
        </div>

        {cardPos && (
          <div
            ref={cardRef}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{ left: cardPos.left, top: cardPos.top, maxWidth: 300 }}
            className="absolute z-20 w-max rounded-xl border border-line bg-surface p-3 text-left shadow-lg"
          >
            {selectedMarker.detail}
          </div>
        )}
      </div>
    </div>
  );
}
