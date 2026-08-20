import { useEffect, useRef, useState } from "react";
import { updateCurrentUser } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const roleLabel = { owner: "Owner", admin: "Admin", manager: "Manager", technician: "Technician" };

const APPEARANCE_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function ReadOnlyField({ label, value }) {
  return (
    <div className="min-w-36 max-w-full">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1.5 break-words text-sm text-ink-secondary">{value}</p>
    </div>
  );
}

// Your own profile + device preference — nothing here is an administrative
// action, so unlike every other Settings section this one carries no
// capability gate at all. Email/Role/Organization are read-only by
// architecture, not just by convention: email is kept in sync with the
// Firebase token on every request (changing it here would just be
// overwritten), and role/Company membership changes are deliberately only
// ever made from Users & Roles (by someone else, or not at all for your
// own row — see that page's self-role protection).
export default function SettingsAccount() {
  const { user, role, refetch } = useAuth();
  const { preference, setPreference } = useTheme();
  const company = user?.companies?.[0];

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
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

    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      await updateCurrentUser({ displayName: displayName.trim() || null });
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
    <div className="space-y-8">
      <div>
        <div className="mb-6">
          <h2 className="text-base font-semibold text-ink">Account</h2>
          <p className="mt-0.5 text-sm text-ink-secondary">Your own profile and preferences.</p>
        </div>

        <div className="max-w-sm rounded-2xl border border-line bg-surface p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Profile</h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
              />
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Save Changes"}
              </button>
              {saved && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Saved</span>}
            </div>
          </form>

          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-5 border-t border-line pt-5">
            <ReadOnlyField label="Email" value={user?.email} />
            <ReadOnlyField label="Role" value={roleLabel[role] || role} />
            <ReadOnlyField label="Organization" value={company?.name} />
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Appearance</h3>
          <p className="mt-0.5 text-sm text-ink-secondary">Choose how PropertyOS looks on this device.</p>
        </div>
        <div className="inline-flex rounded-lg border border-line bg-surface-subtle p-1">
          {APPEARANCE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPreference(option.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                preference === option.value ? "bg-surface text-ink shadow-sm" : "text-ink-secondary hover:text-ink-secondary"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
