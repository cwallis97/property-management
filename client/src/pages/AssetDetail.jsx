import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import EmptyState from "../components/EmptyState";
import SectionSpinner from "../components/SectionSpinner";
import EditAssetModal from "../components/EditAssetModal";
import { IconAlertTriangle, IconArrowLeft, IconWrench } from "../components/icons";
import { priorityBadge, statusBadge as woStatusBadge, statusLabel } from "../components/WorkOrderTable";
import { statusBadge as assetStatusBadge } from "../components/AssetTable";
import EntityDocuments from "../components/EntityDocuments";
import { formatAge, isOverdue, ACTIVE_WORK_ORDER_STATUSES, categoryLabel } from "../utils/workOrders";
import { getAsset } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { CAPABILITIES } from "../utils/capabilities";

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatShortDate(value) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function BackLink({ to, state, label }) {
  return (
    <Link to={to} state={state} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-900">
      <IconArrowLeft className="h-4 w-4" />
      Back to {label}
    </Link>
  );
}

// Direct URL / refresh / any origin that didn't pass explicit state falls
// back here — the property's own Assets tab, since propertyId is always
// known from the route regardless of how this page was reached.
function fallbackBackTarget(propertyId) {
  return { backLabel: "Assets", backTo: `/portfolio/${propertyId}`, backTabState: { tab: "assets" } };
}

function Stat({ label, value, accent }) {
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${accent ? "text-red-600" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

// The Asset's own story: what it is, where it is, what's happening to it
// now, and what's happened to it before — all read directly off the same
// Work Orders and Cost Entries used everywhere else in PropertyOS. Nothing
// here is a second copy of that history or that spend; Lifetime
// Maintenance Spend and every history row's cost are computed fresh by the
// backend from real Cost Entries, never stored on the Asset itself.
export default function AssetDetail() {
  const { propertyId, assetId } = useParams();
  const location = useLocation();
  const { hasCapability } = useAuth();

  // Same return-to-origin navigation as WorkOrderDetail: whoever linked
  // here (Property's Assets tab, eventually Portfolio Assets, or a Work
  // Order's Asset link) passes where "back" should go via router state —
  // never browser history.
  const { backLabel, backTo, backTabState } = location.state?.backTo
    ? location.state
    : fallbackBackTarget(propertyId);

  const [asset, setAsset] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | error | not-found | ready
  const [error, setError] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getAsset(assetId)
      .then((data) => {
        if (cancelled) return;
        setAsset(data);
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
  }, [assetId]);

  // updateAsset's response is the bare Asset row, not this page's enriched
  // shape (property/location/workOrders/lifetimeSpend) — refetching after a
  // successful save is the simplest way to get a fully consistent view back,
  // rather than hand-merging a partial response into existing state.
  function handleUpdated() {
    setShowEditModal(false);
    getAsset(assetId).then(setAsset);
  }

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
        <EmptyState
          icon={IconWrench}
          title="Asset not found"
          description="This asset may have been archived, or the link is out of date."
        />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div>
        <BackLink to={backTo} state={backTabState} label={backLabel} />
        <EmptyState
          icon={IconAlertTriangle}
          title="Couldn't load this asset"
          description={error || "Something went wrong while loading this asset. Please try again."}
        />
      </div>
    );
  }

  const activeWorkOrders = asset.workOrders.filter((wo) => ACTIVE_WORK_ORDER_STATUSES.includes(wo.status));
  const mostRecent = asset.workOrders[0] ?? null; // already sorted createdAt DESC by the backend

  // Every link from this page into a Work Order carries this Asset's own
  // URL as the Back target, so Back-from-WorkOrderDetail always returns
  // here — never further back to wherever THIS page was opened from.
  const workOrderLinkState = { backLabel: "Asset", backTo: `/portfolio/${propertyId}/assets/${assetId}` };

  return (
    <div>
      <BackLink to={backTo} state={backTabState} label={backLabel} />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{asset.name}</h1>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                assetStatusBadge[asset.status] || "bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-100"
              }`}
            >
              {asset.status.replace("-", " ")}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {asset.property?.name}
            {asset.location && ` · ${asset.location.name}`}
            {asset.category && ` · ${asset.category}`}
          </p>
        </div>
        {hasCapability(CAPABILITIES.ASSET_EDIT) && (
          <button
            type="button"
            onClick={() => setShowEditModal(true)}
            className="shrink-0 text-xs font-medium text-gray-500 transition hover:text-gray-900"
          >
            Edit Asset
          </button>
        )}
      </div>

      <div className="mb-8 grid grid-cols-1 divide-x divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white sm:grid-cols-3 sm:divide-y-0">
        <Stat label="Active Work Orders" value={activeWorkOrders.length} accent={activeWorkOrders.length > 0} />
        <Stat label="Lifetime Maintenance Spend" value={formatMoney(asset.lifetimeSpend)} />
        <Stat label="Most Recent Activity" value={mostRecent ? formatShortDate(mostRecent.createdAt) : "—"} />
      </div>

      {activeWorkOrders.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Current Work</h2>
          <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
            {activeWorkOrders.map((wo) => (
              <Link
                key={wo.id}
                to={`/portfolio/${propertyId}/work-orders/${wo.id}`}
                state={workOrderLinkState}
                className="block px-5 py-4 transition hover:bg-gray-50"
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{wo.title}</p>
                    <p className="mt-1 text-xs text-gray-400">{formatAge(new Date() - new Date(wo.createdAt))} ago</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                        priorityBadge[wo.priority] || "bg-gray-50 text-gray-500"
                      }`}
                    >
                      {wo.priority}
                    </span>
                    {isOverdue(wo) && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-600 ring-1 ring-inset ring-red-100">
                        Overdue
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                        woStatusBadge[wo.status] || "bg-gray-50 text-gray-500"
                      }`}
                    >
                      {statusLabel[wo.status] || wo.status}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Maintenance History</h2>
        {asset.workOrders.length === 0 ? (
          <EmptyState
            icon={IconWrench}
            title="No maintenance history yet"
            description="Work Orders raised against this asset will appear here."
          />
        ) : (
          <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
            {asset.workOrders.map((wo) => (
              <Link
                key={wo.id}
                to={`/portfolio/${propertyId}/work-orders/${wo.id}`}
                state={workOrderLinkState}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-4 transition hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{wo.title}</p>
                  <p className="truncate text-xs text-gray-500">
                    {wo.status === "completed" && wo.completedAt
                      ? `Completed ${formatShortDate(wo.completedAt)}`
                      : `Reported ${formatShortDate(wo.createdAt)}`}
                    {wo.category && ` · ${categoryLabel[wo.category] ?? wo.category}`}
                    {wo.workType && ` · ${wo.workType.label}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      woStatusBadge[wo.status] || "bg-gray-50 text-gray-500"
                    }`}
                  >
                    {statusLabel[wo.status] || wo.status}
                  </span>
                  <span className="w-20 text-right text-sm font-medium text-gray-900">
                    {wo.cost > 0 ? formatMoney(wo.cost) : <span className="font-normal text-gray-300">—</span>}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <EntityDocuments attachment={{ assetId }} />
      </div>

      {showEditModal && (
        <EditAssetModal asset={asset} onClose={() => setShowEditModal(false)} onUpdated={handleUpdated} />
      )}
    </div>
  );
}
