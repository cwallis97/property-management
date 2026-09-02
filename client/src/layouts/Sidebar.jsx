import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  IconGrid,
  IconBuilding,
  IconBox,
  IconWrench,
  IconTruck,
  IconFolder,
  IconSettings,
  IconActivity,
} from "../components/icons";
import SearchableSelect from "../components/SearchableSelect";
import { usePropertyScope } from "../context/PropertyScopeContext";
import { useAuth } from "../context/AuthContext";
import { CAPABILITIES } from "../utils/capabilities";
import { getProperties } from "../utils/api";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: IconGrid },
  { to: "/portfolio", label: "Portfolio", icon: IconBuilding },
  { to: "/assets", label: "Assets", icon: IconBox },
  { to: "/work-orders", label: "Work Orders", icon: IconWrench },
  // Reporting is portfolio-wide, not scoped to one property, so it lives
  // as a top-level pillar alongside Dashboard/Portfolio rather than inside
  // any single property's own navigation. Gated on REPORTS_READ (the same
  // capability the report endpoints enforce server-side) so Technician —
  // who would only ever hit a 403 here — isn't shown a dead-end link.
  // UX only: the server remains the authoritative boundary.
  { to: "/reports", label: "Reports", icon: IconActivity, capability: CAPABILITIES.REPORTS_READ },
  { to: "/vendors", label: "Vendors", icon: IconTruck },
  { to: "/documents", label: "Documents", icon: IconFolder },
];

const linkClasses = ({ isActive }) =>
  [
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
    isActive
      ? "bg-surface-subtle text-ink"
      : "text-ink-secondary hover:bg-surface-subtle hover:text-ink",
  ].join(" ");

// Compact, always-visible "which Property am I operating in" control, sitting
// right under the wordmark. Options always come from the live, Company-scoped
// getProperties() call — never a cached/hardcoded list — so this stays
// correct if a Property is added and, later, if per-user Property access is
// ever restricted by role. Purely UX/navigation state: selecting a Property
// here never substitutes for backend tenant authorization, which every
// request still independently enforces.
function PropertyScopeSelector() {
  const { propertyId, property, setPropertyScope, clearPropertyScope } = usePropertyScope();
  const location = useLocation();
  const [properties, setProperties] = useState([]);
  // Distinct from properties.length === 0 — that's ambiguous between "the
  // fetch hasn't resolved yet" (must not clear scope, or every fresh page
  // load would briefly flash-clear a valid selection) and "the fetch
  // resolved and this member genuinely has zero accessible Properties
  // right now" (must clear scope, this is exactly the "Admin just revoked
  // my access" recovery case). This flag is what lets the effect below
  // tell those two apart.
  const [propertiesLoaded, setPropertiesLoaded] = useState(false);

  // Refetches on every navigation (not just once on mount) so a Property
  // archived or restored from Settings — or a Property Access grant
  // changed by an Admin — is reflected here as soon as the user navigates
  // anywhere else. GET /api/properties already only ever returns Properties
  // the caller may access (see server/authorization/propertyAccess.js), so
  // this list is also the access-restricted source of truth the recovery
  // effect below relies on. Sidebar never unmounts, so without refetching
  // here the option list could otherwise stay stale for the rest of the
  // session.
  useEffect(() => {
    getProperties()
      .then((data) => {
        setProperties(data);
        setPropertiesLoaded(true);
      })
      .catch(() => {
        // The selector just won't populate — navigation elsewhere in the
        // app still works fine unscoped.
      });
  }, [location.pathname]);

  // Two jobs, both only meaningful once the (accessible, active-only)
  // Properties list has actually loaded: backfill the display name when
  // scope was restored from sessionStorage (id only, no name), and clear
  // scope if it points at a Property no longer in that list — archived in
  // a previous session, deleted, or (new in Property Access V1) access to
  // it was revoked, including the case where that leaves zero accessible
  // Properties at all. A fresh page load must never leave the selector
  // silently pointing at something it can't offer as an option. Skipped
  // entirely while the user is actually on that Property's own Detail
  // page, since an archived-but-still-accessible Property is deliberately
  // still inspectable there and sets scope to itself on every load — this
  // check must never fight that. (An inaccessible Property's own Detail
  // page 404s server-side and never calls setPropertyScope in the first
  // place, so this guard has nothing to fight in that case either.)
  useEffect(() => {
    if (!propertyId || !propertiesLoaded) return;
    if (location.pathname.startsWith(`/portfolio/${propertyId}`)) return;

    const match = properties.find((p) => p.id === propertyId);
    if (match) {
      if (!property) setPropertyScope(match);
    } else {
      clearPropertyScope();
    }
  }, [propertyId, property, properties, propertiesLoaded, location.pathname, setPropertyScope, clearPropertyScope]);

  const options = useMemo(() => {
    const opts = [{ value: null, label: "All Properties", sublabel: null }];
    for (const p of properties) opts.push({ value: p.id, label: p.name, sublabel: null });
    return opts;
  }, [properties]);

  function handleChange(value) {
    if (!value) {
      clearPropertyScope();
      return;
    }
    const match = properties.find((p) => p.id === value);
    if (match) setPropertyScope(match);
  }

  return (
    <div className="px-3 pb-3">
      <SearchableSelect
        value={propertyId}
        onChange={handleChange}
        options={options}
        placeholder="All Properties"
      />
    </div>
  );
}

export default function Sidebar() {
  const { hasCapability } = useAuth();
  const { propertyId: scopePropertyId } = usePropertyScope();
  const location = useLocation();

  // Portfolio is the one nav item whose destination depends on scope: a
  // specific Property selected means the user is already "inside" that
  // Property's context, so Portfolio should take them straight to its
  // Detail/Overview rather than to a redundant one-row directory they'd
  // have to click through again. "All Properties" still opens the full
  // directory. See PropertyDetail.jsx for the matching reverse case
  // (changing scope while already on a Property's Detail page).
  const portfolioTo = scopePropertyId ? `/portfolio/${scopePropertyId}` : "/portfolio";
  // Deliberately NOT derived from NavLink's own to-vs-location matching —
  // that would compare the current URL against portfolioTo, which breaks
  // the moment they disagree for a legitimate reason (e.g. scope is
  // Riverbend but the user navigated directly to the bare /portfolio
  // directory, a fully valid state under Portfolio's Model B filtering).
  // Portfolio is "active" for this Sidebar whenever the URL is anywhere
  // under /portfolio, independent of what scope currently is.
  const portfolioActive = location.pathname === "/portfolio" || location.pathname.startsWith("/portfolio/");

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex h-16 items-center gap-2.5 px-6">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-xs font-bold text-accent-ink">
          P
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-ink">
          PropertyOS
        </span>
      </div>

      <PropertyScopeSelector />

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {navItems
          .filter(({ capability }) => !capability || hasCapability(capability))
          .map(({ to, label, icon: Icon }) =>
            to === "/portfolio" ? (
              <Link key={label} to={portfolioTo} className={linkClasses({ isActive: portfolioActive })}>
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </Link>
            ) : (
              <NavLink key={label} to={to} className={linkClasses}>
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </NavLink>
            )
          )}
      </nav>

      {hasCapability(CAPABILITIES.SETTINGS_ACCESS) && (
        <div className="border-t border-line px-3 py-3">
          <NavLink to="/settings" className={linkClasses}>
            <IconSettings className="h-[18px] w-[18px]" />
            Settings
          </NavLink>
        </div>
      )}
    </aside>
  );
}
