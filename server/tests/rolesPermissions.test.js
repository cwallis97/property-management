// Roles & Permissions — the ROLE -> CAPABILITY map itself
// (server/authorization/capabilities.js) plus a couple of live
// controller-level gating checks. Deliberately does not enumerate every
// capability individually — the map is exercised thoroughly by every
// other suite's controller calls; this asserts the shape of the map
// itself and the handful of invariants that matter most.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CAPABILITIES, roleHasCapability, ROLE_CAPABILITIES } from "../authorization/capabilities.js";
import * as membershipController from "../controllers/membershipController.js";
import * as auditEventController from "../controllers/auditEventController.js";
import { reqFor, makeRes } from "./helpers/mockReqRes.js";
import { createCompany, createUser, createMembership } from "./helpers/fixtures.js";
import { cleanupCompanies } from "./helpers/cleanup.js";

describe("Roles & Permissions", () => {
  describe("capability map (pure, no database)", () => {
    it("Admin/Owner hold every defined capability", () => {
      for (const capability of Object.values(CAPABILITIES)) {
        expect(roleHasCapability("owner", capability)).toBe(true);
        expect(roleHasCapability("admin", capability)).toBe(true);
      }
    });

    it("Manager holds day-to-day operational capabilities but not Company/Property administration", () => {
      for (const capability of [
        CAPABILITIES.WORK_ORDER_CREATE,
        CAPABILITIES.WORK_ORDER_EDIT,
        CAPABILITIES.WORK_ORDER_NOTE_CREATE,
        CAPABILITIES.WORK_ORDER_COST_CREATE,
        CAPABILITIES.ASSET_CREATE,
        CAPABILITIES.ASSET_EDIT,
        CAPABILITIES.LOCATION_MANAGE,
        CAPABILITIES.VENDOR_CREATE,
        CAPABILITIES.VENDOR_EDIT,
        CAPABILITIES.DOCUMENT_MANAGE,
        CAPABILITIES.SITE_PLAN_UPLOAD,
      ]) {
        expect(roleHasCapability("manager", capability)).toBe(true);
      }
      for (const capability of [
        CAPABILITIES.SETTINGS_ACCESS,
        CAPABILITIES.PROPERTY_CREATE,
        CAPABILITIES.PROPERTY_LIFECYCLE,
        CAPABILITIES.USERS_MANAGE,
        CAPABILITIES.AUDIT_LOG_READ,
      ]) {
        expect(roleHasCapability("manager", capability)).toBe(false);
      }
    });

    it("Technician holds zero mutation capabilities", () => {
      expect(ROLE_CAPABILITIES.technician.size).toBe(0);
      for (const capability of Object.values(CAPABILITIES)) {
        expect(roleHasCapability("technician", capability)).toBe(false);
      }
    });

    it("Audit Log read remains its own dedicated capability, not reused from users.manage or settings.access", () => {
      expect(CAPABILITIES.AUDIT_LOG_READ).toBe("auditLog.read");
      expect(CAPABILITIES.AUDIT_LOG_READ).not.toBe(CAPABILITIES.USERS_MANAGE);
      expect(CAPABILITIES.AUDIT_LOG_READ).not.toBe(CAPABILITIES.SETTINGS_ACCESS);
    });

    it("billing.manage does not exist yet", () => {
      expect(CAPABILITIES.BILLING_MANAGE).toBeUndefined();
      expect(Object.values(CAPABILITIES)).not.toContain("billing.manage");
    });
  });

  describe("live gating (database-backed)", () => {
    let company, userOwner, userManager, userTech;
    let membershipOwner, membershipManager, membershipTech;

    beforeAll(async () => {
      company = await createCompany("QA Roles Company");
      userOwner = await createUser("QA Roles Owner");
      userManager = await createUser("QA Roles Manager");
      userTech = await createUser("QA Roles Technician");
      membershipOwner = await createMembership({ user: userOwner, company, role: "owner" });
      membershipManager = await createMembership({ user: userManager, company, role: "manager" });
      membershipTech = await createMembership({ user: userTech, company, role: "technician" });
    });

    afterAll(async () => {
      await cleanupCompanies([company.id]);
    });

    it("Users & Roles management (listCompanyMembers) is gated to Admin/Owner", async () => {
      let req = reqFor(userOwner, [membershipOwner]);
      let res = makeRes();
      await membershipController.listCompanyMembers(req, res);
      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);

      req = reqFor(userManager, [membershipManager]);
      res = makeRes();
      await membershipController.listCompanyMembers(req, res);
      expect(res.statusCode).toBe(403);

      req = reqFor(userTech, [membershipTech]);
      res = makeRes();
      await membershipController.listCompanyMembers(req, res);
      expect(res.statusCode).toBe(403);
    });

    it("the global Audit Log remains gated to Admin/Owner (auditLog.read), not Manager/Technician", async () => {
      let req = reqFor(userOwner, [membershipOwner]);
      let res = makeRes();
      req.query = {};
      await auditEventController.listAuditEvents(req, res);
      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);

      req = reqFor(userManager, [membershipManager]);
      res = makeRes();
      req.query = {};
      await auditEventController.listAuditEvents(req, res);
      expect(res.statusCode).toBe(403);

      req = reqFor(userTech, [membershipTech]);
      res = makeRes();
      req.query = {};
      await auditEventController.listAuditEvents(req, res);
      expect(res.statusCode).toBe(403);
    });
  });
});
