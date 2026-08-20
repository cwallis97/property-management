import { createContext, useCallback, useContext, useMemo, useState } from "react";

// Pure UX/navigation state — which Property the app is currently "operating
// in," never an authorization boundary. Every data fetch is independently
// re-validated against the caller's Company on the backend regardless of
// what this Context believes the scope is; this only decides what a page
// defaults to showing.
//
// Persisted to sessionStorage (survives a refresh, does not survive
// logout/a new session) rather than synced into the URL — Property Detail
// already owns its own persistent scope via its :propertyId route param,
// so this only needs to remember scope for the pages that don't have one.
const STORAGE_KEY = "propertyos.scope.propertyId";

const PropertyScopeContext = createContext(null);

function readInitialScope() {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored || null;
  } catch {
    return null;
  }
}

export function PropertyScopeProvider({ children }) {
  const [scope, setScope] = useState(readInitialScope);

  // { id, name } for display, or null for "All Properties" — kept alongside
  // the id so the Sidebar selector can render a label without needing its
  // own separate Properties fetch just to resolve one name.
  const [scopeProperty, setScopeProperty] = useState(null);

  const setPropertyScope = useCallback((property) => {
    if (!property) {
      setScope(null);
      setScopeProperty(null);
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // sessionStorage unavailable (e.g. private browsing edge cases) —
        // in-memory scope for this session still works fine without it.
      }
      return;
    }
    setScope(property.id);
    setScopeProperty(property);
    try {
      sessionStorage.setItem(STORAGE_KEY, property.id);
    } catch {
      // Same as above — non-fatal.
    }
  }, []);

  const clearPropertyScope = useCallback(() => setPropertyScope(null), [setPropertyScope]);

  const value = useMemo(
    () => ({ propertyId: scope, property: scopeProperty, setPropertyScope, clearPropertyScope }),
    [scope, scopeProperty, setPropertyScope, clearPropertyScope]
  );

  return <PropertyScopeContext.Provider value={value}>{children}</PropertyScopeContext.Provider>;
}

export function usePropertyScope() {
  const ctx = useContext(PropertyScopeContext);
  if (!ctx) throw new Error("usePropertyScope must be used within a PropertyScopeProvider");
  return ctx;
}
