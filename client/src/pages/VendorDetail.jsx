import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import EmptyState from "../components/EmptyState";
import SectionSpinner from "../components/SectionSpinner";
import { IconAlertTriangle, IconArrowLeft, IconTruck } from "../components/icons";
import { statusBadge as woStatusBadge, statusLabel } from "../components/WorkOrderTable";
import { statusBadge as vendorStatusBadge } from "../components/VendorTable";
import EntityDocuments from "../components/EntityDocuments";
import { categoryLabel } from "../utils/workOrders";
import { getVendor } from "../utils/api";

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatShortDate(value) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function BackLink({ to, state, label }) {
  return (
    <Link to={to} state={state} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-secondary transition hover:text-ink">
      <IconArrowLeft className="h-4 w-4" />
      Back to {label}
    </Link>
  );
}

function fallbackBackTarget() {
  return { backLabel: "Vendors", backTo: "/vendors", backTabState: { portfolioVendorsState: { view: "active" } } };
}

function Stat({ label, value, accent }) {
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${accent ? "text-red-600 dark:text-red-400" : "text-ink"}`}>{value}</p>
    </div>
  );
}

// The Vendor's own story: who they are, how to reach them, and their real
// operational history — Properties Worked, Work Orders, and Actual Vendor
// Spend are all derived fresh from real WorkOrderVendor participation and
// WorkOrderCostEntry attribution, never stored on the Vendor itself.
export default function VendorDetail() {
  const { vendorId } = useParams();
  const location = useLocation();

  const { backLabel, backTo, backTabState } = location.state?.backTo ? location.state : fallbackBackTarget();

  const [vendor, setVendor] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | error | not-found | ready
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getVendor(vendorId)
      .then((data) => {
        if (cancelled) return;
        setVendor(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 404) setStatus("not-found");
        else {
          setError(err.message);
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  if (status === "loading") {
    return (
      <div>
        <BackLink to={backTo} state={backTabState} label={backLabel} />
        <SectionSpinner />
      </div>
    );
  }

  if (status === "not-found") {
    return (
      <div>
        <BackLink to={backTo} state={backTabState} label={backLabel} />
        <EmptyState icon={IconTruck} title="Vendor not found" description="This vendor may have been removed, or the link is out of date." />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div>
        <BackLink to={backTo} state={backTabState} label={backLabel} />
        <EmptyState
          icon={IconAlertTriangle}
          title="Couldn't load this vendor"
          description={error || "Something went wrong while loading this vendor. Please try again."}
        />
      </div>
    );
  }

  return (
    <div>
      <BackLink to={backTo} state={backTabState} label={backLabel} />

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{vendor.name}</h1>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
              vendorStatusBadge[vendor.status] || "bg-surface-subtle text-ink-secondary ring-1 ring-inset ring-line"
            }`}
          >
            {vendor.status}
          </span>
        </div>
        {vendor.category && <p className="mt-1 text-sm text-ink-secondary">{vendor.category}</p>}

        {(vendor.contactName || vendor.phone || vendor.email) && (
          <p className="mt-2 text-sm text-ink-secondary">
            {vendor.contactName}
            {vendor.contactName && (vendor.phone || vendor.email) && " · "}
            {vendor.phone}
            {vendor.phone && vendor.email && " · "}
            {vendor.email}
          </p>
        )}
      </div>

      <div className="mb-8 grid grid-cols-1 divide-x divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-4 sm:divide-y-0">
        <Stat label="Properties Worked" value={vendor.propertiesWorked.length} />
        <Stat label="Work Orders" value={vendor.workOrders.length} />
        <Stat label="Actual Vendor Spend" value={formatMoney(vendor.actualSpend)} />
        <Stat label="Most Recent Work" value={vendor.mostRecentWorkAt ? formatShortDate(vendor.mostRecentWorkAt) : "—"} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink">Work History</h2>
        {vendor.workOrders.length === 0 ? (
          <EmptyState
            icon={IconTruck}
            title="No work history yet"
            description="Work Orders this vendor is assigned to will appear here."
          />
        ) : (
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {vendor.workOrders.map((wo) => (
              <Link
                key={wo.id}
                to={`/portfolio/${wo.propertyId}/work-orders/${wo.id}`}
                state={{ backLabel: "Vendor", backTo: `/vendors/${vendorId}` }}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-4 transition hover:bg-surface-subtle"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{wo.title}</p>
                  <p className="truncate text-xs text-ink-secondary">
                    {wo.property?.name}
                    {wo.location && ` · ${wo.location.name}`}
                    {wo.category && ` · ${categoryLabel[wo.category] ?? wo.category}`}
                    {wo.workType && ` → ${wo.workType.label}`}
                    {" · "}
                    {wo.status === "completed" && wo.completedAt ? `Completed ${formatShortDate(wo.completedAt)}` : `Reported ${formatShortDate(wo.createdAt)}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      woStatusBadge[wo.status] || "bg-surface-subtle text-ink-secondary"
                    }`}
                  >
                    {statusLabel[wo.status] || wo.status}
                  </span>
                  <span className="w-20 text-right text-sm font-medium text-ink">
                    {wo.vendorSpend > 0 ? formatMoney(wo.vendorSpend) : <span className="font-normal text-ink-muted">—</span>}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <EntityDocuments attachment={{ vendorId }} />
      </div>
    </div>
  );
}
