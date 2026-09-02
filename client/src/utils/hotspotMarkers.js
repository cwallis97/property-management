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
//   1. A named-Location hotspot with a representative coordinate — badge
//      shown once it has 2+ matching Work Orders; a single-match Location
//      still gets a marker, just a plain unbadged one.
//   2. "Unspecified Location" Work Orders that individually have
//      coordinates — rendered as their own individual pins, never
//      collapsed into one fake shared point (there is no one real place
//      that bucket represents).
export function buildHotspotMarkers({ hotspots, workOrders, selectedHotspotKey, onSelectHotspot }) {
  const markers = [];

  for (const hotspot of hotspots) {
    if (hotspot.mapX == null || hotspot.mapY == null) continue;
    const key = hotspotKey(hotspot.locationId);
    const isGrouped = hotspot.workOrderCount > 1;
    const isSelected = selectedHotspotKey === key;
    markers.push({
      id: `hotspot-${key}`,
      x: hotspot.mapX,
      y: hotspot.mapY,
      tone: isGrouped ? (isSelected ? "hotspotSelected" : "hotspot") : isSelected ? "defaultSelected" : "default",
      size: hotspot.workOrderCount >= 5 ? "lg" : hotspot.workOrderCount >= 2 ? "md" : "sm",
      // Selection is communicated by a distinct ring/halo in SitePlanCanvas
      // (not tone alone) so it reads for a viewer who can't rely on the
      // color shift between hotspot / hotspotSelected.
      selected: isSelected,
      badge: isGrouped ? hotspot.workOrderCount : undefined,
      label: `${hotspot.locationLabel} — ${hotspot.workOrderCount} matching Work Order${hotspot.workOrderCount === 1 ? "" : "s"}`,
      onClick: () => onSelectHotspot(key),
    });
  }

  for (const wo of workOrders) {
    if (wo.locationId != null) continue; // has a named-Location hotspot marker instead
    if (wo.mapX == null || wo.mapY == null) continue;
    const key = "__unspecified__";
    const isSelected = selectedHotspotKey === key;
    markers.push({
      id: `wo-${wo.id}`,
      x: wo.mapX,
      y: wo.mapY,
      tone: isSelected ? "defaultSelected" : "default",
      size: "sm",
      selected: isSelected,
      label: `${wo.title} — Unspecified Location`,
      onClick: () => onSelectHotspot(key),
    });
  }

  return markers;
}
