import { useEffect } from "react";
import { IconX } from "./icons";
import { formatAuditEventLabel, formatAuditEventSentence, formatAuditEventDetail } from "../utils/auditEvents";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", manager: "Manager", technician: "Technician" };
const AUTHORIZATION_PATH_LABEL = { full_editor: "Full editor", assigned_technician: "Assigned technician" };

function formatFullTimestamp(createdAt) {
  return new Date(createdAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Field({ label, children }) {
  if (children === null || children === undefined) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-0.5 text-sm text-ink">{children}</p>
    </div>
  );
}

// Same modal shell as CreateVendorModal/CreateWorkOrderModal (overlay,
// header, Escape-to-close) — a plain modal, not a slide-out drawer,
// matching the app's one existing "detail on demand" pattern rather than
// introducing a second. Only human-readable fields — no raw JSON blob; a
// developer/debug payload view is deliberately out of scope for V1.
export default function AuditEventDetailModal({ event, onClose }) {
  useEffect(() => {
    function handleEscape(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const sentence = formatAuditEventSentence(event);
  const detail = formatAuditEventDetail(event);
  const authorizationPath = event.metadata?.authorizationPath;

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-gray-900/40 px-4 py-8 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{formatAuditEventLabel(event)}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-ink-muted transition hover:bg-surface-subtle hover:text-ink">
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-sm text-ink">
            <span className="font-medium text-ink">{event.actor.name ?? "Unknown"}</span> {sentence}
          </p>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Time">{formatFullTimestamp(event.createdAt)}</Field>
            <Field label="Actor role">{ROLE_LABEL[event.actor.role] ?? event.actor.role}</Field>
            <Field label="Target">{event.entityLabel}</Field>
            <Field label="Property">{event.propertyName ?? "Company-wide"}</Field>
            {authorizationPath && <Field label="Authorization path">{AUTHORIZATION_PATH_LABEL[authorizationPath] ?? authorizationPath}</Field>}
          </div>

          {detail && <Field label="What changed">{detail}</Field>}
        </div>

        <div className="flex justify-end border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
