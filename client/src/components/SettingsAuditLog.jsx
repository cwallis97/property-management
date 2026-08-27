import { useEffect, useState } from "react";
import EmptyState from "./EmptyState";
import SectionSpinner from "./SectionSpinner";
import SearchableSelect from "./SearchableSelect";
import AuditEventDetailModal from "./AuditEventDetailModal";
import { IconActivity, IconAlertTriangle } from "./icons";
import { getAuditEvents, getMembers, getProperties } from "../utils/api";
import { AUDIT_CATEGORIES, formatAuditEventSentence, formatAuditEventDetail } from "../utils/auditEvents";

// "Aug 17 · 9:42 AM" — same shape as WorkOrderDetail's own note timestamp
// formatter, kept local rather than shared per this codebase's existing
// per-component duplication convention for small display formatters.
function formatEventTime(createdAt) {
  const date = new Date(createdAt);
  const datePart = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}

// Settings → Audit Log — a single, dense, chronological activity feed, not
// a database viewer. Admin/Owner-only (Settings.jsx already gates the
// section itself on CAPABILITIES.AUDIT_LOG_READ before this ever mounts).
export default function SettingsAuditLog() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | error | ready
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);

  const [categoryFilter, setCategoryFilter] = useState(null);
  const [propertyFilter, setPropertyFilter] = useState(null);
  const [actorFilter, setActorFilter] = useState(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [properties, setProperties] = useState([]);
  const [members, setMembers] = useState([]);

  const [selectedEvent, setSelectedEvent] = useState(null);

  // Filter option sources — same "fetch once, filter client-side picker
  // options" pattern SettingsUsers already uses for its own Property Access
  // picker (getProperties({status:"all"}) so an event tied to an archived
  // Property can still be filtered on).
  useEffect(() => {
    getProperties({ status: "all" })
      .then(setProperties)
      .catch(() => setProperties([]));
    getMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);

  function currentFilters() {
    const filters = {};
    if (categoryFilter) filters.entityType = categoryFilter;
    if (propertyFilter) filters.propertyId = propertyFilter;
    if (actorFilter) filters.actorMembershipId = actorFilter;
    if (fromDate) filters.from = new Date(`${fromDate}T00:00:00`).toISOString();
    if (toDate) filters.to = new Date(`${toDate}T23:59:59`).toISOString();
    return filters;
  }

  // Re-fetches from scratch (fresh cursor) whenever a filter changes —
  // deliberately not client-side filtering of an already-loaded page,
  // since the server is the only place that can correctly apply
  // Company-scoped, keyset-paginated filtering.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getAuditEvents(currentFilters())
      .then((data) => {
        if (cancelled) return;
        setEvents(data.events);
        setNextCursor(data.nextCursor);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, propertyFilter, actorFilter, fromDate, toDate]);

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await getAuditEvents({ ...currentFilters(), cursor: nextCursor });
      setEvents((prev) => [...prev, ...data.events]);
      setNextCursor(data.nextCursor);
    } catch {
      // A failed "load more" leaves the already-loaded page intact —
      // nothing to roll back, just let the user retry the click.
    } finally {
      setLoadingMore(false);
    }
  }

  const propertyOptions = [
    { value: null, label: "All properties", sublabel: null },
    ...properties.map((p) => ({ value: p.id, label: p.name, sublabel: null })),
  ];
  const categoryOptions = [
    { value: null, label: "All activity", sublabel: null },
    ...AUDIT_CATEGORIES.map((c) => ({ value: c.value, label: c.label, sublabel: null })),
  ];
  const actorOptions = [
    { value: null, label: "Everyone", sublabel: null },
    ...members.map((m) => ({ value: m.membershipId, label: m.name, sublabel: null })),
  ];

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-ink">Audit Log</h2>
        <p className="mt-1 text-sm text-ink-secondary">
          A record of who changed what, when — Work Orders, roles, Property Access, and Property lifecycle.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SearchableSelect value={categoryFilter} onChange={setCategoryFilter} options={categoryOptions} placeholder="All activity" />
        <SearchableSelect value={propertyFilter} onChange={setPropertyFilter} options={propertyOptions} placeholder="All properties" />
        <SearchableSelect value={actorFilter} onChange={setActorFilter} options={actorOptions} placeholder="Everyone" />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            aria-label="From date"
          />
          <span className="text-ink-muted">–</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            aria-label="To date"
          />
        </div>
      </div>

      {status === "loading" && <SectionSpinner />}

      {status === "error" && (
        <EmptyState icon={IconAlertTriangle} title="Couldn't load the audit log" description="Something went wrong. Please try again." />
      )}

      {status === "ready" && events.length === 0 && (
        <EmptyState icon={IconActivity} title="No activity yet" description="Changes to Work Orders, roles, Property Access, and Properties will show up here." />
      )}

      {status === "ready" && events.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs font-medium uppercase tracking-wide text-ink-muted">
                  <th className="px-5 py-3">Time</th>
                  <th className="px-5 py-3">Activity</th>
                  <th className="px-5 py-3">Property</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const sentence = formatAuditEventSentence(event);
                  const detail = formatAuditEventDetail(event);
                  return (
                    <tr
                      key={event.id}
                      onClick={() => setSelectedEvent(event)}
                      className="cursor-pointer border-b border-surface-subtle transition hover:bg-surface-subtle last:border-0"
                    >
                      <td className="whitespace-nowrap px-5 py-3 align-top text-ink-secondary">{formatEventTime(event.createdAt)}</td>
                      <td className="px-5 py-3">
                        <p className="text-ink">
                          <span className="font-medium text-ink">{event.actor.name ?? "Unknown"}</span> {sentence}
                        </p>
                        {detail && <p className="mt-0.5 text-xs text-ink-secondary">{detail}</p>}
                      </td>
                      <td className="px-5 py-3 align-top text-ink-secondary">{event.propertyName ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {nextCursor && (
            <div className="mt-4 flex justify-center">
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

      {selectedEvent && <AuditEventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </div>
  );
}
