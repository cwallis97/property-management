// Notification Center V1 — permanent regression coverage. Proves the
// product rules: notifications tell a user when responsibility, urgency,
// or access materially changes FOR THEM (never an activity feed, never a
// mirror of AuditEvent). One mutation → zero, one, or several
// Notifications. Central self-suppression + recipient de-dup. Same-
// transaction atomicity with the business mutation. Strict recipient-
// self-scoped read APIs and Company/tenant isolation.
//
// work_order.overdue is intentionally deferred (Production Jobs V1) — no
// coverage here.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Notification, WorkOrder, PropertyAccess } from "../models/index.js";
import * as workOrderController from "../controllers/workOrderController.js";
import * as membershipController from "../controllers/membershipController.js";
import * as notificationController from "../controllers/notificationController.js";
import { reqFor, makeRes } from "./helpers/mockReqRes.js";
import { createCompany, createUser, createMembership, createProperty, createLocation, createWorkOrder } from "./helpers/fixtures.js";
import { cleanupCompanies } from "./helpers/cleanup.js";

describe("Notification Center", () => {
  let companyA, companyB;
  let userOwner, userAdmin, userManagerAll, userManagerRestricted, userTech, userTech2, userForeign, userMulti;
  let mOwner, mAdmin, mManagerAll, mManagerRestricted, mTech, mTech2, mForeign, mMultiA, mMultiB;
  let propA1, propA2, propB1, locA1;

  beforeAll(async () => {
    companyA = await createCompany("QA Notif Company A");
    companyB = await createCompany("QA Notif Company B");

    userOwner = await createUser("QA Notif Owner");
    userAdmin = await createUser("QA Notif Admin");
    userManagerAll = await createUser("QA Notif Manager All");
    userManagerRestricted = await createUser("QA Notif Manager Restricted");
    userTech = await createUser("QA Notif Tech");
    userTech2 = await createUser("QA Notif Tech Two");
    userForeign = await createUser("QA Notif Foreign");
    userMulti = await createUser("QA Notif Multi");

    mOwner = await createMembership({ user: userOwner, company: companyA, role: "owner", accessMode: "all" });
    mAdmin = await createMembership({ user: userAdmin, company: companyA, role: "admin", accessMode: "all" });
    mManagerAll = await createMembership({ user: userManagerAll, company: companyA, role: "manager", accessMode: "all" });
    mManagerRestricted = await createMembership({ user: userManagerRestricted, company: companyA, role: "manager", accessMode: "restricted" });
    mTech = await createMembership({ user: userTech, company: companyA, role: "technician", accessMode: "all" });
    mTech2 = await createMembership({ user: userTech2, company: companyA, role: "technician", accessMode: "all" });
    mForeign = await createMembership({ user: userForeign, company: companyB, role: "owner", accessMode: "all" });
    mMultiA = await createMembership({ user: userMulti, company: companyA, role: "manager", accessMode: "all" });
    mMultiB = await createMembership({ user: userMulti, company: companyB, role: "technician", accessMode: "all" });

    propA1 = await createProperty({ company: companyA, name: "QA Notif Riverbend" });
    propA2 = await createProperty({ company: companyA, name: "QA Notif Canyon" });
    propB1 = await createProperty({ company: companyB, name: "QA Notif Beacon" });
    locA1 = await createLocation({ property: propA1, name: "Unit 12", type: "unit" });
    // The fixture helpers append a random suffix to name/title; these
    // tests assert on exact notification body strings, so normalise back.
    await propA1.update({ name: "QA Notif Riverbend" });
    await propA2.update({ name: "QA Notif Canyon" });
    await propB1.update({ name: "QA Notif Beacon" });
    await locA1.update({ name: "Unit 12" });

    await PropertyAccess.create({ membershipId: mManagerRestricted.id, propertyId: propA1.id });
  });

  afterAll(async () => {
    await cleanupCompanies([companyA.id, companyB.id]);
  });

  const reqOwner = () => reqFor(userOwner, [mOwner]);
  const reqManagerAll = () => reqFor(userManagerAll, [mManagerAll]);
  const reqForeign = () => reqFor(userForeign, [mForeign]);

  const notifsFor = (membershipId, type) =>
    Notification.findAll({ where: { recipientMembershipId: membershipId, ...(type ? { type } : {}) }, order: [["createdAt", "ASC"]] });

  async function callUpdateWorkOrder(req, id, body) {
    const res = makeRes();
    req.params = { id };
    req.body = body;
    await workOrderController.updateWorkOrder(req, res);
    return res;
  }
  async function callCreateWorkOrder(req, propertyId, body) {
    const res = makeRes();
    req.params = { propertyId };
    req.body = body;
    await workOrderController.createWorkOrder(req, res);
    return res;
  }

  // ── Assignment / reassignment ──────────────────────────────────────
  describe("assignment", () => {
    it("the new assignee receives exactly one 'assigned to you' notification, with Property/Location context", async () => {
      const wo = await createWorkOrder({ property: propA1, title: "Assign A", locationId: locA1.id });
      await callUpdateWorkOrder(reqOwner(), wo.id, { assignedMembershipId: mTech.id });

      const got = await notifsFor(mTech.id, "work_order.assigned");
      expect(got).toHaveLength(1);
      expect(got[0].title).toMatch(/assigned to you$/);
      expect(got[0].body).toBe("QA Notif Riverbend · Unit 12");
      expect(got[0].entityType).toBe("work_order");
      expect(got[0].entityId).toBe(wo.id);
      expect(got[0].propertyId).toBe(propA1.id);
      expect(got[0].readAt).toBeNull();
      // nobody else
      expect(await notifsFor(mOwner.id, "work_order.assigned")).toHaveLength(0);
      expect(await notifsFor(mAdmin.id, "work_order.assigned")).toHaveLength(0);
    });

    it("reassigning moves it: previous assignee gets 'reassigned', new assignee gets 'assigned', no double-notify", async () => {
      const wo = await createWorkOrder({ property: propA1, title: "Assign B", assignedMembershipId: mTech.id });
      await callUpdateWorkOrder(reqOwner(), wo.id, { assignedMembershipId: mTech2.id });

      const prev = await Notification.findAll({ where: { recipientMembershipId: mTech.id, entityId: wo.id, type: "work_order.reassigned" } });
      expect(prev).toHaveLength(1);
      expect(prev[0].body).toBe(`Now assigned to ${userTech2.displayName}`);
      expect(prev[0].metadata.newAssignee).toBe(userTech2.displayName);

      const next = await Notification.findAll({ where: { recipientMembershipId: mTech2.id, entityId: wo.id, type: "work_order.assigned" } });
      expect(next).toHaveLength(1);
      // the new assignee is NOT also sent a 'reassigned' row
      expect(await Notification.findAll({ where: { recipientMembershipId: mTech2.id, entityId: wo.id, type: "work_order.reassigned" } })).toHaveLength(0);
    });

    it("clearing the assignment tells the previous assignee it is no longer theirs", async () => {
      const wo = await createWorkOrder({ property: propA1, title: "Assign C", assignedMembershipId: mTech.id });
      await callUpdateWorkOrder(reqOwner(), wo.id, { assignedMembershipId: null });

      const got = await Notification.findAll({ where: { recipientMembershipId: mTech.id, entityId: wo.id, type: "work_order.reassigned" } });
      expect(got).toHaveLength(1);
      expect(got[0].body).toBe("This Work Order is no longer assigned to you");
      expect(got[0].metadata.newAssignee).toBeNull();
    });

    it("re-submitting the same assignee is a no-op — no notification", async () => {
      const wo = await createWorkOrder({ property: propA1, title: "Assign D", assignedMembershipId: mTech.id });
      await callUpdateWorkOrder(reqOwner(), wo.id, { assignedMembershipId: mTech.id });
      expect(await Notification.findAll({ where: { entityId: wo.id } })).toHaveLength(0);
    });

    it("a Manager assigning a Work Order to their own Membership gets no 'assigned to you' (actor == recipient)", async () => {
      const wo = await createWorkOrder({ property: propA1, title: "Assign E" });
      await callUpdateWorkOrder(reqManagerAll(), wo.id, { assignedMembershipId: mManagerAll.id });
      expect(await notifsFor(mManagerAll.id, "work_order.assigned")).toHaveLength(0);
    });

    it("a cross-company assignee is rejected by the existing mutation auth (404), and no notification is created", async () => {
      const wo = await createWorkOrder({ property: propA1, title: "Assign F" });
      const res = await callUpdateWorkOrder(reqOwner(), wo.id, { assignedMembershipId: mForeign.id });
      expect(res.statusCode).toBe(404);
      expect(await Notification.findAll({ where: { entityId: wo.id } })).toHaveLength(0);
    });
  });

  // ── Reopen ────────────────────────────────────────────────────────
  describe("reopen", () => {
    it("the current assignee is notified on a real completed → not-completed transition", async () => {
      const wo = await createWorkOrder({ property: propA1, title: "Reopen A", status: "completed", completedAt: new Date(), assignedMembershipId: mTech.id });
      await callUpdateWorkOrder(reqOwner(), wo.id, { status: "open" });

      const got = await notifsFor(mTech.id, "work_order.reopened");
      expect(got).toHaveLength(1);
      expect(got[0].title).toMatch(/reopened$/);
      expect(got[0].entityId).toBe(wo.id);
    });

    it("no notification when the reopened Work Order has no assignee", async () => {
      const wo = await createWorkOrder({ property: propA1, title: "Reopen B", status: "completed", completedAt: new Date() });
      await callUpdateWorkOrder(reqOwner(), wo.id, { status: "open" });
      expect(await Notification.findAll({ where: { entityId: wo.id, type: "work_order.reopened" } })).toHaveLength(0);
    });

    it("a Manager reopening their own assigned Work Order gets no 'reopened' (actor == recipient)", async () => {
      const wo = await createWorkOrder({ property: propA1, title: "Reopen C", status: "completed", completedAt: new Date(), assignedMembershipId: mManagerAll.id });
      await callUpdateWorkOrder(reqManagerAll(), wo.id, { status: "open" });
      expect(await notifsFor(mManagerAll.id, "work_order.reopened")).toHaveLength(0);
    });

    it("a status change between two non-completed values is not a reopen", async () => {
      const wo = await createWorkOrder({ property: propA1, title: "Reopen D", status: "open", assignedMembershipId: mTech.id });
      await callUpdateWorkOrder(reqOwner(), wo.id, { status: "in_progress" });
      expect(await Notification.findAll({ where: { entityId: wo.id, type: "work_order.reopened" } })).toHaveLength(0);
    });

    it("re-submitting the same status is a no-op — no notification", async () => {
      const wo = await createWorkOrder({ property: propA1, title: "Reopen E", status: "open", assignedMembershipId: mTech.id });
      await callUpdateWorkOrder(reqOwner(), wo.id, { status: "open" });
      expect(await Notification.findAll({ where: { entityId: wo.id } })).toHaveLength(0);
    });
  });

  // ── Role changed ──────────────────────────────────────────────────
  describe("role changed", () => {
    it("the affected member is notified, with human-readable new role", async () => {
      const target = await createUser("QA Notif Role Target");
      const mTarget = await createMembership({ user: target, company: companyA, role: "technician", accessMode: "all" });
      try {
        const res = makeRes();
        const req = reqOwner();
        req.params = { id: mTarget.id };
        req.body = { role: "manager" };
        await membershipController.updateMemberRole(req, res);

        const got = await notifsFor(mTarget.id, "membership.role_changed");
        expect(got).toHaveLength(1);
        expect(got[0].title).toBe("Your role changed");
        expect(got[0].body).toBe("You are now Manager");
        expect(got[0].metadata.newRole).toBe("manager");
      } finally {
        await Notification.destroy({ where: { recipientMembershipId: mTarget.id } });
        await mTarget.destroy();
        await target.destroy();
      }
    });

    it("re-submitting the same role is a no-op — no notification", async () => {
      const target = await createUser("QA Notif Role NoOp");
      const mTarget = await createMembership({ user: target, company: companyA, role: "manager", accessMode: "all" });
      try {
        const res = makeRes();
        const req = reqOwner();
        req.params = { id: mTarget.id };
        req.body = { role: "manager" };
        await membershipController.updateMemberRole(req, res);
        expect(await notifsFor(mTarget.id, "membership.role_changed")).toHaveLength(0);
      } finally {
        await mTarget.destroy();
        await target.destroy();
      }
    });
  });

  // ── Property access changed ───────────────────────────────────────
  describe("property access changed", () => {
    async function setAccess(membershipId, propertyIds) {
      const res = makeRes();
      const req = reqOwner();
      req.params = { id: membershipId };
      req.body = { accessMode: "restricted", propertyIds };
      await membershipController.updateMemberPropertyAccess(req, res);
      return res;
    }

    it("adding one Property → 'X added'; removing one → 'X removed'; a multi-change is summarised, not exploded", async () => {
      const u = await createUser("QA Notif Access Target");
      const m = await createMembership({ user: u, company: companyA, role: "manager", accessMode: "restricted" });
      await PropertyAccess.create({ membershipId: m.id, propertyId: propA1.id });
      try {
        await setAccess(m.id, [propA1.id, propA2.id]);
        let got = await notifsFor(m.id, "membership.property_access_changed");
        expect(got).toHaveLength(1);
        expect(got[0].title).toBe("Your Property access changed");
        expect(got[0].body).toBe("QA Notif Canyon added");
        expect(got[0].metadata).toMatchObject({ addedCount: 1, removedCount: 0 });

        await setAccess(m.id, [propA2.id]); // remove propA1
        got = await notifsFor(m.id, "membership.property_access_changed");
        expect(got).toHaveLength(2);
        expect(got[1].body).toBe("QA Notif Riverbend removed");

        await setAccess(m.id, [propA1.id]); // add propA1, remove propA2 in one mutation
        got = await notifsFor(m.id, "membership.property_access_changed");
        expect(got).toHaveLength(3);
        expect(got[2].body).toBe("1 Property added · 1 Property removed");
        expect(got[2].metadata).toMatchObject({ addedCount: 1, removedCount: 1 });
      } finally {
        await Notification.destroy({ where: { recipientMembershipId: m.id } });
        await PropertyAccess.destroy({ where: { membershipId: m.id } });
        await m.destroy();
        await u.destroy();
      }
    });

    it("submitting the same access set is a no-op — no notification", async () => {
      const u = await createUser("QA Notif Access NoOp");
      const m = await createMembership({ user: u, company: companyA, role: "manager", accessMode: "restricted" });
      await PropertyAccess.create({ membershipId: m.id, propertyId: propA1.id });
      try {
        await setAccess(m.id, [propA1.id]);
        expect(await notifsFor(m.id, "membership.property_access_changed")).toHaveLength(0);
      } finally {
        await PropertyAccess.destroy({ where: { membershipId: m.id } });
        await m.destroy();
        await u.destroy();
      }
    });

    it("the notification stays readable to its recipient even after that Property access is removed", async () => {
      const u = await createUser("QA Notif Access Removed");
      const m = await createMembership({ user: u, company: companyA, role: "manager", accessMode: "restricted" });
      await PropertyAccess.create({ membershipId: m.id, propertyId: propA1.id });
      await PropertyAccess.create({ membershipId: m.id, propertyId: propA2.id });
      try {
        await setAccess(m.id, [propA1.id]); // removes propA2

        const res = makeRes();
        const req = reqFor(u, [m]);
        req.query = {};
        await notificationController.listNotifications(req, res);

        const removedNotif = res.body.notifications.find((n) => n.type === "membership.property_access_changed");
        expect(removedNotif).toBeTruthy();
        expect(removedNotif.body).toBe("QA Notif Canyon removed");
        expect(removedNotif.readAt).toBeNull();
      } finally {
        await Notification.destroy({ where: { recipientMembershipId: m.id } });
        await PropertyAccess.destroy({ where: { membershipId: m.id } });
        await m.destroy();
        await u.destroy();
      }
    });
  });

  // ── Urgent Work Order created ─────────────────────────────────────
  describe("urgent Work Order created", () => {
    it("Owner/Admin/Manager with Property Access are notified; the actor, Technicians, and out-of-access Managers are not", async () => {
      const res = await callCreateWorkOrder(reqOwner(), propA1.id, { title: "Urgent A", priority: "urgent" });
      const woId = res.body.id;

      expect(await notifsFor(mAdmin.id, "work_order.urgent_created")).toHaveLength(1);
      expect(await notifsFor(mManagerAll.id, "work_order.urgent_created")).toHaveLength(1);
      expect(await notifsFor(mManagerRestricted.id, "work_order.urgent_created")).toHaveLength(1); // granted propA1
      expect(await notifsFor(mMultiA.id, "work_order.urgent_created")).toHaveLength(1); // manager in Company A

      expect(await notifsFor(mOwner.id, "work_order.urgent_created")).toHaveLength(0); // actor
      expect(await notifsFor(mTech.id, "work_order.urgent_created")).toHaveLength(0); // Technician
      expect(await notifsFor(mMultiB.id, "work_order.urgent_created")).toHaveLength(0); // membership is in Company B

      const one = (await notifsFor(mAdmin.id, "work_order.urgent_created"))[0];
      expect(one.title).toMatch(/^Urgent Work Order created: /);
      expect(one.entityId).toBe(woId);
      expect(one.propertyId).toBe(propA1.id);
    });

    it("a restricted Manager without access to the Property is NOT notified", async () => {
      await callCreateWorkOrder(reqOwner(), propA2.id, { title: "Urgent B", priority: "urgent" });
      // mManagerRestricted is granted propA1 only
      const onCanyon = await Notification.findAll({
        where: { recipientMembershipId: mManagerRestricted.id, type: "work_order.urgent_created", propertyId: propA2.id },
      });
      expect(onCanyon).toHaveLength(0);
      // control: an all-access Manager still gets it
      expect(
        await Notification.findAll({ where: { recipientMembershipId: mManagerAll.id, type: "work_order.urgent_created", propertyId: propA2.id } })
      ).toHaveLength(1);
    });

    it("a non-urgent Work Order creates no urgent notification", async () => {
      const res = await callCreateWorkOrder(reqOwner(), propA1.id, { title: "High only", priority: "high" });
      expect(await Notification.findAll({ where: { entityId: res.body.id, type: "work_order.urgent_created" } })).toHaveLength(0);
    });

    it("the actor is excluded even when they are in the eligible role set (Manager creates an urgent Work Order)", async () => {
      await callCreateWorkOrder(reqManagerAll(), propA1.id, { title: "Urgent by Manager", priority: "urgent" });
      // the acting Manager is NOT notified about the urgent Work Order they just created
      const forManager = await notifsFor(mManagerAll.id, "work_order.urgent_created");
      expect(forManager.some((n) => n.title.includes("Urgent by Manager"))).toBe(false);
      // …but the Admin (also eligible, not the actor) still receives it
      const forAdmin = await notifsFor(mAdmin.id, "work_order.urgent_created");
      expect(forAdmin.some((n) => n.title.includes("Urgent by Manager"))).toBe(true);
    });
  });

  // ── Read / unread APIs (recipient-self-scoped) ────────────────────
  describe("read / unread", () => {
    it("a recipient lists only their own notifications, with an accurate unread count", async () => {
      const wo = await createWorkOrder({ property: propA1, title: "Read A" });
      await callUpdateWorkOrder(reqOwner(), wo.id, { assignedMembershipId: mTech.id });

      const res = makeRes();
      const req = reqFor(userTech, [mTech]);
      req.query = {};
      await notificationController.listNotifications(req, res);

      expect(res.body.notifications.every((n) => n.type)).toBe(true);
      expect(res.body.unreadCount).toBeGreaterThan(0);
      expect(res.body.notifications.some((n) => n.entityId === wo.id)).toBe(true);
    });

    it("a caller cannot read or mark another Membership's notification (404, not 403)", async () => {
      const wo = await createWorkOrder({ property: propA1, title: "Read B" });
      await callUpdateWorkOrder(reqOwner(), wo.id, { assignedMembershipId: mTech.id });
      const techNotif = (await notifsFor(mTech.id, "work_order.assigned")).find((n) => n.entityId === wo.id);

      const res = makeRes();
      const req = reqFor(userTech2, [mTech2]);
      req.params = { id: techNotif.id };
      await notificationController.markNotificationRead(req, res);
      expect(res.statusCode).toBe(404);

      await techNotif.reload();
      expect(techNotif.readAt).toBeNull(); // untouched
    });

    it("mark one read → readAt set, row still present, unread count drops", async () => {
      const wo = await createWorkOrder({ property: propA1, title: "Read C" });
      await callUpdateWorkOrder(reqOwner(), wo.id, { assignedMembershipId: mTech.id });
      const techNotif = (await notifsFor(mTech.id, "work_order.assigned")).find((n) => n.entityId === wo.id);

      const before = (await notifsFor(mTech.id)).filter((n) => !n.readAt).length;

      const res = makeRes();
      const req = reqFor(userTech, [mTech]);
      req.params = { id: techNotif.id };
      await notificationController.markNotificationRead(req, res);

      await techNotif.reload();
      expect(techNotif.readAt).not.toBeNull();
      expect(res.body.unreadCount).toBe(before - 1);

      // still visible in filter=all, gone from filter=unread
      const listRes = makeRes();
      const listReq = reqFor(userTech, [mTech]);
      listReq.query = { filter: "unread" };
      await notificationController.listNotifications(listReq, listRes);
      expect(listRes.body.notifications.some((n) => n.id === techNotif.id)).toBe(false);
    });

    it("mark all read clears the unread count and deletes nothing", async () => {
      const u = await createUser("QA Notif ReadAll");
      const m = await createMembership({ user: u, company: companyA, role: "technician", accessMode: "all" });
      try {
        const wo1 = await createWorkOrder({ property: propA1, title: "ReadAll 1" });
        const wo2 = await createWorkOrder({ property: propA1, title: "ReadAll 2" });
        await callUpdateWorkOrder(reqOwner(), wo1.id, { assignedMembershipId: m.id });
        await callUpdateWorkOrder(reqOwner(), wo2.id, { assignedMembershipId: m.id });

        const res = makeRes();
        const req = reqFor(u, [m]);
        req.body = {};
        await notificationController.markAllNotificationsRead(req, res);
        expect(res.body.updated).toBe(2);
        expect(res.body.unreadCount).toBe(0);
        expect(await Notification.count({ where: { recipientMembershipId: m.id } })).toBe(2); // not deleted
      } finally {
        await Notification.destroy({ where: { recipientMembershipId: m.id } });
        await m.destroy();
        await u.destroy();
      }
    });
  });

  // ── Tenant / multi-company isolation ─────────────────────────────
  describe("tenant isolation", () => {
    it("a Company A caller's inbox never contains a Company B notification", async () => {
      // generate a Company B notification: foreign owner assigns a Company B WO
      const woB = await createWorkOrder({ property: propB1, title: "Iso B" });
      await callUpdateWorkOrder(reqForeign(), woB.id, { assignedMembershipId: mMultiB.id });

      const res = makeRes();
      const req = reqOwner();
      req.query = {};
      await notificationController.listNotifications(req, res);
      expect(res.body.notifications.every((n) => n.companyId === companyA.id)).toBe(true);
    });

    it("a multi-company user sees notifications from both of their Memberships, each with its own Company context", async () => {
      // Company A urgent (mMultiA is a manager there) + Company B assignment (mMultiB)
      await callCreateWorkOrder(reqOwner(), propA1.id, { title: "Multi Urgent A", priority: "urgent" });
      const woB = await createWorkOrder({ property: propB1, title: "Multi Assign B" });
      await callUpdateWorkOrder(reqForeign(), woB.id, { assignedMembershipId: mMultiB.id });

      const res = makeRes();
      const req = reqFor(userMulti, [mMultiA, mMultiB]);
      req.query = {};
      await notificationController.listNotifications(req, res);

      const companies = new Set(res.body.notifications.map((n) => n.companyId));
      expect(companies.has(companyA.id)).toBe(true);
      expect(companies.has(companyB.id)).toBe(true);
      expect(res.body.notifications.every((n) => n.companyName)).toBe(true);
    });
  });

  // ── Atomicity ────────────────────────────────────────────────────
  describe("atomicity", () => {
    it("a notification insert failure rolls back the triggering mutation", async () => {
      const wo = await createWorkOrder({ property: propA1, title: "Atomic A" });
      const spy = vi.spyOn(Notification, "bulkCreate").mockRejectedValueOnce(new Error("notification insert failed"));
      try {
        await expect(callUpdateWorkOrder(reqOwner(), wo.id, { assignedMembershipId: mTech.id })).rejects.toThrow();
      } finally {
        spy.mockRestore();
      }

      const reloaded = await WorkOrder.findByPk(wo.id);
      expect(reloaded.assignedMembershipId).toBeNull(); // mutation rolled back
      expect(await Notification.findAll({ where: { entityId: wo.id } })).toHaveLength(0);
    });
  });
});
