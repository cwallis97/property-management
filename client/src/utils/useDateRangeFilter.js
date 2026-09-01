import { useMemo, useState } from "react";
import { resolveDateRange } from "./reportDateRange";

// The one date-range control behind both Site Map's History mode and
// Reports' Work Orders tab — identical presets, identical Custom
// start/end semantics, identical validation, so the two surfaces can never
// interpret "Jan 1 – Aug 31" differently. Custom is first-class, not a
// second-tier escape hatch: switching to it seeds real dates (from
// whatever preset was active) rather than leaving the fields empty.
export const DATE_PRESET_OPTIONS = [
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_90_days", label: "Last 90 Days" },
  { value: "ytd", label: "This Year" },
  { value: "last_12_months", label: "Last 12 Months" },
  { value: "all_time", label: "All Time" },
];

function formatDateLabel(dateOnly, includeYear) {
  // dateOnly is a YYYY-MM-DD string — parsed as a local calendar date
  // (never UTC-shifted a day off) by constructing from parts directly
  // rather than `new Date(dateOnly)`, which Safari/Chrome both treat as
  // UTC midnight for a bare date-only ISO string.
  const [year, month, day] = dateOnly.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: includeYear ? "numeric" : undefined });
}

// Always shows the REAL resolved dates, regardless of preset vs. Custom —
// "the control should show the actual active range clearly... do not hide
// the selected dates behind Custom."
export function formatRangeLabel(startDate, endDate) {
  if (!startDate && !endDate) return "All Time";
  if (!startDate || !endDate) return "Select a date range";
  const [startYear] = startDate.split("-");
  const [endYear] = endDate.split("-");
  const sameYear = startYear === endYear;
  return `${formatDateLabel(startDate, !sameYear)} – ${formatDateLabel(endDate, true)}`;
}

export function useDateRangeFilter(restored) {
  const [rangeKey, setRangeKeyRaw] = useState(restored?.rangeKey ?? "last_12_months");
  const [customStart, setCustomStart] = useState(restored?.customStart ?? "");
  const [customEnd, setCustomEnd] = useState(restored?.customEnd ?? "");

  // Switching TO Custom seeds the two date inputs from whichever preset
  // was active a moment ago, so the user sees real, meaningful dates
  // immediately rather than two empty fields they have to fill from
  // scratch. Only seeds once — later edits are the user's own.
  function setRangeKey(nextKey) {
    if (nextKey === "custom" && rangeKey !== "custom" && !customStart && !customEnd) {
      const seeded = resolveDateRange(rangeKey === "custom" ? "last_12_months" : rangeKey);
      if (seeded.startDate) setCustomStart(seeded.startDate);
      if (seeded.endDate) setCustomEnd(seeded.endDate);
    }
    setRangeKeyRaw(nextKey);
  }

  const resolved = useMemo(() => {
    if (rangeKey !== "custom") {
      return { ...resolveDateRange(rangeKey), isValid: true, error: null };
    }
    if (!customStart || !customEnd) {
      return { startDate: null, endDate: null, isValid: false, error: "Choose both a start and end date." };
    }
    if (customEnd < customStart) {
      return { startDate: null, endDate: null, isValid: false, error: "End date must be on or after the start date." };
    }
    return { startDate: customStart, endDate: customEnd, isValid: true, error: null };
  }, [rangeKey, customStart, customEnd]);

  return {
    rangeKey,
    setRangeKey,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    startDate: resolved.startDate,
    endDate: resolved.endDate,
    isValid: resolved.isValid,
    error: resolved.error,
    // Serializable snapshot for router-state round-trips (back/forward
    // navigation restores Custom dates exactly, not just the preset key).
    toState: () => ({ rangeKey, customStart, customEnd }),
  };
}
