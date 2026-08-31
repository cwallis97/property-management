// Generalized Audit / Event History V1 — append-only, Company-scoped audit
// trail for high-value operational/security-sensitive mutations. See
// server/services/auditService.js, server/models/AuditEvent.js, and
// docs/Product-Bible.md.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { User, Company, Membership, Property, WorkOrder, Vendor, PropertyAccess, AuditEvent } from "../models/index.js";
import * as workOrderController from "../controllers/workOrderController.js";
import * as workOrderNoteController from "../controllers/workOrderNoteController.js";
import * as workOrderCostController from "../controllers/workOrderCostController.js";
import * as membershipController from "../controllers/membershipController.js";
import * as propertyController from "../controllers/propertyController.js";
import * as auditEventController from "../controllers/auditEventController.js";
import { reqFor, makeRes } from "./helpers/mockReqRes.js";
import { createCompany, createUser, createMembership, createProperty, createWorkOrder } from "./helpers/fixtures.js";
import { cleanupCompanies } from "./helpers/cleanup.js";

async function latestEventFor(companyId, entityId, action) {
  return AuditEvent.findOne({ where: { companyId, entityId, action }, order: [["createdAt", "DESC"]] });
}

describe("Audit Events", () => {
  let companyA, companyB;
  let userOwner, userManager, userTech, userMulti, userForeign;
  let membershipOwner, membershipManager, membershipTech, membershipForeign, membershipMultiA, membershipMultiB, membershipOwnerInB;
  let propertyA, propertyB;
  let vendor;
  let workOrderA;

  beforeAll(async () => {
    companyA = await createCompany("QA Audit Company A");
    companyB = await createCompany("QA Audit Company B Foreign");

    userOwner = await createUser("Chris Wallis");
    userManager = await createUser("Pat Manager");
    userTech = await createUser("Mike Johnson");
    userMulti = await createUser("Multi Co");
    userForeign = await createUser("Foreign Person");

    membershipOwner = await createMembership({ user: userOwner, company: companyA, role: "owner" });
    membershipManager = await createMembership({ user: userManager, company: companyA, role: "manager" });
    membershipTech = await createMembership({ user: userTech, company: companyA, role: "technician", accessMode: "restricted" });
    membershipForeign = await createMembership({ user: userForeign, company: companyB, role: "owner" });
    membershipMultiA = await createMembership({ user: userMulti, company: companyA, role: "technician", accessMode: "restricted" });
    membershipMultiB = await createMembership({ user: userMulti, company: companyB, role: "owner" });
    membershipOwnerInB = await createMembership({ user: userOwner, company: companyB, role: "owner" });

    propertyA = await createProperty({ company: companyA, name: "Sunset Ridge" });
    propertyB = await createProperty({ company: companyA, name: "Mountain View" });

    await PropertyAccess.create({ membershipId: membershipTech.id, propertyId: propertyA.id });
    await PropertyAccess.create({ membershipId: membershipMultiA.id, propertyId: propertyA.id });

    vendor = await Vendor.create({ companyId: companyA.id, name: "QA Audit Vendor" });

    workOrderA = await createWorkOrder({
      property: propertyA,
      title: "Water Leak - Lot 17",
      assignedMembershipId: membershipTech.id,
    });
  });

  afterAll(async () => {
    await cleanupCompanies([companyA.id, companyB.id]);
  });

  const reqOwner = () => reqFor(userOwner, [membershipOwner]);
  const reqManager = () => reqFor(userManager, [membershipManager]);
  const reqTech = () => reqFor(userTech, [membershipTech]);
  const reqForeign = () => reqFor(userForeign, [membershipForeign]);
  const reqMulti = () => reqFor(userMulti, [membershipMultiB, membershipMultiA]);
  const reqOwnerMulti = () => reqFor(userOwner, [membershipOwnerInB, membershipOwner]);

  describe("event creation", () => {
    it("Work Order assignment change creates one event with human-readable before/after and the real actor", async () => {
      const before = await AuditEvent.count({ where: { companyId: companyA.id } });
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { assignedMembershipId: membershipManager.id };
      await workOrderController.updateWorkOrder(req, res);
      const after = await AuditEvent.count({ where: { companyId: companyA.id } });

      expect(res.body?.assignee?.membershipId).toBe(membershipManager.id);
      expect(after).toBe(before + 1);

      const event = await latestEventFor(companyA.id, workOrderA.id, "work_order.assignment_changed");
      expect(event.before).toMatchObject({ membershipId: membershipTech.id, name: "Mike Johnson" });
      expect(event.after).toMatchObject({ membershipId: membershipManager.id, name: "Pat Manager" });
      expect(event.entityLabel).toBe(workOrderA.title);
      expect(event.propertyId).toBe(propertyA.id);
      expect(event.actorMembershipId).toBe(membershipOwner.id);
      expect(event.actorName).toBe("Chris Wallis");

      // reassign back to Tech for downstream tests
      const revertReq = reqOwner();
      const revertRes = makeRes();
      revertReq.params = { id: workOrderA.id };
      revertReq.body = { assignedMembershipId: membershipTech.id };
      await workOrderController.updateWorkOrder(revertReq, revertRes);
      expect(revertRes.body?.assignee?.membershipId).toBe(membershipTech.id);
    });

    it("status change by a full editor creates one event with authorizationPath=full_editor", async () => {
      const before = await AuditEvent.count({ where: { companyId: companyA.id } });
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "in_progress" };
      await workOrderController.updateWorkOrder(req, res);
      const after = await AuditEvent.count({ where: { companyId: companyA.id } });

      expect(res.body?.status).toBe("in_progress");
      expect(after).toBe(before + 1);
      const event = await latestEventFor(companyA.id, workOrderA.id, "work_order.status_changed");
      expect(event.before).toMatchObject({ status: "open" });
      expect(event.after).toMatchObject({ status: "in_progress" });
      expect(event.metadata?.authorizationPath).toBe("full_editor");
      expect(event.actorRole).toBe("owner");
    });

    it("status change by the assigned Technician records authorizationPath=assigned_technician and the Technician's own actor identity", async () => {
      const before = await AuditEvent.count({ where: { companyId: companyA.id } });
      const req = reqTech();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "waiting" };
      await workOrderController.updateWorkOrder(req, res);
      const after = await AuditEvent.count({ where: { companyId: companyA.id } });

      expect(res.body?.status).toBe("waiting");
      expect(after).toBe(before + 1);
      const event = await latestEventFor(companyA.id, workOrderA.id, "work_order.status_changed");
      expect(event.actorRole).toBe("technician");
      expect(event.actorMembershipId).toBe(membershipTech.id);
      expect(event.metadata?.authorizationPath).toBe("assigned_technician");
    });

    it("Note creation records only noteId + authorizationPath — never the note body", async () => {
      const before = await AuditEvent.count({ where: { companyId: companyA.id } });
      const req = reqTech();
      req.params = { workOrderId: workOrderA.id };
      req.body = { body: "Replaced the shutoff valve and pressure-tested the line." };
      const res = makeRes();
      await workOrderNoteController.createWorkOrderNote(req, res);
      const after = await AuditEvent.count({ where: { companyId: companyA.id } });

      expect(res.statusCode).toBe(201);
      expect(after).toBe(before + 1);
      const event = await latestEventFor(companyA.id, workOrderA.id, "work_order.note_created");
      expect(event.metadata?.noteId).toBe(res.body.id);
      expect(event.metadata?.body).toBeUndefined();
      expect(JSON.stringify(event.toJSON())).not.toContain("shutoff valve");
      expect(event.metadata?.authorizationPath).toBe("assigned_technician");
    });

    it("Cost creation records structured fields (type/amount/costDate/vendor) — never the free-text note", async () => {
      const before = await AuditEvent.count({ where: { companyId: companyA.id } });
      const req = reqTech();
      req.params = { workOrderId: workOrderA.id };
      req.body = { type: "material", amount: 185, note: "Copper pipe and fittings", costDate: "2026-08-20", vendorId: vendor.id };
      const res = makeRes();
      await workOrderCostController.createWorkOrderCost(req, res);
      const after = await AuditEvent.count({ where: { companyId: companyA.id } });

      expect(res.statusCode).toBe(201);
      expect(after).toBe(before + 1);
      const event = await latestEventFor(companyA.id, workOrderA.id, "work_order.cost_created");
      expect(event.metadata).toMatchObject({
        costEntryId: res.body.id,
        type: "material",
        costDate: "2026-08-20",
        vendorId: vendor.id,
        vendorName: "QA Audit Vendor",
      });
      expect(Number(event.metadata.amount)).toBe(185);
      expect(event.metadata?.note).toBeUndefined();
      expect(JSON.stringify(event.toJSON())).not.toContain("Copper pipe");
    });

    it("role change creates one event with before/after roles and the target member's name", async () => {
      const before = await AuditEvent.count({ where: { companyId: companyA.id } });
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: membershipTech.id };
      req.body = { role: "manager" };
      await membershipController.updateMemberRole(req, res);
      const after = await AuditEvent.count({ where: { companyId: companyA.id } });

      expect(res.body?.role).toBe("manager");
      expect(after).toBe(before + 1);
      const event = await latestEventFor(companyA.id, membershipTech.id, "membership.role_changed");
      expect(event.before).toMatchObject({ role: "technician" });
      expect(event.after).toMatchObject({ role: "manager" });
      expect(event.entityLabel).toBe("Mike Johnson");
      expect(event.actorMembershipId).toBe(membershipOwner.id);

      const revertReq = reqOwner();
      const revertRes = makeRes();
      revertReq.params = { id: membershipTech.id };
      revertReq.body = { role: "technician" };
      await membershipController.updateMemberRole(revertReq, revertRes);
      expect(revertRes.body?.role).toBe("technician");
    });

    it("Property Access change creates one event with human-readable added/removed Property names", async () => {
      const before = await AuditEvent.count({ where: { companyId: companyA.id } });
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: membershipTech.id };
      req.body = { accessMode: "restricted", propertyIds: [propertyB.id] };
      await membershipController.updateMemberPropertyAccess(req, res);
      const after = await AuditEvent.count({ where: { companyId: companyA.id } });

      expect(res.body?.propertyIds).toEqual([propertyB.id]);
      expect(after).toBe(before + 1);
      const event = await latestEventFor(companyA.id, membershipTech.id, "membership.property_access_changed");
      expect(event.metadata?.addedProperties?.some((p) => p.name === propertyB.name)).toBe(true);
      expect(event.metadata?.removedProperties?.some((p) => p.name === propertyA.name)).toBe(true);
      expect(event.before).toMatchObject({ accessMode: "restricted" });
      expect(event.after).toMatchObject({ accessMode: "restricted" });

      // restore Tech's access to Sunset Ridge for downstream tests
      const revertReq = reqOwner();
      const revertRes = makeRes();
      revertReq.params = { id: membershipTech.id };
      revertReq.body = { accessMode: "restricted", propertyIds: [propertyA.id] };
      await membershipController.updateMemberPropertyAccess(revertReq, revertRes);
      expect(revertRes.body?.propertyIds).toEqual([propertyA.id]);
    });

    it("Property archived/restored create semantic events with no noisy before/after", async () => {
      let before = await AuditEvent.count({ where: { companyId: companyA.id } });
      let req = reqOwner();
      let res = makeRes();
      req.params = { id: propertyB.id };
      req.body = { status: "archived" };
      await propertyController.updateProperty(req, res);
      let after = await AuditEvent.count({ where: { companyId: companyA.id } });
      expect(res.body?.status).toBe("archived");
      expect(after).toBe(before + 1);
      let event = await latestEventFor(companyA.id, propertyB.id, "property.archived");
      expect(event.before).toBeNull();
      expect(event.after).toBeNull();
      expect(event.entityLabel).toBe(propertyB.name);

      before = await AuditEvent.count({ where: { companyId: companyA.id } });
      req = reqOwner();
      res = makeRes();
      req.params = { id: propertyB.id };
      req.body = { status: "active" };
      await propertyController.updateProperty(req, res);
      after = await AuditEvent.count({ where: { companyId: companyA.id } });
      expect(res.body?.status).toBe("active");
      expect(after).toBe(before + 1);
      event = await latestEventFor(companyA.id, propertyB.id, "property.restored");
      expect(event.action).toBe("property.restored");
    });
  });

  describe("no-op and failed mutations create no event", () => {
    it("resubmitting the same status creates no event", async () => {
      const before = await AuditEvent.count({ where: { companyId: companyA.id } });
      const req = reqTech();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "waiting" };
      await workOrderController.updateWorkOrder(req, res);
      const after = await AuditEvent.count({ where: { companyId: companyA.id } });
      expect(after).toBe(before);
      expect(res.body?.status).toBe("waiting");
    });

    it("resubmitting the same assignee creates no event", async () => {
      const before = await AuditEvent.count({ where: { companyId: companyA.id } });
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { assignedMembershipId: membershipTech.id };
      await workOrderController.updateWorkOrder(req, res);
      const after = await AuditEvent.count({ where: { companyId: companyA.id } });
      expect(after).toBe(before);
    });

    it("resubmitting the same role creates no event", async () => {
      const before = await AuditEvent.count({ where: { companyId: companyA.id } });
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: membershipTech.id };
      req.body = { role: "technician" };
      await membershipController.updateMemberRole(req, res);
      const after = await AuditEvent.count({ where: { companyId: companyA.id } });
      expect(after).toBe(before);
    });

    it("resubmitting the same Property Access set creates no event", async () => {
      const before = await AuditEvent.count({ where: { companyId: companyA.id } });
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: membershipTech.id };
      req.body = { accessMode: "restricted", propertyIds: [propertyA.id] };
      await membershipController.updateMemberPropertyAccess(req, res);
      const after = await AuditEvent.count({ where: { companyId: companyA.id } });
      expect(after).toBe(before);
    });

    it("a forbidden Technician mutation (403) creates no event", async () => {
      const before = await AuditEvent.count({ where: { companyId: companyA.id } });
      const req = reqTech();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { vendorId: vendor.id };
      await workOrderController.updateWorkOrder(req, res);
      const after = await AuditEvent.count({ where: { companyId: companyA.id } });
      expect(res.statusCode).toBe(403);
      expect(after).toBe(before);
    });

    it("an invalid status value (400) creates no event", async () => {
      const before = await AuditEvent.count({ where: { companyId: companyA.id } });
      const req = reqOwner();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "not-a-real-status" };
      await workOrderController.updateWorkOrder(req, res);
      const after = await AuditEvent.count({ where: { companyId: companyA.id } });
      expect(res.statusCode).toBe(400);
      expect(after).toBe(before);
    });

    it("a rejected cross-company mutation (404) creates no event anywhere", async () => {
      const before = await AuditEvent.count({});
      const req = reqForeign();
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "open" };
      await workOrderController.updateWorkOrder(req, res);
      const after = await AuditEvent.count({});
      expect(res.statusCode).toBe(404);
      expect(after).toBe(before);
    });
  });

  describe("atomicity", () => {
    it("an induced AuditEvent insert failure rolls back the business mutation instead of silently applying without its audit event", async () => {
      const originalCreate = AuditEvent.create;
      AuditEvent.create = async () => {
        throw new Error("__QA_INDUCED_AUDIT_FAILURE__");
      };
      const before = await WorkOrder.findByPk(workOrderA.id);
      const beforeStatus = before.status;
      let threw = false;
      try {
        const req = reqOwner();
        const res = makeRes();
        req.params = { id: workOrderA.id };
        req.body = { status: "open" };
        await workOrderController.updateWorkOrder(req, res);
      } catch (err) {
        threw = err.message === "__QA_INDUCED_AUDIT_FAILURE__";
      } finally {
        AuditEvent.create = originalCreate;
      }
      const after = await WorkOrder.findByPk(workOrderA.id);
      expect(threw).toBe(true);
      expect(after.status).toBe(beforeStatus);
    });
  });

  describe("actor resolution", () => {
    it("multi-company caller resolves the Company-A membership/role, regardless of array order, and it is never accepted from the request body", async () => {
      const ownerReq = reqOwner();
      const ownerRes = makeRes();
      ownerReq.params = { id: workOrderA.id };
      ownerReq.body = { assignedMembershipId: membershipMultiA.id, status: "open" };
      await workOrderController.updateWorkOrder(ownerReq, ownerRes);
      expect(ownerRes.body?.assignee?.membershipId).toBe(membershipMultiA.id);

      const before = await AuditEvent.count({ where: { companyId: companyA.id } });
      const req = reqMulti(); // Company B listed FIRST in memberships, deliberately
      const res = makeRes();
      req.params = { id: workOrderA.id };
      req.body = { status: "in_progress" };
      await workOrderController.updateWorkOrder(req, res);
      const after = await AuditEvent.count({ where: { companyId: companyA.id } });

      expect(res.body?.status).toBe("in_progress");
      expect(after).toBe(before + 1);
      const event = await latestEventFor(companyA.id, workOrderA.id, "work_order.status_changed");
      expect(event.actorMembershipId).toBe(membershipMultiA.id);
      expect(event.actorRole).toBe("technician");
      expect(event.companyId).toBe(companyA.id);
    });

    it("a crafted actorMembershipId/actorUserId in the request body is ignored — the real caller is always recorded", async () => {
      const req = reqOwner();
      req.body = {
        status: "waiting",
        actorMembershipId: "00000000-0000-4000-8000-000000000000",
        actorUserId: "00000000-0000-4000-8000-000000000000",
      };
      req.params = { id: workOrderA.id };
      const res = makeRes();
      await workOrderController.updateWorkOrder(req, res);
      const event = await latestEventFor(companyA.id, workOrderA.id, "work_order.status_changed");
      expect(event.actorMembershipId).toBe(membershipOwner.id);
      expect(event.actorUserId).toBe(userOwner.id);
    });
  });

  describe("global Audit Log read authorization", () => {
    it("Admin/Owner may read", async () => {
      const req = reqOwner();
      const res = makeRes();
      req.query = { limit: "10" };
      await auditEventController.listAuditEvents(req, res);
      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
    });

    it("Manager is denied (403) — auditLog.read is Admin/Owner-only", async () => {
      const req = reqManager();
      const res = makeRes();
      req.query = {};
      await auditEventController.listAuditEvents(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("Technician is denied (403)", async () => {
      const req = reqTech();
      const res = makeRes();
      req.query = {};
      await auditEventController.listAuditEvents(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("Company B's own read never returns Company A's events", async () => {
      const req = reqForeign();
      const res = makeRes();
      req.query = {};
      await auditEventController.listAuditEvents(req, res);
      const ids = (res.body?.events ?? []).map((e) => e.entityId);
      expect(ids).not.toContain(workOrderA.id);
    });

    it("multi-company Owner can read Company A explicitly, despite Company B being first in the membership array", async () => {
      const req = reqOwnerMulti();
      req.query = { companyId: companyA.id, limit: "5" };
      const res = makeRes();
      await auditEventController.listAuditEvents(req, res);
      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
    });

    it("omitting companyId defaults to the caller's own Company (single-company UX preserved)", async () => {
      const req = reqOwner();
      req.query = { limit: "5" };
      const res = makeRes();
      await auditEventController.listAuditEvents(req, res);
      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
    });

    it("requesting a companyId the caller doesn't belong to is rejected (403)", async () => {
      const req = reqOwner();
      req.query = { companyId: companyB.id };
      const res = makeRes();
      await auditEventController.listAuditEvents(req, res);
      expect(res.statusCode).toBe(403);
    });
  });

  describe("keyset pagination", () => {
    it("is newest-first, deterministic across page boundaries, and hard-caps at 100 regardless of requested limit", async () => {
      const bulkCompany = await Company.create({ name: "QA Audit Pagination Co" });
      const bulkUser = await User.create({ firebaseUid: `qa_page_${bulkCompany.id}`, email: `qa-page-${bulkCompany.id}@example.test`, displayName: "Page Tester" });
      const bulkMembership = await Membership.create({ userId: bulkUser.id, companyId: bulkCompany.id, role: "owner", accessMode: "all" });
      bulkMembership.company = bulkCompany;

      const rows = [];
      const base = Date.now();
      const FIXTURE_COUNT = 150;
      for (let i = 0; i < FIXTURE_COUNT; i++) {
        rows.push({
          companyId: bulkCompany.id,
          actorMembershipId: bulkMembership.id,
          actorUserId: bulkUser.id,
          actorRole: "owner",
          actorName: "Page Tester",
          actorEmail: bulkUser.email,
          action: "property.archived",
          entityType: "property",
          entityId: propertyA.id,
          entityLabel: `QA Bulk ${i}`,
          createdAt: new Date(base - i * 1000),
        });
      }
      await AuditEvent.bulkCreate(rows);

      try {
        const reqBulk = () => reqFor(bulkUser, [bulkMembership]);

        const req = reqBulk();
        req.query = {};
        const res = makeRes();
        await auditEventController.listAuditEvents(req, res);
        expect(res.body?.events?.length).toBe(50);
        expect(res.body?.nextCursor).toBeTruthy();
        expect(new Date(res.body.events[0].createdAt).getTime()).toBeGreaterThan(new Date(res.body.events[49].createdAt).getTime());

        const req2 = reqBulk();
        req2.query = { cursor: res.body.nextCursor };
        const res2 = makeRes();
        await auditEventController.listAuditEvents(req2, res2);
        expect(res2.body?.events?.length).toBe(50);
        expect(res2.body?.nextCursor).toBeTruthy();

        const req3 = reqBulk();
        req3.query = { cursor: res2.body.nextCursor };
        const res3 = makeRes();
        await auditEventController.listAuditEvents(req3, res3);
        expect(res3.body?.events?.length).toBe(50);
        expect(res3.body?.nextCursor).toBeNull();

        const allIds = new Set([...res.body.events, ...res2.body.events, ...res3.body.events].map((e) => e.id));
        expect(allIds.size).toBe(FIXTURE_COUNT);

        const reqMax = reqBulk();
        reqMax.query = { limit: "9999" };
        const resMax = makeRes();
        await auditEventController.listAuditEvents(reqMax, resMax);
        expect(resMax.body?.events?.length).toBe(100);
      } finally {
        await AuditEvent.destroy({ where: { companyId: bulkCompany.id } });
        await Membership.destroy({ where: { id: bulkMembership.id } });
        await User.destroy({ where: { id: bulkUser.id } });
        await Company.destroy({ where: { id: bulkCompany.id } });
      }
    });
  });
});
