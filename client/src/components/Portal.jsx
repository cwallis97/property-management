import { createPortal } from "react-dom";

// Renders children as a direct child of <body>, outside the React tree's
// normal DOM position. Needed for any overlay opened from INSIDE the
// sticky Header: Header has `backdrop-blur` (a backdrop-filter), which — per
// CSS — makes Header the containing block for `position: fixed`
// descendants and also its own stacking context, so a `fixed inset-0`
// modal rendered within Header gets clamped to the 64px header box and
// painted at the header's z-layer. Portaling to <body> escapes both, so
// the existing `fixed inset-0 z-30` modal chrome resolves to the real
// viewport and paints above the whole app. Pages that open the same
// modals from within <main> don't need this (no fixed-trapping ancestor
// there) and are unchanged.
export default function Portal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
