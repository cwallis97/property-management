import { analyzeMoney } from "./analyzeFormat";

// The one shared identity for a hotspot everywhere it's referenced — the
// Top Repeat Locations list, map markers, and the detail panel all derive
// "which hotspot" from this same function, so they can never disagree
// about what's selected. null (the "Unspecified Location" bucket) becomes
// a stable sentinel string so it still works as a Map/state key.
export function hotspotKey(locationId) {
  return locationId ?? "__unspecified__";
}

// Builds SitePlanCanvas marker objects directly from the Work Orders
// Report's own authoritative `hotspots` + `workOrders` arrays — never a
// second, independent filter or aggregation. Two kinds, matching the
// backend's documented hotspot rule (see reportController.js#getWorkOrdersReport):
//   1. A named-Location hotspot with a representative coordinate.
//   2. "Unspecified Location" Work Orders that individually have
//      coordinates — rendered as their own individual pins, never
//      collapsed into one fake shared point.
//
// Every marker uses the single Analyze "hotspot" tone. Prominence and
// repair count are NOT encoded at rest (no size tiers, no colour ramp, no
// always-on badge) — the count/spend surface on hover and in the side
// panel. Selection is communicated by halo geometry in SitePlanCanvas, not
// a darker colour.
export function buildHotspotMarkers({ hotspots, workOrders, selectedHotspotKey, onSelectHotspot }) {
  const markers = [];

  for (const hotspot of hotspots) {
    if (hotspot.mapX == null || hotspot.mapY == null) continue;
    const key = hotspotKey(hotspot.locationId);
    const count = hotspot.workOrderCount;
    const countText = `${count} repair${count === 1 ? "" : "s"}`;
    markers.push({
      id: `hotspot-${key}`,
      x: hotspot.mapX,
      y: hotspot.mapY,
      tone: "hotspot",
      selected: selectedHotspotKey === key,
      preview: {
        title: hotspot.locationLabel,
        meta: `${countText} · ${analyzeMoney(hotspot.spend)}`,
      },
      tooltip: `${hotspot.locationLabel} — ${countText}`,
      ariaLabel: `${hotspot.locationLabel}: ${countText}, ${analyzeMoney(hotspot.spend)} spend`,
      onClick: () => onSelectHotspot(key),
    });
  }

  for (const wo of workOrders) {
    if (wo.locationId != null) continue; // has a named-Location hotspot marker instead
    if (wo.mapX == null || wo.mapY == null) continue;
    const key = "__unspecified__";
    markers.push({
      id: `wo-${wo.id}`,
      x: wo.mapX,
      y: wo.mapY,
      tone: "hotspot",
      selected: selectedHotspotKey === key,
      preview: { title: wo.title, meta: "Unspecified Location" },
      tooltip: `${wo.title} — Unspecified Location`,
      ariaLabel: `${wo.title}, Unspecified Location`,
      onClick: () => onSelectHotspot(key),
    });
  }

  return markers;
}
