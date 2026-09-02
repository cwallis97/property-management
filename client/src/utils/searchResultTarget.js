import { openDocumentFile } from "./api";

// Maps a Global Search result ({ type, id, propertyId }) to how the app
// should get the user to the EXACT record — nothing "roughly the right
// section." The backend deliberately returns only entity ids (+ the
// Property id for nested routes); route structure and blob-open semantics
// live here on the client where they belong.
//
// Returns either:
//   { to, state? } — navigate there with react-router (use <Link> or navigate())
//   { run }        — a side-effecting action (opening a Document file)
export function searchResultTarget(result) {
  switch (result.type) {
    case "property":
      return { to: `/portfolio/${result.id}` };
    case "location":
      // No standalone Location route — land on the Property's Locations tab
      // with this Location focused/scrolled into view (PropertyDetail reads
      // state.tab + state.focusLocationId).
      return { to: `/portfolio/${result.propertyId}`, state: { tab: "locations", focusLocationId: result.id } };
    case "work_order":
      return { to: `/portfolio/${result.propertyId}/work-orders/${result.id}` };
    case "asset":
      return { to: `/portfolio/${result.propertyId}/assets/${result.id}` };
    case "vendor":
      return { to: `/vendors/${result.id}` };
    case "user":
      // No standalone User route — Settings > Users & Roles with this
      // person's row focused (Settings reads state.section + state.focusUserId).
      return { to: "/settings", state: { section: "users", focusUserId: result.id } };
    case "document":
      return { run: () => openDocumentFile(result.id) };
    default:
      return { to: "/dashboard" };
  }
}
