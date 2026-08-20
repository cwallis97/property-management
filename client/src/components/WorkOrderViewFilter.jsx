const VIEWS = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All" },
];

// Same segmented-control visual language as WorkOrderDetail's Status
// selector — reused here rather than inventing a second control style.
export default function WorkOrderViewFilter({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-subtle p-1">
      {VIEWS.map((view) => (
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
