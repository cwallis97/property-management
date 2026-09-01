import { DATE_PRESET_OPTIONS } from "../utils/useDateRangeFilter";

// Compact, single-row date control shared by Site Map's History mode and
// Reports' Work Orders tab — presets plus a first-class Custom range, never
// a second-tier "Custom" pill that hides the actual dates. The resolved
// range is always shown as real text by the caller (see formatRangeLabel),
// never buried behind the word "Custom."
export default function DateRangeControl({ rangeKey, setRangeKey, customStart, setCustomStart, customEnd, setCustomEnd, error }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex flex-wrap rounded-lg border border-line bg-surface-subtle p-1">
        {DATE_PRESET_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRangeKey(option.value)}
            className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
              rangeKey === option.value ? "bg-surface text-ink shadow-sm" : "text-ink-secondary hover:text-ink-secondary"
            }`}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setRangeKey("custom")}
          className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
            rangeKey === "custom" ? "bg-surface text-ink shadow-sm" : "text-ink-secondary hover:text-ink-secondary"
          }`}
        >
          Custom
        </button>
      </div>

      {rangeKey === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            aria-label="Start date"
            className="rounded-lg border border-line bg-surface px-2.5 py-[5px] text-sm text-ink"
          />
          <span className="text-sm text-ink-muted" aria-hidden="true">
            –
          </span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            aria-label="End date"
            min={customStart || undefined}
            className="rounded-lg border border-line bg-surface px-2.5 py-[5px] text-sm text-ink"
          />
          {error && <span className="text-xs font-medium text-red-600 dark:text-red-400">{error}</span>}
        </div>
      )}
    </div>
  );
}
