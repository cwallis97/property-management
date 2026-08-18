export default function SectionSpinner() {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
    </div>
  );
}
