import { useEffect, useState } from "react";
import { IconX, IconActivity, IconAlertTriangle } from "./icons";
import { getWorkOrderHistory } from "../utils/api";
import { formatContextualAuditEventLabel, formatAuditEventDetail } from "../utils/auditEvents";

// Same "Aug 17 · 9:42 AM" shape SettingsAuditLog's own Time column and
// WorkOrderDetail's note timestamps already use — a Work Order's history
// can span weeks, so a bare time (as in a same-day mockup) would be
// ambiguous; the date prefix is a deliberate, small deviation toward this
// app's existing activity-timestamp convention.
function formatEventTime(createdAt) {
  const date = new Date(createdAt);
  const datePart = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}

// Contextual Work Order History — a right-anchored panel using the exact
// same interaction mechanics every other modal in this app already uses
// (fixed overlay, Escape-to-close), just positioned as a full-height,
// right-aligned sheet rather than a centered card — PropertyOS has no
// separate drawer/slide-over component yet, and this doesn't introduce
// one; it's the existing shell with different positioning classes.
//
// Deliberately reuses client/src/utils/auditEvents.js's shared formatters
// (formatContextualAuditEventLabel/formatAuditEventDetail) rather than any
// local switch/case — this is the SAME AuditEvent source and the SAME
// config the global Settings → Audit Log reads through; only the query
// scope and the label variant (contextual vs. sentence) differ.
export default function WorkOrderHistoryPanel({ workOrderId, onClose }) {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | error | ready
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  function load() {
    setStatus("loading");
    getWorkOrderHistory(workOrderId)
      .then((data) => {
        setEvents(data.events);
        setNextCursor(data.nextCursor);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderId]);

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await getWorkOrderHistory(workOrderId, { cursor: nextCursor });
      setEvents((prev) => [...prev, ...data.events]);
      setNextCursor(data.nextCursor);
    } catch {
      // Leaves the already-loaded events in place — nothing to roll back,
      // just let the person retry the click.
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-gray-900/40">
      <div className="flex h-full w-full max-w-md flex-col bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <IconActivity className="h-4 w-4 text-ink-muted" />
            <h2 className="text-base font-semibold text-ink">History</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close history"
            className="rounded-lg p-1 text-ink-muted transition hover:bg-surface-subtle hover:text-ink"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {status === "loading" && (
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line py-12 text-center">
              <IconAlertTriangle className="h-6 w-6 text-ink-muted" />
              <p className="text-sm text-ink-secondary">Couldn't load history. Please try again.</p>
              <button
                type="button"
                onClick={load}
                className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle"
              >
                Retry
              </button>
            </div>
          )}

          {status === "ready" && events.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 py-16 text-center">
              <p className="text-sm font-medium text-ink">No recorded activity yet.</p>
              <p className="max-w-xs text-xs text-ink-muted">Changes recorded by PropertyOS will appear here.</p>
            </div>
          )}

          {status === "ready" && events.length > 0 && (
            <>
              <ol className="relative space-y-6 border-l border-line pl-5">
                {events.map((event) => {
                  const label = formatContextualAuditEventLabel(event);
                  const detail = formatAuditEventDetail(event);
                  return (
                    <li key={event.id} className="relative">
                      <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-line-strong" />
                      <p className="text-sm font-medium text-ink">{event.actor.name ?? "Unknown"}</p>
                      <p className="text-sm text-ink-secondary">{label}</p>
                      {detail && <p className="mt-0.5 text-sm text-ink">{detail}</p>}
                      <p className="mt-1 text-xs text-ink-muted">{formatEventTime(event.createdAt)}</p>
                    </li>
                  );
                })}
              </ol>

              {nextCursor && (
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
