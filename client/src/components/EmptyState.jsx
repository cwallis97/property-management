import { IconPlus } from "./icons";

export default function EmptyState({ icon: Icon, title, description, actionLabel }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface px-6 py-24 text-center">
      {Icon && (
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-subtle text-ink-muted">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-ink-secondary">{description}</p>
      )}
      {actionLabel && (
        <button
          type="button"
          disabled
          title="Coming soon"
          className="mt-6 inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink opacity-40"
        >
          <IconPlus className="h-4 w-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
