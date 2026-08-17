import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import { IconSettings } from "../components/icons";

export default function Settings() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your organization, team, and account preferences."
      />
      <EmptyState
        icon={IconSettings}
        title="Settings are coming soon"
        description="Organization details, team members, and preferences will be configurable from here."
      />
    </div>
  );
}
