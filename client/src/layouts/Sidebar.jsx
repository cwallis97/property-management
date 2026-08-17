import { NavLink } from "react-router-dom";
import {
  IconGrid,
  IconBuilding,
  IconBox,
  IconWrench,
  IconTruck,
  IconFolder,
  IconSettings,
} from "../components/icons";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: IconGrid },
  { to: "/portfolio", label: "Portfolio", icon: IconBuilding },
  { to: "/assets", label: "Assets", icon: IconBox },
  { to: "/work-orders", label: "Work Orders", icon: IconWrench },
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

export default function Sidebar() {
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

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClasses}>
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-gray-100 px-3 py-3">
        <NavLink to="/settings" className={linkClasses}>
          <IconSettings className="h-[18px] w-[18px]" />
          Settings
        </NavLink>
      </div>
    </aside>
  );
}
