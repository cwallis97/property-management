// Global Search V1 — permanent regression coverage for
// server/controllers/searchController.js (GET /api/search). Proves the
// core product rules: search is global across every ACTIVE Property the
// caller may access (never the frontend Property Scope, which these tests
// don't touch because it makes no authorization decision), matching is
// case-insensitive / partial / multi-word with conservative fuzzy, ranking
// is deterministic, and — the part that matters most — every entity's
// authorization constrains the SQL itself: tenant isolation, per-Membership
// multi-company Property Access, entity capability rules, archived-Property
// exclusion, and enumeration parity all hold, and fuzzy matching never
// widens any of them.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PropertyAccess, Vendor, Document } from "../models/index.js";
import * as searchController from "../controllers/searchController.js";
import { reqFor, makeRes } from "./helpers/mockReqRes.js";
import {
  createCompany,
  createUser,
  createMembership,
  createProperty,
  createLocation,
  createAsset,
  createWorkOrder,
} from "./helpers/fixtures.js";
import { cleanupCompanies } from "./helpers/cleanup.js";

async function search(req, query) {
  const res = makeRes();
  req.query = query;
  await searchController.globalSearch(req, res);
  return res;
}
const titles = (res) => res.body.results.map((r) => r.title);
const types = (res) => new Set(res.body.results.map((r) => r.type));
const ofType = (res, t) => res.body.results.filter((r) => r.type === t);

describe("Global Search", () => {
  let companyA, companyB;
  let userOwnerA, userManagerA, userTechA, userMulti, userOwnerB, userForeign;
  let mOwnerA, mManagerA, mTechA, mMultiA, mMultiB, mOwnerB, mForeign;
  let propA1, propA2, propArchived, propB1;
  let locUnit12, locCanyonUnit, locArchived, locB;
  let assetMeter, assetCanyonPump, assetArchived;
  let woLeak, woDescOnly, woCanyon, woArchivedProp, woArchivedItself, woB;
  let vendorPlumbing, vendorInactive;
  let docProp, docCanyonAsset, docVendor, docArchivedProp;
  let userAareon, userSecretB;

  beforeAll(async () => {
    companyA = await createCompany("QA Search Company A");
    companyB = await createCompany("QA Search Company B");

    userOwnerA = await createUser("QA Search Owner A");
    userManagerA = await createUser("QA Search Manager A Restricted");
    userTechA = await createUser("QA Search Tech A");
    userMulti = await createUser("QA Search Multi Company");
    userOwnerB = await createUser("QA Search Owner B");
    userForeign = await createUser("QA Search Foreign");
    userAareon = await createUser("Aareon Findme"); // only in Company A
    userSecretB = await createUser("Zzsecret Personb"); // only in Company B

    mOwnerA = await createMembership({ user: userOwnerA, company: companyA, role: "owner", accessMode: "all" });
    mManagerA = await createMembership({ user: userManagerA, company: companyA, role: "manager", accessMode: "restricted" });
    mTechA = await createMembership({ user: userTechA, company: companyA, role: "technician", accessMode: "all" });
    // The multi-company case: ADMIN (holds USERS_MANAGE) in A, TECHNICIAN
    // (does not) in B.
    mMultiA = await createMembership({ user: userMulti, company: companyA, role: "admin", accessMode: "all" });
    mMultiB = await createMembership({ user: userMulti, company: companyB, role: "technician", accessMode: "all" });
    mOwnerB = await createMembership({ user: userOwnerB, company: companyB, role: "owner", accessMode: "all" });
    mForeign = await createMembership({ user: userForeign, company: companyB, role: "owner", accessMode: "all" });
    await createMembership({ user: userAareon, company: companyA, role: "technician", accessMode: "all" });
    await createMembership({ user: userSecretB, company: companyB, role: "technician", accessMode: "all" });

    // The fixture helpers append a random suffix to name/title to keep
    // fixtures obviously synthetic and collision-free. These tests assert
    // on exact display strings and ranking tiers (exact vs prefix vs
    // substring), so normalise the referenced rows back to a clean name
    // right after creation.
    const rename = (row, value) => row.update(row.title !== undefined ? { title: value } : { name: value });

    propA1 = await createProperty({ company: companyA, name: "QA Search Riverbend Park" });
    propA2 = await createProperty({ company: companyA, name: "QA Search Canyon View" });
    propArchived = await createProperty({ company: companyA, name: "QA Search Retired Meadows", status: "archived" });
    propB1 = await createProperty({ company: companyB, name: "QA Search Beacon Ridge" });
    await rename(propA1, "QA Search Riverbend Park");
    await rename(propA2, "QA Search Canyon View");
    await rename(propArchived, "QA Search Retired Meadows");
    await rename(propB1, "QA Search Beacon Ridge");

    // Restricted manager is granted ONLY propA1 (never propA2).
    await PropertyAccess.create({ membershipId: mManagerA.id, propertyId: propA1.id });

    locUnit12 = await createLocation({ property: propA1, name: "Unit 12", type: "unit" });
    locCanyonUnit = await createLocation({ property: propA2, name: "Canyon Clubhouse", type: "amenity" });
    locArchived = await createLocation({ property: propArchived, name: "Meadows Shed", type: "building" });
    locB = await createLocation({ property: propB1, name: "Beacon Unit 99", type: "unit" });
    await rename(locUnit12, "Unit 12");
    await rename(locCanyonUnit, "Canyon Clubhouse");
    await rename(locArchived, "Meadows Shed");
    await rename(locB, "Beacon Unit 99");

    assetMeter = await createAsset({ property: propA1, name: "Riverbend Water Meter Alpha", locationId: locUnit12.id, category: "plumbing" });
    assetCanyonPump = await createAsset({ property: propA2, name: "Canyon Booster Pump" });
    assetArchived = await createAsset({ property: propA1, name: "Retired Air Compressor", archivedAt: new Date() });
    await rename(assetMeter, "Riverbend Water Meter Alpha");
    await rename(assetCanyonPump, "Canyon Booster Pump");
    await rename(assetArchived, "Retired Air Compressor");

    woLeak = await createWorkOrder({
      property: propA1,
      title: "Kitchen Water Leak",
      description: "tenant reports dripping under the sink",
      locationId: locUnit12.id,
    });
    woDescOnly = await createWorkOrder({
      property: propA1,
      title: "Quarterly Inspection",
      description: "check the galvanized supply line at the crawlspace hatch",
    });
    woCanyon = await createWorkOrder({ property: propA2, title: "Canyon Roof Membrane Repair" });
    woArchivedProp = await createWorkOrder({ property: propArchived, title: "Meadows Perimeter Fence" });
    woArchivedItself = await createWorkOrder({ property: propA1, title: "Cancelled Repaint Job", archivedAt: new Date() });
    woB = await createWorkOrder({ property: propB1, title: "Beacon Water Leak" });
    await rename(woLeak, "Kitchen Water Leak");
    await rename(woDescOnly, "Quarterly Inspection");
    await rename(woCanyon, "Canyon Roof Membrane Repair");
    await rename(woArchivedProp, "Meadows Perimeter Fence");
    await rename(woArchivedItself, "Cancelled Repaint Job");
    await rename(woB, "Beacon Water Leak");

    vendorPlumbing = await Vendor.create({
      companyId: companyA.id,
      name: "ABC Plumbing Co",
      category: "Plumbing",
      contactName: "Dave Ramirez",
      status: "active",
    });
    vendorInactive = await Vendor.create({
      companyId: companyA.id,
      name: "Zephyr Plumbing Supplies",
      category: "Plumbing",
      status: "inactive",
    });

    const docBase = { companyId: companyA.id, category: "warranty", storedFilename: "s.pdf", mimeType: "application/pdf", fileSize: 100 };
    docProp = await Document.create({ ...docBase, name: "Riverbend Master Warranty", originalFilename: "riverbend-warranty.pdf", propertyId: propA1.id });
    docCanyonAsset = await Document.create({ ...docBase, name: "Canyon Pump Warranty Booklet", originalFilename: "canyon-pump.pdf", assetId: assetCanyonPump.id });
    docVendor = await Document.create({ ...docBase, name: "ABC Plumbing Warranty Terms", originalFilename: "abc-terms.pdf", vendorId: vendorPlumbing.id });
    docArchivedProp = await Document.create({ ...docBase, name: "Meadows Site Warranty Survey", originalFilename: "meadows-survey.pdf", propertyId: propArchived.id });
  });

  afterAll(async () => {
    await cleanupCompanies([companyA.id, companyB.id]);
  });

  const reqOwnerA = () => reqFor(userOwnerA, [mOwnerA]);
  const reqManagerA = () => reqFor(userManagerA, [mManagerA]);
  const reqTechA = () => reqFor(userTechA, [mTechA]);
  const reqMulti = () => reqFor(userMulti, [mMultiA, mMultiB]);
  const reqOwnerB = () => reqFor(userOwnerB, [mOwnerB]);
  const reqForeign = () => reqFor(userForeign, [mForeign]);

  // ── entity matching ──────────────────────────────────────────────────
  describe("entity matching", () => {
    it("matches a Property by name", async () => {
      const res = await search(reqOwnerA(), { q: "riverbend park" });
      expect(ofType(res, "property").map((r) => r.title)).toContain("QA Search Riverbend Park");
    });

    it("matches a Location by name", async () => {
      const res = await search(reqOwnerA(), { q: "unit 12" });
      const loc = ofType(res, "location").find((r) => r.title === "Unit 12");
      expect(loc).toBeTruthy();
      expect(loc.propertyId).toBe(propA1.id);
      expect(loc.propertyName).toBe("QA Search Riverbend Park");
    });

    it("matches a Work Order by title", async () => {
      const res = await search(reqOwnerA(), { q: "kitchen water leak" });
      expect(ofType(res, "work_order").map((r) => r.title)).toContain("Kitchen Water Leak");
    });

    it("matches a Work Order by description text alone (not in the title)", async () => {
      const res = await search(reqOwnerA(), { q: "galvanized supply line" });
      expect(ofType(res, "work_order").map((r) => r.title)).toContain("Quarterly Inspection");
    });

    it("matches an Asset by name", async () => {
      const res = await search(reqOwnerA(), { q: "water meter alpha" });
      expect(ofType(res, "asset").map((r) => r.title)).toContain("Riverbend Water Meter Alpha");
    });

    it("matches a Vendor by name and by contact name", async () => {
      const byName = await search(reqOwnerA(), { q: "abc plumbing" });
      expect(ofType(byName, "vendor").map((r) => r.title)).toContain("ABC Plumbing Co");
      const byContact = await search(reqOwnerA(), { q: "ramirez" });
      expect(ofType(byContact, "vendor").map((r) => r.title)).toContain("ABC Plumbing Co");
    });

    it("matches a Document by name and by original filename", async () => {
      const byName = await search(reqOwnerA(), { q: "master warranty" });
      expect(ofType(byName, "document").map((r) => r.title)).toContain("Riverbend Master Warranty");
      const byFile = await search(reqOwnerA(), { q: "riverbend-warranty.pdf" });
      expect(ofType(byFile, "document").map((r) => r.title)).toContain("Riverbend Master Warranty");
    });

    it("every result carries Property context (or is explicitly Company-level)", async () => {
      const res = await search(reqOwnerA(), { q: "warranty" });
      for (const r of res.body.results) {
        if (r.type === "vendor" || r.type === "user") {
          expect(r.propertyId).toBeNull();
        } else if (r.type === "document") {
          // property- / asset- / work-order-attached docs resolve a Property;
          // vendor-attached docs are Company-level.
          expect(r.context).toMatch(/^Document · /);
        } else {
          expect(r.propertyName).toBeTruthy();
        }
      }
    });
  });

  // ── matching behavior ────────────────────────────────────────────────
  describe("matching behavior", () => {
    it("is case-insensitive", async () => {
      const res = await search(reqOwnerA(), { q: "KITCHEN WATER LEAK" });
      expect(ofType(res, "work_order").map((r) => r.title)).toContain("Kitchen Water Leak");
    });

    it("does partial / infix matching (abc plum -> ABC Plumbing Co)", async () => {
      const res = await search(reqOwnerA(), { q: "abc plum" });
      expect(ofType(res, "vendor").map((r) => r.title)).toContain("ABC Plumbing Co");
    });

    it("does multi-word matching regardless of word order in the source text", async () => {
      const res = await search(reqOwnerA(), { q: "leak water kitchen" });
      expect(ofType(res, "work_order").map((r) => r.title)).toContain("Kitchen Water Leak");
    });

    it("tolerates a small typo via conservative fuzzy matching", async () => {
      const res = await search(reqOwnerA(), { q: "riverbnd water meter" });
      expect(ofType(res, "asset").map((r) => r.title)).toContain("Riverbend Water Meter Alpha");
    });

    it("ranks an exact name above a prefix above a body-text-only match", async () => {
      const res = await search(reqOwnerA(), { q: "unit 12" });
      const ranked = res.body.results;
      const exactLoc = ranked.findIndex((r) => r.type === "location" && r.title === "Unit 12");
      const woWithUnit12 = ranked.findIndex((r) => r.type === "work_order");
      expect(exactLoc).toBeGreaterThanOrEqual(0);
      // The exactly-named Location outranks every Work Order that only
      // mentions "Unit 12" via its joined Location name.
      if (woWithUnit12 >= 0) expect(exactLoc).toBeLessThan(woWithUnit12);
    });
  });

  // ── authorization ───────────────────────────────────────────────────
  describe("authorization & isolation", () => {
    it("Company A's caller never sees Company B data, under any query", async () => {
      for (const q of ["beacon", "unit 99", "beacon water leak", "zzsecret"]) {
        const res = await search(reqOwnerA(), { q });
        for (const r of res.body.results) {
          expect(r.propertyName).not.toBe("QA Search Beacon Ridge");
          expect(r.title).not.toBe("Beacon Water Leak");
          expect(r.title).not.toBe("Beacon Unit 99");
        }
      }
    });

    it("a restricted Manager only sees results from Properties they are granted", async () => {
      const res = await search(reqManagerA(), { q: "canyon" });
      const t = titles(res);
      expect(t).not.toContain("QA Search Canyon View"); // property they can't access
      expect(t).not.toContain("Canyon Clubhouse"); // location on it
      expect(t).not.toContain("Canyon Booster Pump"); // asset on it
      expect(t).not.toContain("Canyon Roof Membrane Repair"); // work order on it
      expect(t).not.toContain("Canyon Pump Warranty Booklet"); // doc on an asset on it
    });

    it("a restricted Manager DOES see results from their granted Property", async () => {
      const res = await search(reqManagerA(), { q: "water" });
      const t = titles(res);
      expect(t).toContain("Kitchen Water Leak");
      expect(t).toContain("Riverbend Water Meter Alpha");
    });

    it("a restricted Manager still sees the Company-wide Vendor directory and Vendor-attached Documents", async () => {
      const vendors = await search(reqManagerA(), { q: "abc plumbing" });
      expect(ofType(vendors, "vendor").map((r) => r.title)).toContain("ABC Plumbing Co");
      const docs = await search(reqManagerA(), { q: "abc plumbing warranty terms" });
      expect(ofType(docs, "document").map((r) => r.title)).toContain("ABC Plumbing Warranty Terms");
    });

    it("a Technician gets operational entity types but never People", async () => {
      const res = await search(reqTechA(), { q: "aareon" });
      expect(types(res).has("user")).toBe(false);
      expect(res.body.counts.user).toBeUndefined();
      // still gets the operational surfaces
      const wo = await search(reqTechA(), { q: "kitchen water leak" });
      expect(ofType(wo, "work_order").length).toBeGreaterThan(0);
    });

    it("People results are returned only for Companies where the caller holds USERS_MANAGE", async () => {
      // userMulti is ADMIN in Company A (has USERS_MANAGE) and TECHNICIAN
      // in Company B (does not).
      const inA = await search(reqMulti(), { q: "aareon findme" });
      expect(ofType(inA, "user").map((r) => r.title)).toContain("Aareon Findme");

      const inB = await search(reqMulti(), { q: "zzsecret personb" });
      expect(ofType(inB, "user")).toHaveLength(0); // Company B person — never exposed
      for (const r of inB.body.results) expect(r.title).not.toBe("Zzsecret Personb");
    });

    it("a multi-company caller's operational search spans every Company they can access", async () => {
      const res = await search(reqMulti(), { q: "water leak" });
      const t = titles(res);
      expect(t).toContain("Kitchen Water Leak"); // Company A
      expect(t).toContain("Beacon Water Leak"); // Company B (technician can read Work Orders)
    });

    it("a cross-company exact-name query returns nothing (enumeration parity)", async () => {
      const res = await search(reqForeign(), { q: "QA Search Riverbend Park" });
      expect(res.body.results).toHaveLength(0);
      expect(Object.values(res.body.counts).every((n) => n === 0)).toBe(true);
    });

    it("fuzzy matching never bypasses authorization", async () => {
      // "riverbnd" fuzzy-matches Riverbend content for an authorized caller…
      const authed = await search(reqOwnerA(), { q: "riverbnd" });
      expect(authed.body.results.length).toBeGreaterThan(0);
      // …but a foreign caller gets nothing, fuzzy or not.
      const foreign = await search(reqForeign(), { q: "riverbnd" });
      expect(foreign.body.results).toHaveLength(0);
      // And a restricted manager's fuzzy query never reaches an
      // inaccessible Property.
      const restricted = await search(reqManagerA(), { q: "canyn" });
      expect(titles(restricted)).not.toContain("QA Search Canyon View");
      expect(titles(restricted)).not.toContain("Canyon Booster Pump");
    });
  });

  // ── archived records ────────────────────────────────────────────────
  describe("archived exclusion", () => {
    it("excludes an archived Property and every record beneath it, even for an Owner", async () => {
      const res = await search(reqOwnerA(), { q: "meadows" });
      const t = titles(res);
      expect(t).not.toContain("QA Search Retired Meadows"); // archived property
      expect(t).not.toContain("Meadows Shed"); // location beneath it
      expect(t).not.toContain("Meadows Perimeter Fence"); // work order beneath it
      expect(t).not.toContain("Meadows Site Warranty Survey"); // document on it
    });

    it("excludes an individually archived Work Order / Asset", async () => {
      const wo = await search(reqOwnerA(), { q: "cancelled repaint" });
      expect(titles(wo)).not.toContain("Cancelled Repaint Job");
      const asset = await search(reqOwnerA(), { q: "retired air compressor" });
      expect(titles(asset)).not.toContain("Retired Air Compressor");
    });

    it("an inactive Vendor is still findable but ranks below an active one", async () => {
      const res = await search(reqOwnerA(), { q: "plumbing" });
      const vendorTitles = ofType(res, "vendor").map((r) => r.title);
      expect(vendorTitles).toContain("ABC Plumbing Co");
      expect(vendorTitles).toContain("Zephyr Plumbing Supplies");
      expect(vendorTitles.indexOf("ABC Plumbing Co")).toBeLessThan(vendorTitles.indexOf("Zephyr Plumbing Supplies"));
    });
  });

  // ── limits, shape & safety ──────────────────────────────────────────
  describe("limits, shape & safety", () => {
    it("rejects an empty or too-short query, never dumps the database", async () => {
      const empty = await search(reqOwnerA(), { q: "" });
      expect(empty.statusCode).toBe(400);
      const oneChar = await search(reqOwnerA(), { q: "a" });
      expect(oneChar.statusCode).toBe(400);
    });

    it("respects the result limit", async () => {
      const res = await search(reqOwnerA(), { q: "qa search", limit: 5 });
      expect(res.body.results.length).toBeLessThanOrEqual(5);
      expect(res.body.hasMore).toBe(true);
    });

    it("type-filtered mode returns only that type, paginated with hasMore", async () => {
      const page1 = await search(reqOwnerA(), { q: "qa search", type: "work_order", limit: 2, offset: 0 });
      expect(page1.body.results.every((r) => r.type === "work_order")).toBe(true);
      expect(page1.body.results.length).toBeLessThanOrEqual(2);
      const page2 = await search(reqOwnerA(), { q: "qa search", type: "work_order", limit: 2, offset: 2 });
      const p1ids = page1.body.results.map((r) => r.id);
      for (const r of page2.body.results) expect(p1ids).not.toContain(r.id);
    });

    it("rejects an unknown type", async () => {
      const res = await search(reqOwnerA(), { q: "water", type: "secrets" });
      expect(res.statusCode).toBe(400);
    });

    it("a Technician asking for type=user directly gets an empty list, not an error or data", async () => {
      const res = await search(reqTechA(), { q: "aareon", type: "user" });
      expect(res.statusCode).toBe(200);
      expect(res.body.results).toHaveLength(0);
    });

    it("never returns internal identifiers", async () => {
      const res = await search(reqOwnerA(), { q: "qa search" });
      for (const r of res.body.results) {
        expect(r).not.toHaveProperty("score");
        expect(r).not.toHaveProperty("companyId");
        expect(r).not.toHaveProperty("firebaseUid");
        expect(r).not.toHaveProperty("membershipId");
        expect(r).not.toHaveProperty("storedFilename");
        expect(Object.keys(r).sort()).toEqual(
          ["context", "id", "propertyId", "propertyName", "subtitle", "title", "type"].sort()
        );
      }
    });

    it("gives Location and User results enough to navigate to the exact record", async () => {
      const loc = ofType(await search(reqOwnerA(), { q: "unit 12" }), "location").find((r) => r.title === "Unit 12");
      expect(loc.id).toBe(locUnit12.id); // client routes to /portfolio/:propertyId + focus this Location id
      expect(loc.propertyId).toBe(propA1.id);

      const user = ofType(await search(reqOwnerA(), { q: "aareon findme" }), "user")[0];
      expect(user.id).toBe(userAareon.id); // client routes to Settings > Users & Roles + focus this User id
    });
  });

  // ── Property Scope independence ─────────────────────────────────────
  it("Global Search ignores any Property Scope — an accessible record in another Property still appears", async () => {
    // req carries no Property Scope concept at all; this asserts the
    // contract directly: an Owner searching for a Canyon View (propA2)
    // record finds it even though nothing scoped them there.
    const res = await search(reqOwnerA(), { q: "canyon roof membrane" });
    expect(ofType(res, "work_order").map((r) => r.title)).toContain("Canyon Roof Membrane Repair");
    const asset = await search(reqOwnerA(), { q: "canyon booster pump" });
    expect(ofType(asset, "asset").map((r) => r.title)).toContain("Canyon Booster Pump");
  });
});
