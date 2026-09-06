import { Membership } from "../models/index.js";
import { membershipHasPropertyAccess } from "./propertyAccess.js";

const URGENT_ELIGIBLE_ROLES = ["owner", "admin", "manager"];

// Who is notified when an urgent Work Order is created: every Owner /
// Admin / Manager Membership IN THE WORK ORDER'S COMPANY that also has
// Property Access to the Work Order's Property.
//
//   - Owner/Admin are always accessMode "all" (see propertyAccess.js), so
//     they always qualify. A restricted Manager qualifies only if the
//     Property is in their grant set — membershipHasPropertyAccess is the
//     symmetric counterpart to getAccessiblePropertyIds, evaluated from
//     the target Membership's side.
//   - Technicians are deliberately excluded even with Property Access —
//     they only ever hear about an urgent Work Order through the normal
//     assignment trigger, if it is assigned to them.
//   - The actor and duplicate Memberships are removed centrally in
//     notificationService.createNotifications; passing actorMembershipId
//     is not required here.
//   - Company isolation is structural: the Membership query is scoped to
//     companyId, so a Membership in another Company can never appear.
//
// Returns `[{ membershipId, userId }]`.
export async function resolveUrgentWorkOrderRecipients(companyId, propertyId) {
  const memberships = await Membership.findAll({
    where: { companyId, role: URGENT_ELIGIBLE_ROLES },
    attributes: ["id", "userId", "accessMode"],
  });

  const eligible = [];
  for (const m of memberships) {
    if (await membershipHasPropertyAccess(m, propertyId)) {
      eligible.push({ membershipId: m.id, userId: m.userId });
    }
  }
  return eligible;
}
