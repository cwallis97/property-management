import { useState } from "react";
import PageHeader from "../components/PageHeader";
import SectionSpinner from "../components/SectionSpinner";
import SettingsProperties from "../components/SettingsProperties";
import SettingsUsers from "../components/SettingsUsers";
import SettingsOrganization from "../components/SettingsOrganization";
import SettingsAccount from "../components/SettingsAccount";
import { useAuth } from "../context/AuthContext";
import { CAPABILITIES } from "../utils/capabilities";

export default function Settings() {
  const { hasCapability, loading } = useAuth();
  const [activeSection, setActiveSection] = useState("properties");

  // All four sections are real now — nothing here is a placeholder.
  // Properties/Organization share settings.access (the same Admin/Owner
  // boundary Property lifecycle administration already used); Users &
  // Roles keeps its own users.manage; Account has no capability gate at
  // all — every member, regardless of role, manages their own name and
  // appearance. That last point is exactly why this page is no longer
  // wrapped in a route-level RequireCapability: Settings now has to be
  // reachable by everyone, not just Admin/Owner.
  const SECTIONS = [
    { key: "properties", label: "Properties", enabled: hasCapability(CAPABILITIES.SETTINGS_ACCESS) },
    { key: "users", label: "Users & Roles", enabled: hasCapability(CAPABILITIES.USERS_MANAGE) },
    { key: "organization", label: "Organization", enabled: hasCapability(CAPABILITIES.SETTINGS_ACCESS) },
    { key: "account", label: "Account", enabled: true },
  ];

  // Falls back to the first available section whenever the one currently
  // selected isn't (still) enabled for this member — covers both a
  // Manager/Technician landing here with only Account available, and the
  // brief window before capabilities finish resolving. Account is always
  // enabled, so this can never come up empty.
  const availableSections = SECTIONS.filter((s) => s.enabled);
  const effectiveSection = availableSections.some((s) => s.key === activeSection)
    ? activeSection
    : availableSections[0]?.key;

  return (
    <div>
      <PageHeader title="Settings" description="Manage your organization, properties, and account preferences." />

      {loading ? (
        <SectionSpinner />
      ) : (
        <>
          {/*
            Two independent renderings of the same SECTIONS list, swapped by
            breakpoint rather than reflowed with one shared layout — a vertical
            rail and a horizontal tab strip are different enough visually
            (bottom-indicator vs filled-row) that forcing one flex/grid to become
            both looks worse than just picking whichever fits. Rail kicks in at
            `lg` (not the more common `md`) specifically because a fixed-width
            rail is what made the medium/half-screen width feel cramped — this
            gives it more room before committing to that layout.
          */}
          <nav className="mb-6 -mx-1 overflow-x-auto px-1 lg:hidden">
            <div className="flex gap-5 whitespace-nowrap border-b border-gray-200">
              {SECTIONS.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  disabled={!section.enabled}
                  onClick={() => section.enabled && setActiveSection(section.key)}
                  title={section.enabled ? undefined : "You don't have access to this"}
                  className={`shrink-0 border-b-2 pb-3 text-sm font-medium transition ${
                    !section.enabled
                      ? "cursor-not-allowed border-transparent text-gray-300"
                      : effectiveSection === section.key
                      ? "border-gray-900 text-gray-900"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {section.label}
                </button>
              ))}
            </div>
          </nav>

          <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
            <nav className="hidden space-y-0.5 lg:block">
              {SECTIONS.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  disabled={!section.enabled}
                  onClick={() => section.enabled && setActiveSection(section.key)}
                  title={section.enabled ? undefined : "You don't have access to this"}
                  className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                    !section.enabled
                      ? "cursor-not-allowed text-gray-300"
                      : effectiveSection === section.key
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {section.label}
                </button>
              ))}
            </nav>

            <div className="min-w-0">
              {effectiveSection === "properties" && <SettingsProperties />}
              {effectiveSection === "users" && <SettingsUsers />}
              {effectiveSection === "organization" && <SettingsOrganization />}
              {effectiveSection === "account" && <SettingsAccount />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
