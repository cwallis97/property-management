import { Link } from "react-router-dom";

// Generic operational-graph breadcrumb: Portfolio > Property > Location...
// > current item. Works from a plain list of { label, to?, state? } — it
// has no idea what a "Building," "Lot," or "Unit" is, so it renders
// identically deep or shallow, for any property shape. Only entries with a
// `to` (and that aren't the last/current entry) are links; everything else
// — including intermediate Location segments, which don't have their own
// route yet — renders as plain breadcrumb text.
export default function Breadcrumb({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={index} className="flex items-center gap-1.5">
            {index > 0 && <span className="text-gray-300">›</span>}
            {item.to && !isLast ? (
              <Link to={item.to} state={item.state} className="text-gray-500 transition hover:text-gray-900">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "font-medium text-gray-900" : "text-gray-500"}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
