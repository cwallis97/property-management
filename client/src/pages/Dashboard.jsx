import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import SectionSpinner from "../components/SectionSpinner";
import { IconBuilding, IconAlertTriangle, IconWrench } from "../components/icons";
import { priorityBadge, statusBadge, statusLabel } from "../components/WorkOrderTable";
import { getDashboardSummary } from "../utils/api";
import { formatAge, isOverdue, needsAttention, compareByAttention, resolveWorkOrderContext } from "../utils/workOrders";

// Sensible cap so this stays a scannable exception list, not a second
// Work Orders table. Anything beyond this is still fully counted in the
// Pulse/Property Pressure numbers below — it just isn't rendered as a row.
const ATTENTION_LIMIT = 8;

// One divided stat cell inside a single shared strip, not its own bordered
// card — Portfolio Pulse is supporting context for Needs Attention above it,
// not a fourth competing block of "card soup."
function PulseStat({ label, value, accent }) {
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${accent ? "text-red-600" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState("loading"); // "loading" | "error" | "ready"
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    setStatus("loading");
    getDashboardSummary()
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Enriches each active work order (already filtered server-side) with the
  // same Location/Asset/overdue/attention logic used on PropertyDetail and
  // WorkOrderDetail, reused via utils/workOrders — never a second
  // definition of "overdue" or "needs attention".
  const rows = useMemo(() => {
    if (!summary) return [];
    const propertyById = new Map(summary.properties.map((p) => [p.id, p]));

    return summary.workOrders.map((wo) => {
      const { locationLabel, assetLabel } = resolveWorkOrderContext(wo, summary.locations, summary.assets);
      return {
        id: wo.id,
        propertyId: wo.propertyId,
        propertyName: propertyById.get(wo.propertyId)?.name ?? "—",
        title: wo.title,
        status: wo.status,
        priority: wo.priority,
        overdue: isOverdue(wo),
        needsAttention: needsAttention(wo),
        locationLabel,
        assetLabel,
        ageLabel: formatAge(new Date() - new Date(wo.createdAt)),
        createdAtMs: new Date(wo.createdAt).getTime(),
      };
    });
  }, [summary]);

  const attentionRows = useMemo(() => rows.filter((r) => r.needsAttention).sort(compareByAttention), [rows]);
  const visibleAttentionRows = attentionRows.slice(0, ATTENTION_LIMIT);
  const hiddenAttentionCount = attentionRows.length - visibleAttentionRows.length;

  const overdueCount = rows.filter((r) => r.overdue).length;
  const criticalAssetCount = summary ? summary.assets.filter((a) => a.status === "critical").length : 0;
  const needsAttentionAssetCount = summary ? summary.assets.filter((a) => a.status === "needs-attention").length : 0;

  // Property Pressure: deterministic precedence — urgent+overdue, then
  // urgent, then overdue, then critical assets, then needs-attention
  // assets, then active work order volume. No score, just facts, sorted.
  const propertyPressure = useMemo(() => {
    if (!summary) return [];

    const rowsByProperty = new Map();
    for (const row of rows) {
      if (!rowsByProperty.has(row.propertyId)) rowsByProperty.set(row.propertyId, []);
      rowsByProperty.get(row.propertyId).push(row);
    }
    const assetsByProperty = new Map();
    for (const asset of summary.assets) {
      if (!assetsByProperty.has(asset.propertyId)) assetsByProperty.set(asset.propertyId, []);
      assetsByProperty.get(asset.propertyId).push(asset);
    }

    const list = summary.properties.map((property) => {
      const propertyRows = rowsByProperty.get(property.id) ?? [];
      const propertyAssets = assetsByProperty.get(property.id) ?? [];
      return {
        id: property.id,
        name: property.name,
        activeCount: propertyRows.length,
        urgentCount: propertyRows.filter((r) => r.priority === "urgent").length,
        overdueCount: propertyRows.filter((r) => r.overdue).length,
        urgentAndOverdueCount: propertyRows.filter((r) => r.priority === "urgent" && r.overdue).length,
        criticalAssetCount: propertyAssets.filter((a) => a.status === "critical").length,
        needsAttentionAssetCount: propertyAssets.filter((a) => a.status === "needs-attention").length,
      };
    });

    return list.sort(
      (a, b) =>
        b.urgentAndOverdueCount - a.urgentAndOverdueCount ||
        b.urgentCount - a.urgentCount ||
        b.overdueCount - a.overdueCount ||
        b.criticalAssetCount - a.criticalAssetCount ||
        b.needsAttentionAssetCount - a.needsAttentionAssetCount ||
        b.activeCount - a.activeCount
    );
  }, [summary, rows]);

  return (
    <div>
      <PageHeader title="Operations" description="What needs attention across your portfolio right now." />

      {status === "loading" && <SectionSpinner />}

      {status === "error" && (
        <EmptyState
          icon={IconAlertTriangle}
          title="Couldn't load your dashboard"
          description={error || "Something went wrong. Please try again."}
        />
      )}

      {status === "ready" && summary.properties.length === 0 && (
        <EmptyState
          icon={IconBuilding}
          title="No properties yet"
          description="Properties added to your company will show up here."
        />
      )}

      {status === "ready" && summary.properties.length > 0 && (
        <div className="space-y-10">
          <div>
            <div className="mb-3 flex items-center gap-2.5">
              <h2 className="text-lg font-semibold tracking-tight text-gray-900">Needs Attention</h2>
              {attentionRows.length > 0 && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 ring-1 ring-inset ring-red-100">
                  {attentionRows.length}
                </span>
              )}
            </div>

            {attentionRows.length === 0 ? (
              <EmptyState
                icon={IconWrench}
                title="No urgent or overdue Work Orders"
                description="Your portfolio is calm right now."
              />
            ) : (
              <>
                <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
                  {visibleAttentionRows.map((row) => (
                    <Link
                      key={row.id}
                      to={`/portfolio/${row.propertyId}/work-orders/${row.id}`}
                      state={{ backLabel: "Dashboard", backTo: "/dashboard" }}
                      className="block px-5 py-4 transition hover:bg-gray-50"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{row.title}</p>
                          <p className="truncate text-xs text-gray-500">
                            {row.propertyName}
                            {row.locationLabel && ` · ${row.locationLabel}`}
                            {row.assetLabel && ` · ${row.assetLabel}`}
                          </p>
                          <p className="mt-1 text-xs text-gray-400">Reported {row.ageLabel} ago</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                              priorityBadge[row.priority] || "bg-gray-50 text-gray-500"
                            }`}
                          >
                            {row.priority}
                          </span>
                          {row.overdue && (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-600 ring-1 ring-inset ring-red-100">
                              Overdue
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                              statusBadge[row.status] || "bg-gray-50 text-gray-500"
                            }`}
                          >
                            {statusLabel[row.status] || row.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                {hiddenAttentionCount > 0 && (
                  <p className="mt-2 text-xs text-gray-400">
                    +{hiddenAttentionCount} more across your portfolio — open a property to see all its Work Orders.
                  </p>
                )}
              </>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Portfolio Pulse</p>
            <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white sm:grid-cols-5 sm:divide-y-0">
              <PulseStat label="Active Work Orders" value={rows.length} />
              <PulseStat label="Needs Attention" value={attentionRows.length} accent={attentionRows.length > 0} />
              <PulseStat label="Overdue" value={overdueCount} accent={overdueCount > 0} />
              <PulseStat label="Critical Assets" value={criticalAssetCount} accent={criticalAssetCount > 0} />
              <PulseStat label="Assets Needing Attention" value={needsAttentionAssetCount} />
            </div>
          </div>

          <div>
            <h2 className="mb-1 text-base font-semibold text-gray-900">Property Pressure</h2>
            <p className="mb-3 text-xs text-gray-400">Open a property to investigate further.</p>
            <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
              {propertyPressure.map((property) => (
                <Link
                  key={property.id}
                  to={`/portfolio/${property.id}`}
                  className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-4 transition hover:bg-gray-50 ${
                    property.urgentAndOverdueCount > 0 ? "border-l-2 border-l-red-400" : ""
                  }`}
                >
                  <p className="truncate text-sm font-medium text-gray-900">{property.name}</p>
                  <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {property.activeCount > 0 ? (
                      <span className="text-gray-500">{property.activeCount} active</span>
                    ) : (
                      <span className="text-gray-400">No active Work Orders</span>
                    )}
                    {property.urgentCount > 0 && (
                      <span className="font-medium text-red-600">{property.urgentCount} urgent</span>
                    )}
                    {property.overdueCount > 0 && (
                      <span className="font-medium text-amber-700">{property.overdueCount} overdue</span>
                    )}
                    {property.criticalAssetCount > 0 && (
                      <span className="font-medium text-red-600">
                        {property.criticalAssetCount} critical asset{property.criticalAssetCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
