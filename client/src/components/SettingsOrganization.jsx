import { useEffect, useRef, useState } from "react";
import { updateCompany } from "../utils/api";
import { useAuth } from "../context/AuthContext";

// Deliberately one field. Company has exactly one editable property today —
// see the Organization Settings audit for why logo/timezone/notification-
// policy/etc. don't belong here yet: none of them have any consuming
// feature in this app, and adding them now would be filler, not
// foundation. The initial value comes straight from AuthContext (already
// loaded by the time Settings renders this at all) — no separate fetch.
export default function SettingsOrganization() {
  const { user, companyId, refetch } = useAuth();
  const company = user?.companies?.[0];

  const [name, setName] = useState(company?.name ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const savedTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Company name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateCompany(companyId, trimmed);
      setName(updated.name);
      // Refreshes AuthContext's own copy of the Company name (used
      // elsewhere — the Join preview page, Invite creation) so it reflects
      // the change the next time any of those actually reload their data,
      // without needing a full page refresh here.
      await refetch();
      setSaved(true);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-base font-semibold text-gray-900">Organization</h2>
        <p className="mt-0.5 text-sm text-gray-500">Basic details about your company.</p>
      </div>

      <div className="max-w-sm rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Organization details</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-900">Company name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save Changes"}
            </button>
            {saved && <span className="text-xs font-medium text-emerald-600">Saved</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
