import { IconBuilding, IconMapPin, IconWrench, IconBox, IconTruck, IconFolder, IconUser } from "./icons";

const TYPE_ICON = {
  property: IconBuilding,
  location: IconMapPin,
  work_order: IconWrench,
  asset: IconBox,
  vendor: IconTruck,
  document: IconFolder,
  user: IconUser,
};

// Bold the first contiguous occurrence of the query in the title — only
// when it's a single clean substring hit, never a fuzzy re-highlight.
function withHighlight(text, query) {
  const q = (query || "").trim();
  if (!q || !text) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-ink">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
}

// One search result — icon + title + one compact context line. Shared by
// the Header autocomplete dropdown and the /search results page. Always a
// <button>: even Documents "navigate" (they open a file), so every result
// is activated the same way through searchResultTarget in the parent.
export default function SearchResultRow({ result, active = false, query = "", id, onSelect, dense = true }) {
  const Icon = TYPE_ICON[result.type] || IconFolder;
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={active}
      aria-label={`${result.title} — ${result.subtitle}${result.context ? `, ${result.context}` : ""}`}
      onClick={() => onSelect(result)}
      className={`flex w-full items-center gap-3 rounded-lg px-2.5 text-left transition ${
        dense ? "py-2" : "py-2.5"
      } ${active ? "bg-surface-subtle" : "hover:bg-surface-subtle"}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-subtle text-ink-secondary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink">{withHighlight(result.title, query)}</span>
        {result.context && <span className="block truncate text-xs text-ink-muted">{result.context}</span>}
      </span>
    </button>
  );
}
