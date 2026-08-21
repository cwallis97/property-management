import { useEffect, useMemo, useState } from "react";
import { IconX } from "./icons";
import { getProperties, updateMemberPropertyAccess } from "../utils/api";

const MODES = [
  { value: "all", label: "All Properties", description: "Sees every property in the company, including new ones." },
  { value: "restricted", label: "Selected Properties", description: "Sees only the properties checked below." },
];

// All Properties (active and archived) are fetched here, not just active —
// a member already granted access to a since-archived Property must still
// show that grant as checked, never silently drop it just because this
// modal's own picker only offers active ones to newly select. Showing
// every Property with an "Archived" badge on the relevant few is simpler
// and safer than a two-tier "active picker + separate archived list" UI.
export default function EditPropertyAccessModal({ member, onClose, onUpdated }) {
  const [accessMode, setAccessMode] = useState(member.accessMode);
  const [selectedIds, setSelectedIds] = useState(() => new Set(member.propertyIds ?? []));

  const [properties, setProperties] = useState([]);
  const [propertiesStatus, setPropertiesStatus] = useState("loading"); // loading | error | ready

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getProperties({ status: "all" })
      .then((data) => {
        setProperties(data);
        setPropertiesStatus("ready");
      })
      .catch(() => setPropertiesStatus("error"));
  }, []);

  useEffect(() => {
    function handleEscape(e) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, submitting]);

  const sortedProperties = useMemo(
    () => [...properties].sort((a, b) => a.name.localeCompare(b.name)),
    [properties]
  );

  function toggleProperty(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    if (accessMode === "restricted" && selectedIds.size === 0) {
      setError("Select at least one property, or choose All Properties.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload =
        accessMode === "all" ? { accessMode: "all" } : { accessMode: "restricted", propertyIds: [...selectedIds] };
      const updated = await updateMemberPropertyAccess(member.membershipId, payload);
      onUpdated(updated);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-gray-900/40 px-4 py-8 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Property Access</h2>
            <p className="mt-0.5 text-xs text-ink-secondary">{member.name}</p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-subtle hover:text-ink-secondary"
            aria-label="Close"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div className="space-y-2">
            {MODES.map((mode) => (
              <label
                key={mode.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                  accessMode === mode.value ? "border-line-strong bg-surface-subtle" : "border-line hover:bg-surface-subtle"
                }`}
              >
                <input
                  type="radio"
                  name="accessMode"
                  value={mode.value}
                  checked={accessMode === mode.value}
                  onChange={() => setAccessMode(mode.value)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium text-ink">{mode.label}</span>
                  <span className="block text-xs text-ink-secondary">{mode.description}</span>
                </span>
              </label>
            ))}
          </div>

          {accessMode === "restricted" && (
            <div>
              {propertiesStatus === "loading" && <p className="text-sm text-ink-muted">Loading properties…</p>}
              {propertiesStatus === "error" && (
                <p className="text-sm text-red-600 dark:text-red-400">Couldn't load properties. Please try again.</p>
              )}
              {propertiesStatus === "ready" && sortedProperties.length === 0 && (
                <p className="text-sm text-ink-muted">No properties exist yet.</p>
              )}
              {propertiesStatus === "ready" && sortedProperties.length > 0 && (
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
                  {sortedProperties.map((property) => (
                    <label
                      key={property.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition hover:bg-surface-subtle"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(property.id)}
                        onChange={() => toggleProperty(property.id)}
                      />
                      <span className="min-w-0 flex-1 truncate text-ink">{property.name}</span>
                      {property.status === "archived" && (
                        <span className="shrink-0 rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted ring-1 ring-inset ring-line">
                          Archived
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
