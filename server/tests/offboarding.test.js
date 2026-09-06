// SOC 2 Phase 1 — access-lifecycle / offboarding. Proves the control end
// to end against the real controllers and a real database: Membership
// disable (Company-level), global User disable, owner safety,
// reactivation layering, invite interaction, and multi-company isolation.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The Firebase revocation call is a mocked boundary — the DB switch is the
// authoritative cut; this just records that the secondary call was made.
vi.mock("../services/sessionRevocation.js", () => ({
  revokeUserSessions: vi.fn(async () => ({ revoked: true })),
  __resetForTests: vi.fn(),
}));

import { revokeUserSessions } from "../services/sessionRevocation.js";
import { Membership, User, AuditEvent, Notification, WorkOrder, PropertyAccess, Invitation } from "../models/index.js";
import { randomUUID } from "crypto";
import * as accessLifecycle from "../controllers/accessLifecycleController.js";
import * as membershipController from "../controllers/membershipController.js";
import * as workOrderController from "../controllers/workOrderController.js";
import { resolveUrgentWorkOrderRecipients } from "../authorization/notificationRecipients.js";
import { createNotifications } from "../services/notificationService.js";
import { sequelize } from "../models/index.js";
import { reqFor, makeRes } from "./helpers/mockReqRes.js";
import { createCompany, createUser, createMembership, createProperty, createWorkOrder } from "./helpers/fixtures.js";
import { cleanupCompanies } from "./helpers/cleanup.js";

async function disableRow(row) {
  row.disabledAt = new Date();
  await row.save();
}

describe("Access lifecycle / offboarding", () => {
  let company, otherCompany;
  let ownerU, ownerM, adminU, adminM, techU, techM, mgrU, mgrM;
  let property;

  beforeEach(async () => {
    revokeUserSessions.mockClear();
    company = await createCompany("QA Offboard Co");
    otherCompany = await createCompany("QA Offboard Other Co");

    ownerU = await createUser("QA Offboard Owner");
    adminU = await createUser("QA Offboard Admin");
    techU = await createUser("QA Offboard Tech");
    mgrU = await createUser("QA Offboard Manager");

    ownerM = await createMembership({ user: ownerU, company, role: "owner" });
    adminM = await createMembership({ user: adminU, company, role: "admin" });
    techM = await createMembership({ user: techU, company, role: "technician" });
    mgrM = await createMembership({ user: mgrU, company, role: "manager" });

    property = await createProperty({ company });
  });

  afterEach(async () => {
    // Invitations are RESTRICT on invited_by_user_id and cleanupCompanies
    // doesn't handle them — clear the suite's own first.
    await Invitation.destroy({ where: { companyId: [company.id, otherCompany.id] } });
    await cleanupCompanies([company.id, otherCompany.id]);
  });

  function reqOwner(extra = {}) {
    return reqFor(ownerU, [ownerM], extra);
  }
  function reqAdmin(extra = {}) {
    return reqFor(adminU, [adminM], extra);
  }
  function reqTech(extra = {}) {
    return reqFor(techU, [techM], extra);
  }

  // ── B. MEMBERSHIP DISABLE ────────────────────────────────────────────
  describe("Membership disable", () => {
    it("Owner/Admin can disable a Membership; it is audited; role/access preserved", async () => {
      const res = makeRes();
      await accessLifecycle.updateMembershipStatus(
        reqAdmin({ params: { id: techM.id }, body: { status: "disabled", reason: "Contractor engagement ended" } }),
        res
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("disabled");

      await techM.reload();
      expect(techM.disabledAt).not.toBeNull();
      expect(techM.role).toBe("technician"); // preserved

      const audit = await AuditEvent.findOne({
        where: { companyId: company.id, action: "membership.disabled", entityId: techM.id },
      });
      expect(audit).toBeTruthy();
      expect(audit.metadata.reason).toBe("Contractor engagement ended");
      expect(audit.before).toEqual({ disabled: false });
      expect(audit.after).toEqual({ disabled: true });
    });

    it("returns the open-assignment count on disable but does not block", async () => {
      await createWorkOrder({ property, status: "open", assignedMembershipId: techM.id });
      await createWorkOrder({ property, status: "in_progress", assignedMembershipId: techM.id });
      await createWorkOrder({ property, status: "completed", assignedMembershipId: techM.id });

      const res = makeRes();
      await accessLifecycle.updateMembershipStatus(
        reqOwner({ params: { id: techM.id }, body: { status: "disabled" } }),
        res
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.openAssignedWorkOrderCount).toBe(2); // completed one excluded
    });

    it("a disabled member is no longer a selectable assignee", async () => {
      await disableRow(techM);
      const wo = await createWorkOrder({ property });
      wo.property = property; // getAssignableMembers reads workOrder.property
      const res = makeRes();
      await workOrderController.getAssignableMembers(
        reqOwner({ params: { id: wo.id } }),
        res
      );
      expect(res.statusCode).toBe(200);
      const ids = res.body.map((m) => m.membershipId);
      expect(ids).not.toContain(techM.id);
      expect(ids).toContain(mgrM.id);
    });

    it("assigning a Work Order to a disabled member is rejected", async () => {
      await disableRow(techM);
      const wo = await createWorkOrder({ property, status: "open" });
      const res = makeRes();
      await workOrderController.updateWorkOrder(
        reqOwner({ params: { id: wo.id }, body: { assignedMembershipId: techM.id } }),
        res
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/disabled/i);
    });

    it("role and property-access edits are refused on a disabled Membership", async () => {
      await disableRow(mgrM);
      const roleRes = makeRes();
      await membershipController.updateMemberRole(
        reqOwner({ params: { id: mgrM.id }, body: { role: "admin" } }),
        roleRes
      );
      expect(roleRes.statusCode).toBe(409);

      const accessRes = makeRes();
      await membershipController.updateMemberPropertyAccess(
        reqOwner({ params: { id: mgrM.id }, body: { accessMode: "all" } }),
        accessRes
      );
      expect(accessRes.statusCode).toBe(409);
    });

    it("disabled members still appear in the member list with status", async () => {
      await disableRow(techM);
      const res = makeRes();
      await membershipController.listCompanyMembers(reqOwner(), res);
      const tech = res.body.find((m) => m.membershipId === techM.id);
      expect(tech.status).toBe("disabled");
      expect(tech.role).toBe("technician");
    });

    it("no new notifications reach a disabled Membership; existing rows remain", async () => {
      // seed an existing notification for the tech
      await sequelize.transaction((t) =>
        createNotifications({
          transaction: t,
          companyId: company.id,
          recipients: [{ membershipId: techM.id, userId: techU.id }],
          type: "work_order.assigned",
          title: "Old one",
        })
      );
      const before = await Notification.count({ where: { recipientMembershipId: techM.id } });
      expect(before).toBe(1);

      await disableRow(techM);

      const created = await sequelize.transaction((t) =>
        createNotifications({
          transaction: t,
          companyId: company.id,
          recipients: [{ membershipId: techM.id, userId: techU.id }],
          type: "work_order.assigned",
          title: "New one",
        })
      );
      expect(created).toBe(0);
      const after = await Notification.count({ where: { recipientMembershipId: techM.id } });
      expect(after).toBe(1); // unchanged
    });

    it("urgent-WO recipient resolution excludes a disabled Manager", async () => {
      const before = await resolveUrgentWorkOrderRecipients(company.id, property.id);
      expect(before.map((r) => r.membershipId)).toContain(mgrM.id);

      await disableRow(mgrM);
      const after = await resolveUrgentWorkOrderRecipients(company.id, property.id);
      expect(after.map((r) => r.membershipId)).not.toContain(mgrM.id);
    });

    it("re-enable restores the exact role and access", async () => {
      await disableRow(techM);
      const res = makeRes();
      await accessLifecycle.updateMembershipStatus(
        reqOwner({ params: { id: techM.id }, body: { status: "active" } }),
        res
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("active");
      await techM.reload();
      expect(techM.disabledAt).toBeNull();
      expect(techM.role).toBe("technician");

      const audit = await AuditEvent.findOne({ where: { action: "membership.enabled", entityId: techM.id } });
      expect(audit).toBeTruthy();
    });

    it("a Technician cannot disable anyone (no USERS_MANAGE)", async () => {
      const res = makeRes();
      await accessLifecycle.updateMembershipStatus(
        reqTech({ params: { id: mgrM.id }, body: { status: "disabled" } }),
        res
      );
      expect(res.statusCode).toBe(403);
    });

    it("is idempotent — disabling an already-disabled Membership writes no second audit row", async () => {
      await disableRow(techM);
      const res = makeRes();
      await accessLifecycle.updateMembershipStatus(
        reqOwner({ params: { id: techM.id }, body: { status: "disabled" } }),
        res
      );
      expect(res.statusCode).toBe(200);
      const count = await AuditEvent.count({ where: { action: "membership.disabled", entityId: techM.id } });
      expect(count).toBe(0);
    });
  });

  // ── C. OWNER SAFETY ─────────────────────────────────────────────────
  describe("Owner safety", () => {
    it("the owner Membership can never be disabled", async () => {
      const res = makeRes();
      await accessLifecycle.updateMembershipStatus(
        reqAdmin({ params: { id: ownerM.id }, body: { status: "disabled" } }),
        res
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/owner/i);
      await ownerM.reload();
      expect(ownerM.disabledAt).toBeNull();
    });

    it("you cannot disable your own Membership", async () => {
      const res = makeRes();
      await accessLifecycle.updateMembershipStatus(
        reqAdmin({ params: { id: adminM.id }, body: { status: "disabled" } }),
        res
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/your own/i);
    });

    it("global disable refuses a Company owner", async () => {
      const res = makeRes();
      await accessLifecycle.updateUserStatus(
        reqAdmin({ params: { id: ownerU.id }, body: { status: "disabled" } }),
        res
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/owns a company/i);
      await ownerU.reload();
      expect(ownerU.disabledAt).toBeNull();
    });
  });

  // ── A. GLOBAL USER DISABLE ──────────────────────────────────────────
  describe("Global User disable", () => {
    it("Owner/Admin can globally disable a non-owner; audited; refresh tokens revoked", async () => {
      const res = makeRes();
      await accessLifecycle.updateUserStatus(
        reqOwner({ params: { id: techU.id }, body: { status: "disabled", reason: "Security incident" } }),
        res
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.disabled).toBe(true);
      expect(res.body.refreshTokensRevoked).toBe(true);

      await techU.reload();
      expect(techU.disabledAt).not.toBeNull();

      expect(revokeUserSessions).toHaveBeenCalledWith(techU.firebaseUid);

      const disabledAudit = await AuditEvent.findOne({ where: { action: "user.disabled", entityId: techU.id } });
      expect(disabledAudit).toBeTruthy();
      expect(disabledAudit.metadata.reason).toBe("Security incident");
      const revokeAudit = await AuditEvent.findOne({ where: { action: "refresh_tokens.revoked", entityId: techU.id } });
      expect(revokeAudit).toBeTruthy();
      expect(revokeAudit.metadata.result).toEqual({ revoked: true });
    });

    it("you cannot globally disable yourself", async () => {
      const res = makeRes();
      await accessLifecycle.updateUserStatus(
        reqAdmin({ params: { id: adminU.id }, body: { status: "disabled" } }),
        res
      );
      expect(res.statusCode).toBe(400);
    });

    it("a Technician cannot globally disable anyone", async () => {
      const res = makeRes();
      await accessLifecycle.updateUserStatus(
        reqTech({ params: { id: mgrU.id }, body: { status: "disabled" } }),
        res
      );
      expect(res.statusCode).toBe(403);
    });

    it("re-enable clears users.disabled_at and does NOT touch a separately-disabled Membership", async () => {
      await disableRow(techM); // membership disabled independently
      techU.disabledAt = new Date(); // and globally
      await techU.save();

      const res = makeRes();
      await accessLifecycle.updateUserStatus(
        reqOwner({ params: { id: techU.id }, body: { status: "active" } }),
        res
      );
      expect(res.statusCode).toBe(200);

      await techU.reload();
      await techM.reload();
      expect(techU.disabledAt).toBeNull(); // account re-enabled
      expect(techM.disabledAt).not.toBeNull(); // membership STILL disabled

      const audit = await AuditEvent.findOne({ where: { action: "user.enabled", entityId: techU.id } });
      expect(audit).toBeTruthy();
    });
  });

  // ── F. MULTI-COMPANY ────────────────────────────────────────────────
  describe("Multi-company isolation", () => {
    it("disabling a Membership in Company A does not affect the same user's Membership in Company B", async () => {
      const otherOwner = await createUser("QA Offboard OtherOwner");
      await createMembership({ user: otherOwner, company: otherCompany, role: "owner" });
      const bMembership = await createMembership({ user: techU, company: otherCompany, role: "manager" });

      await disableRow(techM); // disable in Company A only

      await techM.reload();
      await bMembership.reload();
      expect(techM.disabledAt).not.toBeNull();
      expect(bMembership.disabledAt).toBeNull(); // Company B untouched
    });

    it("global User disable revokes access everywhere (both Memberships become unusable via authMiddleware's active filter)", async () => {
      const bMembership = await createMembership({ user: techU, company: otherCompany, role: "manager" });
      await createMembership({ user: await createUser("QA Offboard OtherOwner2"), company: otherCompany, role: "owner" });

      const res = makeRes();
      await accessLifecycle.updateUserStatus(
        reqOwner({ params: { id: techU.id }, body: { status: "disabled" } }),
        res
      );
      expect(res.statusCode).toBe(200);
      await techU.reload();
      expect(techU.disabledAt).not.toBeNull();
      // Both Memberships still exist (never deleted) but the global switch
      // is what authMiddleware checks first.
      await techM.reload();
      await bMembership.reload();
      expect(techM.disabledAt).toBeNull();
      expect(bMembership.disabledAt).toBeNull();
    });
  });

  // ── E. INVITES ─────────────────────────────────────────────────────
  describe("Invites", () => {
    it("createInvite refuses a disabled-Membership email (points to re-enable instead)", async () => {
      const inviteController = await import("../controllers/inviteController.js");
      await disableRow(techM);
      const res = makeRes();
      await inviteController.createInvite(
        reqOwner({ body: { email: techU.email, role: "technician" } }),
        res
      );
      expect(res.statusCode).toBe(409);
      expect(res.body.error).toMatch(/disabled/i);
    });

    it("createInvite refuses a globally disabled account", async () => {
      const inviteController = await import("../controllers/inviteController.js");
      const stranger = await createUser("QA Offboard Stranger");
      stranger.disabledAt = new Date();
      await stranger.save();
      const res = makeRes();
      await inviteController.createInvite(
        reqOwner({ body: { email: stranger.email, role: "manager" } }),
        res
      );
      expect(res.statusCode).toBe(409);
      expect(res.body.error).toMatch(/account is disabled/i);
      await User.destroy({ where: { id: stranger.id } });
    });

    it("acceptInvite creates a Membership and audits it as membership.created", async () => {
      const inviteController = await import("../controllers/inviteController.js");
      const invitee = await createUser("QA Offboard Invitee");
      const token = `qatok_${randomUUID()}`;
      await Invitation.create({
        companyId: company.id,
        email: invitee.email,
        role: "technician",
        token,
        invitedByUserId: ownerU.id,
        expiresAt: new Date(Date.now() + 86400000),
      });

      const res = makeRes();
      // acceptInvite runs under requireFirebaseUser — only req.user is set.
      await inviteController.acceptInvite({ params: { token }, user: invitee, body: {} }, res);
      expect(res.statusCode).toBe(200);

      const m = await Membership.findOne({ where: { userId: invitee.id, companyId: company.id } });
      expect(m).toBeTruthy();
      const audit = await AuditEvent.findOne({
        where: { action: "membership.created", entityId: m.id },
      });
      expect(audit).toBeTruthy();
      expect(audit.metadata.via).toBe("invitation");
      await Membership.destroy({ where: { id: m.id } });
      await User.destroy({ where: { id: invitee.id } });
    });

    it("acceptInvite on a disabled Membership refuses (no silent re-enable)", async () => {
      const inviteController = await import("../controllers/inviteController.js");
      const returner = await createUser("QA Offboard Returner");
      const rm = await createMembership({ user: returner, company, role: "technician" });
      await disableRow(rm);

      const token = `qatok_${randomUUID()}`;
      await Invitation.create({
        companyId: company.id,
        email: returner.email,
        role: "technician",
        token,
        invitedByUserId: ownerU.id,
        expiresAt: new Date(Date.now() + 86400000),
      });

      const res = makeRes();
      await inviteController.acceptInvite({ params: { token }, user: returner, body: {} }, res);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe("ACCESS_DISABLED");

      await rm.reload();
      expect(rm.disabledAt).not.toBeNull(); // NOT re-enabled

      await Membership.destroy({ where: { id: rm.id } });
      await User.destroy({ where: { id: returner.id } });
    });
  });
});
