export default function PageHeader({ title, description }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      {description && <p className="mt-1.5 text-sm text-ink-secondary">{description}</p>}
    </div>
  );
}
