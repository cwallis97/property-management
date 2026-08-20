import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "propertyos.theme";
const PREFERENCES = ["system", "light", "dark"];

// Device-local only, deliberately — no User column, no migration, no
// backend round-trip. There's no product reason yet for a theme choice to
// follow someone between computers, and adding persistence for that would
// be exactly the kind of backend complexity this app has consistently
// avoided until something concrete actually needs it.
const ThemeContext = createContext(null);

function readStoredPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return PREFERENCES.includes(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(preference) {
  return preference === "system" ? (systemPrefersDark() ? "dark" : "light") : preference;
}

// Stamped on the root element rather than anywhere React renders into —
// this is exactly what index.html's own inline script sets synchronously
// before React ever paints (see that script's comment for why), and this
// effect keeps it in sync afterward. No CSS reacts to this attribute yet;
// that's the next milestone's actual styling sweep. This only makes sure
// that work has a real, already-correct signal to hook into rather than
// needing to invent one.
function applyToDocument(resolvedTheme) {
  document.documentElement.dataset.theme = resolvedTheme;
}

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readStoredPreference);
  const [resolvedTheme, setResolvedTheme] = useState(() => resolve(preference));

  function setPreference(next) {
    if (!PREFERENCES.includes(next)) return;
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // No persistence this session — the preference still works, it just
      // won't survive a refresh.
    }
  }

  useEffect(() => {
    const resolved = resolve(preference);
    setResolvedTheme(resolved);
    applyToDocument(resolved);
  }, [preference]);

  // Only matters while preference === "system" — Light/Dark are already
  // fixed regardless of what the OS is doing, so there's nothing to listen
  // for in that case.
  useEffect(() => {
    if (preference !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange() {
      const resolved = resolve("system");
      setResolvedTheme(resolved);
      applyToDocument(resolved);
    }
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [preference]);

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
