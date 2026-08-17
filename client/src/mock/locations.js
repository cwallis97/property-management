// parentLocationId links locations into an arbitrarily deep tree per property.
// null = top-level location. Depth is not capped by this schema — see
// src/utils/hierarchy.js for the traversal logic that walks it.
export const locations = [
  // Maple Ridge Apartments (Apartment): Building -> Unit
  { id: 1, propertyId: 1, parentLocationId: null, name: "Building A", type: "Building" },
  { id: 2, propertyId: 1, parentLocationId: 1, name: "Unit 204", type: "Unit" },

  // Riverside Commons (Commercial): Suite, and a top-level Building with no sub-location
  { id: 7, propertyId: 2, parentLocationId: null, name: "Suite 100", type: "Suite" },
  { id: 8, propertyId: 2, parentLocationId: null, name: "Main Building", type: "Building" },

  // Harbor Point Hotel (Hotel): Floor -> Room, plus a top-level Rooftop
  { id: 5, propertyId: 3, parentLocationId: null, name: "Floor 3", type: "Floor" },
  { id: 6, propertyId: 3, parentLocationId: 5, name: "Room 312", type: "Room" },
  { id: 13, propertyId: 3, parentLocationId: null, name: "Rooftop", type: "Common Area" },

  // Summit Tower (Commercial): Building -> Floor -> Suite (3 levels, proves no hard depth cap)
  { id: 9, propertyId: 4, parentLocationId: null, name: "Building A", type: "Building" },
  { id: 10, propertyId: 4, parentLocationId: 9, name: "Floor 5", type: "Floor" },
  { id: 11, propertyId: 4, parentLocationId: 10, name: "Suite 501", type: "Suite" },
  { id: 12, propertyId: 4, parentLocationId: 9, name: "Mechanical Room", type: "Common Area" },

  // Cedar Grove Mobile Home Park (Mobile Home Park): Lot only, no sub-location
  { id: 3, propertyId: 5, parentLocationId: null, name: "Lot 12", type: "Lot" },
  { id: 4, propertyId: 5, parentLocationId: null, name: "Lot 14", type: "Lot" },
];
