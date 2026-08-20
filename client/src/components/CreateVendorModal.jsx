import { useEffect, useState } from "react";
import { IconX } from "./icons";
import { createVendor } from "../utils/api";

// Same modal shell/UX conventions as CreateAssetModal/CreateWorkOrderModal
// (overlay, header, Escape-to-close, Cancel/Submit footer). Status always
// defaults to Active — a brand-new Vendor is, by definition, available for
// new work.
export default function CreateVendorModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

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

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = { name: name.trim(), status: "active" };
    if (category.trim()) payload.category = category.trim();
    if (contactName.trim()) payload.contactName = contactName.trim();
    if (phone.trim()) payload.phone = phone.trim();
    if (email.trim()) payload.email = email.trim();
    if (notes.trim()) payload.notes = notes.trim();

    try {
      const created = await createVendor(payload);
      onCreated(created);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-gray-900/40 px-4 py-8 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Add Vendor</h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-subtle hover:text-ink-secondary"
            aria-label="Close"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Name</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ABC Plumbing"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Services</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Plumbing, Sewer (optional)"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Contact name</label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. John Smith (optional)"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(optional)"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="(optional)"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
              />
            </div>
          </div>

          <div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-secondary placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            />
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
              {submitting ? "Adding..." : "Add Vendor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
