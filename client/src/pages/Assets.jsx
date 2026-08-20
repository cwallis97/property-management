import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import SectionSpinner from "../components/SectionSpinner";
import SearchableSelect from "../components/SearchableSelect";
import AssetTable from "../components/AssetTable";
import { IconAlertTriangle, IconBox } from "../components/icons";
import { getPortfolioAssets, getProperties } from "../utils/api";
import { usePropertyScope } from "../context/PropertyScopeContext";

const VIEWS = [
  { value: "all", label: "All" },
  { value: "needs-attention", label: "Needs Attention" },
  { value: "critical", label: "Critical" },
];

// Same segmented-control visual language as WorkOrderViewFilter, kept as
// its own small local control rather than generalizing that component —
// Asset condition (All/Needs Attention/Critical) is a different value set
// from Work Orders' Active/Completed/All, not a variant of the same idea.
function AssetViewFilter({ value, onChange }) {
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

// Portfolio-wide: "what physical assets do we have across our properties,
// where are they, and which need attention?" This page is for finding the
// physical thing — Asset Detail (opened by clicking a row) is for
// understanding it.
export default function Assets() {
  const location = useLocation();
  const navigate = useNavigate();
  const restored = location.state?.portfolioAssetsState ?? null;
  // Explicit return-to-origin state wins if present (unchanged); otherwise
  // this page's filter starts wherever the app's current Property scope is.
  // After this initial mount the filter is fully independent local state —
  // changing it here never writes back to global scope.
  const { propertyId: scopePropertyId } = usePropertyScope();

  const [view, setView] = useState(restored?.view ?? "all");
  const [propertyFilterId, setPropertyFilterId] = useState(restored?.propertyId ?? scopePropertyId ?? null);

  const [properties, setProperties] = useState([]);
  useEffect(() => {
    getProperties()
      .then(setProperties)
      .catch(() => {
        // The property filter just won't populate — the list itself still
        // works unfiltered.
      });
  }, []);

  const [assets, setAssets] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | error | ready

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getPortfolioAssets()
      .then((data) => {
        if (cancelled) return;
        setAssets(data);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Same Where-resolution rule as PropertyDetail's own assetRows: no
  // Location means the asset is Property-level, not missing data.
  const assetRows = useMemo(
    () =>
      assets.map((a) => ({
        id: a.id,
        propertyId: a.propertyId,
        propertyName: a.property?.name ?? "—",
        name: a.name,
        category: a.category || "—",
        status: a.status,
        locationPath: !a.locationId ? "Property-level" : a.location ? a.location.name : "—",
      })),
    [assets]
  );

  const visibleRows = useMemo(() => {
    let rows = propertyFilterId ? assetRows.filter((row) => row.propertyId === propertyFilterId) : assetRows;
    if (view === "needs-attention") rows = rows.filter((row) => row.status === "needs-attention");
    else if (view === "critical") rows = rows.filter((row) => row.status === "critical");
    return rows;
  }, [assetRows, propertyFilterId, view]);

  const propertyOptions = useMemo(() => {
    const options = [{ value: null, label: "All Properties", sublabel: null }];
    for (const p of properties) options.push({ value: p.id, label: p.name, sublabel: null });
    return options;
  }, [properties]);

  const portfolioAssetsState = { view, propertyId: propertyFilterId };

  return (
    <div>
      <PageHeader title="Assets" description="Track equipment and physical assets across every property and location." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <AssetViewFilter value={view} onChange={setView} />
        <div className="w-56">
          <SearchableSelect
            value={propertyFilterId}
            onChange={setPropertyFilterId}
            options={propertyOptions}
            placeholder="All Properties"
          />
        </div>
      </div>

      {status === "loading" && <SectionSpinner />}

      {status === "error" && (
        <EmptyState
          icon={IconAlertTriangle}
          title="Couldn't load Assets"
          description="Something went wrong. Please try again."
        />
      )}

      {status === "ready" && assets.length === 0 && (
        <EmptyState
          icon={IconBox}
          title="No assets yet"
          description="Once properties and locations are set up, assets tracked within them will show up here."
        />
      )}

      {status === "ready" && assets.length > 0 && visibleRows.length === 0 && (
        <EmptyState
          icon={IconBox}
          title={view === "all" ? "No assets match this filter" : "Nothing here right now"}
          description="Adjust the property filter or condition view above."
        />
      )}

      {status === "ready" && visibleRows.length > 0 && (
        <AssetTable
          rows={visibleRows}
          showPropertyContext
          onRowClick={(id) => {
            const row = visibleRows.find((r) => r.id === id);
            if (!row) return;
            navigate(`/portfolio/${row.propertyId}/assets/${id}`, {
              state: {
                backLabel: "Assets",
                backTo: "/assets",
                backTabState: { portfolioAssetsState },
              },
            });
          }}
        />
      )}
    </div>
  );
}
