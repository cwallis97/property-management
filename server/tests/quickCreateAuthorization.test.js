// Global Quick Create V1 — the app-shell "+ New" launcher is pure
// frontend orchestration over the EXISTING entity create endpoints; it
// adds no backend code and no capability. But it makes those create
// endpoints reachable from every page, so this suite pins, at the
// controller boundary, the guarantees the launcher's menu-visibility
// rules must never be the only thing enforcing:
//
//   - Property create is Owner/Admin only (Manager + Technician get 403)
//   - Technician holds NO create capability — every create endpoint 403s
//   - a restricted Manager cannot create a Property-scoped record on a
//     Property they aren't granted (404, before the capability check)
//   - a cross-company propertyId is rejected (404), never acted on
//
// Positive controls confirm the same endpoints still work for the roles
// that ARE allowed, so a future capability regression can't pass by making
// everything 403.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PropertyAccess } from "../models/index.js";
import * as propertyController from "../controllers/propertyController.js";
import * as workOrderController from "../controllers/workOrderController.js";
import * as assetController from "../controllers/assetController.js";
import * as vendorController from "../controllers/vendorController.js";
import * as documentController from "../controllers/documentController.js";
import { reqFor, makeRes } from "./helpers/mockReqRes.js";
import { createCompany, createUser, createMembership, createProperty } from "./helpers/fixtures.js";
import { cleanupCompanies } from "./helpers/cleanup.js";

const PDF_FILE = { buffer: Buffer.from("%PDF-1.4 test"), mimetype: "application/pdf", originalname: "test.pdf", size: 12 };

describe("Global Quick Create — server authorization", () => {
  let companyA, companyB;
  let userOwner, userManagerAll, userManagerRestricted, userTech;
  let mOwner, mManagerAll, mManagerRestricted, mTech;
  let propGranted, propUngranted, propForeign;

  beforeAll(async () => {
    companyA = await createCompany("QA QuickCreate Company A");
    companyB = await createCompany("QA QuickCreate Company B");

    userOwner = await createUser("QA QC Owner");
    userManagerAll = await createUser("QA QC Manager All");
    userManagerRestricted = await createUser("QA QC Manager Restricted");
    userTech = await createUser("QA QC Technician");

    mOwner = await createMembership({ user: userOwner, company: companyA, role: "owner", accessMode: "all" });
    mManagerAll = await createMembership({ user: userManagerAll, company: companyA, role: "manager", accessMode: "all" });
    mManagerRestricted = await createMembership({ user: userManagerRestricted, company: companyA, role: "manager", accessMode: "restricted" });
    mTech = await createMembership({ user: userTech, company: companyA, role: "technician", accessMode: "all" });

    propGranted = await createProperty({ company: companyA, name: "QA QC Granted" });
    propUngranted = await createProperty({ company: companyA, name: "QA QC Ungranted" });
    propForeign = await createProperty({ company: companyB, name: "QA QC Foreign" });

    await PropertyAccess.create({ membershipId: mManagerRestricted.id, propertyId: propGranted.id });
  });

  afterAll(async () => {
    await cleanupCompanies([companyA.id, companyB.id]);
  });

  const req = (user, memberships, { params = {}, body = {}, file } = {}) => {
    const r = reqFor(user, memberships);
    r.params = params;
    r.body = body;
    if (file) r.file = file;
    return r;
  };
  const run = async (handler, r) => {
    const res = makeRes();
    await handler(r, res);
    return res;
  };

  // ── Property create: Owner/Admin only ──────────────────────────────
  describe("Property create is Owner/Admin only", () => {
    it("Owner can create a Property", async () => {
      const res = await run(propertyController.createProperty, req(userOwner, [mOwner], { body: { name: "QA QC New Property" } }));
      expect(res.statusCode).toBe(201);
    });

    it("Manager is denied (403) creating a Property — even calling the endpoint directly", async () => {
      const res = await run(propertyController.createProperty, req(userManagerAll, [mManagerAll], { body: { name: "QA QC Nope" } }));
      expect(res.statusCode).toBe(403);
    });

    it("Technician is denied (403) creating a Property", async () => {
      const res = await run(propertyController.createProperty, req(userTech, [mTech], { body: { name: "QA QC Nope" } }));
      expect(res.statusCode).toBe(403);
    });
  });

  // ── Technician holds no create capability ──────────────────────────
  describe("Technician cannot create any record the launcher would ever offer", () => {
    it("Work Order → 403", async () => {
      const res = await run(
        workOrderController.createWorkOrder,
        req(userTech, [mTech], { params: { propertyId: propGranted.id }, body: { title: "QA QC WO" } })
      );
      expect(res.statusCode).toBe(403);
    });

    it("Asset → 403", async () => {
      const res = await run(
        assetController.createAsset,
        req(userTech, [mTech], { params: { propertyId: propGranted.id }, body: { name: "QA QC Asset" } })
      );
      expect(res.statusCode).toBe(403);
    });

    it("Vendor → 403", async () => {
      const res = await run(vendorController.createVendor, req(userTech, [mTech], { body: { name: "QA QC Vendor" } }));
      expect(res.statusCode).toBe(403);
    });

    it("Document → 403 (reaches the capability check, never touches the filesystem)", async () => {
      const res = await run(
        documentController.createDocument,
        req(userTech, [mTech], { body: { name: "QA QC Doc", propertyId: propGranted.id }, file: PDF_FILE })
      );
      expect(res.statusCode).toBe(403);
    });
  });

  // ── Positive controls: allowed roles still work ────────────────────
  describe("the same endpoints still work for roles that are allowed", () => {
    it("Manager can create a Work Order, Asset, and Vendor on an accessible Property", async () => {
      const wo = await run(
        workOrderController.createWorkOrder,
        req(userManagerAll, [mManagerAll], { params: { propertyId: propGranted.id }, body: { title: "QA QC Manager WO" } })
      );
      expect(wo.statusCode).toBe(201);

      const asset = await run(
        assetController.createAsset,
        req(userManagerAll, [mManagerAll], { params: { propertyId: propGranted.id }, body: { name: "QA QC Manager Asset" } })
      );
      expect(asset.statusCode).toBe(201);

      const vendor = await run(vendorController.createVendor, req(userManagerAll, [mManagerAll], { body: { name: "QA QC Manager Vendor" } }));
      expect(vendor.statusCode).toBe(201);
    });
  });

  // ── Property Access constrains Property-scoped create ──────────────
  describe("a restricted Manager cannot create on a Property they aren't granted", () => {
    it("Work Order on an ungranted Property → 404 (indistinguishable from nonexistent, before the capability check)", async () => {
      const res = await run(
        workOrderController.createWorkOrder,
        req(userManagerRestricted, [mManagerRestricted], { params: { propertyId: propUngranted.id }, body: { title: "QA QC WO" } })
      );
      expect(res.statusCode).toBe(404);
    });

    it("Asset on an ungranted Property → 404", async () => {
      const res = await run(
        assetController.createAsset,
        req(userManagerRestricted, [mManagerRestricted], { params: { propertyId: propUngranted.id }, body: { name: "QA QC Asset" } })
      );
      expect(res.statusCode).toBe(404);
    });

    it("Work Order on their granted Property → allowed", async () => {
      const res = await run(
        workOrderController.createWorkOrder,
        req(userManagerRestricted, [mManagerRestricted], { params: { propertyId: propGranted.id }, body: { title: "QA QC Granted WO" } })
      );
      expect(res.statusCode).toBe(201);
    });
  });

  // ── Cross-company propertyId is rejected ──────────────────────────
  describe("a cross-company propertyId is rejected, never acted on", () => {
    it("Owner of Company A creating a Work Order against a Company B Property → 404", async () => {
      const res = await run(
        workOrderController.createWorkOrder,
        req(userOwner, [mOwner], { params: { propertyId: propForeign.id }, body: { title: "QA QC WO" } })
      );
      expect(res.statusCode).toBe(404);
    });

    it("Owner of Company A creating an Asset against a Company B Property → 404", async () => {
      const res = await run(
        assetController.createAsset,
        req(userOwner, [mOwner], { params: { propertyId: propForeign.id }, body: { name: "QA QC Asset" } })
      );
      expect(res.statusCode).toBe(404);
    });
  });
});
