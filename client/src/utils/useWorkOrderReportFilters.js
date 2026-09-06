import { useCallback, useEffect, useMemo, useState } from "react";
import { getWorkTypes } from "./api";
import { useDateRangeFilter } from "./useDateRangeFilter";

// The single filter contract behind BOTH Reports' Work Orders tab and the
// Property Site Map's Analyze mode — same Date range, Category, Work Type,
// and Status semantics, so the two surfaces can never drift into subtly
// different behaviour. Pair with <WorkOrderReportFilters> for the matching
// compact control row.
//
// Work Type is strictly dependent on Category. Work Types are only unique
// *within* a Category (several Categories each legitimately have their own
// "Other"), so an "All Categories" state can't offer a coherent Work Type
// list — it would show duplicate, context-free rows. The rule instead:
//   • No Category  → Work Type disabled, no id can be set.
//   • A Category   → Work Type lists only that Category's types, default
//                    "All Work Types".
//   • Category changes → any selected Work Type id is cleared immediately,
//     so an invalid (old-Category) pairing can never be submitted.
export function useWorkOrderReportFilters(restored) {
  const dateRange = useDateRangeFilter(restored);
  const [category, setCategoryRaw] = useState(restored?.category ?? "");
  const [workTypeId, setWorkTypeId] = useState(restored?.workTypeId ?? "");
  const [status, setStatus] = useState(restored?.status ?? "");

  const [workTypes, setWorkTypes] = useState([]);
  useEffect(() => {
    let cancelled = false;
    getWorkTypes()
      .then((rows) => {
        if (!cancelled) setWorkTypes(rows);
      })
      .catch(() => {
        // Non-fatal — the Work Type control just stays empty.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const workTypeEnabled = Boolean(category);
  const visibleWorkTypes = useMemo(
    () => (category ? workTypes.filter((wt) => wt.category === category) : []),
    [workTypes, category]
  );

  const setCategory = useCallback((next) => {
    setCategoryRaw(next);
    setWorkTypeId(""); // never carry a Work Type id across Categories
  }, []);

  // Guard against an inconsistent pairing arriving another way — a restored
  // router state, or workTypes loading in after a restored id: drop any
  // Work Type id that isn't a real type of the current Category.
  useEffect(() => {
    if (!workTypeId) return;
    if (!category) {
      setWorkTypeId("");
      return;
    }
    if (workTypes.length > 0 && !workTypes.some((wt) => wt.id === workTypeId && wt.category === category)) {
      setWorkTypeId("");
    }
  }, [workTypeId, category, workTypes]);

  const isActive = Boolean(category || workTypeId || status || dateRange.rangeKey !== "last_12_months");

  const reset = useCallback(() => {
    dateRange.setRangeKey("last_12_months");
    setCategoryRaw("");
    setWorkTypeId("");
    setStatus("");
  }, [dateRange]);

  // Query params for /api/reports/work-orders, minus propertyId (each
  // surface adds its own — Property Scope for Reports, the route for Site
  // Map). Stable identity so consumers' useMemo deps stay clean.
  const params = useMemo(
    () => ({
      startDate: dateRange.startDate || undefined,
      endDate: dateRange.endDate || undefined,
      category: category || undefined,
      workTypeId: workTypeId || undefined,
      status: status || undefined,
    }),
    [dateRange.startDate, dateRange.endDate, category, workTypeId, status]
  );

  // Serializable snapshot for router-state round-trips.
  const toState = useCallback(
    () => ({ ...dateRange.toState(), category, workTypeId, status }),
    [dateRange, category, workTypeId, status]
  );

  return {
    dateRange,
    category,
    setCategory,
    workTypeId,
    setWorkTypeId,
    status,
    setStatus,
    workTypes,
    workTypeEnabled,
    visibleWorkTypes,
    isActive,
    reset,
    params,
    toState,
  };
}
