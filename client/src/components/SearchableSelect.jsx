import { useEffect, useMemo, useRef, useState } from "react";
import { IconSearch, IconChevronDown } from "./icons";

// A single-select field that filters an in-memory option list as the user
// types, rather than a plain <select>. A native <select> with hundreds of
// lots/assets becomes unusable (no search, awkward on mobile); this stays
// just as simple to use for today's 8 locations but doesn't need to be
// rebuilt when a property has hundreds of them — filtering an array is
// cheap at any realistic scale, and no extra requests are made since
// `options` is always data already loaded by the caller.
export default function SearchableSelect({ value, onChange, options, placeholder, disabled, disabledHint }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sublabel ?? "").toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    function handleEscape(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function pick(optionValue) {
    onChange(optionValue);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
          disabled
            ? "cursor-not-allowed border-line bg-surface-subtle text-ink-secondary"
            : "border-line bg-surface text-ink hover:border-line-strong"
        }`}
      >
        <span className="min-w-0 truncate">
          {selected ? (
            <>
              {selected.label}
              {selected.sublabel && <span className="ml-1.5 text-ink-muted">· {selected.sublabel}</span>}
            </>
          ) : (
            <span className="text-ink-muted">{placeholder}</span>
          )}
        </span>
        {!disabled && <IconChevronDown className="h-4 w-4 shrink-0 text-ink-muted" />}
      </button>

      {disabled && disabledHint && <p className="mt-1 text-xs text-ink-muted">{disabledHint}</p>}

      {open && !disabled && (
        <div className="absolute z-20 mt-1.5 w-full rounded-xl border border-line bg-surface shadow-lg shadow-gray-900/5">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <IconSearch className="h-4 w-4 shrink-0 text-ink-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter..."
              className="w-full border-none bg-transparent text-sm text-ink-secondary placeholder:text-ink-muted focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-3 text-sm text-ink-muted">No matches.</p>}
            {filtered.map((option) => (
              <button
                key={option.value ?? "__none__"}
                type="button"
                onClick={() => pick(option.value)}
                className={`flex w-full flex-col px-3 py-2 text-left text-sm transition hover:bg-surface-subtle ${
                  option.value === value ? "bg-surface-subtle" : ""
                }`}
              >
                <span className="text-ink">{option.label}</span>
                {option.sublabel && <span className="text-xs text-ink-muted">{option.sublabel}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
