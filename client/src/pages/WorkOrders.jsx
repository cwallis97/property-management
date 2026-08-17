import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import { IconWrench } from "../components/icons";

export default function WorkOrders() {
  return (
    <div>
      <PageHeader
        title="Work Orders"
        description="Maintenance requests and repair tasks across your portfolio."
      />
      <EmptyState
        icon={IconWrench}
        title="No work orders yet"
        description="Work orders raised against properties, locations, or assets will be tracked here from creation to completion."
        actionLabel="Create Work Order"
      />
    </div>
  );
}
