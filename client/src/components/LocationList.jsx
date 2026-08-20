import { buildLocationTree } from "../utils/hierarchy";

// A compact row for a location with no children of its own — used both for
// nested leaves (e.g. a Unit) and for top-level standalone locations, just
// at two different densities.
function LeafRow({ location, compact }) {
  return (
    <div
      className={
        compact
          ? "flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 hover:bg-surface-subtle"
          : "flex items-center justify-between gap-4 px-5 py-3"
      }
    >
      <p className="truncate text-sm font-medium text-ink">{location.name}</p>
      <span className="shrink-0 rounded-full bg-surface-subtle px-2.5 py-1 text-[11px] font-medium text-ink-secondary">
        {location.type}
      </span>
    </div>
  );
}

// Renders a location that has children. Depth 0 (e.g. a Building) becomes a
// visual group: a card with a prominent name and its descendants inside.
// Any deeper level with children (e.g. a Floor) becomes a subtle section
// label plus a left-bordered block — grouping without another card, so
// hierarchy is communicated by typography/borders rather than by stacking
// indentation alone. This is purely structural (depth + "has children"), so
// it recurses correctly for any nesting depth, not just Building/Floor/Unit.
function LocationGroup({ location, depth }) {
  if (location.children.length === 0) {
    return <LeafRow location={location} compact={depth > 0} />;
  }

  if (depth === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="mb-4 flex items-baseline gap-2">
          <h3 className="text-[15px] font-semibold text-ink">{location.name}</h3>
          <span className="text-xs font-medium text-ink-muted">{location.type}</span>
        </div>
        <div className="space-y-4">
          {location.children.map((child) => (
            <LocationGroup key={child.id} location={child} depth={depth + 1} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-secondary">
        {location.name}
        <span className="ml-1.5 normal-case text-ink-muted">· {location.type}</span>
      </p>
      <div className="space-y-1 border-l border-line pl-3">
        {location.children.map((child) => (
          <LocationGroup key={child.id} location={child} depth={depth + 1} />
        ))}
      </div>
    </div>
  );
}

export default function LocationList({ locations }) {
  const tree = buildLocationTree(locations);
  const groups = tree.filter((node) => node.children.length > 0);
  const standalones = tree.filter((node) => node.children.length === 0);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <LocationGroup key={group.id} location={group} depth={0} />
      ))}

      {standalones.length > 0 && (
        <div>
          {groups.length > 0 && (
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Other locations</p>
          )}
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {standalones.map((location) => (
              <LeafRow key={location.id} location={location} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
