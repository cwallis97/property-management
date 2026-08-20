import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import SectionSpinner from "../components/SectionSpinner";
import VendorTable from "../components/VendorTable";
import CreateVendorModal from "../components/CreateVendorModal";
import { IconAlertTriangle, IconTruck, IconPlus } from "../components/icons";
import { getVendors } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { CAPABILITIES } from "../utils/capabilities";

const VIEWS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "all", label: "All" },
];

// Same segmented-control visual language as WorkOrderViewFilter/
// AssetViewFilter, kept as its own small local control — Vendor's
// Active/Inactive/All is its own value set, not a variant of either.
function VendorViewFilter({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
      {VIEWS.map((view) => (
        <button
          key={view.value}
          type="button"
          onClick={() => onChange(view.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            value === view.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}

// "Find the Vendor -> open Vendor Detail." Portfolio-wide, Company-scoped
// (a Vendor isn't owned by any one Property), so there's no Property
// filter here — unlike Portfolio Work Orders/Assets.
export default function Vendors() {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasCapability } = useAuth();
  const restored = location.state?.portfolioVendorsState ?? null;

  const [view, setView] = useState(restored?.view ?? "active");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [vendors, setVendors] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | error | ready

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getVendors()
      .then((data) => {
        if (cancelled) return;
        setVendors(data);
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

  const visibleRows = useMemo(() => {
    if (view === "all") return vendors;
    return vendors.filter((v) => v.status === view);
  }, [vendors, view]);

  const portfolioVendorsState = { view };

  return (
    <div>
      <PageHeader title="Vendors" description="Contractors and service providers you work with." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <VendorViewFilter value={view} onChange={setView} />
        {hasCapability(CAPABILITIES.VENDOR_CREATE) && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            <IconPlus className="h-4 w-4" />
            Add Vendor
          </button>
        )}
      </div>

      {status === "loading" && <SectionSpinner />}

      {status === "error" && (
        <EmptyState
          icon={IconAlertTriangle}
          title="Couldn't load Vendors"
          description="Something went wrong. Please try again."
        />
      )}

      {status === "ready" && vendors.length === 0 && (
        <EmptyState
          icon={IconTruck}
          title="No vendors yet"
          description="Vendors you add can be linked to work orders for maintenance and spend history."
        />
      )}

      {status === "ready" && vendors.length > 0 && visibleRows.length === 0 && (
        <EmptyState icon={IconTruck} title="Nothing here right now" description="Adjust the filter above." />
      )}

      {status === "ready" && visibleRows.length > 0 && (
        <VendorTable
          rows={visibleRows}
          onRowClick={(id) =>
            navigate(`/vendors/${id}`, {
              state: {
                backLabel: "Vendors",
                backTo: "/vendors",
                backTabState: { portfolioVendorsState },
              },
            })
          }
        />
      )}

      {showCreateModal && (
        <CreateVendorModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(created) => {
            setVendors((prev) => [...prev, created]);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}
