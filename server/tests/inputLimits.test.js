// Phase 0 SOC 2 hardening — server-side maximum lengths on user-
// controlled free-text fields. Over-limit input is rejected with 400,
// never silently truncated. Exercises the real controllers (not the
// helper in isolation) for the highest-volume write paths.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { textFieldError, TEXT_LIMITS } from "../validation/text.js";
import * as workOrderController from "../controllers/workOrderController.js";
import * as assetController from "../controllers/assetController.js";
import * as vendorController from "../controllers/vendorController.js";
import { reqFor, makeRes } from "./helpers/mockReqRes.js";
import { createCompany, createUser, createMembership, createProperty } from "./helpers/fixtures.js";
import { cleanupCompanies } from "./helpers/cleanup.js";

describe("free-text length caps (Phase 0)", () => {
  describe("textFieldError (pure)", () => {
    it("accepts a value at the limit and rejects one over it", () => {
      expect(textFieldError("x".repeat(255), { field: "name", max: 255 })).toBeNull();
      expect(textFieldError("x".repeat(256), { field: "name", max: 255 })).toMatch(/255 characters or fewer/);
    });
    it("honors required / allowNull", () => {
      expect(textFieldError(undefined, { field: "name", required: true })).toMatch(/required/);
      expect(textFieldError(null, { field: "notes", allowNull: true })).toBeNull();
      expect(textFieldError(42, { field: "name" })).toMatch(/must be a string/);
    });
  });

  describe("controllers reject over-limit input with 400", () => {
    let company, user, membership, property;

    beforeAll(async () => {
      company = await createCompany("QA InputLimits Co");
      user = await createUser("QA InputLimits Owner");
      membership = await createMembership({ user, company, role: "owner" });
      property = await createProperty({ company });
    });

    afterAll(async () => {
      await cleanupCompanies([company.id]);
    });

    it("createWorkOrder: over-long title", async () => {
      const res = makeRes();
      await workOrderController.createWorkOrder(
        reqFor(user, [membership], {
          params: { propertyId: property.id },
          body: { title: "t".repeat(TEXT_LIMITS.name + 1) },
        }),
        res
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/title must be \d+ characters or fewer/);
    });

    it("createWorkOrder: over-long description", async () => {
      const res = makeRes();
      await workOrderController.createWorkOrder(
        reqFor(user, [membership], {
          params: { propertyId: property.id },
          body: { title: "ok", description: "d".repeat(TEXT_LIMITS.longText + 1) },
        }),
        res
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/description must be/);
    });

    it("createWorkOrder: a normal title/description still works", async () => {
      const res = makeRes();
      await workOrderController.createWorkOrder(
        reqFor(user, [membership], {
          params: { propertyId: property.id },
          body: { title: "Fix the fence", description: "The north fence panel is loose." },
        }),
        res
      );
      expect(res.statusCode).toBe(201);
    });

    it("createAsset: over-long notes", async () => {
      const res = makeRes();
      await assetController.createAsset(
        reqFor(user, [membership], {
          params: { propertyId: property.id },
          body: { name: "Pump", notes: "n".repeat(TEXT_LIMITS.longText + 1) },
        }),
        res
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/notes must be/);
    });

    it("createVendor: over-long name", async () => {
      const res = makeRes();
      await vendorController.createVendor(
        reqFor(user, [membership], { body: { name: "v".repeat(TEXT_LIMITS.name + 1) } }),
        res
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/name must be \d+ characters or fewer/);
    });
  });
});
