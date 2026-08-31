// Work Order Assignment / My Work V1 — operational responsibility assigned
// to one specific Membership/person, independent of Property Access
// (assignment never grants it) and independent of Technician mutation
// rights (a separate, narrower milestone). See
// server/controllers/workOrderController.js and userController.js.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PropertyAccess } from "../models/index.js";
import * as workOrderController from "../controllers/workOrderController.js";
import * as userController from "../controllers/userController.js";
import { reqFor, makeRes } from "./helpers/mockReqRes.js";
import { createCompany, createUser, createMembership, createProperty, createWorkOrder } from "./helpers/fixtures.js";
import { cleanupCompanies } from "./helpers/cleanup.js";

describe("Work Order Assignment / My Work", () => {
  let companyA, companyB;
  let userOwner, userManager, userTechA, userTechB, userForeign, userMulti;
  let membershipOwner, membershipManager, membershipTechA, membershipTechB, membershipForeign, membershipMultiA, membershipMultiB;
  let propertyA, propertyB;
  let workOrderA;

  beforeAll(async () => {
    companyA = await createCompany("QA Assignment Company A");
    companyB = await createCompany("QA Assignment Company B Foreign");

    userOwner = await createUser("QA Owner");
    userManager = await createUser("QA Manager");
    userTechA = await createUser("QA Tech With Access");
    userTechB = await createUser("QA Tech Without Access");
    userForeign = await createUser("QA Foreign Person");
    userMulti = await createUser("QA Multi Company User");

    membershipOwner = await createMembership({ user: userOwner, company: companyA, role: "owner" });
    membershipManager = await createMembership({ user: userManager, company: companyA, role: "manager" });
    membershipTechA = await createMembership({ user: userTechA, company: companyA, role: "technician", accessMode: "restricted" });
    membershipTechB = await createMembership({ user: userTechB, company: companyA, role: "technician", accessMode: "restricted" });
    membershipForeign = await createMembership({ user: userForeign, company: companyB, role: "owner" });
    membershipMultiA = await createMembership({ user: userMulti, company: companyA, role: "technician", accessMode: "restricted" });
    membershipMultiB = await createMembership({ user: userMulti, company: companyB, role: "owner" });

    propertyA = await createProperty({ company: companyA, name: "QA Property A" });
    propertyB = await createProperty({ company: companyA, name: "QA Property B" });

    // TechA and MultiA have access to propertyA; TechB deliberately does not.
    await PropertyAccess.create({ membershipId: membershipTechA.id, propertyId: propertyA.id });
    await PropertyAccess.create({ membershipId: membershipMultiA.id, propertyId: propertyA.id });

    workOrderA = await createWorkOrder({ property: propertyA, title: "QA Assignment Work Order" });
  });

  afterAll(async () => {
    await cleanupCompanies([companyA.id, companyB.id]);
  });

  const reqOwner = () => reqFor(userOwner, [membershipOwner]);
  const reqManager = () => reqFor(userManager, [membershipManager]);
  const reqTechA = () => reqFor(userTechA, [membershipTechA]);
  const reqTechB = () => reqFor(userTechB, [membershipTechB]);
  const reqForeign = () => reqFor(userForeign, [membershipForeign]);
  const reqMulti = () => reqFor(userMulti, [membershipMultiB, membershipMultiA]);

  describe("assigning, unassigning, and reassigning", () => {
    it("Owner can assign the Work Order to a specific eligible person", async () => {
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { assignedMembershipId: membershipTechA.id };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.body?.assignee).toMatchObject({ membershipId: membershipTechA.id });
    });

    it("Manager can reassign to a different eligible person", async () => {
      const req = reqManager();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { assignedMembershipId: membershipMultiA.id };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.body?.assignee?.membershipId).toBe(membershipMultiA.id);
    });

    it("can be unassigned back to null", async () => {
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { assignedMembershipId: null };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.body?.assignee).toBeNull();
    });
  });

  describe("assignee eligibility", () => {
    it("assignee must belong to the same Company — a foreign Membership id is rejected", async () => {
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { assignedMembershipId: membershipForeign.id };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(404);
    });

    it("assignee must already have Property Access to the Work Order's Property — a same-company Membership without it is rejected", async () => {
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { assignedMembershipId: membershipTechB.id };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(400);
    });

    it("getAssignableMembers only lists Company members who already have Property Access to this Property", async () => {
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      await workOrderController.getAssignableMembers(req, res);
      const ids = res.body.map((m) => m.membershipId);
      expect(ids).toContain(membershipTechA.id);
      expect(ids).toContain(membershipMultiA.id);
      expect(ids).not.toContain(membershipTechB.id);
    });
  });

  describe("assignment never grants Property Access", () => {
    it("assigning a Work Order does not create any PropertyAccess grant as a side effect", async () => {
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { assignedMembershipId: membershipTechA.id };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.body?.assignee?.membershipId).toBe(membershipTechA.id);

      // TechA's only real grant is the one created explicitly in setup —
      // assignment must not have added a second one for propertyB or
      // anything else.
      const grants = await PropertyAccess.findAll({ where: { membershipId: membershipTechA.id } });
      expect(grants.map((g) => g.propertyId)).toEqual([propertyA.id]);
    });

    it("a stale assignee who later loses Property Access remains assigned in the database but harmless — reads simply stop surfacing it for them", async () => {
      await PropertyAccess.destroy({ where: { membershipId: membershipTechA.id, propertyId: propertyA.id } });

      const req = reqTechA();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      await workOrderController.getWorkOrder(req, res);
      expect(res.statusCode).toBe(404);

      const ownerReq = reqOwner();
      const ownerRes = makeRes();
      ownerReq.params = { id: workOrderA.id };
      await workOrderController.getWorkOrder(ownerReq, ownerRes);
      expect(ownerRes.body?.assignee?.membershipId).toBe(membershipTechA.id); // unchanged — never auto-cleared

      // restore for downstream tests
      await PropertyAccess.create({ membershipId: membershipTechA.id, propertyId: propertyA.id });
    });
  });

  describe("My Work identity", () => {
    it("/api/users/me exposes the caller's own membershipId for the current Company", async () => {
      const req = reqTechA();
      const res = makeRes();
      userController.getCurrentUser(req, res);
      const myMembershipId = res.body.companies?.find((c) => c.id === companyA.id)?.membershipId;
      expect(myMembershipId).toBe(membershipTechA.id);
    });

    it("multi-company caller resolves the Company-A membershipId, never the Company-B one, regardless of array order", async () => {
      const req = reqMulti(); // Company B listed FIRST
      const res = makeRes();
      userController.getCurrentUser(req, res);
      const companyAEntry = res.body.companies?.find((c) => c.id === companyA.id);
      const companyBEntry = res.body.companies?.find((c) => c.id === companyB.id);
      expect(companyAEntry?.membershipId).toBe(membershipMultiA.id);
      expect(companyBEntry?.membershipId).toBe(membershipMultiB.id);
    });
  });

  describe("Technician cannot mutate assignment", () => {
    it("an assigned Technician cannot reassign, clear, or self-assign the Work Order (403)", async () => {
      const setupReq = reqOwner();
      const setupRes = makeRes();
      setupReq.params = { id: workOrderA.id };
      setupReq.body = { assignedMembershipId: membershipTechA.id };
      await workOrderController.updateWorkOrder(setupReq, setupRes);
      expect(setupRes.body?.assignee?.membershipId).toBe(membershipTechA.id);

      let req = reqTechA();
      let res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { assignedMembershipId: membershipTechA.id }; // even to themselves
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(403);

      req = reqTechA();
      res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { assignedMembershipId: null };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("Technician cannot enumerate assignable members", async () => {
      const req = reqTechA();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      await workOrderController.getAssignableMembers(req, res);
      expect(res.statusCode).toBe(403);
    });
  });

  describe("cross-company isolation", () => {
    it("a foreign-company caller cannot assign or read this Work Order (404)", async () => {
      let req = reqForeign();
      let res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { assignedMembershipId: membershipForeign.id };
      await workOrderController.updateWorkOrder(req, res);
      expect(res.statusCode).toBe(404);

      req = reqForeign();
      res = makeRes();
      req.params = { id: workOrderA.id };
      await workOrderController.getWorkOrder(req, res);
      expect(res.statusCode).toBe(404);
    });
  });
});
