import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import { IconFolder } from "../components/icons";

export default function Documents() {
  return (
    <div>
      <PageHeader
        title="Documents"
        description="Leases, warranties, inspection reports, and other property files."
      />
      <EmptyState
        icon={IconFolder}
        title="No documents yet"
        description="Upload leases, warranties, and reports to keep them attached to the right property, location, or asset."
        actionLabel="Upload Document"
      />
    </div>
  );
}
