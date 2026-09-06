import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconPlus, IconWrench, IconBox, IconFolder, IconTruck, IconBuilding } from "./icons";
import { useAuth } from "../context/AuthContext";
import { CAPABILITIES } from "../utils/capabilities";
import Portal from "./Portal";
import CreateVendorModal from "./CreateVendorModal";
import CreatePropertyModal from "./CreatePropertyModal";
import AddDocumentModal from "./AddDocumentModal";
import QuickCreateWorkOrder from "./QuickCreateWorkOrder";
import QuickCreateAsset from "./QuickCreateAsset";

// Ordered operational/high-frequency first (Work Order, Asset), then
// Document (frequent), then the rarer setup actions (Vendor, Property).
// Each item is shown only when the caller holds the exact capability the
// underlying create endpoint enforces server-side — the menu never shows a
// disabled option, and Technician (who holds no create capability) gets no
// launcher at all.
const ITEMS = [
  { key: "work_order", label: "Work Order", description: "Create and assign maintenance work", icon: IconWrench, capability: CAPABILITIES.WORK_ORDER_CREATE },
  { key: "asset", label: "Asset", description: "Add equipment or infrastructure", icon: IconBox, capability: CAPABILITIES.ASSET_CREATE },
  { key: "document", label: "Document", description: "Upload an operational file", icon: IconFolder, capability: CAPABILITIES.DOCUMENT_MANAGE },
  { key: "vendor", label: "Vendor", description: "Add a service provider", icon: IconTruck, capability: CAPABILITIES.VENDOR_CREATE },
  { key: "property", label: "Property", description: "Add a property — Owner/Admin only", icon: IconBuilding, capability: CAPABILITIES.PROPERTY_CREATE },
];

export default function QuickCreate() {
  const navigate = useNavigate();
  const { hasCapability } = useAuth();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [flow, setFlow] = useState(null); // null | one of ITEMS[].key

  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const items = useMemo(() => ITEMS.filter((i) => hasCapability(i.capability)), [hasCapability]);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open && activeIndex >= 0) {
      menuRef.current?.querySelector(`#quick-create-item-${activeIndex}`)?.focus();
    }
  }, [open, activeIndex]);

  // Caller must hold at least one create capability, or there is no button.
  if (items.length === 0) return null;

  function choose(key) {
    setOpen(false);
    setActiveIndex(-1);
    setFlow(key);
  }

  function closeFlow() {
    setFlow(null);
    buttonRef.current?.focus();
  }

  function onButtonKeyDown(e) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex(0);
    }
  }

  function onMenuKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      buttonRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(items.length - 1);
    }
  }

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setActiveIndex(-1);
          }}
          onKeyDown={onButtonKeyDown}
          aria-haspopup="menu"
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle hover:text-ink"
        >
          <IconPlus className="h-4 w-4" />
          New
        </button>

        {open && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Create new"
            onKeyDown={onMenuKeyDown}
            className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
          >
            {items.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  id={`quick-create-item-${index}`}
                  type="button"
                  role="menuitem"
                  tabIndex={activeIndex === index ? 0 : -1}
                  onClick={() => choose(item.key)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition ${
                    activeIndex === index ? "bg-surface-subtle" : "hover:bg-surface-subtle"
                  } focus:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-subtle text-ink-secondary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{item.label}</span>
                    <span className="block truncate text-xs text-ink-muted">{item.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* One shared modal layer for every Quick Create flow — portaled to
          <body> so it escapes the sticky, backdrop-blurred Header's
          containing block and stacking context. The Create* modals'
          existing `fixed inset-0 z-30` chrome is unchanged; the portal is
          what makes it resolve to the real viewport. */}
      {flow && (
        <Portal>
          {flow === "work_order" && <QuickCreateWorkOrder onClose={closeFlow} />}
          {flow === "asset" && <QuickCreateAsset onClose={closeFlow} />}
          {flow === "vendor" && (
            <CreateVendorModal
              onClose={closeFlow}
              onCreated={(created) => {
                setFlow(null);
                navigate(`/vendors/${created.id}`);
              }}
            />
          )}
          {flow === "property" && (
            <CreatePropertyModal
              onClose={closeFlow}
              onCreated={(created) => {
                setFlow(null);
                navigate(`/portfolio/${created.id}`);
              }}
            />
          )}
          {flow === "document" && (
            // Existing global attachment picker (Property/Asset/Work Order/
            // Vendor), which already preselects the current Property Scope
            // for the Property target. On success just close and stay put —
            // Quick Create's job is to let the user act without losing
            // where they were, and there is no toast system in V1.
            <AddDocumentModal attachment={null} onClose={closeFlow} onCreated={closeFlow} />
          )}
        </Portal>
      )}
    </>
  );
}
