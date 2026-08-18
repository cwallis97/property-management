import { useEffect, useState } from "react";
import { getSitePlanFileBlob } from "./api";

// Fetches an uploaded SitePlan's actual file bytes as an object URL, only
// once site plan metadata (id, mimeType) is known — the file itself can be
// several MB, so there's no reason to download it before something needs
// to render it. Shared by the full Map tab and the Create Work Order
// modal's "Mark Location on Map" step so neither duplicates this fetch/
// cleanup logic.
export function useSitePlanFile(propertyId, sitePlan) {
  const [status, setStatus] = useState("idle"); // idle | loading | error | ready
  const [fileUrl, setFileUrl] = useState(null);
  const [fileObjectType, setFileObjectType] = useState(null); // "image" | "pdf"

  useEffect(() => {
    if (!sitePlan) {
      setStatus("idle");
      setFileUrl(null);
      setFileObjectType(null);
      return;
    }

    let cancelled = false;
    let objectUrl = null;

    setStatus("loading");
    getSitePlanFileBlob(propertyId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setFileUrl(objectUrl);
        setFileObjectType(sitePlan.mimeType === "application/pdf" ? "pdf" : "image");
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // sitePlan.id changes whenever a new plan is uploaded/replaced, which is
    // exactly when the old blob becomes stale and needs refetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, sitePlan?.id]);

  return { status, fileUrl, fileObjectType };
}
