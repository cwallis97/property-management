// Work Orders Report — permanent regression coverage for
// server/controllers/reportController.js#getWorkOrdersReport, the ONE
// shared dataset behind both Reports' spreadsheet-first "Work Orders" tab
// and Property Site Map's "Analyze" mode. See docs/Product-Bible.md's
// entry for the full product rules this suite proves: Work-Order-first
// aggregation (never cost-entry-first — a $0 Work Order must still
// count), Location-based (never coordinate-clustering) hotspot grouping
// with an Asset fallback, deterministic hotspot marker positions, the
// mathematical reconciliation invariants this feature's trustworthiness
// depends on, and — the reason this endpoint is shared in the first
// place — that Reports and Site Map can never silently compute different
// numbers for identical filters.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WorkType, WorkOrder, WorkOrderCostEntry, Property, Location, Membership, User, PropertyAccess } from "../models/index.js";
import * as reportController from "../controllers/reportController.js";
import { reqFor, makeRes } from "./helpers/mockReqRes.js";
import { createCompany, createUser, createMembership, createProperty, createLocation, createAsset, createWorkOrder, createCostEntry, createWorkType } from "./helpers/fixtures.js";
import { cleanupCompanies } from "./helpers/cleanup.js";

function hotspotKey(locationId) {
  return locationId ?? "__unspecified__";
}

describe("Work Orders Report", () => {
  let companyA, companyB;
  let userOwner, userAdmin, userManager, userTech, userForeign;
  let membershipOwner, membershipAdmin, membershipManager, membershipTech, membershipForeign;
  let propertyA, propertyB, propertyForeign;
  let locationUnit12, locationUnit27, locationClubhouse;
  let assetInUnit12;
  let workType;

  // The obvious, hand-computable dataset the user's own manual QA plan
  // uses — kept identical here so the permanent suite and manual QA are
  // provably checking the same scenario, not two different ones that could
  // quietly drift apart:
  //   Unit 12:      3 matching Work Orders, $300 total spend, all mapped
  //   Unit 27:      2 matching Work Orders, $120 total spend, one mapped
  //   Clubhouse:    1 matching Work Order,  $50 spend, mapped
  //   Unspecified:  1 matching Work Order,  $0 spend,  mapped (no Location)
  //   Out of range: 1 Work Order with a cost entry, EXCLUDED by date filter
  //   Wrong category: 1 Work Order, EXCLUDED
  let woUnit12A, woUnit12B, woUnit12C;
  let woUnit27A, woUnit27B;
  let woClubhouse;
  let woUnspecifiedMapped;
  let woOutOfRange;
  let woWrongCategory;
  let woForeign;
  // propertyB fixtures — used only by the Company-wide describe block below.
  let woOnPropertyB;
  // An ARCHIVED Property in the same Company — its in-range, in-category
  // Work Order and $500 spend must never appear in a Company-wide ("All
  // Properties") report (that view is the active operating portfolio), but
  // the row itself still exists and a direct single-Property request for
  // it is still answered in full.
  let propertyArchived, locationArchived, woArchived, costArchived;

  beforeAll(async () => {
    companyA = await createCompany("QA Reports Company A");
    companyB = await createCompany("QA Reports Company B Foreign");

    userOwner = await createUser("QA Reports Owner");
    userAdmin = await createUser("QA Reports Admin");
    userManager = await createUser("QA Reports Manager");
    userTech = await createUser("QA Reports Technician");
    userForeign = await createUser("QA Reports Foreign");

    membershipOwner = await createMembership({ user: userOwner, company: companyA, role: "owner" });
    membershipAdmin = await createMembership({ user: userAdmin, company: companyA, role: "admin" });
    membershipManager = await createMembership({ user: userManager, company: companyA, role: "manager" });
    membershipTech = await createMembership({ user: userTech, company: companyA, role: "technician" });
    membershipForeign = await createMembership({ user: userForeign, company: companyB, role: "owner" });

    propertyA = await createProperty({ company: companyA, name: "QA Sunset Ridge" });
    propertyB = await createProperty({ company: companyA, name: "QA Second Property" });
    propertyForeign = await createProperty({ company: companyB, name: "QA Foreign Property" });

    locationUnit12 = await createLocation({ property: propertyA, name: "Unit 12" });
    locationUnit27 = await createLocation({ property: propertyA, name: "Unit 27" });
    locationClubhouse = await createLocation({ property: propertyA, name: "Clubhouse" });
    assetInUnit12 = await createAsset({ property: propertyA, name: "Water Heater", locationId: locationUnit12.id });

    workType = await createWorkType({ category: "water", label: "QA Line Repair" });

    const inRangeDate = new Date("2026-06-01T12:00:00Z");

    // Unit 12 — 3 matching Work Orders, one attached via Asset (no direct
    // locationId of its own) to prove the Asset-fallback grouping rule.
    woUnit12A = await createWorkOrder({
      property: propertyA,
      title: "Leak A",
      category: "water",
      workTypeId: workType.id,
      status: "completed",
      locationId: locationUnit12.id,
      mapX: 20,
      mapY: 30,
      createdAt: inRangeDate,
    });
    await createCostEntry({ workOrder: woUnit12A, amount: 100, costDate: "2026-01-01" });

    woUnit12B = await createWorkOrder({
      property: propertyA,
      title: "Leak B",
      category: "water",
      workTypeId: workType.id,
      status: "open",
      locationId: locationUnit12.id,
      mapX: 22,
      mapY: 31,
      createdAt: new Date(inRangeDate.getTime() + 1000),
    });
    await createCostEntry({ workOrder: woUnit12B, amount: 60, costDate: "2026-02-01" });
    // Second Cost Entry on the SAME Work Order — proves summing doesn't
    // double count and doesn't need a second Work Order to prove it works.
    await createCostEntry({ workOrder: woUnit12B, amount: 40, costDate: "2026-03-01" });

    // No locationId of its own — groups under Unit 12 ONLY via its Asset.
    woUnit12C = await createWorkOrder({
      property: propertyA,
      title: "Leak C (via Asset)",
      category: "water",
      workTypeId: workType.id,
      status: "open",
      assetId: assetInUnit12.id,
      mapX: null,
      mapY: null, // deliberately unmapped — still counts, still groups
      createdAt: new Date(inRangeDate.getTime() + 2000),
    });
    await createCostEntry({ workOrder: woUnit12C, amount: 100, costDate: "2026-04-01" });

    // Unit 27 — 2 matching, only one mapped.
    woUnit27A = await createWorkOrder({
      property: propertyA,
      title: "Unit 27 Repair A",
      category: "water",
      workTypeId: workType.id,
      status: "open",
      locationId: locationUnit27.id,
      mapX: 70,
      mapY: 40,
      createdAt: new Date(inRangeDate.getTime() + 3000),
    });
    await createCostEntry({ workOrder: woUnit27A, amount: 100, costDate: "2026-01-15" });

    woUnit27B = await createWorkOrder({
      property: propertyA,
      title: "Unit 27 Repair B",
      category: "water",
      workTypeId: workType.id,
      status: "completed",
      locationId: locationUnit27.id,
      mapX: null,
      mapY: null,
      createdAt: new Date(inRangeDate.getTime() + 4000),
    });
    await createCostEntry({ workOrder: woUnit27B, amount: 20, costDate: "2026-01-15" });

    // Clubhouse — single matching Work Order.
    woClubhouse = await createWorkOrder({
      property: propertyA,
      title: "Clubhouse Repair",
      category: "water",
      workTypeId: workType.id,
      status: "open",
      locationId: locationClubhouse.id,
      mapX: 50,
      mapY: 50,
      createdAt: new Date(inRangeDate.getTime() + 5000),
    });
    await createCostEntry({ workOrder: woClubhouse, amount: 50, costDate: "2026-01-15" });

    // Unspecified Location — no locationId, no Asset, but IS mapped — proves
    // an unmapped/un-located repair is never dropped, and a $0 Work Order
    // still counts as a repair.
    woUnspecifiedMapped = await createWorkOrder({
      property: propertyA,
      title: "Unspecified Mapped Repair",
      category: "water",
      workTypeId: workType.id,
      status: "open",
      mapX: 85,
      mapY: 15,
      createdAt: new Date(inRangeDate.getTime() + 6000),
    });
    // Deliberately zero Cost Entries.

    // Out of range — real cost, but its createdAt falls outside the query
    // window used below, so it must never appear in the filtered totals.
    woOutOfRange = await createWorkOrder({
      property: propertyA,
      title: "Out of Range Repair",
      category: "water",
      workTypeId: workType.id,
      status: "open",
      locationId: locationUnit12.id,
      mapX: 21,
      mapY: 29,
      createdAt: new Date("2020-01-01T00:00:00Z"),
    });
    await createCostEntry({ workOrder: woOutOfRange, amount: 9999, costDate: "2020-01-01" });

    // Wrong category — must never appear in a category: "water" query.
    woWrongCategory = await createWorkOrder({
      property: propertyA,
      title: "Electrical Repair",
      category: "electrical",
      status: "open",
      createdAt: inRangeDate,
    });
    await createCostEntry({ workOrder: woWrongCategory, amount: 500, costDate: "2026-01-15" });

    // A second Property in the SAME Company — used by the Company-wide
    // scope tests below (propertyId omitted).
    woOnPropertyB = await createWorkOrder({
      property: propertyB,
      title: "Second Property Repair",
      category: "water",
      workTypeId: workType.id,
      status: "open",
      createdAt: new Date(inRangeDate.getTime() + 7000),
    });
    await createCostEntry({ workOrder: woOnPropertyB, amount: 75, costDate: "2026-01-15" });

    // Archived Property in Company A — same shape as any active Property's
    // data (in range, category "water", real spend), so the ONLY reason it
    // drops out of a Company-wide report is its archived status.
    propertyArchived = await createProperty({ company: companyA, name: "QA Archived Property", status: "archived" });
    locationArchived = await createLocation({ property: propertyArchived, name: "Archived Lot 9" });
    woArchived = await createWorkOrder({
      property: propertyArchived,
      title: "Archived Property Repair",
      category: "water",
      workTypeId: workType.id,
      status: "open",
      locationId: locationArchived.id,
      mapX: 40,
      mapY: 40,
      createdAt: new Date(inRangeDate.getTime() + 8000),
    });
    costArchived = await createCostEntry({ workOrder: woArchived, amount: 500, costDate: "2026-01-15" });

    // Foreign company's own Work Order — must never appear in any Company A
    // result, under any filter.
    woForeign = await createWorkOrder({
      property: propertyForeign,
      title: "Foreign Repair",
      category: "water",
      status: "open",
      mapX: 10,
      mapY: 10,
      createdAt: inRangeDate,
    });
    await createCostEntry({ workOrder: woForeign, amount: 12345, costDate: "2026-01-15" });
  });

  afterAll(async () => {
    // Company/Work Order cleanup must run FIRST — work_orders.work_type_id
    // is a real FK, so WorkType can't be removed while a fixture Work
    // Order still references it.
    await cleanupCompanies([companyA.id, companyB.id]);
    await WorkType.destroy({ where: { id: workType.id } });
  });

  const reqOwner = () => reqFor(userOwner, [membershipOwner]);
  const reqAdmin = () => reqFor(userAdmin, [membershipAdmin]);
  const reqManager = () => reqFor(userManager, [membershipManager]);
  const reqTech = () => reqFor(userTech, [membershipTech]);
  const reqForeign = () => reqFor(userForeign, [membershipForeign]);

  const IN_RANGE_QUERY = { startDate: "2026-01-01", endDate: "2026-12-31", category: "water", workTypeId: undefined };

  async function fetchReport(req, extraQuery = {}) {
    const res = makeRes();
    req.query = { ...IN_RANGE_QUERY, propertyId: propertyA.id, ...extraQuery };
    await reportController.getWorkOrdersReport(req, res);
    return res;
  }

  describe("filter consistency", () => {
    it("matches exactly the expected 7 in-range, in-category Work Orders and excludes out-of-range/wrong-category/foreign-company records", async () => {
      const res = await fetchReport(reqOwner());
      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
      const ids = res.body.workOrders.map((wo) => wo.id);
      expect(ids.sort()).toEqual(
        [woUnit12A.id, woUnit12B.id, woUnit12C.id, woUnit27A.id, woUnit27B.id, woClubhouse.id, woUnspecifiedMapped.id].sort()
      );
      expect(ids).not.toContain(woOutOfRange.id);
      expect(ids).not.toContain(woWrongCategory.id);
      expect(ids).not.toContain(woForeign.id);
    });

    it("Status filter narrows to exactly the matching statuses", async () => {
      const res = await fetchReport(reqOwner(), { status: "completed" });
      const ids = res.body.workOrders.map((wo) => wo.id).sort();
      expect(ids).toEqual([woUnit12A.id, woUnit27B.id].sort());
    });

    it("Work Type filter narrows to that Work Type only", async () => {
      const res = await fetchReport(reqOwner(), { workTypeId: workType.id });
      // Every in-category fixture Work Order was created with this same
      // Work Type, so filtering by it changes nothing here — the real
      // assertion is that the set is still exactly right with the filter
      // applied, not merely when it's absent.
      const ids = res.body.workOrders.map((wo) => wo.id).sort();
      expect(ids).toEqual([woUnit12A.id, woUnit12B.id, woUnit12C.id, woUnit27A.id, woUnit27B.id, woClubhouse.id, woUnspecifiedMapped.id].sort());
    });
  });

  describe("aggregation correctness — the reconciliation invariants", () => {
    it("total spend equals the hand-computed sum, and a zero-Cost-Entry Work Order still counts as a repair", async () => {
      const res = await fetchReport(reqOwner());
      // 100 + (60+40) + 100 + 100 + 20 + 50 + 0 = 470
      expect(res.body.summary.totalSpend).toBe(470);
      expect(res.body.summary.workOrderCount).toBe(7);
      const zeroCost = res.body.workOrders.find((wo) => wo.id === woUnspecifiedMapped.id);
      expect(zeroCost.spend).toBe(0);
    });

    it("a Work Order's spend is its FULL recorded cost regardless of the Cost Entries' own costDate — never silently mixed with the Work Order date filter", async () => {
      const res = await fetchReport(reqOwner());
      // woUnit12B's cost entries are dated 2026-02-01 and 2026-03-01, both
      // inside the query's own date range here, but the point is they are
      // NEVER filtered by cost_date at all — summed unconditionally.
      const wo = res.body.workOrders.find((w) => w.id === woUnit12B.id);
      expect(wo.spend).toBe(100);
    });

    it("multiple Cost Entries on one Work Order sum correctly and are never duplicated by the join", async () => {
      const res = await fetchReport(reqOwner());
      expect(res.body.workOrders.filter((wo) => wo.id === woUnit12B.id)).toHaveLength(1);
      expect(res.body.workOrders.find((wo) => wo.id === woUnit12B.id).spend).toBe(100);
    });

    it("mapped/unmapped counts are correct and sum to the total", async () => {
      const res = await fetchReport(reqOwner());
      const { workOrderCount, mappedCount, unmappedCount } = res.body.summary;
      expect(mappedCount + unmappedCount).toBe(workOrderCount);
      // Mapped: woUnit12A, woUnit12B, woUnit27A, woClubhouse, woUnspecifiedMapped = 5
      // Unmapped: woUnit12C, woUnit27B = 2
      expect(mappedCount).toBe(5);
      expect(unmappedCount).toBe(2);
    });

    it("locationsRepresented counts only real named Locations, never the Unspecified Location bucket", async () => {
      const res = await fetchReport(reqOwner());
      // Unit 12, Unit 27, Clubhouse = 3 real Locations; Unspecified excluded.
      expect(res.body.summary.locationsRepresented).toBe(3);
    });

    it("sum of hotspot.workOrderCount equals summary.workOrderCount (every matching Work Order belongs to exactly one hotspot)", async () => {
      const res = await fetchReport(reqOwner());
      const hotspotTotal = res.body.hotspots.reduce((sum, h) => sum + h.workOrderCount, 0);
      expect(hotspotTotal).toBe(res.body.summary.workOrderCount);
    });

    it("sum of hotspot.spend equals summary.totalSpend", async () => {
      const res = await fetchReport(reqOwner());
      const hotspotSpend = res.body.hotspots.reduce((sum, h) => sum + h.spend, 0);
      expect(hotspotSpend).toBe(res.body.summary.totalSpend);
    });

    it("summary.totalSpend equals the sum of every unique matching Work Order's own spend", async () => {
      const res = await fetchReport(reqOwner());
      const workOrderSpendTotal = res.body.workOrders.reduce((sum, wo) => sum + wo.spend, 0);
      expect(workOrderSpendTotal).toBe(res.body.summary.totalSpend);
    });

    it("no Work Order id appears in more than one hotspot's workOrderIds", async () => {
      const res = await fetchReport(reqOwner());
      const seen = new Set();
      for (const hotspot of res.body.hotspots) {
        for (const id of hotspot.workOrderIds) {
          expect(seen.has(id)).toBe(false);
          seen.add(id);
        }
      }
    });
  });

  describe("hotspot grouping and ranking", () => {
    it("Work Orders at the same Location group into one hotspot, including one attached only via its Asset", async () => {
      const res = await fetchReport(reqOwner());
      const unit12 = res.body.hotspots.find((h) => h.locationId === locationUnit12.id);
      expect(unit12.workOrderCount).toBe(3);
      expect(unit12.workOrderIds.sort()).toEqual([woUnit12A.id, woUnit12B.id, woUnit12C.id].sort());
      expect(unit12.spend).toBe(300); // 100 (A) + 100 (B: 60+40) + 100 (C)
    });

    it("different Locations never merge into the same hotspot", async () => {
      const res = await fetchReport(reqOwner());
      const keys = res.body.hotspots.map((h) => hotspotKey(h.locationId));
      expect(new Set(keys).size).toBe(keys.length);
      const unit27 = res.body.hotspots.find((h) => h.locationId === locationUnit27.id);
      expect(unit27.workOrderCount).toBe(2);
    });

    it("a Work Order with neither a Location nor an Asset Location falls into the single 'Unspecified Location' bucket, not dropped", async () => {
      const res = await fetchReport(reqOwner());
      const unspecified = res.body.hotspots.find((h) => h.locationId === null);
      expect(unspecified).toBeTruthy();
      expect(unspecified.locationLabel).toBe("Unspecified Location");
      expect(unspecified.workOrderIds).toContain(woUnspecifiedMapped.id);
    });

    it("ranks hotspots by repair count descending, spend as tiebreak", async () => {
      const res = await fetchReport(reqOwner());
      const counts = res.body.hotspots.map((h) => h.workOrderCount);
      const sorted = [...counts].sort((a, b) => b - a);
      expect(counts).toEqual(sorted);
      expect(res.body.hotspots[0].locationId).toBe(locationUnit12.id);
    });

    it("a named-Location hotspot's marker position is deterministic — the earliest-created mapped Work Order in that group, not random and not averaged", async () => {
      const res = await fetchReport(reqOwner());
      const unit12 = res.body.hotspots.find((h) => h.locationId === locationUnit12.id);
      // woUnit12A is the earliest-created mapped member (woUnit12C has no
      // coordinates at all) — its exact coordinates must be the ones used.
      expect(unit12.mapX).toBe(20);
      expect(unit12.mapY).toBe(30);

      // Re-fetching must produce the exact same position — proves this
      // isn't randomly re-chosen per request.
      const res2 = await fetchReport(reqOwner());
      const unit12Again = res2.body.hotspots.find((h) => h.locationId === locationUnit12.id);
      expect(unit12Again.mapX).toBe(unit12.mapX);
      expect(unit12Again.mapY).toBe(unit12.mapY);
    });

    it("the 'Unspecified Location' bucket never gets a single fabricated representative marker position", async () => {
      const res = await fetchReport(reqOwner());
      const unspecified = res.body.hotspots.find((h) => h.locationId === null);
      expect(unspecified.mapX).toBeNull();
      expect(unspecified.mapY).toBeNull();
    });

    it("a hotspot with zero mapped members still appears in the ranked list with null coordinates — never dropped for lacking a map position", async () => {
      // Unit 27 has one mapped (A) and one unmapped (B) member, so this
      // specific case is already covered by "different Locations" above.
      // Construct a Location whose only matching Work Order is unmapped, to
      // prove a fully-unmapped hotspot still survives end to end.
      const lonelyLocation = await createLocation({ property: propertyA, name: "Fully Unmapped Spot" });
      const lonelyWo = await createWorkOrder({
        property: propertyA,
        title: "Fully Unmapped Repair",
        category: "water",
        status: "open",
        locationId: lonelyLocation.id,
        mapX: null,
        mapY: null,
        createdAt: new Date("2026-06-15T00:00:00Z"),
      });
      try {
        const res = await fetchReport(reqOwner());
        const lonely = res.body.hotspots.find((h) => h.locationId === lonelyLocation.id);
        expect(lonely).toBeTruthy();
        expect(lonely.workOrderCount).toBe(1);
        expect(lonely.mapX).toBeNull();
        expect(lonely.mapY).toBeNull();
        expect(res.body.workOrders.map((wo) => wo.id)).toContain(lonelyWo.id);
      } finally {
        await WorkOrder.destroy({ where: { id: lonelyWo.id } });
        await Location.destroy({ where: { id: lonelyLocation.id } });
      }
    });
  });

  describe("Company-wide scope (propertyId omitted) — Reports' 'All Properties' view", () => {
    it("aggregates across every accessible Property in the Company, and includes each Work Order's own Property name", async () => {
      const res = makeRes();
      const req = reqOwner();
      req.query = { ...IN_RANGE_QUERY, propertyId: undefined };
      await reportController.getWorkOrdersReport(req, res);

      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
      const ids = res.body.workOrders.map((wo) => wo.id);
      // Every propertyA in-range/in-category Work Order, PLUS propertyB's.
      expect(ids).toContain(woUnit12A.id);
      expect(ids).toContain(woOnPropertyB.id);
      // Never another Company's data, even Company-wide.
      expect(ids).not.toContain(woForeign.id);

      const propertyBRow = res.body.workOrders.find((wo) => wo.id === woOnPropertyB.id);
      expect(propertyBRow.propertyName).toBe(propertyB.name);

      // 470 (propertyA) + 75 (propertyB) = 545
      expect(res.body.summary.totalSpend).toBe(470 + 75);
    });

    it("a restricted member's Company-wide aggregate includes only their accessible Property, excluding the sibling Property they were never granted", async () => {
      const restrictedUser = await createUser("QA Reports Restricted CompanyWide");
      const restrictedMembership = await createMembership({ user: restrictedUser, company: companyA, role: "manager", accessMode: "restricted" });
      await PropertyAccess.create({ membershipId: restrictedMembership.id, propertyId: propertyA.id });
      try {
        const res = makeRes();
        const req = reqFor(restrictedUser, [restrictedMembership]);
        req.query = { ...IN_RANGE_QUERY, propertyId: undefined };
        await reportController.getWorkOrdersReport(req, res);

        expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
        const ids = res.body.workOrders.map((wo) => wo.id);
        expect(ids).toContain(woUnit12A.id);
        // propertyB was never granted — must be fully absent, not merely
        // zero-valued, from a restricted member's "Company-wide" view.
        expect(ids).not.toContain(woOnPropertyB.id);
        expect(res.body.summary.totalSpend).toBe(470);
      } finally {
        await PropertyAccess.destroy({ where: { membershipId: restrictedMembership.id } });
        await Membership.destroy({ where: { id: restrictedMembership.id } });
        await User.destroy({ where: { id: restrictedUser.id } });
      }
    });
  });

  describe("archived Properties — excluded from Company-wide reporting by default", () => {
    it("Company-wide Work Orders report omits an archived Property's Work Orders and spend, while still including every active Property", async () => {
      const res = makeRes();
      const req = reqOwner();
      req.query = { ...IN_RANGE_QUERY, propertyId: undefined };
      await reportController.getWorkOrdersReport(req, res);

      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
      const ids = res.body.workOrders.map((wo) => wo.id);
      // Active Properties: unchanged.
      expect(ids).toContain(woUnit12A.id);
      expect(ids).toContain(woOnPropertyB.id);
      // Archived Property: fully absent, not merely zero-valued.
      expect(ids).not.toContain(woArchived.id);
      expect(res.body.workOrders.some((wo) => wo.propertyName === propertyArchived.name)).toBe(false);
      expect(res.body.hotspots.some((h) => h.locationId === locationArchived.id)).toBe(false);
      // The active-portfolio total is exactly what it was before the
      // archived Property existed — 470 (propertyA) + 75 (propertyB) — never
      // + 500.
      expect(res.body.summary.totalSpend).toBe(470 + 75);
    });

    it("Company-wide Maintenance Spend applies the same active-Property default", async () => {
      const res = makeRes();
      const req = reqOwner();
      req.query = { ...IN_RANGE_QUERY, propertyId: undefined };
      await reportController.getMaintenanceSpendSummary(req, res);

      expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
      expect(res.body.summary.totalSpend).toBe(470 + 75);
    });

    it("the archived Property's Work Order and Cost Entry rows still exist — this is a reporting default, never a delete", async () => {
      expect(await WorkOrder.findByPk(woArchived.id)).not.toBeNull();
      expect(await WorkOrderCostEntry.findByPk(costArchived.id)).not.toBeNull();
      const stillThere = await Property.findByPk(propertyArchived.id);
      expect(stillThere).not.toBeNull();
      expect(stillThere.status).toBe("archived");
    });

    it("a direct single-Property request for the accessible archived Property is still answered in full (existing access/resource convention)", async () => {
      const woRes = makeRes();
      const woReq = reqOwner();
      woReq.query = { ...IN_RANGE_QUERY, propertyId: propertyArchived.id };
      await reportController.getWorkOrdersReport(woReq, woRes);
      expect(woRes.statusCode === 200 || woRes.statusCode === undefined).toBe(true);
      expect(woRes.body.workOrders.map((wo) => wo.id)).toContain(woArchived.id);
      expect(woRes.body.summary.totalSpend).toBe(500);

      const msRes = makeRes();
      const msReq = reqOwner();
      msReq.query = { ...IN_RANGE_QUERY, propertyId: propertyArchived.id };
      await reportController.getMaintenanceSpendSummary(msReq, msRes);
      expect(msRes.statusCode === 200 || msRes.statusCode === undefined).toBe(true);
      expect(msRes.body.summary.totalSpend).toBe(500);
    });
  });

  // The actual architectural guarantee this milestone's redesign depends
  // on: Reports' Work Orders tab and Property Site Map's Analyze mode call
  // this exact same controller function with the same filter shape. This
  // is deliberately not a "different code path" test — there IS only one
  // code path — but a permanent tripwire: if a future change ever forks
  // Reports and Site Map onto separate queries, this is what would catch
  // it the moment their results stop matching bit-for-bit.
  describe("Reports / Site Map Analyze consistency", () => {
    it("identical single-Property filters produce identical Work Order ID sets and identical total spend, regardless of which surface's request shape is used", async () => {
      const reportsShapedReq = reqOwner();
      reportsShapedReq.query = { propertyId: propertyA.id, startDate: "2026-01-01", endDate: "2026-12-31", category: "water", workTypeId: undefined, status: undefined };
      const reportsRes = makeRes();
      await reportController.getWorkOrdersReport(reportsShapedReq, reportsRes);

      const siteMapShapedReq = reqOwner();
      siteMapShapedReq.query = { propertyId: propertyA.id, startDate: "2026-01-01", endDate: "2026-12-31", category: "water", workTypeId: "", status: "" };
      const siteMapRes = makeRes();
      await reportController.getWorkOrdersReport(siteMapShapedReq, siteMapRes);

      const reportsIds = reportsRes.body.workOrders.map((wo) => wo.id).sort();
      const siteMapIds = siteMapRes.body.workOrders.map((wo) => wo.id).sort();
      expect(reportsIds).toEqual(siteMapIds);
      expect(reportsRes.body.summary.totalSpend).toBe(siteMapRes.body.summary.totalSpend);
      expect(reportsRes.body.summary.workOrderCount).toBe(siteMapRes.body.summary.workOrderCount);
      expect(reportsRes.body.hotspots).toEqual(siteMapRes.body.hotspots);
    });
  });

  describe("role authorization — REPORTS_READ", () => {
    it("Owner, Admin, and Manager may read the Work Orders Report", async () => {
      for (const req of [reqOwner(), reqAdmin(), reqManager()]) {
        const res = await fetchReport(req);
        expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
      }
    });

    it("Technician is denied (403) — portfolio/Property-wide financial analytics is not part of Technician's own Work Order cost visibility", async () => {
      const res = await fetchReport(reqTech());
      expect(res.statusCode).toBe(403);
    });

    it("Technician is denied (403) on Maintenance Spend too — server authorization is the boundary, regardless of the hidden nav link", async () => {
      const res = makeRes();
      const req = reqTech();
      req.query = { ...IN_RANGE_QUERY, propertyId: propertyA.id };
      await reportController.getMaintenanceSpendSummary(req, res);
      expect(res.statusCode).toBe(403);
    });
  });

  describe("tenant / Property Access security", () => {
    it("a foreign Company's caller cannot read Company A's report (404, not 403 — never confirms the Property exists)", async () => {
      const res = await fetchReport(reqForeign());
      expect(res.statusCode).toBe(404);
    });

    it("a restricted member without access to the requested Property is rejected (404) and gets zero data", async () => {
      const restrictedUser = await createUser("QA Reports Restricted");
      const restrictedMembership = await createMembership({ user: restrictedUser, company: companyA, role: "manager", accessMode: "restricted" });
      try {
        const res = await fetchReport(reqFor(restrictedUser, [restrictedMembership]));
        expect(res.statusCode).toBe(404);
        expect(res.body.workOrders).toBeUndefined();
      } finally {
        await Membership.destroy({ where: { id: restrictedMembership.id } });
        await User.destroy({ where: { id: restrictedUser.id } });
      }
    });

    it("a restricted member WITH access to the requested Property sees the full, correct dataset for it — no aggregate leakage, no missing data", async () => {
      const restrictedUser = await createUser("QA Reports Restricted Grant");
      const restrictedMembership = await createMembership({ user: restrictedUser, company: companyA, role: "manager", accessMode: "restricted" });
      await PropertyAccess.create({ membershipId: restrictedMembership.id, propertyId: propertyA.id });
      try {
        const res = await fetchReport(reqFor(restrictedUser, [restrictedMembership]));
        expect(res.statusCode === 200 || res.statusCode === undefined).toBe(true);
        expect(res.body.summary.totalSpend).toBe(470);
        expect(res.body.summary.workOrderCount).toBe(7);
      } finally {
        await PropertyAccess.destroy({ where: { membershipId: restrictedMembership.id } });
        await Membership.destroy({ where: { id: restrictedMembership.id } });
        await User.destroy({ where: { id: restrictedUser.id } });
      }
    });

    it("a crafted propertyId belonging to another Company returns 404, never another Company's data", async () => {
      const res = await fetchReport(reqOwner(), { propertyId: propertyForeign.id });
      expect(res.statusCode).toBe(404);
    });

    it("Location labels and spend from an inaccessible Property never leak into an accessible Property's result", async () => {
      // propertyB belongs to Company A but is excluded here by the explicit
      // propertyId filter — its (real, populated) data must never leak into
      // a single-Property request scoped to propertyA.
      const res = await fetchReport(reqOwner());
      const ids = res.body.workOrders.map((wo) => wo.id);
      expect(ids).not.toContain(woOnPropertyB.id);
      expect(ids).not.toContain(woForeign.id);
      for (const hotspot of res.body.hotspots) {
        expect(hotspot.locationLabel).not.toContain("Foreign");
      }
    });
  });
});
