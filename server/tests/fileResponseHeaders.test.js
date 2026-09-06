// Phase 0 SOC 2 hardening — authenticated file responses (Documents,
// Site Plans) must carry X-Content-Type-Options: nosniff, a sanitized
// Content-Disposition, and no-store caching. The pure header builder is
// unit-tested; the controllers are checked with a stubbed res so the
// header calls are asserted without needing a real file on disk. The
// existing cross-tenant 404 behavior is re-confirmed.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { Document } from "../models/index.js";
import * as documentController from "../controllers/documentController.js";
import * as sitePlanController from "../controllers/sitePlanController.js";
import { contentDispositionHeader } from "../utils/httpFiles.js";
import { reqFor } from "./helpers/mockReqRes.js";
import { createCompany, createUser, createMembership, createProperty } from "./helpers/fixtures.js";
import { cleanupCompanies } from "./helpers/cleanup.js";
import { SitePlan } from "../models/index.js";

function fileRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    sentFile: null,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    sendFile(pathArg, cb) {
      this.sentFile = pathArg;
      if (typeof cb === "function") cb(); // simulate a successful stream
    },
  };
}

describe("File response hardening (Phase 0)", () => {
  describe("contentDispositionHeader (pure)", () => {
    it("defaults to attachment and keeps a normal name", () => {
      expect(contentDispositionHeader("Roof Warranty.pdf")).toBe(
        `attachment; filename="Roof Warranty.pdf"; filename*=UTF-8''Roof%20Warranty.pdf`
      );
    });
    it("neutralizes path separators and leading dots", () => {
      const h = contentDispositionHeader("../../../etc/passwd");
      expect(h).not.toMatch(/[\\/]/); // no separators survive
      expect(h).not.toMatch(/filename="\.\./); // no leading traversal
      expect(h).toContain('filename="_.._.._etc_passwd"');
    });
    it("strips a quote that could terminate the header token", () => {
      expect(contentDispositionHeader('a"; x=y.pdf')).toContain('filename="a; x=y.pdf"');
    });
    it("supports inline disposition for site plans", () => {
      expect(contentDispositionHeader("plan.pdf", { disposition: "inline" })).toMatch(/^inline; /);
    });
    it("falls back to a generic name when empty/invalid", () => {
      expect(contentDispositionHeader(null, { fallback: "document" })).toContain('filename="document"');
    });
  });

  describe("controller responses", () => {
    let company, foreign, user, membership, foreignUser, foreignMembership, property, document, sitePlan;

    beforeAll(async () => {
      company = await createCompany("QA FileHeaders Co");
      foreign = await createCompany("QA FileHeaders Foreign Co");
      user = await createUser("QA FileHeaders Owner");
      foreignUser = await createUser("QA FileHeaders Foreigner");
      membership = await createMembership({ user, company, role: "owner" });
      foreignMembership = await createMembership({ user: foreignUser, company: foreign, role: "owner" });
      property = await createProperty({ company });

      document = await Document.create({
        companyId: company.id,
        propertyId: property.id,
        name: "QA Warranty",
        category: "other",
        originalFilename: 'evil"; name.pdf',
        storedFilename: `${randomUUID()}.pdf`,
        mimeType: "application/pdf",
        fileSize: 123,
      });

      sitePlan = await SitePlan.create({
        propertyId: property.id,
        originalFilename: "site plan.pdf",
        storedFilename: `${randomUUID()}.pdf`,
        mimeType: "application/pdf",
        fileSize: 456,
      });
    });

    afterAll(async () => {
      await Document.destroy({ where: { id: document.id } });
      await SitePlan.destroy({ where: { id: sitePlan.id } });
      await cleanupCompanies([company.id, foreign.id]);
    });

    it("getDocumentFile sets nosniff + attachment + no-store with a sanitized filename", async () => {
      const res = fileRes();
      await documentController.getDocumentFile(reqFor(user, [membership], { params: { id: document.id } }), res);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect(res.headers["content-disposition"]).toMatch(/^attachment; /);
      expect(res.headers["content-disposition"]).not.toContain('"; name.pdf"'); // quote stripped
      expect(res.sentFile).toBeTruthy();
    });

    it("getSitePlanFile sets nosniff + inline + no-store", async () => {
      const res = fileRes();
      await sitePlanController.getSitePlanFile(
        reqFor(user, [membership], { params: { propertyId: property.id } }),
        res
      );
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect(res.headers["content-disposition"]).toMatch(/^inline; /);
    });

    it("a cross-tenant document id still 404s (no headers leaked)", async () => {
      const res = fileRes();
      await documentController.getDocumentFile(
        reqFor(foreignUser, [foreignMembership], { params: { id: document.id } }),
        res
      );
      expect(res.statusCode).toBe(404);
      expect(res.headers["content-disposition"]).toBeUndefined();
    });
  });
});
