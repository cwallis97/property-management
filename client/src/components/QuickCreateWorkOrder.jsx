import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePropertyScope } from "../context/PropertyScopeContext";
import { getProperties, getLocations, getAssets } from "../utils/api";
import CreateWorkOrderModal from "./CreateWorkOrderModal";
import QuickCreatePropertyStep from "./QuickCreatePropertyStep";
import QuickCreateSheet from "./QuickCreateSheet";
import SectionSpinner from "./SectionSpinner";
import EmptyState from "./EmptyState";
import { IconAlertTriangle } from "./icons";

// Global "New → Work Order". Resolves the target Property (from the current
// Property Scope by default; an explicit picker when scope is All
// Properties, or whenever the user hits "Change" in the form), loads that
// Property's Locations/Assets, then hands the UNCHANGED CreateWorkOrderModal
// exactly the props PropertyDetail already passes it. The chosen Property
// affects this create only — global Property Scope is never mutated here.
export default function QuickCreateWorkOrder({ onClose }) {
  const navigate = useNavigate();
  const { propertyId: scopePropertyId } = usePropertyScope();

  const [properties, setProperties] = useState([]);
  const [propertiesStatus, setPropertiesStatus] = useState("loading"); // loading | ready | error
  const [targetId, setTargetId] = useState(scopePropertyId ?? null);
  const [picking, setPicking] = useState(!scopePropertyId);

  const loadProperties = useCallback(() => {
    setPropertiesStatus("loading");
    getProperties()
      .then((rows) => {
        setProperties(rows);
        setPropertiesStatus("ready");
        // Scope points at a Property that isn't in the accessible + active
        // list any more (archived, or access revoked) — fall back to the
        // picker rather than trying to create against it.
        setTargetId((current) => {
          if (current && !rows.some((r) => r.id === current)) {
            setPicking(true);
            return null;
          }
          return current;
        });
      })
      .catch(() => setPropertiesStatus("error"));
  }, []);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  const [ctx, setCtx] = useState({ status: "idle", locations: [], assets: [] }); // idle | loading | ready | error
  useEffect(() => {
    if (!targetId || picking) return;
    let cancelled = false;
    setCtx({ status: "loading", locations: [], assets: [] });
    Promise.all([getLocations(targetId), getAssets(targetId)])
      .then(([locations, assets]) => {
        if (!cancelled) setCtx({ status: "ready", locations, assets });
      })
      .catch(() => {
        if (!cancelled) setCtx({ status: "error", locations: [], assets: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [targetId, picking]);

  const targetName = properties.find((p) => p.id === targetId)?.name ?? "";

  function handleCreated(created) {
    onClose();
    navigate(`/portfolio/${created.propertyId ?? targetId}/work-orders/${created.id}`);
  }

  if (picking) {
    return (
      <QuickCreatePropertyStep
        entityLabel="Work Order"
        properties={properties}
        status={propertiesStatus}
        selectedId={targetId}
        onSelect={(id) => {
          setTargetId(id);
          setPicking(false);
        }}
        onBack={targetId ? () => setPicking(false) : null}
        onRetry={loadProperties}
        onClose={onClose}
      />
    );
  }

  if (ctx.status === "loading" || ctx.status === "idle") {
    return (
      <QuickCreateSheet title="Create Work Order" onClose={onClose}>
        <SectionSpinner />
      </QuickCreateSheet>
    );
  }

  if (ctx.status === "error") {
    return (
      <QuickCreateSheet title="Create Work Order" onClose={onClose}>
        <EmptyState icon={IconAlertTriangle} title="Couldn't load this property" description="Something went wrong. Close and try again." />
      </QuickCreateSheet>
    );
  }

  return (
    <CreateWorkOrderModal
      propertyId={targetId}
      locations={ctx.locations}
      assets={ctx.assets}
      propertyLabel={targetName || undefined}
      onChangeProperty={() => setPicking(true)}
      onClose={onClose}
      onCreated={handleCreated}
    />
  );
}
