// Generic location/asset hierarchy helpers. Locations form a tree of
// arbitrary depth via parentLocationId (null = top-level) — nothing here
// assumes a fixed number of levels or a specific property type, so the same
// functions work for "Building > Unit", "Lot", "Floor > Room", or deeper
// chains like "Building > Floor > Suite".

export function buildLocationTree(locations) {
  const byParent = new Map();
  locations.forEach((location) => {
    const key = location.parentLocationId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(location);
  });

  function attachChildren(location) {
    return {
      ...location,
      children: (byParent.get(location.id) || []).map(attachChildren),
    };
  }

  return (byParent.get(null) || []).map(attachChildren);
}

export function getLocationPath(locationId, locations) {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const path = [];
  let current = byId.get(locationId);
  while (current) {
    path.unshift(current.name);
    current = current.parentLocationId != null ? byId.get(current.parentLocationId) : null;
  }
  return path;
}

export function buildAssetRows(propertyId, { locations, assets }) {
  const propertyLocations = locations.filter((location) => location.propertyId === propertyId);
  const propertyAssets = assets.filter((asset) => asset.propertyId === propertyId);

  return propertyAssets.map((asset) => {
    const path = getLocationPath(asset.locationId, propertyLocations);
    return {
      ...asset,
      locationPath: path.join(" > "),
      depth: path.length,
    };
  });
}
