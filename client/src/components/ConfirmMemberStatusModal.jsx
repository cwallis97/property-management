import { useEffect, useState } from "react";
import { IconX, IconAlertTriangle } from "./icons";
import { updateMemberStatus } from "../utils/api";

// SOC 2 Phase 1 — confirm disabling or re-enabling a member's access to
// this Company. Disabling is security-sensitive: it takes effect on the
// member's very next request. Historical Work Orders, notes, and activity
// stay exactly as they are.
export default function ConfirmMemberStatusModal({ member, intent, onClose, onUpdated }) {
  const disabling = intent === "disable";
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await updateMemberStatus(member.membershipId, {
        status: disabling ? "disabled" : "active",
        reason: reason.trim() || undefined,
      });
      onUpdated(updated);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-gray-900/40 px-4 py-8 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">
            {disabling ? "Disable access" : "Re-enable access"} for {member.name}?
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-subtle hover:text-ink-secondary"
            aria-label="Close"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {disabling ? (
            <>
              <p className="text-sm text-ink-secondary">
                {member.name} will immediately lose access to PropertyOS for this company. Their role and property
                access are kept and restored if you re-enable them later. Historical Work Orders and activity remain
                unchanged.
              </p>
              {member.openAssignedWorkOrderCount > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-line bg-surface-subtle px-3 py-2 text-sm text-ink-secondary">
                  <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span>
                    {member.name} is currently assigned to {member.openAssignedWorkOrderCount} open Work Order
                    {member.openAssignedWorkOrderCount === 1 ? "" : "s"}. Those assignments are left as-is for the
                    record — reassign them separately if needed.
                  </span>
                </div>
              )}
              <div>
                <label htmlFor="disable-reason" className="mb-1 block text-xs font-medium text-ink-secondary">
                  Reason (optional)
                </label>
                <input
                  id="disable-reason"
                  type="text"
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Employee left the company"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-secondary">
              {member.name} will regain access to this company with the role and property access they had before.
            </p>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle disabled:opacity-50"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${
              disabling ? "bg-red-600 hover:bg-red-700" : "bg-accent text-accent-ink hover:bg-accent-hover"
            }`}
          >
            {submitting ? "Saving…" : disabling ? "Disable access" : "Re-enable access"}
          </button>
        </div>
      </div>
    </div>
  );
}
