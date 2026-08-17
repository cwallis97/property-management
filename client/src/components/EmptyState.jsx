import { IconPlus } from "./icons";

export default function EmptyState({ icon: Icon, title, description, actionLabel }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-24 text-center">
      {Icon && (
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 text-gray-400">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-gray-500">{description}</p>
      )}
      {actionLabel && (
        <button
          type="button"
          disabled
          title="Coming soon"
          className="mt-6 inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white opacity-40"
        >
          <IconPlus className="h-4 w-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
