// Contextual Work Order History V1 — operational history attached directly
// to a Work Order for anyone who can already read it, deliberately
// distinct from the Admin/Owner-only global Audit Log. See
// server/controllers/workOrderController.js#getWorkOrderHistory and
// docs/Product-Bible.md.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AuditEvent, PropertyAccess, Vendor } from "../models/index.js";
import * as workOrderController from "../controllers/workOrderController.js";
import * as workOrderNoteController from "../controllers/workOrderNoteController.js";
import * as workOrderCostController from "../controllers/workOrderCostController.js";
import * as membershipController from "../controllers/membershipController.js";
import * as auditEventController from "../controllers/auditEventController.js";
import { reqFor, makeRes } from "./helpers/mockReqRes.js";
import { createCompany, createUser, createMembership, createProperty, createWorkOrder } from "./helpers/fixtures.js";
import { cleanupCompanies } from "./helpers/cleanup.js";

describe("Contextual Work Order History", () => {
  let companyA, companyB;
  let userOwner, userAdmin, userManager, userTech, userTechNoAccess, userForeign, userMulti;
  let membershipOwner, membershipAdmin, membershipManager, membershipTech, membershipTechNoAccess, membershipForeign, membershipMultiA, membershipMultiB;
  let propertyA;
  let vendor;
  let workOrderA, workOrderOther;

  beforeAll(async () => {
    companyA = await createCompany("QA History Company A");
    companyB = await createCompany("QA History Company B Foreign");

    userOwner = await createUser("Chris Wallis");
    userAdmin = await createUser("Ash Admin");
    userManager = await createUser("Pat Manager");
    userTech = await createUser("Mike Johnson");
    userTechNoAccess = await createUser("No Access Tech");
    userForeign = await createUser("Foreign Person");
    userMulti = await createUser("Multi Co");

    membershipOwner = await createMembership({ user: userOwner, company: companyA, role: "owner" });
    membershipAdmin = await createMembership({ user: userAdmin, company: companyA, role: "admin" });
    membershipManager = await createMembership({ user: userManager, company: companyA, role: "manager" });
    membershipTech = await createMembership({ user: userTech, company: companyA, role: "technician", accessMode: "restricted" });
    membershipTechNoAccess = await createMembership({ user: userTechNoAccess, company: companyA, role: "technician", accessMode: "restricted" });
    membershipForeign = await createMembership({ user: userForeign, company: companyB, role: "owner" });
    membershipMultiA = await createMembership({ user: userMulti, company: companyA, role: "technician", accessMode: "restricted" });
    membershipMultiB = await createMembership({ user: userMulti, company: companyB, role: "owner" });

    propertyA = await createProperty({ company: companyA, name: "Sunset Ridge" });

    await PropertyAccess.create({ membershipId: membershipTech.id, propertyId: propertyA.id });
    await PropertyAccess.create({ membershipId: membershipMultiA.id, propertyId: propertyA.id });

    vendor = await Vendor.create({ companyId: companyA.id, name: "ABC Plumbing" });

    workOrderA = await createWorkOrder({ property: propertyA, title: "Water Leak - Lot 17", assignedMembershipId: membershipTech.id });
    workOrderOther = await createWorkOrder({ property: propertyA, title: "QA Other Work Order" });

    // Generate real events on workOrderA: status, note, cost, assignment —
    // plus deliberately unrelated events (another Work Order's own status
    // change, a role change) that the contextual endpoint must never leak.
    let req = reqOwner();
    let res = makeRes();
    req.params = { id: workOrderA.id };
    req.body = { status: "in_progress" };
    await workOrderController.updateWorkOrder(req, res);

    req = reqTech();
    req.params = { workOrderId: workOrderA.id };
    req.body = { body: "Replaced the shutoff valve." };
    res = makeRes();
    await workOrderNoteController.createWorkOrderNote(req, res);

    req = reqTech();
    req.params = { workOrderId: workOrderA.id };
    req.body = { type: "material", amount: 185, costDate: "2026-08-26", vendorId: vendor.id };
    res = makeRes();
    await workOrderCostController.createWorkOrderCost(req, res);

    req = reqOwner();
    res = makeRes();
    req.params = { id: workOrderA.id };
    req.body = { assignedMembershipId: membershipMultiA.id };
    await workOrderController.updateWorkOrder(req, res);

    req = reqOwner();
    res = makeRes();
    req.params = { id: workOrderOther.id };
    req.body = { status: "in_progress" };
    await workOrderController.updateWorkOrder(req, res);

    req = reqOwner();
    res = makeRes();
    req.params = { id: membershipTech.id };
    req.body = { role: "manager" };
    await membershipController.updateMemberRole(req, res);
    const revertReq = reqOwner();
    const revertRes = makeRes();
    revertReq.params = { id: membershipTech.id };
    revertReq.body = { role: "technician" };
    await membershipController.updateMemberRole(revertReq, revertRes);
  });

  afterAll(async () => {
    await cleanupCompanies([companyA.id, companyB.id]);
  });

  function reqOwner() {
    return reqFor(userOwner, [membershipOwner]);
  }
  function reqAdmin() {
    return reqFor(userAdmin, [membershipAdmin]);
  }
  function reqManager() {
    return reqFor(userManager, [membershipManager]);
  }
  function reqTech() {
    return reqFor(userTech, [membershipTech]);
  }
  function reqTechNoAccess() {
    return reqFor(userTechNoAccess, [membershipTechNoAccess]);
  }
  function reqForeign() {
    return reqFor(userForeign, [membershipForeign]);
  }
  function reqMulti() {
    // Company B listed FIRST, deliberately.
    return reqFor(userMulti, [membershipMultiB, membershipMultiA]);
  }

  describe("read authorization follows Work Order read authorization, not auditLog.read", () => {
    it("Owner can read Work Order history", async () => {
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.query = {};
      await workOrderController.getWorkOrderHistory(req, res);
      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
      expect(res.body?.events?.length).toBeGreaterThanOrEqual(4);
    });

    it("Admin can read Work Order history", async () => {
      const req = reqAdmin();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.query = {};
      await workOrderController.getWorkOrderHistory(req, res);
      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
    });

    it("Manager (Property Access via accessMode=all) can read Work Order history", async () => {
      const req = reqManager();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.query = {};
      await workOrderController.getWorkOrderHistory(req, res);
      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
    });

    it("Technician with existing Work Order read access can read history — no auditLog.read required", async () => {
      const req = reqTech();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.query = {};
      await workOrderController.getWorkOrderHistory(req, res);
      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
    });

    it("the global Audit Log remains Admin/Owner-only, unaffected by contextual history existing", async () => {
      let req = reqManager();
      let res = makeRes();
      req.query = {};
      await auditEventController.listAuditEvents(req, res);
      expect(res.statusCode).toBe(403);

      req = reqTech();
      res = makeRes();
      req.query = {};
      await auditEventController.listAuditEvents(req, res);
      expect(res.statusCode).toBe(403);

      req = reqOwner();
      res = makeRes();
      req.query = {};
      await auditEventController.listAuditEvents(req, res);
      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
    });
  });

  describe("Property Access remains mandatory", () => {
    it("Technician WITHOUT Property Access to the Property cannot read its history (404)", async () => {
      const req = reqTechNoAccess();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.query = {};
      await workOrderController.getWorkOrderHistory(req, res);
      expect(res.statusCode).toBe(404);
    });

    it("assignment does not bypass a missing Property Access grant", async () => {
      workOrderA.assignedMembershipId = membershipTechNoAccess.id;
      await workOrderA.save();

      const req = reqTechNoAccess();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.query = {};
      await workOrderController.getWorkOrderHistory(req, res);
      expect(res.statusCode).toBe(404);

      workOrderA.assignedMembershipId = membershipMultiA.id;
      await workOrderA.save();
    });

    it("Property Access revocation immediately removes history access; restoring it immediately returns access", async () => {
      const beforeReq = reqTech();
      const beforeRes = makeRes();
      beforeReq.params = { id: workOrderA.id };
      beforeReq.query = {};
      await workOrderController.getWorkOrderHistory(beforeReq, beforeRes);
      expect(beforeRes.statusCode === 200 || beforeRes.statusCode === undefined).toBe(true);

      await PropertyAccess.destroy({ where: { membershipId: membershipTech.id, propertyId: propertyA.id } });

      const afterReq = reqTech();
      const afterRes = makeRes();
      afterReq.params = { id: workOrderA.id };
      afterReq.query = {};
      await workOrderController.getWorkOrderHistory(afterReq, afterRes);
      expect(afterRes.statusCode).toBe(404);

      await PropertyAccess.create({ membershipId: membershipTech.id, propertyId: propertyA.id });
    });
  });

  describe("tenant isolation", () => {
    it("Company B cannot retrieve Company A's Work Order history (404)", async () => {
      const req = reqForeign();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.query = {};
      await workOrderController.getWorkOrderHistory(req, res);
      expect(res.statusCode).toBe(404);
    });

    it("multi-company caller resolves the correct Company-A/Property-A boundary despite array order", async () => {
      const req = reqMulti();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.query = {};
      await workOrderController.getWorkOrderHistory(req, res);
      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
    });
  });

  describe("event scope is hard-coded to the exact Work Order", () => {
    it("returns assignment/status/note/cost events for workOrderA, and never membership/property events", async () => {
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.query = { limit: "100" };
      await workOrderController.getWorkOrderHistory(req, res);
      const events = res.body.events;
      expect(events.length).toBeGreaterThan(0);

      const actions = events.map((e) => e.action);
      for (const expected of ["work_order.assignment_changed", "work_order.status_changed", "work_order.note_created", "work_order.cost_created"]) {
        expect(actions).toContain(expected);
      }
      expect(actions).not.toContain("membership.role_changed");
      expect(actions).not.toContain("membership.property_access_changed");

      const otherEvent = await AuditEvent.findOne({ where: { entityId: workOrderOther.id, action: "work_order.status_changed" } });
      expect(otherEvent).not.toBeNull();
      expect(events.some((e) => e.id === otherEvent.id)).toBe(false);
    });

    it("crafted entityType/entityId query params cannot redirect the query to another entity", async () => {
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.query = { entityType: "membership", entityId: membershipTech.id, limit: "100" };
      await workOrderController.getWorkOrderHistory(req, res);
      const actions = res.body.events.map((e) => e.action);
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.every((a) => a.startsWith("work_order."))).toBe(true);
    });

    it("events are returned newest-first", async () => {
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.query = { limit: "100" };
      await workOrderController.getWorkOrderHistory(req, res);
      const times = res.body.events.map((e) => new Date(e.createdAt).getTime());
      const sorted = [...times].sort((a, b) => b - a);
      expect(times).toEqual(sorted);
    });
  });

  describe("data minimization", () => {
    it("contextual event shape is exactly {id, createdAt, action, actor, before, after, metadata}", async () => {
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.query = { limit: "1" };
      await workOrderController.getWorkOrderHistory(req, res);
      const event = res.body.events[0];
      expect(Object.keys(event).sort()).toEqual(["action", "actor", "after", "before", "createdAt", "id", "metadata"].sort());
      expect(Object.keys(event.actor).sort()).toEqual(["name", "role"]);
      expect(event).not.toHaveProperty("entityId");
      expect(event).not.toHaveProperty("entityType");
      expect(event).not.toHaveProperty("entityLabel");
      expect(event).not.toHaveProperty("propertyId");
      expect(event).not.toHaveProperty("companyId");
    });

    it("note event never contains the note body; cost event carries structured fields", async () => {
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.query = { limit: "100" };
      await workOrderController.getWorkOrderHistory(req, res);

      const noteEvent = res.body.events.find((e) => e.action === "work_order.note_created");
      expect(noteEvent?.metadata?.noteId).toBeTruthy();
      expect(JSON.stringify(noteEvent)).not.toContain("shutoff valve");

      const costEvent = res.body.events.find((e) => e.action === "work_order.cost_created");
      expect(costEvent?.metadata?.type).toBe("material");
      expect(Number(costEvent?.metadata?.amount)).toBe(185);
      expect(costEvent?.metadata?.vendorName).toBe("ABC Plumbing");
    });
  });

  describe("keyset pagination", () => {
    it("defaults to 25 (tighter than the global log), loads more without duplicates, and hard-caps at 100", async () => {
      const rows = [];
      const base = Date.now();
      const FIXTURE_COUNT = 110;
      for (let i = 0; i < FIXTURE_COUNT; i++) {
        rows.push({
          companyId: companyA.id,
          actorMembershipId: membershipOwner.id,
          actorUserId: userOwner.id,
          actorRole: "owner",
          actorName: "Chris Wallis",
          actorEmail: userOwner.email,
          action: "work_order.note_created",
          entityType: "work_order",
          entityId: workOrderA.id,
          entityLabel: "Water Leak - Lot 17",
          metadata: { noteId: "00000000-0000-4000-8000-000000000000", authorizationPath: "full_editor" },
          createdAt: new Date(base - (i + 1000) * 1000),
        });
      }
      await AuditEvent.bulkCreate(rows);

      const req = reqOwner();
      req.params = { id: workOrderA.id };
      req.query = {};
      const res = makeRes();
      await workOrderController.getWorkOrderHistory(req, res);
      expect(res.body.events.length).toBe(25);
      expect(res.body.nextCursor).toBeTruthy();

      const req2 = reqOwner();
      req2.params = { id: workOrderA.id };
      req2.query = { cursor: res.body.nextCursor };
      const res2 = makeRes();
      await workOrderController.getWorkOrderHistory(req2, res2);
      const page1Ids = new Set(res.body.events.map((e) => e.id));
      expect(res2.body.events.every((e) => !page1Ids.has(e.id))).toBe(true);

      const reqMax = reqOwner();
      reqMax.params = { id: workOrderA.id };
      reqMax.query = { limit: "9999" };
      const resMax = makeRes();
      await workOrderController.getWorkOrderHistory(reqMax, resMax);
      expect(resMax.body.events.length).toBe(100);
    });
  });
});
