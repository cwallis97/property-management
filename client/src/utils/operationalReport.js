import { useEffect, useState, useCallback } from "react";
import { getWorkOrdersReport } from "./api";

// The ONE fetch implementation behind both Reports' Work Orders tab and
// Property Site Map's History mode — same endpoint, same race-condition
// guard, used by both, so neither surface can quietly diverge in how it
// talks to the one shared /api/reports/work-orders dataset.
//
// `enabled` lets a caller defer fetching until its own prerequisites are
// ready (e.g. History mode only fetches once its Property id is known)
// without needing a second hook shape.
//
// status: "idle" (disabled) | "loading" (first fetch) | "refreshing"
// (filters changed, prior data still on screen) | "error" | "ready".
// Callers use "refreshing" to keep showing the previous result while
// visually marking it stale — never silently swapping in nothing, and
// never presenting old numbers as if they matched the new filters.
export function useOperationalReport(filterParams, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle");
  // Bumped by retry() to force the effect below to re-run even when
  // filterKey hasn't changed — the smallest way to support a manual Retry
  // action on the error state without a second fetch implementation.
  const [retryNonce, setRetryNonce] = useState(0);
  const retry = useCallback(() => setRetryNonce((n) => n + 1), []);

  const filterKey = JSON.stringify(filterParams);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setStatus("idle");
      return;
    }
    // Closure-based cancellation token — the same pattern established
    // throughout this app's reports. When filters change again before this
    // request resolves, React tears down THIS effect (setting `cancelled`
    // true in this exact closure) before running the next one, so a
    // late-arriving older response can never overwrite newer state. No
    // AbortController needed: this already fully solves the race.
    let cancelled = false;
    setStatus((prev) => (prev === "ready" || prev === "refreshing" ? "refreshing" : "loading"));
    getWorkOrdersReport(filterParams)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // filterKey is the real dependency (a stable string of filterParams'
    // actual values) — filterParams itself is a fresh object reference
    // every render even when its contents haven't changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, filterKey, retryNonce]);

  return { data, status, retry };
}
