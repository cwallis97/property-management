const BASE_VIEWS = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All" },
];

const MY_WORK_VIEW = { value: "my-work", label: "My Work" };

// Same segmented-control visual language as WorkOrderDetail's Status
// selector — reused here rather than inventing a second control style.
// includeMyWork is opt-in (default false) so PropertyDetail's own Work
// Orders tab — a single Property's queue, where "My Work" wasn't asked
// for — stays exactly as it already is; only the portfolio-wide Work
// Orders page passes it. My Work is a peer view alongside Active/
// Completed/All, not a second axis layered on top of them — it shows
// every status of Work Order assigned to the caller, exactly like "All"
// shows every status portfolio-wide.
export default function WorkOrderViewFilter({ value, onChange, includeMyWork = false }) {
  const views = includeMyWork ? [MY_WORK_VIEW, ...BASE_VIEWS] : BASE_VIEWS;
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-subtle p-1">
      {views.map((view) => (
        <button
          key={view.value}
          type="button"
          onClick={() => onChange(view.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            value === view.value ? "bg-surface text-ink shadow-sm" : "text-ink-secondary hover:text-ink-secondary"
          }`}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}
