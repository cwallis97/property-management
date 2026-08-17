import { useState } from "react";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { currentUser as mockUser } from "../mock/user";
import { IconSearch, IconBell, IconPlus, IconChevronDown } from "../components/icons";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName =
    auth.currentUser?.displayName || auth.currentUser?.email || mockUser.name;
  const displayEmail = auth.currentUser?.email || mockUser.email;
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleLogout() {
    setMenuOpen(false);
    await signOut(auth);
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-gray-200 bg-white/80 px-8 backdrop-blur">
      <div className="relative w-full max-w-sm">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search properties, assets, work orders..."
          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-12 text-sm text-gray-700 placeholder:text-gray-400 transition focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/5"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-gray-400">
          ⌘K
        </kbd>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
        >
          <IconPlus className="h-4 w-4" />
          New
        </button>

        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-gray-500 transition hover:border-gray-200 hover:bg-gray-50 hover:text-gray-700"
        >
          <IconBell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-white" />
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
                    {displayName}
                  </p>
                  <p className="truncate text-xs text-gray-500">{displayEmail}</p>
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
