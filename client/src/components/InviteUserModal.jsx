import { useEffect, useState } from "react";
import { IconX } from "./icons";
import { createInvite } from "../utils/api";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "technician", label: "Technician" },
];

function formatShortDate(value) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Same modal shell as CreateVendorModal/CreatePropertyModal, but with a
// second internal step: on success it doesn't just close, it shows the
// generated link once (the backend never re-serves an invitation's token
// after creation) so the Admin can copy it before dismissing.
export default function InviteUserModal({ onClose, onInvited }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("technician");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, submitting]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const invite = await createInvite({ email: email.trim(), role });
      setCreated(invite);
      onInvited(invite);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  const inviteLink = created ? `${window.location.origin}/join/${created.token}` : "";

  function handleCopy() {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-gray-900/40 px-4 py-8 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{created ? "Invite created" : "Invite User"}</h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-subtle hover:text-ink-secondary"
            aria-label="Close"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        {!created ? (
          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Email</label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Role</label>
              <div className="flex gap-1.5">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium transition ${
                      role === r.value ? "bg-accent text-accent-ink" : "bg-surface-subtle text-ink-secondary hover:bg-line"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => !submitting && onClose()}
                className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Create Invite"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 px-5 py-5">
            <p className="text-sm text-ink-secondary">
              Send this link to <span className="font-medium text-ink">{created.email}</span> — they'll join as{" "}
              <span className="font-medium text-ink capitalize">{created.role}</span>.
            </p>

            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-subtle px-3 py-2.5">
              <p className="min-w-0 flex-1 truncate font-mono text-xs text-ink-secondary">{inviteLink}</p>
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-ink transition hover:bg-accent-hover"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <p className="text-xs text-ink-muted">Expires {formatShortDate(created.expiresAt)}. This link is only shown once.</p>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
