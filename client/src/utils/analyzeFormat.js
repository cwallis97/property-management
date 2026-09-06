// Display formatters shared across every Site Map Analyze surface (the
// summary line, the ranked Locations list, the hotspot detail block, the
// Work Order rows) so money and dates read identically everywhere.
//
// Analyze shows whole-dollar amounts — cents belong on true accounting
// surfaces (a Work Order's own cost detail), never on a scannable
// investigative view.
export function analyzeMoney(amount) {
  return `$${Math.round(Number(amount) || 0).toLocaleString("en-US")}`;
}

export function analyzeDate(value) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
