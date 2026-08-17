import { useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import AssetTable from "../components/AssetTable";
import { IconBuilding, IconBox } from "../components/icons";
import { properties } from "../mock/properties";
import { locations } from "../mock/locations";
import { assets } from "../mock/assets";
import { buildAssetRows } from "../utils/hierarchy";

export default function PropertyDetail() {
  const { propertyId } = useParams();
  const property = properties.find((p) => String(p.id) === propertyId);

  if (!property) {
    return (
      <div>
        <PageHeader title="Property" description="Property details will appear here." />
        <EmptyState
          icon={IconBuilding}
          title="Property not found"
          description="This property may have been removed, or the link is out of date."
        />
      </div>
    );
  }

  const assetRows = buildAssetRows(property.id, { locations, assets });

  return (
    <div>
      <PageHeader
        title={property.name}
        description={`${property.type} — ${property.address}`}
      />

      {assetRows.length === 0 ? (
        <EmptyState
          icon={IconBox}
          title="No assets yet"
          description="Assets added to this property's locations will show up here."
        />
      ) : (
        <AssetTable rows={assetRows} />
      )}
    </div>
  );
}
