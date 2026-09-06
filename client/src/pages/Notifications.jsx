import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import SectionSpinner from "../components/SectionSpinner";
import EmptyState from "../components/EmptyState";
import NotificationRow from "../components/NotificationRow";
import { IconBell, IconAlertTriangle } from "../components/icons";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "../utils/api";
import { notificationTarget } from "../utils/notifications";

const PAGE_LIMIT = 25;

export default function Notifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setUnreadCount, refreshUnreadCount } = useNotifications();
  const [params, setParams] = useSearchParams();

  const filter = params.get("filter") === "unread" ? "unread" : "all";
  const multiCompany = (user?.companies?.length ?? 0) > 1;

  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | error | ready
  const [loadingMore, setLoadingMore] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    const seq = ++seqRef.current;
    setStatus("loading");
    setItems([]);
    setNextCursor(null);
    getNotifications({ filter, limit: PAGE_LIMIT })
      .then((data) => {
        if (seq !== seqRef.current) return;
        setItems(data.notifications);
        setNextCursor(data.nextCursor);
        setUnreadCount(data.unreadCount ?? 0);
        setStatus("ready");
      })
      .catch(() => {
        if (seq === seqRef.current) setStatus("error");
      });
  }, [filter, setUnreadCount]);

  function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    getNotifications({ filter, limit: PAGE_LIMIT, cursor: nextCursor })
      .then((data) => {
        setItems((prev) => [...prev, ...data.notifications]);
        setNextCursor(data.nextCursor);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }

  function setFilter(next) {
    const p = new URLSearchParams(params);
    if (next === "all") p.delete("filter");
    else p.set("filter", next);
    setParams(p, { replace: true });
  }

  function handleSelect(n) {
    if (!n.readAt) {
      setItems((prev) =>
        filter === "unread"
          ? prev.filter((x) => x.id !== n.id)
          : prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      markNotificationRead(n.id)
        .then((data) => setUnreadCount(data.unreadCount ?? 0))
        .catch(() => refreshUnreadCount());
    }
    const target = notificationTarget(n);
    if (target?.to) navigate(target.to);
  }

  async function handleMarkAll() {
    const newest = items[0]?.createdAt;
    setItems((prev) => (filter === "unread" ? [] : prev.map((x) => (x.readAt ? x : { ...x, readAt: new Date().toISOString() }))));
    setUnreadCount(0);
    try {
      const data = await markAllNotificationsRead(newest);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      refreshUnreadCount();
    }
  }

  return (
    <div>
      <PageHeader title="Notifications" description="What changed that you personally need to know about." />

      <div className="mb-4 flex items-center justify-between gap-3 border-b border-line">
        <div className="flex gap-5">
          {[
            ["all", "All"],
            ["unread", "Unread"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`border-b-2 pb-3 text-sm font-medium transition ${
                filter === key ? "border-accent text-ink" : "border-transparent text-ink-secondary hover:text-ink-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleMarkAll}
          className="pb-3 text-xs font-medium text-ink-secondary transition hover:text-ink"
        >
          Mark all as read
        </button>
      </div>

      {status === "loading" && <SectionSpinner />}
      {status === "error" && (
        <EmptyState icon={IconAlertTriangle} title="Couldn't load notifications" description="Something went wrong. Please try again." />
      )}

      {status === "ready" && items.length === 0 && (
        <EmptyState
          icon={IconBell}
          title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
          description="You'll be notified when a Work Order becomes yours, an urgent issue is created where you manage, or your role or Property access changes."
        />
      )}

      {status === "ready" && items.length > 0 && (
        <>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {items.map((n) => (
              <NotificationRow key={n.id} notification={n} onSelect={handleSelect} dense={false} showCompany={multiCompany} />
            ))}
          </div>
          {nextCursor && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
