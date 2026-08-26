import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentUser } from "../utils/api";
import { roleHasCapability } from "../utils/capabilities";

// Fetched once per session from /api/users/me. This app's Membership model
// supports a user belonging to more than one Company, but nothing else in
// the product distinguishes between them yet (Property Scope, Dashboard,
// Vendor creation, etc. all already assume "the caller's one company" via
// companyIds[0]) — companies[0] here follows that same existing assumption
// rather than introducing a company-switcher this milestone doesn't need.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, role: null, companyId: null, membershipId: null, loading: true });

  // Extracted so both the initial mount fetch and any later "I just changed
  // something you're caching" caller (Organization renaming the Company,
  // Account renaming itself) can re-run the exact same fetch-and-derive
  // logic. Callers don't get their own local reload logic instead of this.
  const load = useCallback(() => {
    return getCurrentUser()
      .then((data) => {
        const company = data.companies?.[0] ?? null;
        setState({
          user: data,
          role: company?.role ?? null,
          companyId: company?.id ?? null,
          // The caller's own Membership id for the current Company — used
          // by My Work to identify "assigned to me" without a separate
          // lookup or trusting anything else the browser might claim.
          membershipId: company?.membershipId ?? null,
          loading: false,
        });
      })
      .catch(() => {
        // Fails closed — no role resolved means no capability check ever
        // passes, so the UI hides administrative actions rather than
        // guessing. Read access itself doesn't depend on this at all (every
        // GET endpoint is unconditionally open to a Company member), so a
        // failed fetch here only ever affects what CAN be shown, never what
        // can be read.
        setState({ user: null, role: null, companyId: null, membershipId: null, loading: false });
      });
  }, []);

  // No cancelled-guard here (unlike most fetch effects elsewhere in this
  // app) — AuthProvider wraps the entire AppShell for the life of the
  // session and never remounts during normal navigation, and load() is
  // also the same function Organization/Account call directly after a
  // save, well outside any effect's lifecycle.
  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(
    () => ({
      ...state,
      hasCapability: (capability) => roleHasCapability(state.role, capability),
      refetch: load,
    }),
    [state, load]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
