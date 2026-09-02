import { useEffect, useState } from "react";
import EmptyState from "./EmptyState";
import SectionSpinner from "./SectionSpinner";
import SearchableSelect from "./SearchableSelect";
import InviteUserModal from "./InviteUserModal";
import EditPropertyAccessModal from "./EditPropertyAccessModal";
import { IconAlertTriangle, IconTruck, IconPlus } from "./icons";
import { getMembers, updateMemberRole, getPendingInvites, revokeInvite, getProperties } from "../utils/api";
import { useAuth } from "../context/AuthContext";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin", sublabel: null },
  { value: "manager", label: "Manager", sublabel: null },
  { value: "technician", label: "Technician", sublabel: null },
];
const roleLabel = { owner: "Owner", admin: "Admin", manager: "Manager", technician: "Technician" };

function formatShortDate(value) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Company-level role management — what a member can DO, not which
// Properties they can see (that's a separate, not-yet-built milestone).
// Owner is shown but never editable here (no ownership transfer in V1,
// and the schema has no separate "primary owner" flag beyond the role
// itself — treating that role as immutable is the smallest rule that can
// never leave a Company without one). A signed-in Admin's own row is
// likewise read-only, so this page can never be used to accidentally lock
// yourself out of Settings mid-session.
export default function SettingsUsers({ focusUserId = null }) {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | error | ready
  const [pendingId, setPendingId] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const [invites, setInvites] = useState([]);
  const [invitesStatus, setInvitesStatus] = useState("loading"); // loading | error | ready
  const [revokingId, setRevokingId] = useState(null);

  // Only ever used for the "N of M Properties" access summary below —
  // includes archived Properties too, so the denominator always matches
  // what EditPropertyAccessModal's own picker shows.
  const [propertyCount, setPropertyCount] = useState(null);

  const [editingAccessMember, setEditingAccessMember] = useState(null);

  useEffect(() => {
    getProperties({ status: "all" })
      .then((data) => setPropertyCount(data.length))
      .catch(() => {
        // The "N of M" summary just won't show a denominator — access
        // itself is still fully manageable via the modal either way.
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    getMembers()
      .then((data) => {
        if (cancelled) return;
        setMembers(data);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setInvitesStatus("loading");
    getPendingInvites()
      .then((data) => {
        if (cancelled) return;
        setInvites(data);
        setInvitesStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setInvitesStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Arriving here from a Global Search "People" result — scroll that
  // member's row into view and briefly ring it so the match is obvious.
  useEffect(() => {
    if (!focusUserId || status !== "ready") return;
    const el = document.getElementById(`member-${focusUserId}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusUserId, status]);

  async function handleRoleChange(member, role) {
    setPendingId(member.membershipId);
    try {
      const updated = await updateMemberRole(member.membershipId, role);
      setMembers((prev) => prev.map((m) => (m.membershipId === updated.membershipId ? updated : m)));
    } catch (err) {
      window.alert(err.message || "Something went wrong. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  function handleAccessUpdated(updated) {
    setMembers((prev) => prev.map((m) => (m.membershipId === updated.membershipId ? updated : m)));
    setEditingAccessMember(null);
  }

  function handleInvited(invite) {
    // listPendingInvites' own shape (no token) — created's shape includes
    // the one-time token, which this list never needs to hold onto.
    const { token, companyName, ...rest } = invite;
    setInvites((prev) => [rest, ...prev]);
  }

  async function handleRevoke(invite) {
    if (!window.confirm(`Cancel the invitation to "${invite.email}"?`)) return;
    setRevokingId(invite.id);
    try {
      await revokeInvite(invite.id);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (err) {
      window.alert(err.message || "Something went wrong. Please try again.");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">Users & Roles</h2>
          <p className="mt-0.5 text-sm text-ink-secondary">Manage what each member of your company can do.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowInviteModal(true)}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink transition hover:bg-accent-hover sm:self-auto"
        >
          <IconPlus className="h-4 w-4" />
          Invite User
        </button>
      </div>

      {status === "loading" && <SectionSpinner />}

      {status === "error" && (
        <EmptyState icon={IconAlertTriangle} title="Couldn't load members" description="Something went wrong. Please try again." />
      )}

      {status === "ready" && members.length === 0 && (
        <EmptyState icon={IconTruck} title="No members yet" description="Members of your company will show up here." />
      )}

      {status === "ready" && members.length > 0 && (
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {members.map((member) => {
            const isOwner = member.role === "owner";
            const isSelf = member.userId === user?.id;
            const locked = isOwner || isSelf;
            // Owner and Admin are always unrestricted (see Property Access
            // V1's role semantics) — access is only ever actually editable
            // for a Manager or Technician, and never for your own row.
            const accessLocked = isOwner || member.role === "admin" || isSelf;
            const accessSummary =
              member.accessMode === "restricted"
                ? `${member.propertyIds?.length ?? 0} of ${propertyCount ?? "…"} Properties`
                : "All Properties";

            return (
              <div
                key={member.membershipId}
                id={`member-${member.userId}`}
                className={`flex flex-col gap-2 px-5 py-4 transition sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
                  focusUserId === member.userId ? "bg-surface-subtle ring-2 ring-inset ring-accent" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {member.name}
                    {isSelf && <span className="ml-1.5 text-xs font-normal text-ink-muted">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-ink-secondary">{member.email}</p>
                </div>

                <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <div className="w-full sm:w-44">
                    {locked ? (
                      <SearchableSelect
                        value={member.role}
                        onChange={() => {}}
                        options={[{ value: member.role, label: roleLabel[member.role] || member.role, sublabel: null }]}
                        disabled
                        disabledHint={isOwner ? "Owner role can't be changed" : "You can't change your own role"}
                      />
                    ) : (
                      <SearchableSelect
                        value={member.role}
                        onChange={(role) => handleRoleChange(member, role)}
                        options={ROLE_OPTIONS}
                        disabled={pendingId === member.membershipId}
                      />
                    )}
                  </div>

                  <div className="w-full sm:w-44">
                    {accessLocked ? (
                      <p
                        className="truncate px-1 text-sm text-ink-muted"
                        title={
                          isOwner || member.role === "admin"
                            ? "Owner and Admin always have access to every property"
                            : "You can't change your own property access"
                        }
                      >
                        All Properties
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingAccessMember(member)}
                        className="truncate rounded-lg border border-line px-3 py-2 text-left text-sm text-ink-secondary transition hover:bg-surface-subtle"
                      >
                        {accessSummary}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {invitesStatus === "ready" && invites.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Pending Invitations</h3>
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{invite.email}</p>
                  <p className="truncate text-xs text-ink-secondary">
                    {roleLabel[invite.role] || invite.role}
                    {invite.status === "expired" ? " · Expired" : ` · Expires ${formatShortDate(invite.expiresAt)}`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={revokingId === invite.id}
                  onClick={() => handleRevoke(invite)}
                  className="self-end shrink-0 rounded-md px-2 py-1.5 text-xs font-medium text-ink-secondary transition hover:text-red-600 dark:hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto sm:px-0 sm:py-0"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showInviteModal && (
        <InviteUserModal onClose={() => setShowInviteModal(false)} onInvited={handleInvited} />
      )}

      {editingAccessMember && (
        <EditPropertyAccessModal
          member={editingAccessMember}
          onClose={() => setEditingAccessMember(null)}
          onUpdated={handleAccessUpdated}
        />
      )}
    </div>
  );
}
