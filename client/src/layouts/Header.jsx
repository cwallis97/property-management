import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { IconBell, IconPlus, IconChevronDown } from "../components/icons";
import GlobalSearch from "../components/GlobalSearch";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  // auth.currentUser is synchronously null until Firebase finishes
  // restoring the session (same hydration race documented in utils/api.js),
  // so reading it directly at render time — as this used to — can render a
  // stale/fallback value on first paint that never gets corrected until
  // some unrelated re-render happens to occur. Subscribing here (same
  // pattern as ProtectedRoute/PublicRoute) means the header updates itself
  // the moment the real session resolves, with no fake data in between.
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(setUser);
    return () => unsubscribe();
  }, []);

  const displayName = user?.displayName || user?.email || null;
  const displayEmail = user?.email || null;
  const initials = displayName
    ? displayName
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : null;

  async function handleLogout() {
    setMenuOpen(false);
    await signOut(auth);
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-line bg-surface/80 px-8 backdrop-blur">
      <GlobalSearch />

      {/* New is not wired to anything yet — disabled and muted rather than
          styled as a live primary action, so it reads as "not built"
          instead of "broken." */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          title="Coming soon"
          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink-muted"
        >
          <IconPlus className="h-4 w-4" />
          New
        </button>

        <button
          type="button"
          disabled
          title="Coming soon"
          className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full border border-transparent text-ink-muted"
        >
          <IconBell className="h-5 w-5" />
        </button>

        <div className="relative ml-1">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-surface-subtle"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-ink">
              {initials}
            </span>
            <IconChevronDown className="h-4 w-4 text-ink-muted" />
          </button>

          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-lg shadow-gray-900/5">
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-medium text-ink">
                    {displayName ?? "Loading…"}
                  </p>
                  <p className="truncate text-xs text-ink-secondary">{displayEmail ?? ""}</p>
                </div>
                <div className="my-1 h-px bg-surface-subtle" />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-ink-secondary transition hover:bg-surface-subtle"
                >
                  Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
