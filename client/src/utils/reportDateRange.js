// Resolving a preset range into a concrete { startDate, endDate } is pure
// UI convenience, not a business rule, so it stays entirely client-side and
// the backend only ever sees explicit dates. Used directly by the
// Maintenance Spend report, and by useDateRangeFilter (the shared control
// behind Reports' Work Orders tab and Site Map's Analyze mode) to seed its
// Custom range from whichever preset was active. Not a general-purpose date
// library.
export const RANGE_OPTIONS = [
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_90_days", label: "Last 90 Days" },
  { value: "ytd", label: "Year to Date" },
  { value: "last_12_months", label: "Last 12 Months" },
  { value: "all_time", label: "All Time" },
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateOnly(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Resolves a preset range into concrete { startDate, endDate } using LOCAL
// calendar days. All Time omits both bounds entirely.
export function resolveDateRange(rangeKey) {
  const today = new Date();
  const endDate = toDateOnly(today);

  if (rangeKey === "all_time") return { startDate: null, endDate: null };

  const start = new Date(today);
  if (rangeKey === "last_30_days") start.setDate(start.getDate() - 30);
  else if (rangeKey === "last_90_days") start.setDate(start.getDate() - 90);
  else if (rangeKey === "ytd") {
    start.setMonth(0);
    start.setDate(1);
  } else if (rangeKey === "last_12_months") start.setFullYear(start.getFullYear() - 1);

  return { startDate: toDateOnly(start), endDate };
}
