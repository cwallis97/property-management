import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getNotificationUnreadCount } from "../utils/api";

// Keeps the Header bell's unread count fresh. Polls the lightweight
// /unread-count endpoint every 60s, but ONLY while the tab is visible
// (and immediately on becoming visible again) — no WebSockets, no
// 2-second polling. The bell dropdown and the /notifications page fetch
// the full list themselves and push the authoritative unreadCount they
// get back into `setUnreadCount`, so a mark-read is reflected instantly
// without waiting for the next poll.
const NotificationsContext = createContext(null);
const POLL_MS = 60000;

export function NotificationsProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const seqRef = useRef(0);

  const refreshUnreadCount = useCallback(() => {
    const seq = ++seqRef.current;
    getNotificationUnreadCount()
      .then((data) => {
        if (seq === seqRef.current) setUnreadCount(data.count ?? 0);
      })
      .catch(() => {
        // Non-fatal — the bell just keeps its last known count.
      });
  }, []);

  useEffect(() => {
    refreshUnreadCount();
    const id = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") refreshUnreadCount();
    }, POLL_MS);
    function onVisible() {
      if (document.visibilityState === "visible") refreshUnreadCount();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshUnreadCount]);

  return (
    <NotificationsContext.Provider value={{ unreadCount, setUnreadCount, refreshUnreadCount }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationsProvider");
  return ctx;
}
