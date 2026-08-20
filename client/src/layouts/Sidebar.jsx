import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
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
  // any single property's own navigation.
  { to: "/reports", label: "Reports", icon: IconActivity },
  { to: "/vendors", label: "Vendors", icon: IconTruck },
  { to: "/documents", label: "Documents", icon: IconFolder },
];

const linkClasses = ({ isActive }) =>
  [
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
    isActive
      ? "bg-gray-100 text-gray-900"
      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900",
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

  // Refetches on every navigation (not just once on mount) so a Property
  // archived or restored from Settings is reflected here as soon as the
  // user navigates anywhere else — Sidebar never unmounts, so without this
  // the option list could otherwise stay stale for the rest of the session.
  useEffect(() => {
    getProperties()
      .then(setProperties)
      .catch(() => {
        // The selector just won't populate — navigation elsewhere in the
        // app still works fine unscoped.
      });
  }, [location.pathname]);

  // Two jobs, both only meaningful once the (active-only) Properties list
  // has loaded: backfill the display name when scope was restored from
  // sessionStorage (id only, no name), and clear scope if it points at a
  // Property that's no longer active — e.g. archived in a previous session,
  // so a fresh page load must never leave the selector silently pointing at
  // something it can't offer as an option. Skipped entirely while the user
  // is actually on that Property's own Detail page, since an archived
  // Property is deliberately still inspectable there and sets scope to
  // itself on every load — this check must never fight that.
  useEffect(() => {
    if (!propertyId || properties.length === 0) return;
    if (location.pathname.startsWith(`/portfolio/${propertyId}`)) return;

    const match = properties.find((p) => p.id === propertyId);
    if (match) {
      if (!property) setPropertyScope(match);
    } else {
      clearPropertyScope();
    }
  }, [propertyId, property, properties, location.pathname, setPropertyScope, clearPropertyScope]);

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

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-2.5 px-6">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-900 text-xs font-bold text-white">
          P
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-gray-900">
          PropertyOS
        </span>
      </div>

      <PropertyScopeSelector />

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClasses}>
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      {hasCapability(CAPABILITIES.SETTINGS_ACCESS) && (
        <div className="border-t border-gray-100 px-3 py-3">
          <NavLink to="/settings" className={linkClasses}>
            <IconSettings className="h-[18px] w-[18px]" />
            Settings
          </NavLink>
        </div>
      )}
    </aside>
  );
}
