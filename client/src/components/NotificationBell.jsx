import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconBell } from "./icons";
import Portal from "./Portal";
import NotificationRow from "./NotificationRow";
import SectionSpinner from "./SectionSpinner";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "../utils/api";
import { notificationTarget } from "../utils/notifications";

const DROPDOWN_LIMIT = 15;

export default function NotificationBell() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { unreadCount, setUnreadCount, refreshUnreadCount } = useNotifications();

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [items, setItems] = useState([]);

  const buttonRef = useRef(null);
  const seqRef = useRef(0);

  const multiCompany = (user?.companies?.length ?? 0) > 1;

  function loadList() {
    const seq = ++seqRef.current;
    setStatus((s) => (s === "ready" ? "ready" : "loading"));
    getNotifications({ filter: "all", limit: DROPDOWN_LIMIT })
      .then((data) => {
        if (seq !== seqRef.current) return;
        setItems(data.notifications);
        setUnreadCount(data.unreadCount ?? 0);
        setStatus("ready");
      })
      .catch(() => {
        if (seq === seqRef.current) setStatus("error");
      });
  }

  useEffect(() => {
    if (open) loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Outside-click is handled by the full-viewport catcher rendered
    // inside the Portal below (a document-level listener would fire for
    // every click on the portaled dropdown's own buttons, since the
    // dropdown is not a DOM descendant of this component).
    function onKey(e) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleSelect(n) {
    setOpen(false);
    if (!n.readAt) {
      // optimistic — the row and the badge update immediately
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
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
    setItems((prev) => prev.map((x) => (x.readAt ? x : { ...x, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    try {
      const data = await markAllNotificationsRead(newest);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      refreshUnreadCount();
    }
  }

  const badge = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary transition hover:bg-surface-subtle hover:text-ink"
      >
        <IconBell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-ink">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <Portal>
          <div className="fixed inset-0 z-30" aria-hidden="true" onMouseDown={() => setOpen(false)} />
          <div
            role="menu"
            aria-label="Notifications"
            className="fixed right-3 top-16 z-30 max-w-[calc(100vw-1.5rem)] w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-lg sm:right-6"
          >
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
              <span className="text-sm font-semibold text-ink">Notifications</span>
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={unreadCount === 0}
                className="text-xs font-medium text-ink-secondary transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Mark all as read
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto py-1">
              {status === "loading" && <SectionSpinner />}
              {status === "error" && <p className="px-3 py-8 text-center text-sm text-ink-secondary">Couldn&rsquo;t load notifications.</p>}
              {status === "ready" && items.length === 0 && (
                <p className="px-3 py-10 text-center text-sm text-ink-muted">You&rsquo;re all caught up.</p>
              )}
              {status === "ready" &&
                items.map((n) => <NotificationRow key={n.id} notification={n} onSelect={handleSelect} showCompany={multiCompany} />)}
            </div>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate("/notifications");
              }}
              className="block w-full border-t border-line px-3 py-2.5 text-center text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle hover:text-ink"
            >
              View all notifications
            </button>
          </div>
        </Portal>
      )}
    </div>
  );
}
