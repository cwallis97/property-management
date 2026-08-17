import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import { IconTruck } from "../components/icons";

export default function Vendors() {
  return (
    <div>
      <PageHeader
        title="Vendors"
        description="Contractors and service providers you work with."
      />
      <EmptyState
        icon={IconTruck}
        title="No vendors yet"
        description="Vendors you add can be linked to work orders and assets for faster dispatch and history tracking."
        actionLabel="Add Vendor"
      />
    </div>
  );
}
