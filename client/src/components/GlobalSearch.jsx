import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconSearch } from "./icons";
import SearchResultRow from "./SearchResultRow";
import { globalSearch } from "../utils/api";
import { useDebouncedValue } from "../utils/useDebouncedValue";
import { searchResultTarget } from "../utils/searchResultTarget";

const MIN_QUERY = 2;
const PER_GROUP = 4;
const GROUP_ORDER = ["property", "location", "work_order", "asset", "vendor", "document", "user"];
const GROUP_LABEL = {
  property: "Properties",
  location: "Locations",
  work_order: "Work Orders",
  asset: "Assets",
  vendor: "Vendors",
  document: "Documents",
  user: "People",
};

const shortcutHint = () => {
  if (typeof navigator === "undefined") return "Ctrl K";
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K";
};

// The one global search surface — the app shell's search bar, wired.
// Searches across every active accessible Property the caller can reach
// (never the current Property Scope). Debounced, request-cancelling,
// keyboard-navigable, and it takes the user straight to the exact record.
export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ results: [], hasMore: false });
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, 200);

  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const seqRef = useRef(0);
  const hint = useMemo(shortcutHint, []);

  // ⌘K / Ctrl+K focuses the search from anywhere. Nothing else in the app
  // binds this chord (verified), and it is safe to fire even while an
  // input is focused.
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Fetch on the debounced query. Older responses can never overwrite a
  // newer one: each request bumps a sequence number and aborts its
  // predecessor, and a stale resolve is dropped. Previous results stay on
  // screen (marked loading) rather than blanking.
  useEffect(() => {
    if (debounced.length < MIN_QUERY) {
      setData({ results: [], hasMore: false });
      setStatus("idle");
      setActiveIndex(-1);
      return;
    }
    const seq = ++seqRef.current;
    const controller = new AbortController();
    setStatus("loading");
    globalSearch({ q: debounced, limit: 12 }, { signal: controller.signal })
      .then((res) => {
        if (seq !== seqRef.current) return;
        setData({ results: res.results, hasMore: res.hasMore });
        setStatus("ready");
        setActiveIndex(-1);
      })
      .catch(() => {
        if (controller.signal.aborted || seq !== seqRef.current) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [debounced]);

  const groups = useMemo(() => {
    const byType = {};
    for (const r of data.results) (byType[r.type] ||= []).push(r);
    return GROUP_ORDER.filter((t) => byType[t]?.length).map((t) => ({
      type: t,
      label: GROUP_LABEL[t],
      items: byType[t].slice(0, PER_GROUP),
    }));
  }, [data.results]);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const hasResults = flatItems.length > 0;
  const showViewAll = trimmed.length >= MIN_QUERY && hasResults;
  const navCount = flatItems.length + (showViewAll ? 1 : 0);

  function select(result) {
    const target = searchResultTarget(result);
    close();
    if (target.run) target.run();
    else navigate(target.to, target.state ? { state: target.state } : undefined);
  }

  function goToAllResults() {
    close();
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  function close() {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      if (open) setOpen(false);
      else inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (navCount === 0 ? -1 : Math.min(i + 1, navCount - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
      return;
    }
    if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < flatItems.length) {
        select(flatItems[activeIndex]);
      } else if (showViewAll && (activeIndex === flatItems.length || activeIndex === -1)) {
        goToAllResults();
      }
    }
  }

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`#gs-opt-${activeIndex}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const activeDescendant = activeIndex >= 0 ? `gs-opt-${activeIndex}` : undefined;

  return (
    <div ref={rootRef} className="relative w-full max-w-md">
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-listbox"
        aria-autocomplete="list"
        aria-activedescendant={activeDescendant}
        aria-label="Search PropertyOS"
        placeholder="Search PropertyOS"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-line bg-surface-subtle py-2 pl-9 pr-16 text-sm text-ink placeholder:text-ink-muted focus:border-line-strong focus:bg-surface focus:outline-none"
      />
      {!query && (
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
          {hint}
        </kbd>
      )}
      {status === "loading" && (
        <span
          aria-hidden="true"
          className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-line border-t-ink-muted"
        />
      )}

      {open && trimmed.length >= MIN_QUERY && (
        <div
          id="global-search-listbox"
          role="listbox"
          ref={listRef}
          className="absolute left-0 right-0 z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-lg"
        >
          {hasResults ? (
            <>
              {groups.map((group) => (
                <div key={group.type} className="mb-1 last:mb-0">
                  <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{group.label}</p>
                  {group.items.map((result) => {
                    const flatIndex = flatItems.indexOf(result);
                    return (
                      <SearchResultRow
                        key={`${result.type}-${result.id}`}
                        id={`gs-opt-${flatIndex}`}
                        result={result}
                        query={trimmed}
                        active={activeIndex === flatIndex}
                        onSelect={select}
                      />
                    );
                  })}
                </div>
              ))}
              {showViewAll && (
                <button
                  type="button"
                  id={`gs-opt-${flatItems.length}`}
                  role="option"
                  aria-selected={activeIndex === flatItems.length}
                  onClick={goToAllResults}
                  className={`mt-1 flex w-full items-center justify-between rounded-lg border-t border-line px-2.5 py-2 text-left text-sm font-medium transition ${
                    activeIndex === flatItems.length ? "bg-surface-subtle text-ink" : "text-ink-secondary hover:bg-surface-subtle hover:text-ink"
                  }`}
                >
                  <span className="truncate">View all results for &ldquo;{trimmed}&rdquo;</span>
                  <span aria-hidden="true" className="ml-2 shrink-0 text-ink-muted">&#8594;</span>
                </button>
              )}
            </>
          ) : status === "error" ? (
            <p className="px-2.5 py-6 text-center text-sm text-ink-secondary">Something went wrong. Please try again.</p>
          ) : status === "loading" ? (
            <p className="px-2.5 py-6 text-center text-sm text-ink-muted">Searching&hellip;</p>
          ) : (
            <div className="px-2.5 py-5 text-center">
              <p className="text-sm text-ink">No matches for &ldquo;{trimmed}&rdquo;</p>
              <p className="mt-1 text-xs text-ink-muted">
                Try fewer words, or search by Property, Location, Work Order, Asset, Vendor, or Document name.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
