import { useEffect, useRef, useState } from "react";
import { DATE_PRESET_OPTIONS, formatRangeLabel } from "../utils/useDateRangeFilter";
import { IconChevronDown } from "./icons";

// One compact date-range control, shared verbatim by Site Map's Analyze
// mode and Reports' Work Orders tab so the two can never interpret a range
// differently. Progressive disclosure: the trigger shows only the resolved
// range ("Sep 1, 2025 – Sep 1, 2026"); the custom start/end inputs and the
// preset shortcuts live inside the popover, so nothing but a single button
// consumes toolbar space. Editing either date input switches to the custom
// range; presets are shortcuts, not a permanent button row. All range
// semantics stay in useDateRangeFilter — this file is presentation only.
export default function DateRangeControl({
  rangeKey,
  setRangeKey,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  startDate,
  endDate,
  error,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // When a preset is active the two inputs still show its resolved dates
  // (read-only-feeling, but editable) — touching either one is what makes
  // the range "custom".
  const startValue = rangeKey === "custom" ? customStart : startDate || "";
  const endValue = rangeKey === "custom" ? customEnd : endDate || "";

  function editStart(value) {
    if (rangeKey !== "custom") setRangeKey("custom");
    setCustomStart(value);
  }
  function editEnd(value) {
    if (rangeKey !== "custom") setRangeKey("custom");
    setCustomEnd(value);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Date range"
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border bg-surface px-3 text-sm text-ink transition hover:bg-surface-subtle ${
          error ? "border-red-500 dark:border-red-400" : "border-line"
        }`}
      >
        <span className="tabular-nums">{formatRangeLabel(startDate, endDate)}</span>
        <IconChevronDown className={`h-3.5 w-3.5 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1.5 w-72 rounded-xl border border-line bg-surface p-3 shadow-lg">
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">Start</span>
              <input
                type="date"
                value={startValue}
                max={endValue || undefined}
                onChange={(e) => editStart(e.target.value)}
                aria-label="Start date"
                className="h-8 w-full rounded-lg border border-line bg-surface px-2.5 text-sm text-ink"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">End</span>
              <input
                type="date"
                value={endValue}
                min={startValue || undefined}
                onChange={(e) => editEnd(e.target.value)}
                aria-label="End date"
                className="h-8 w-full rounded-lg border border-line bg-surface px-2.5 text-sm text-ink"
              />
            </label>
          </div>

          {error && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}

          <div className="mt-3 grid grid-cols-2 gap-1 border-t border-line pt-2">
            {DATE_PRESET_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setRangeKey(option.value);
                  setOpen(false);
                }}
                className={`rounded-md px-2 py-1.5 text-left text-sm transition ${
                  rangeKey === option.value
                    ? "bg-surface-subtle font-medium text-ink"
                    : "text-ink-secondary hover:bg-surface-subtle hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
