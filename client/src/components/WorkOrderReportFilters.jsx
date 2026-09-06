import DateRangeControl from "./DateRangeControl";
import { IconChevronDown } from "./icons";
import { WORK_ORDER_CATEGORIES } from "../utils/workOrders";

export const WORK_ORDER_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting", label: "Waiting" },
  { value: "completed", label: "Completed" },
];

// A native <select> dressed to read exactly like DateRangeControl's
// trigger — same height, border, radius, font, hover, focus ring, and
// chevron — so the whole filter row is one visual toolbar rather than one
// designed button next to three OS form controls.
function FilterSelect({ value, onChange, label, disabled, title, children }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        aria-label={label}
        disabled={disabled}
        title={title}
        className="h-8 appearance-none rounded-lg border border-line bg-surface pl-3 pr-8 text-sm text-ink transition hover:bg-surface-subtle focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-muted disabled:hover:bg-surface-subtle"
      >
        {children}
      </select>
      <IconChevronDown
        className={`pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${
          disabled ? "text-ink-muted/50" : "text-ink-muted"
        }`}
      />
    </div>
  );
}

// The one compact filter row shared by Reports' Work Orders tab and the
// Property Site Map's Analyze mode. All state, and the Category → Work Type
// dependency, live in useWorkOrderReportFilters — this is purely the
// controls.
export default function WorkOrderReportFilters({ filters }) {
  const {
    dateRange,
    category,
    setCategory,
    workTypeId,
    setWorkTypeId,
    status,
    setStatus,
    workTypeEnabled,
    visibleWorkTypes,
    isActive,
    reset,
  } = filters;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangeControl
        rangeKey={dateRange.rangeKey}
        setRangeKey={dateRange.setRangeKey}
        customStart={dateRange.customStart}
        setCustomStart={dateRange.setCustomStart}
        customEnd={dateRange.customEnd}
        setCustomEnd={dateRange.setCustomEnd}
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
        error={dateRange.error}
      />

      <FilterSelect value={category} onChange={(e) => setCategory(e.target.value)} label="Category">
        <option value="">All Categories</option>
        {WORK_ORDER_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        value={workTypeId}
        onChange={(e) => setWorkTypeId(e.target.value)}
        label="Work Type"
        disabled={!workTypeEnabled}
        title={workTypeEnabled ? undefined : "Select a Category first"}
      >
        <option value="">{workTypeEnabled ? "All Work Types" : "Select a Category first"}</option>
        {visibleWorkTypes.map((wt) => (
          <option key={wt.id} value={wt.id}>
            {wt.label}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect value={status} onChange={(e) => setStatus(e.target.value)} label="Status">
        <option value="">All Statuses</option>
        {WORK_ORDER_STATUS_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </FilterSelect>

      {isActive && (
        <button
          type="button"
          onClick={reset}
          className="ml-1 text-sm font-medium text-ink-muted transition hover:text-ink-secondary"
        >
          Reset
        </button>
      )}
    </div>
  );
}
