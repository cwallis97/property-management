// Pure, DOM-free transform math for the Site Plan map. Extracted so the
// precision-critical parts (contain-fit, zoom-around-centre, pan clamping)
// can be reasoned about — and, if a client test harness is ever added,
// unit-tested — in isolation from React and the browser.
//
// Coordinate model is unchanged: a marker's mapX/mapY are percentages
// (0–100) of the rendered image content box. This module only deals with
// the CSS transform `translate(x px, y px) scale(s)` applied (with
// transform-origin 0 0) to the wrapper that contains the image + markers.

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const ZOOM_STEP = 1.6;

export function clampScale(scale) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

// The CSS px size (at scale 1) of an image with the given aspect ratio
// (w/h) laid out to CONTAIN the viewport — fully visible, never stretched,
// correct for landscape, portrait, and square alike.
export function containSize(viewport, aspect) {
  if (!viewport.w || !viewport.h || !aspect || !Number.isFinite(aspect)) return { w: 0, h: 0 };
  const heightIfFullWidth = viewport.w / aspect;
  if (heightIfFullWidth <= viewport.h) return { w: viewport.w, h: heightIfFullWidth };
  return { w: viewport.h * aspect, h: viewport.h };
}

// Clamp the translate so the content always covers the viewport when it is
// larger than it, and is centred when it fits. No dead space at the edges,
// no way to fling the plan out of view and get lost.
export function clampPan(transform, content, viewport) {
  const scaledW = content.w * transform.scale;
  const scaledH = content.h * transform.scale;
  let { x, y } = transform;

  if (scaledW <= viewport.w) x = (viewport.w - scaledW) / 2;
  else x = Math.min(0, Math.max(viewport.w - scaledW, x));

  if (scaledH <= viewport.h) y = (viewport.h - scaledH) / 2;
  else y = Math.min(0, Math.max(viewport.h - scaledH, y));

  return { scale: transform.scale, x, y };
}

// "Fit" is just scale 1, clamped (which centres it).
export function fitTransform(content, viewport) {
  return clampPan({ scale: MIN_SCALE, x: 0, y: 0 }, content, viewport);
}

// Zoom by `factor` while keeping whatever content point is under the
// viewport CENTRE anchored there — the view never jumps to a corner.
export function zoomAround(transform, factor, content, viewport) {
  const nextScale = clampScale(transform.scale * factor);
  if (nextScale === transform.scale) return transform;
  const cx = viewport.w / 2;
  const cy = viewport.h / 2;
  const ratio = nextScale / transform.scale;
  return clampPan(
    { scale: nextScale, x: cx - (cx - transform.x) * ratio, y: cy - (cy - transform.y) * ratio },
    content,
    viewport
  );
}

// Panning only makes sense when the content overflows the viewport in some
// direction (i.e. when zoomed past Fit).
export function canPan(transform, content, viewport) {
  return content.w * transform.scale > viewport.w + 0.5 || content.h * transform.scale > viewport.h + 0.5;
}

export function isFitted(transform) {
  return transform.scale <= MIN_SCALE + 1e-6;
}

// pointer position (screen px, relative to the content box's rendered
// rect) -> normalized 0–100 map coordinate. `rect` is a getBoundingClient-
// Rect() of the content box, which already includes the CSS transform, so
// this is scale/pan-invariant. Returns null for an out-of-image click or a
// zero-size box.
export function pointerToNormalized(clientX, clientY, rect) {
  if (!rect || rect.width < 1 || rect.height < 1) return null;
  const nx = ((clientX - rect.left) / rect.width) * 100;
  const ny = ((clientY - rect.top) / rect.height) * 100;
  if (nx < 0 || nx > 100 || ny < 0 || ny > 100) return null;
  return { x: nx, y: ny };
}
