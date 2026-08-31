// Property Access V1 — the server-enforced answer to "which Properties may
// this Membership see/operate within," independent of role/capability
// (what they may do) and independent of Property Scope (a frontend-only
// UX lens, not tested here since it makes no authorization decisions).
// See server/authorization/propertyAccess.js.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PropertyAccess } from "../models/index.js";
import * as propertyController from "../controllers/propertyController.js";
import * as workOrderController from "../controllers/workOrderController.js";
import * as membershipController from "../controllers/membershipController.js";
import { reqFor, makeRes } from "./helpers/mockReqRes.js";
import { createCompany, createUser, createMembership, createProperty, createWorkOrder } from "./helpers/fixtures.js";
import { cleanupCompanies } from "./helpers/cleanup.js";

describe("Property Access", () => {
  let companyA, companyB;
  let userOwner, userAdmin, userManagerAll, userManagerRestricted, userTechRestricted, userForeign;
  let membershipOwner, membershipAdmin, membershipManagerAll, membershipManagerRestricted, membershipTechRestricted, membershipForeign;
  let propertyA, propertyB, propertyForeign;
  let workOrderOnA, workOrderOnB;

  beforeAll(async () => {
    companyA = await createCompany("QA PropertyAccess Company A");
    companyB = await createCompany("QA PropertyAccess Company B Foreign");

    userOwner = await createUser("QA Owner");
    userAdmin = await createUser("QA Admin");
    userManagerAll = await createUser("QA Manager All");
    userManagerRestricted = await createUser("QA Manager Restricted");
    userTechRestricted = await createUser("QA Tech Restricted");
    userForeign = await createUser("QA Foreign Person");

    membershipOwner = await createMembership({ user: userOwner, company: companyA, role: "owner", accessMode: "all" });
    membershipAdmin = await createMembership({ user: userAdmin, company: companyA, role: "admin", accessMode: "all" });
    membershipManagerAll = await createMembership({ user: userManagerAll, company: companyA, role: "manager", accessMode: "all" });
    membershipManagerRestricted = await createMembership({ user: userManagerRestricted, company: companyA, role: "manager", accessMode: "restricted" });
    membershipTechRestricted = await createMembership({ user: userTechRestricted, company: companyA, role: "technician", accessMode: "restricted" });
    membershipForeign = await createMembership({ user: userForeign, company: companyB, role: "owner", accessMode: "all" });

    propertyA = await createProperty({ company: companyA, name: "QA Property A (granted)" });
    propertyB = await createProperty({ company: companyA, name: "QA Property B (not granted)" });
    propertyForeign = await createProperty({ company: companyB, name: "QA Property Foreign" });

    // Both restricted members are granted ONLY propertyA.
    await PropertyAccess.create({ membershipId: membershipManagerRestricted.id, propertyId: propertyA.id });
    await PropertyAccess.create({ membershipId: membershipTechRestricted.id, propertyId: propertyA.id });

    workOrderOnA = await createWorkOrder({ property: propertyA, title: "QA WO on Property A" });
    workOrderOnB = await createWorkOrder({ property: propertyB, title: "QA WO on Property B" });
  });

  afterAll(async () => {
    await cleanupCompanies([companyA.id, companyB.id]);
  });

  // Deliberately async + reload(): several tests below mutate a
  // Membership's own accessMode/role columns via the real controllers
  // (updateMemberRole/updateMemberPropertyAccess), which act on their OWN
  // freshly-queried Sequelize instance, not the JS object these fixtures
  // hold onto. Without reloading here, a later reqXxx() call would build a
  // request around a STALE in-memory role/accessMode value even though the
  // database has already changed — silently testing the wrong thing.
  // reload() only refreshes real columns, so the hand-attached `.company`
  // property (see fixtures.js) survives it untouched.
  async function reqOwner() {
    await membershipOwner.reload();
    return reqFor(userOwner, [membershipOwner]);
  }
  async function reqAdmin() {
    await membershipAdmin.reload();
    return reqFor(userAdmin, [membershipAdmin]);
  }
  async function reqManagerAll() {
    await membershipManagerAll.reload();
    return reqFor(userManagerAll, [membershipManagerAll]);
  }
  async function reqManagerRestricted() {
    await membershipManagerRestricted.reload();
    return reqFor(userManagerRestricted, [membershipManagerRestricted]);
  }
  async function reqTechRestricted() {
    await membershipTechRestricted.reload();
    return reqFor(userTechRestricted, [membershipTechRestricted]);
  }
  async function reqForeign() {
    return reqFor(userForeign, [membershipForeign]);
  }

  describe("accessMode: all", () => {
    it("Owner/Admin/Manager(all) see every Property in the Company when listing", async () => {
      for (const req of [await reqOwner(), await reqAdmin(), await reqManagerAll()]) {
        const res = makeRes();
        await propertyController.listProperties(req, res);
        const ids = res.body.map((p) => p.id);
        expect(ids).toContain(propertyA.id);
        expect(ids).toContain(propertyB.id);
      }
    });

    it("Owner/Admin/Manager(all) can read either Property directly", async () => {
      for (const req of [await reqOwner(), await reqAdmin(), await reqManagerAll()]) {
        for (const property of [propertyA, propertyB]) {
          const res = makeRes();
          req.params = { id: property.id };
          await propertyController.getProperty(req, res);
          expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
        }
      }
    });
  });

  describe("accessMode: restricted", () => {
    it("restricted Manager/Technician only see the granted Property when listing", async () => {
      for (const req of [await reqManagerRestricted(), await reqTechRestricted()]) {
        const res = makeRes();
        await propertyController.listProperties(req, res);
        const ids = res.body.map((p) => p.id);
        expect(ids).toContain(propertyA.id);
        expect(ids).not.toContain(propertyB.id);
      }
    });

    it("restricted Manager/Technician can read the granted Property directly", async () => {
      for (const req of [await reqManagerRestricted(), await reqTechRestricted()]) {
        const res = makeRes();
        req.params = { id: propertyA.id };
        await propertyController.getProperty(req, res);
        expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
      }
    });

    it("restricted Manager/Technician get 404 (never 403) reading a Property they aren't granted — indistinguishable from nonexistent", async () => {
      for (const req of [await reqManagerRestricted(), await reqTechRestricted()]) {
        const res = makeRes();
        req.params = { id: propertyB.id };
        await propertyController.getProperty(req, res);
        expect(res.statusCode).toBe(404);
      }
    });

    it("Property Access is inherited by Property-owned resources: Work Orders on the granted Property are readable, on the ungranted Property are not", async () => {
      let req = await reqTechRestricted();
      let res = makeRes();
      req.params = { id: workOrderOnA.id };
      await workOrderController.getWorkOrder(req, res);
      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);

      req = await reqTechRestricted();
      res = makeRes();
      req.params = { id: workOrderOnB.id };
      await workOrderController.getWorkOrder(req, res);
      expect(res.statusCode).toBe(404);
    });
  });

  describe("Property Access changes take effect immediately", () => {
    it("granting access to a previously-ungranted Property is immediately usable", async () => {
      await PropertyAccess.create({ membershipId: membershipTechRestricted.id, propertyId: propertyB.id });

      const req = await reqTechRestricted();
      const res = makeRes();
      req.params = { id: propertyB.id };
      await propertyController.getProperty(req, res);
      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
    });

    it("revoking access immediately removes it — no caching, no stale grant", async () => {
      await PropertyAccess.destroy({ where: { membershipId: membershipTechRestricted.id, propertyId: propertyB.id } });

      const req = await reqTechRestricted();
      const res = makeRes();
      req.params = { id: propertyB.id };
      await propertyController.getProperty(req, res);
      expect(res.statusCode).toBe(404);
    });

    it("updateMemberPropertyAccess correctly replaces the granted set and immediately affects reads", async () => {
      let req = await reqOwner();
      let res = makeRes();
      req.params = { id: membershipManagerRestricted.id };
      req.body = { accessMode: "restricted", propertyIds: [propertyB.id] };
      await membershipController.updateMemberPropertyAccess(req, res);
      expect(res.body?.propertyIds).toEqual([propertyB.id]);

      // Now granted B, no longer granted A.
      req = await reqManagerRestricted();
      res = makeRes();
      req.params = { id: propertyB.id };
      await propertyController.getProperty(req, res);
      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);

      req = await reqManagerRestricted();
      res = makeRes();
      req.params = { id: propertyA.id };
      await propertyController.getProperty(req, res);
      expect(res.statusCode).toBe(404);

      // restore for downstream tests
      const revertReq = await reqOwner();
      const revertRes = makeRes();
      revertReq.params = { id: membershipManagerRestricted.id };
      revertReq.body = { accessMode: "restricted", propertyIds: [propertyA.id] };
      await membershipController.updateMemberPropertyAccess(revertReq, revertRes);
      expect(revertRes.body?.propertyIds).toEqual([propertyA.id]);
    });

    it("switching accessMode back to 'all' grants every Property and clears stored grants", async () => {
      const req = await reqOwner();
      const res = makeRes();
      req.params = { id: membershipTechRestricted.id };
      req.body = { accessMode: "all" };
      await membershipController.updateMemberPropertyAccess(req, res);
      expect(res.body?.accessMode).toBe("all");

      const grants = await PropertyAccess.count({ where: { membershipId: membershipTechRestricted.id } });
      expect(grants).toBe(0);

      const readReq = await reqTechRestricted();
      const readRes = makeRes();
      readReq.params = { id: propertyB.id };
      await propertyController.getProperty(readReq, readRes);
      expect(readRes.statusCode === 200 || readRes.statusCode === undefined).toBe(true);

      // restore restricted-to-A for downstream tests
      const revertReq = await reqOwner();
      const revertRes = makeRes();
      revertReq.params = { id: membershipTechRestricted.id };
      revertReq.body = { accessMode: "restricted", propertyIds: [propertyA.id] };
      await membershipController.updateMemberPropertyAccess(revertReq, revertRes);
      expect(revertRes.body?.propertyIds).toEqual([propertyA.id]);
    });
  });

  describe("Owner/Admin are always unrestricted", () => {
    it("updateMemberPropertyAccess refuses to restrict an Admin or Owner", async () => {
      let req = await reqOwner();
      let res = makeRes();
      req.params = { id: membershipAdmin.id };
      req.body = { accessMode: "restricted", propertyIds: [propertyA.id] };
      await membershipController.updateMemberPropertyAccess(req, res);
      expect(res.statusCode).toBe(400);

      req = await reqOwner();
      res = makeRes();
      req.params = { id: membershipOwner.id };
      req.body = { accessMode: "restricted", propertyIds: [propertyA.id] };
      await membershipController.updateMemberPropertyAccess(req, res);
      expect(res.statusCode).toBe(400);
    });

    it("promoting a restricted Manager to Admin forces accessMode back to 'all' and clears grants", async () => {
      const req = await reqOwner();
      const res = makeRes();
      req.params = { id: membershipManagerRestricted.id };
      req.body = { role: "admin" };
      await membershipController.updateMemberRole(req, res);
      expect(res.body?.accessMode).toBe("all");

      const grants = await PropertyAccess.count({ where: { membershipId: membershipManagerRestricted.id } });
      expect(grants).toBe(0);

      // Restore to Manager for downstream tests. Demoting away from Admin
      // does NOT itself re-restrict accessMode (there's no reverse of the
      // promote-to-admin special case) — proving that requires its own
      // explicit updateMemberPropertyAccess call, the real API path.
      const revertRoleReq = await reqOwner();
      const revertRoleRes = makeRes();
      revertRoleReq.params = { id: membershipManagerRestricted.id };
      revertRoleReq.body = { role: "manager" };
      await membershipController.updateMemberRole(revertRoleReq, revertRoleRes);
      expect(revertRoleRes.body?.accessMode).toBe("all");

      const revertAccessReq = await reqOwner();
      const revertAccessRes = makeRes();
      revertAccessReq.params = { id: membershipManagerRestricted.id };
      revertAccessReq.body = { accessMode: "restricted", propertyIds: [propertyA.id] };
      await membershipController.updateMemberPropertyAccess(revertAccessReq, revertAccessRes);
      expect(revertAccessRes.body?.accessMode).toBe("restricted");
    });
  });

  describe("cross-company isolation", () => {
    it("a foreign-company caller never sees Company A's Properties when listing", async () => {
      const req = await reqForeign();
      const res = makeRes();
      await propertyController.listProperties(req, res);
      const ids = res.body.map((p) => p.id);
      expect(ids).not.toContain(propertyA.id);
      expect(ids).not.toContain(propertyB.id);
      expect(ids).toContain(propertyForeign.id);
    });

    it("a foreign-company caller gets 404 reading Company A's Property or Work Order directly", async () => {
      let req = await reqForeign();
      let res = makeRes();
      req.params = { id: propertyA.id };
      await propertyController.getProperty(req, res);
      expect(res.statusCode).toBe(404);

      req = await reqForeign();
      res = makeRes();
      req.params = { id: workOrderOnA.id };
      await workOrderController.getWorkOrder(req, res);
      expect(res.statusCode).toBe(404);
    });
  });
});
