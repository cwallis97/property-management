import SearchableSelect from "./SearchableSelect";
import SectionSpinner from "./SectionSpinner";
import QuickCreateSheet from "./QuickCreateSheet";
import { IconArrowLeft } from "./icons";

// "Which Property is this at?" — shown before the Create form when the
// global Property Scope is All Properties, and again (via onBack) whenever
// the user hits "Change" inside the form. Only ever lists the caller's
// accessible, active Properties (getProperties() in the wrapper is already
// access-restricted + active-only); the server stays authoritative on top.
// Picking a Property here changes the target for THIS create only — it
// never touches the global Property Scope.
export default function QuickCreatePropertyStep({ entityLabel, properties, status, selectedId, onSelect, onBack, onClose, onRetry }) {
  const options = properties.map((p) => ({ value: p.id, label: p.name, sublabel: p.address || null }));

  return (
    <QuickCreateSheet title={`New ${entityLabel}`} onClose={onClose}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-ink-secondary transition hover:text-ink"
        >
          <IconArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
      )}

      <p className="mb-3 text-sm text-ink-secondary">Which property is this {entityLabel.toLowerCase()} at?</p>

      {status === "loading" && <SectionSpinner />}

      {status === "error" && (
        <div className="rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center">
          <p className="text-sm text-ink-secondary">Couldn&rsquo;t load your properties.</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {status === "ready" && (
        properties.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-secondary">
            You don&rsquo;t have access to any active properties.
          </p>
        ) : (
          <SearchableSelect
            value={selectedId}
            onChange={(id) => id && onSelect(id)}
            options={options}
            placeholder="Select a property"
          />
        )
      )}
    </QuickCreateSheet>
  );
}
