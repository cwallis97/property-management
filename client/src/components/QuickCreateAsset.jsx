import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePropertyScope } from "../context/PropertyScopeContext";
import { getProperties, getLocations } from "../utils/api";
import CreateAssetModal from "./CreateAssetModal";
import QuickCreatePropertyStep from "./QuickCreatePropertyStep";
import QuickCreateSheet from "./QuickCreateSheet";
import SectionSpinner from "./SectionSpinner";
import EmptyState from "./EmptyState";
import { IconAlertTriangle } from "./icons";

// Global "New → Asset". Same Property-resolution flow as
// QuickCreateWorkOrder (scope default, explicit picker for All Properties
// or "Change"), then loads that Property's Locations and hands the
// UNCHANGED CreateAssetModal the props PropertyDetail already passes it.
export default function QuickCreateAsset({ onClose }) {
  const navigate = useNavigate();
  const { propertyId: scopePropertyId } = usePropertyScope();

  const [properties, setProperties] = useState([]);
  const [propertiesStatus, setPropertiesStatus] = useState("loading");
  const [targetId, setTargetId] = useState(scopePropertyId ?? null);
  const [picking, setPicking] = useState(!scopePropertyId);

  const loadProperties = useCallback(() => {
    setPropertiesStatus("loading");
    getProperties()
      .then((rows) => {
        setProperties(rows);
        setPropertiesStatus("ready");
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

  const [ctx, setCtx] = useState({ status: "idle", locations: [] });
  useEffect(() => {
    if (!targetId || picking) return;
    let cancelled = false;
    setCtx({ status: "loading", locations: [] });
    getLocations(targetId)
      .then((locations) => {
        if (!cancelled) setCtx({ status: "ready", locations });
      })
      .catch(() => {
        if (!cancelled) setCtx({ status: "error", locations: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [targetId, picking]);

  const targetName = properties.find((p) => p.id === targetId)?.name ?? "";

  function handleCreated(created) {
    onClose();
    navigate(`/portfolio/${created.propertyId ?? targetId}/assets/${created.id}`);
  }

  if (picking) {
    return (
      <QuickCreatePropertyStep
        entityLabel="Asset"
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
      <QuickCreateSheet title="Add Asset" onClose={onClose}>
        <SectionSpinner />
      </QuickCreateSheet>
    );
  }

  if (ctx.status === "error") {
    return (
      <QuickCreateSheet title="Add Asset" onClose={onClose}>
        <EmptyState icon={IconAlertTriangle} title="Couldn't load this property" description="Something went wrong. Close and try again." />
      </QuickCreateSheet>
    );
  }

  return (
    <CreateAssetModal
      propertyId={targetId}
      locations={ctx.locations}
      propertyLabel={targetName || undefined}
      onChangeProperty={() => setPicking(true)}
      onClose={onClose}
      onCreated={handleCreated}
    />
  );
}
