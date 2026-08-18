import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { IconSearch, IconBell, IconPlus, IconChevronDown } from "../components/icons";

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
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-gray-200 bg-white/80 px-8 backdrop-blur">
      {/* Search and New are not wired to anything yet — disabled and
          muted rather than styled as live primary actions, so they read as
          "not built" instead of "broken." No ⌘K hint for a shortcut that
          doesn't exist. */}
      <div className="relative w-full max-w-sm">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
        <input
          type="text"
          disabled
          placeholder="Search coming soon"
          className="w-full cursor-not-allowed rounded-lg border border-gray-100 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-400 placeholder:text-gray-400"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          title="Coming soon"
          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-400"
        >
          <IconPlus className="h-4 w-4" />
          New
        </button>

        <button
          type="button"
          disabled
          title="Coming soon"
          className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full border border-transparent text-gray-300"
        >
          <IconBell className="h-5 w-5" />
        </button>

        <div className="relative ml-1">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-gray-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
              {initials}
            </span>
            <IconChevronDown className="h-4 w-4 text-gray-400" />
          </button>

          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg shadow-gray-900/5">
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {displayName ?? "Loading…"}
                  </p>
                  <p className="truncate text-xs text-gray-500">{displayEmail ?? ""}</p>
                </div>
                <div className="my-1 h-px bg-gray-100" />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
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
