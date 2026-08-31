// Technician Work Order Actions V1 — narrow, resource-scoped mutation
// rights for the specific Technician currently assigned to a Work Order,
// without granting the broad workOrder.edit capability. See
// server/authorization/workOrderActions.js and docs/Product-Bible.md.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WorkOrder, Vendor, PropertyAccess } from "../models/index.js";
import * as workOrderController from "../controllers/workOrderController.js";
import * as workOrderNoteController from "../controllers/workOrderNoteController.js";
import * as workOrderCostController from "../controllers/workOrderCostController.js";
import { reqFor, makeRes } from "./helpers/mockReqRes.js";
import { createCompany, createUser, createMembership, createProperty, createWorkOrder } from "./helpers/fixtures.js";
import { cleanupCompanies } from "./helpers/cleanup.js";

describe("Technician Work Order Actions", () => {
  let companyA, companyB;
  let userOwner, userTech, userTechOther, userTechNoAccess, userMulti, userForeign;
  let membershipOwner, membershipTech, membershipTechOther, membershipTechNoAccess, membershipMultiA, membershipMultiB, membershipForeign;
  let propertyA;
  let vendor;
  let workOrderA, workOrderUnassigned;

  beforeAll(async () => {
    companyA = await createCompany("QA TechActions Company A");
    companyB = await createCompany("QA TechActions Company B Foreign");

    userOwner = await createUser("QA Owner");
    userTech = await createUser("QA Tech Assigned");
    userTechOther = await createUser("QA Tech Other");
    userTechNoAccess = await createUser("QA Tech No Access");
    userMulti = await createUser("QA Multi Company User");
    userForeign = await createUser("QA Foreign Person");

    membershipOwner = await createMembership({ user: userOwner, company: companyA, role: "owner" });
    membershipTech = await createMembership({ user: userTech, company: companyA, role: "technician", accessMode: "restricted" });
    membershipTechOther = await createMembership({ user: userTechOther, company: companyA, role: "technician", accessMode: "restricted" });
    membershipTechNoAccess = await createMembership({ user: userTechNoAccess, company: companyA, role: "technician", accessMode: "restricted" });
    // Multi-company: a Technician in Company A (assigned to workOrderA) who
    // ALSO holds an unrelated Owner Membership in Company B — proves
    // authorization resolves the Company-A-specific Membership, never a
    // bare User id or an arbitrary/first entry in the array.
    membershipMultiA = await createMembership({ user: userMulti, company: companyA, role: "technician", accessMode: "restricted" });
    membershipMultiB = await createMembership({ user: userMulti, company: companyB, role: "owner" });
    membershipForeign = await createMembership({ user: userForeign, company: companyB, role: "owner" });

    propertyA = await createProperty({ company: companyA, name: "QA Sunset Ridge" });

    await PropertyAccess.create({ membershipId: membershipTech.id, propertyId: propertyA.id });
    await PropertyAccess.create({ membershipId: membershipTechOther.id, propertyId: propertyA.id });
    await PropertyAccess.create({ membershipId: membershipMultiA.id, propertyId: propertyA.id });
    // membershipTechNoAccess deliberately gets NO grant.

    vendor = await Vendor.create({ companyId: companyA.id, name: "QA Vendor" });

    workOrderA = await createWorkOrder({ property: propertyA, title: "QA WO Assigned", assignedMembershipId: membershipTech.id });
    workOrderUnassigned = await createWorkOrder({ property: propertyA, title: "QA WO Unassigned" });
  });

  afterAll(async () => {
    await cleanupCompanies([companyA.id, companyB.id]);
  });

  const reqOwner = () => reqFor(userOwner, [membershipOwner]);
  const reqTech = () => reqFor(userTech, [membershipTech]);
  const reqTechOther = () => reqFor(userTechOther, [membershipTechOther]);
  const reqTechNoAccess = () => reqFor(userTechNoAccess, [membershipTechNoAccess]);
  // Company B listed FIRST deliberately — proves resolution is by
  // companyId match, not array position.
  const reqMulti = () => reqFor(userMulti, [membershipMultiB, membershipMultiA]);
  const reqForeign = () => reqFor(userForeign, [membershipForeign]);

  describe("assigned Technician can perform approved operational actions", () => {
    it("moves status through the active lifecycle (open -> in_progress -> waiting -> open)", async () => {
      let req = reqTech();
      let res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "in_progress" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.body?.status).toBe("in_progress");

      req = reqTech();
      res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "waiting" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.body?.status).toBe("waiting");

      req = reqTech();
      res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "open" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.body?.status).toBe("open");
    });

    it("adds a Note to their own assigned Work Order", async () => {
      const req = reqTech();
      req.params = { workOrderId: workOrderA.id };
      req.body = { body: "QA note: replaced the part." };
      const res = makeRes();
      await workOrderNoteController.createWorkOrderNote(req, res);
      expect(res.statusCode).toBe(201);
      expect(res.body?.body).toBe("QA note: replaced the part.");
    });

    it("creates a Cost Entry on their own assigned Work Order", async () => {
      const req = reqTech();
      req.params = { workOrderId: workOrderA.id };
      req.body = { type: "material", amount: 42.5, note: "New part" };
      const res = makeRes();
      await workOrderCostController.createWorkOrderCost(req, res);
      expect(res.statusCode).toBe(201);
      expect(Number(res.body?.amount)).toBe(42.5);
    });

    it("Owner/full editor multi-field update is unaffected by the Technician allowlist", async () => {
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "in_progress", priority: "urgent", description: "Owner full edit still works" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.body?.status).toBe("in_progress");
      expect(res.body?.priority).toBe("urgent");
      expect(res.body?.description).toBe("Owner full edit still works");
    });

    it("assigned Technician can mark their own Work Order Completed", async () => {
      const req = reqTech();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "completed" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.body?.status).toBe("completed");
    });
  });

  describe("completion ends Technician mutation rights", () => {
    it("Technician status mutation fails after completion (403)", async () => {
      const req = reqTech();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "in_progress" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("Technician Note creation fails after completion (403)", async () => {
      const req = reqTech();
      req.params = { workOrderId: workOrderA.id };
      req.body = { body: "trying to add a note after completion" };
      const res = makeRes();
      await workOrderNoteController.createWorkOrderNote(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("Technician Cost creation fails after completion (403)", async () => {
      const req = reqTech();
      req.params = { workOrderId: workOrderA.id };
      req.body = { type: "labor", amount: 10 };
      const res = makeRes();
      await workOrderCostController.createWorkOrderCost(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("Technician cannot reopen a completed Work Order (403)", async () => {
      const req = reqTech();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "open" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("Owner/full editor retains reopen behavior on the now-completed Work Order", async () => {
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "open" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.body?.status).toBe("open");
    });
  });

  describe("ownership: assignment, not role, gates mutation rights", () => {
    it("Technician cannot mutate an unassigned Work Order (403)", async () => {
      const req = reqTechOther();
      const res = makeRes();
      req.params = { id: workOrderUnassigned.id };
      req.body = { status: "in_progress" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("Technician cannot mutate a Work Order assigned to another Membership (403)", async () => {
      const req = reqTechOther();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "in_progress" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("reassignment immediately removes the previous Technician's mutation rights, and grants the new assignee's", async () => {
      let req = reqOwner();
      let res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { assignedMembershipId: membershipTechOther.id };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.body?.assignee?.membershipId).toBe(membershipTechOther.id);

      req = reqTech();
      res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "waiting" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(403);

      req = reqTechOther();
      res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "waiting" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.body?.status).toBe("waiting");

      // restore for downstream tests
      req = reqOwner();
      res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { assignedMembershipId: membershipTech.id, status: "open" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.body?.assignee?.membershipId).toBe(membershipTech.id);
    });
  });

  describe("Property Access remains mandatory for assignee actions", () => {
    it("assignment to a Membership WITHOUT Property Access is itself rejected (400) — assignment never grants access", async () => {
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderUnassigned.id };
      req.body = { assignedMembershipId: membershipTechNoAccess.id };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(400);
    });

    it("assigned Technician WITHOUT Property Access cannot read or mutate the Work Order (404)", async () => {
      // Simulate "already assigned, then access never granted" directly at
      // the DB level, bypassing the (correctly-blocking) assignment API.
      workOrderUnassigned.assignedMembershipId = membershipTechNoAccess.id;
      await workOrderUnassigned.save();

      let req = reqTechNoAccess();
      let res = makeRes();
      req.params = { id: workOrderUnassigned.id };
      await workOrderController.getWorkOrder(req, res);
      expect(res.statusCode).toBe(404);

      req = reqTechNoAccess();
      res = makeRes();
      req.params = { id: workOrderUnassigned.id };
      req.body = { status: "in_progress" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(404);
    });

    it("Property Access revocation immediately removes mutation rights; restoring it immediately returns them", async () => {
      let req = reqTech();
      let res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "in_progress" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.body?.status).toBe("in_progress");

      await PropertyAccess.destroy({ where: { membershipId: membershipTech.id, propertyId: propertyA.id } });

      req = reqTech();
      res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "waiting" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(404);

      await PropertyAccess.create({ membershipId: membershipTech.id, propertyId: propertyA.id });

      req = reqTech();
      res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "open" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.body?.status).toBe("open");
    });
  });

  describe("field-level security: the assignee allowlist is exactly {status}", () => {
    it("cannot change assignment, even to themselves (403)", async () => {
      const req = reqTech();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { assignedMembershipId: membershipTech.id };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("cannot change Vendor (403)", async () => {
      const req = reqTech();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { vendorId: vendor.id };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("cannot change priority (403)", async () => {
      const req = reqTech();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { priority: "urgent" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("cannot change due date (403)", async () => {
      const req = reqTech();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { dueDate: "2026-12-25" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("cannot archive (403)", async () => {
      const req = reqTech();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      await workOrderController.archiveWorkOrder(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("cannot touch Location/Asset relationship fields, even when set to null (403)", async () => {
      const req = reqTech();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { locationId: null, assetId: null };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("cannot mutate general scalar fields (title/description/category/photoUrls/mapX/mapY) (403)", async () => {
      const req = reqTech();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { title: "Renamed by technician", description: "hijacked", category: "plumbing", photoUrls: [], mapX: 10, mapY: 10 };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("CRITICAL: a mixed allowed+forbidden payload rejects the ENTIRE request — no partial mutation", async () => {
      const before = await WorkOrder.findByPk(workOrderA.id);
      const req = reqTech();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "in_progress", priority: "urgent" };
      await workOrderController.updateWorkOrder(req, res);
      const after = await WorkOrder.findByPk(workOrderA.id);

      expect(res.statusCode).toBe(403);
      expect(after.status).toBe(before.status);
      expect(after.priority).toBe(before.priority);
    });
  });

  describe("cost security", () => {
    it("no update/delete cost-entry controller function exists — impossible by construction for every role", () => {
      expect(workOrderCostController.updateWorkOrderCost).toBeUndefined();
      expect(workOrderCostController.deleteWorkOrderCost).toBeUndefined();
    });

    it("Technician CAN create a Cost Entry on their eligible, active, assigned Work Order", async () => {
      const req = reqTech();
      req.params = { workOrderId: workOrderA.id };
      req.body = { type: "material", amount: 15 };
      const res = makeRes();
      await workOrderCostController.createWorkOrderCost(req, res);
      expect(res.statusCode).toBe(201);
    });
  });

  describe("tenant / identity", () => {
    it("foreign-company caller cannot mutate Company A's Work Order (404)", async () => {
      const req = reqForeign();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "open" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(404);
    });

    it("multi-company caller resolves the correct Company-A Membership despite Company-B being first in the array", async () => {
      const ownerReq = reqOwner();
      const ownerRes = makeRes();
      ownerReq.params = { id: workOrderA.id };
      ownerReq.body = { assignedMembershipId: membershipMultiA.id, status: "open" };
      await workOrderController.updateWorkOrder(ownerReq, ownerRes);
      expect(ownerRes.body?.assignee?.membershipId).toBe(membershipMultiA.id);

      const req = reqMulti();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "in_progress" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.body?.status).toBe("in_progress");
    });

    it("Company-B Membership grants no authority once Company-A Property Access is revoked (404) — proves the success above was really driven by the Company-A Membership", async () => {
      await PropertyAccess.destroy({ where: { membershipId: membershipMultiA.id, propertyId: propertyA.id } });
      const req = reqMulti();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "waiting" };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(404);
      await PropertyAccess.create({ membershipId: membershipMultiA.id, propertyId: propertyA.id });
    });
  });
});
