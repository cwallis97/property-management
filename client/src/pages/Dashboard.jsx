import PageHeader from "../components/PageHeader";
import {
  IconBuilding,
  IconBox,
  IconWrench,
  IconAlertTriangle,
  IconActivity,
} from "../components/icons";
import { metrics, recentActivity, criticalAssets } from "../mock/dashboard";

const metricIcons = {
  properties: IconBuilding,
  assets: IconBox,
  workOrders: IconWrench,
  criticalAssets: IconAlertTriangle,
};

const trendStyles = {
  up: "text-emerald-600",
  down: "text-emerald-600",
  alert: "text-amber-600",
};

const activityDot = {
  workOrder: "bg-blue-500",
  vendor: "bg-purple-500",
  document: "bg-gray-400",
  asset: "bg-amber-500",
};

const severityBadge = {
  high: "bg-red-50 text-red-600 ring-1 ring-inset ring-red-100",
  medium: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100",
};

export default function Dashboard() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Welcome back — here's what's happening across your portfolio."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metricIcons[metric.key];
          return (
            <div
              key={metric.key}
              className="rounded-2xl border border-gray-200 bg-white p-5"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500">
                  {metric.label}
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
              </div>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-gray-900">
                {metric.value}
              </p>
              <p className={`mt-1.5 text-xs font-medium ${trendStyles[metric.trend]}`}>
                {metric.delta}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 lg:col-span-2">
          <div className="mb-5 flex items-center gap-2">
            <IconActivity className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
          </div>
          <ul className="space-y-5">
            {recentActivity.map((item) => (
              <li key={item.id} className="flex gap-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    activityDot[item.type] || "bg-gray-300"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  <p className="truncate text-xs text-gray-500">{item.subtitle}</p>
                </div>
                <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-gray-400">
                  {item.time}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="mb-5 flex items-center gap-2">
            <IconAlertTriangle className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Critical Assets</h2>
          </div>
          <ul className="space-y-4">
            {criticalAssets.map((asset) => (
              <li key={asset.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {asset.name}
                  </p>
                  <p className="truncate text-xs text-gray-500">{asset.property}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                    severityBadge[asset.severity]
                  }`}
                >
                  {asset.severity}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
