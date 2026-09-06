import { notificationIcon, formatRelativeTime } from "../utils/notifications";

// One notification — icon + server-rendered title + body + relative time.
// Unread rows carry a left accent bar and a subtle fill; read rows are
// plain and slightly de-emphasised. Shared by the Header dropdown and the
// /notifications page (roomier via `dense={false}`).
export default function NotificationRow({ notification: n, onSelect, dense = true, showCompany = false }) {
  const Icon = notificationIcon(n.type);
  const unread = !n.readAt;

  return (
    <button
      type="button"
      onClick={() => onSelect(n)}
      className={`flex w-full items-start gap-3 border-l-2 px-3 text-left transition ${dense ? "py-2.5" : "py-3"} ${
        unread ? "border-accent bg-surface-subtle" : "border-transparent hover:bg-surface-subtle"
      }`}
    >
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-subtle text-ink-secondary ${
          unread ? "" : "opacity-70"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${unread ? "font-medium text-ink" : "text-ink-secondary"}`}>{n.title}</span>
        {n.body && <span className="block truncate text-xs text-ink-muted">{n.body}</span>}
        <span className="mt-0.5 block text-[11px] text-ink-muted">
          {formatRelativeTime(n.createdAt)}
          {showCompany && n.companyName ? ` · ${n.companyName}` : ""}
        </span>
      </span>
    </button>
  );
}
