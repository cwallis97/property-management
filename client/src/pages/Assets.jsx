import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import { IconBox } from "../components/icons";

export default function Assets() {
  return (
    <div>
      <PageHeader
        title="Assets"
        description="Track equipment and physical assets across every property and location."
      />
      <EmptyState
        icon={IconBox}
        title="No assets yet"
        description="Once properties and locations are set up, assets tracked within them will show up here."
        actionLabel="Add Asset"
      />
    </div>
  );
}
