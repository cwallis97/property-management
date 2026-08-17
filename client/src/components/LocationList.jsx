import { buildLocationTree } from "../utils/hierarchy";

// Indentation is the only depth cue — deliberately no connector lines or
// per-row icons, so the list stays scannable even with dozens of locations
// across several nesting levels.
function LocationRow({ location, depth }) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-3 pr-5"
      style={{ paddingLeft: `${20 + depth * 20}px` }}
    >
      <p className="truncate text-sm font-medium text-gray-900">{location.name}</p>
      <span className="shrink-0 rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-500">
        {location.type}
      </span>
    </div>
  );
}

function renderNodes(nodes, depth) {
  return nodes.flatMap((node) => [
    <LocationRow key={node.id} location={node} depth={depth} />,
    ...renderNodes(node.children, depth + 1),
  ]);
}

export default function LocationList({ locations }) {
  const tree = buildLocationTree(locations);

  return (
    <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
      {renderNodes(tree, 0)}
    </div>
  );
}
