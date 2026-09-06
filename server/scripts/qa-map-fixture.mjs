import "dotenv/config";
import { Op } from "sequelize";
import {
  sequelize,
  Property,
  SitePlan,
  WorkType,
  Location,
  Asset,
  Membership,
  User,
  WorkOrder,
  WorkOrderCostEntry,
} from "../models/index.js";

// ---------------------------------------------------------------------------
// LOCAL DEV ONLY — QA fixture for stress-testing Site Map → Analyze.
//
//   node scripts/qa-map-fixture.mjs seed      (or: npm run qa:map:seed)
//   node scripts/qa-map-fixture.mjs cleanup   (or: npm run qa:map:cleanup)
//   node scripts/qa-map-fixture.mjs status
//
// Every row it creates is a Work Order on the Riverbend dev Property whose
// title ends with the tag " [QA-MAP]" and whose description begins with a
// fixture marker. cleanup removes ONLY those rows (and their cost entries).
// It never touches real data, and hard safety guards refuse to run against
// anything that isn't the local development database.
// ---------------------------------------------------------------------------

const TAG = "[QA-MAP]";
const MARKER = "QA-MAP fixture — safe to delete with: npm run qa:map:cleanup";

const RIVERBEND_ID = "d7fc52ce-f6af-42c3-ad12-02cf9a93d96c";
const RIVERBEND_NAME = "Riverbend Manufactured Home Community";

// -- Safety ---------------------------------------------------------------

function fail(msg) {
  console.error(`\n  ✗  REFUSING TO RUN — ${msg}\n`);
  process.exit(1);
}

function assertSafeDatabase() {
  const url = process.env.DATABASE_URL || "";
  const testUrl = process.env.TEST_DATABASE_URL || "";

  console.log("──────────────────────────────────────────────────────────────");
  console.log(`  Target DATABASE_URL : ${url.replace(/\/\/[^@]*@/, "//***:***@") || "(unset)"}`);
  console.log(`  NODE_ENV            : ${process.env.NODE_ENV || "(unset)"}`);
  console.log(`  DB_SSL             : ${process.env.DB_SSL || "(unset)"}`);
  console.log("──────────────────────────────────────────────────────────────");

  if (!url) fail("DATABASE_URL is not set.");
  if ((process.env.NODE_ENV || "").toLowerCase() === "production") fail("NODE_ENV is 'production'.");
  if (process.env.DB_SSL === "true") fail("DB_SSL=true — that looks like a managed/remote database.");

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail("DATABASE_URL is not a parseable URL.");
  }
  const host = parsed.hostname;
  const dbName = parsed.pathname.replace(/^\//, "");

  if (testUrl && url.trim() === testUrl.trim()) fail("DATABASE_URL is identical to TEST_DATABASE_URL.");
  if (/test/i.test(dbName)) fail(`database name "${dbName}" contains "test".`);
  if (/prod/i.test(dbName)) fail(`database name "${dbName}" looks production-like.`);
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) fail(`database host "${host}" is not local.`);
  if (/(amazonaws\.com|rds\.|render\.com|neon\.tech|supabase|herokuapp\.com|railway\.app|\.azure|googleapis\.com|\.gcp|\.cloud)/i.test(host)) {
    fail(`database host "${host}" looks like a managed cloud provider.`);
  }

  const allowed = (process.env.QA_MAP_ALLOWED_DB || "property_management").split(",").map((s) => s.trim());
  if (!allowed.includes(dbName)) {
    fail(`database name "${dbName}" is not in the allow-list [${allowed.join(", ")}]. Set QA_MAP_ALLOWED_DB to override.`);
  }

  console.log(`  ✓  "${dbName}" on ${host} is a local development database — proceeding.\n`);
  return { host, dbName };
}

// -- Fixture data -------------------------------------------------------------
//
// wt keys are "<category>/<work_type key>" — resolved against the real
// seeded WorkType rows at run time (the script aborts if any is missing or
// its category doesn't match). loc / asset are human names, resolved
// against Riverbend's own Locations / Assets. x / y are 0–100 normalized
// SitePlan coordinates (null / null = intentionally unmapped).

const F = [
  // ---- A. REPEAT HOTSPOT — Unit 12, mostly water Line Repair, 8 WOs ----
  { t: "Water line leak at service riser", wt: "water/line_repair", loc: "Unit 12", x: 62.3, y: 43.4, d: 520, s: "completed", p: "medium", c: [1350] },
  { t: "Water line leak", wt: "water/line_repair", loc: "Unit 12", x: 62.0, y: 44.0, d: 400, s: "completed", p: "medium", c: [1200] },
  { t: "Recurring water line repair", wt: "water/line_repair", loc: "Unit 12", x: 62.4, y: 43.6, d: 250, s: "completed", p: "high", c: [1650] },
  { t: "Water line leak near meter pit", wt: "water/line_repair", loc: "Unit 12", x: 61.6, y: 44.3, d: 160, s: "completed", p: "medium", c: [980] },
  { t: "Shutoff valve replacement", wt: "water/valve_repair", loc: "Unit 12", x: 62.2, y: 44.5, d: 95, s: "completed", p: "medium", c: [540] },
  { t: "Water line repair", wt: "water/line_repair", loc: "Unit 12", x: 61.8, y: 43.9, d: 40, s: "completed", p: "high", c: [1400, 700] },
  { t: "Water line leak — active", wt: "water/line_repair", loc: "Unit 12", x: 62.6, y: 44.1, d: 18, s: "in_progress", p: "urgent", c: [] },
  { t: "Water meter reading fault", wt: "water/meter_repair", loc: "Unit 12", x: 62.1, y: 44.7, d: 6, s: "open", p: "medium", c: [] },

  // ---- B. HIGH-COST / LOW-FREQUENCY — Lift Station, 3 WOs, big spend ----
  { t: "Sewer main line replacement", wt: "sewer/main_repair", loc: "Lift Station", x: 24.0, y: 78.0, d: 300, s: "completed", p: "high", c: [18500, 4200] },
  { t: "Lift station pump failure", wt: "sewer/lift_station", loc: "Lift Station", asset: "Lift Station Pump #1", x: 24.5, y: 77.6, d: 210, s: "completed", p: "high", c: [9800] },
  { t: "Lift station control panel rebuild", wt: "sewer/lift_station", loc: "Lift Station", x: 23.6, y: 78.4, d: 70, s: "completed", p: "medium", c: [3400] },

  // ---- C. SECONDARY HOTSPOT — Lot 44, mixed water/sewer, 5 WOs ----
  { t: "Sewer backup", wt: "sewer/backup", loc: "Lot 44", x: 78.0, y: 62.0, d: 220, s: "completed", p: "medium", c: [650] },
  { t: "Sewer line cleaning", wt: "sewer/line_cleaning", loc: "Lot 44", x: 78.5, y: 61.5, d: 150, s: "completed", p: "low", c: [420] },
  { t: "Water line leak at lot connection", wt: "water/line_repair", loc: "Lot 44", x: 77.6, y: 62.4, d: 80, s: "completed", p: "medium", c: [1100] },
  { t: "Sewer lateral repair", wt: "sewer/lateral_repair", loc: "Lot 44", x: 78.2, y: 62.7, d: 33, s: "assigned", p: "urgent", c: [] },
  { t: "Water valve leak", wt: "water/valve_repair", loc: "Lot 44", x: 77.9, y: 61.8, d: 12, s: "open", p: "medium", c: [] },

  // ---- D. NEARBY POINTS — 5 distinct Locations, coords ~1.5u apart ----
  { t: "Water line repair", wt: "water/line_repair", loc: "Lot 41", x: 48.0, y: 51.0, d: 60, s: "completed", p: "medium", c: [780] },
  { t: "Electrical pedestal repair", wt: "electrical/pedestal_repair", loc: "Lot 42", x: 48.7, y: 51.4, d: 45, s: "completed", p: "medium", c: [520] },
  { t: "Water meter repair", wt: "water/meter_repair", loc: "Lot 43", x: 49.2, y: 50.8, d: 30, s: "in_progress", p: "medium", c: [] },
  { t: "Sewer backup", wt: "sewer/backup", loc: "Lot 81", x: 47.8, y: 50.4, d: 20, s: "waiting", p: "high", c: [] },
  { t: "Water line leak", wt: "water/line_repair", loc: "Lot 82", x: 48.3, y: 51.7, d: 9, s: "open", p: "medium", c: [] },

  // ---- E. EDGE / CORNER POINTS — 8 WOs near the SitePlan boundary ----
  { t: "Streetlight out near north fence", wt: "electrical/streetlight", loc: "South Loop", asset: "Street Light #12", x: 50.0, y: 4.0, d: 55, s: "completed", p: "low", c: [240] },
  { t: "Road grading at community entrance", wt: "roads/grading", loc: "North Loop", asset: "North Loop Road Section", x: 50.0, y: 95.5, d: 120, s: "completed", p: "medium", c: [1900] },
  { t: "Irrigation leak on west berm", wt: "water/other", loc: "Common Areas", x: 4.5, y: 50.0, d: 70, s: "completed", p: "medium", c: [360] },
  { t: "Transformer inspection — east boundary", wt: "electrical/transformer", asset: "Transformer T-4", x: 96.0, y: 50.0, d: 200, s: "completed", p: "medium", c: [2600] },
  { t: "Sign post repair — NW corner", wt: "buildings_facilities/other", loc: "Common Areas", x: 4.0, y: 5.0, d: 88, s: "completed", p: "low", c: [180] },
  { t: "Storm drain grate — NE corner", wt: "sewer/other", loc: "Community Infrastructure", x: 96.5, y: 4.5, d: 44, s: "assigned", p: "urgent", c: [] },
  { t: "Sidewalk trip hazard — SW", wt: "concrete/sidewalk_repair", loc: "Clubhouse", asset: "Clubhouse Sidewalk", x: 3.5, y: 96.0, d: 175, s: "completed", p: "medium", c: [850] },
  { t: "Erosion / slab repair — SE corner", wt: "concrete/slab_repair", loc: "Community Infrastructure", x: 96.5, y: 96.5, d: 500, s: "completed", p: "medium", c: [1400] },

  // ---- F. DISTRIBUTED SINGLETONS — 14 WOs, spread across the plan ----
  { t: "Well pump seal replacement", wt: "water/other", asset: "Well Pump #1", x: 18.0, y: 30.0, d: 800, s: "completed", p: "high", c: [1850] },
  { t: "Chlorination line repair", wt: "water/line_repair", loc: "Well House", x: 19.0, y: 31.0, d: 610, s: "completed", p: "medium", c: [430] },
  { t: "North Loop shutoff valve rebuild", wt: "water/valve_repair", loc: "North Loop", asset: "North Loop Shutoff Valve", x: 40.0, y: 68.0, d: 330, s: "completed", p: "medium", c: [760] },
  { t: "Transformer T-4 oil leak", wt: "electrical/transformer", asset: "Transformer T-4", x: 42.0, y: 70.0, d: 270, s: "completed", p: "high", c: [3800, 1400] },
  { t: "Clubhouse HVAC compressor replacement", wt: "buildings_facilities/clubhouse", loc: "Clubhouse", x: 30.0, y: 88.0, d: 140, s: "completed", p: "high", c: [3900] },
  { t: "Clubhouse roof leak", wt: "buildings_facilities/clubhouse", loc: "Clubhouse", x: 31.0, y: 87.0, d: 65, s: "in_progress", p: "medium", c: [] },
  { t: "Playground surface repair", wt: "buildings_facilities/common_area", loc: "Playground", x: 58.0, y: 82.0, d: 190, s: "completed", p: "medium", c: [1100] },
  { t: "Cottonwood limb removal", wt: "trees_landscaping/tree_removal", loc: "South Loop", asset: "Cottonwood #28", x: 72.0, y: 76.0, d: 400, s: "completed", p: "medium", c: [2400] },
  { t: "Common area hedge trimming", wt: "trees_landscaping/trimming", loc: "Common Areas", x: 14.0, y: 60.0, d: 25, s: "assigned", p: "low", c: [] },
  { t: "Entrance landscaping refresh", wt: "trees_landscaping/general_landscaping", loc: "Common Areas", x: 10.0, y: 45.0, d: 300, s: "completed", p: "low", c: [680] },
  { t: "Pothole repair on North Loop road", wt: "roads/pothole_repair", loc: "North Loop", asset: "North Loop Road Section", x: 44.0, y: 64.0, d: 100, s: "completed", p: "medium", c: [540] },
  { t: "Street Light #12 photocell", wt: "electrical/streetlight", loc: "South Loop", asset: "Street Light #12", x: 66.0, y: 72.0, d: 50, s: "completed", p: "low", c: [160] },
  { t: "Unit 27 water line leak", wt: "water/line_repair", loc: "Unit 27", x: 55.0, y: 38.0, d: 15, s: "open", p: "urgent", c: [] },
  { t: "Community sign lighting failure", wt: "electrical/other", loc: "Community Infrastructure", x: 52.0, y: 20.0, d: 900, s: "completed", p: "low", c: [320] },

  // ---- G. UNMAPPED — 7 WOs, no coordinates, still counted / still spend ----
  { t: "Water conservation audit", wt: "water/other", x: null, y: null, d: 30, s: "completed", p: "low", c: [] },
  { t: "Community-wide sewer smoke testing", wt: "sewer/line_cleaning", loc: "Community Infrastructure", x: null, y: null, d: 120, s: "completed", p: "medium", c: [2800] },
  { t: "Electrical panel labeling", wt: "electrical/other", x: null, y: null, d: 60, s: "completed", p: "low", c: [150] },
  { t: "Backflow preventer annual test", wt: "water/meter_repair", loc: "Well House", x: null, y: null, d: 45, s: "completed", p: "low", c: [300] },
  { t: "Property tree survey", wt: "trees_landscaping/other", x: null, y: null, d: 200, s: "completed", p: "low", c: [500] },
  { t: "Annual road striping", wt: "roads/other", x: null, y: null, d: 250, s: "completed", p: "low", c: [1600] },
  { t: "General maintenance sweep", wt: "general_other/other", x: null, y: null, d: 10, s: "open", p: "medium", c: [] },
];

// A few overdue (past dueDate, still open) rows so the Active map has both
// urgent-by-priority and urgent-by-overdue markers.
const OVERDUE_TITLES = new Set(["Water meter repair", "Clubhouse roof leak", "Common area hedge trimming"]);

const COST_TYPES = ["labor", "material", "vendor", "equipment", "other"];

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000);
}
function dateOnlyDaysAgo(days) {
  return isoDaysAgo(days).toISOString().slice(0, 10);
}

// -- Commands ----------------------------------------------------------------

async function loadContext() {
  const property = await Property.findByPk(RIVERBEND_ID);
  if (!property) fail(`Riverbend Property (${RIVERBEND_ID}) not found in this database.`);
  if (property.name !== RIVERBEND_NAME) {
    console.warn(`  ! Property ${RIVERBEND_ID} is named "${property.name}" (expected "${RIVERBEND_NAME}") — continuing.`);
  }
  if (property.status !== "active") fail(`Riverbend Property is ${property.status}, not active.`);

  const plan = await SitePlan.findOne({ where: { propertyId: RIVERBEND_ID } });
  if (!plan) fail("Riverbend has no uploaded SitePlan — the whole point is spatial QA.");

  const owner = await Membership.findOne({
    where: { companyId: property.companyId, role: "owner" },
    include: [{ model: User, as: "user", attributes: ["id"] }],
  });
  if (!owner || !owner.user) fail("No owner Membership/User found for Riverbend's Company.");

  const locations = await Location.findAll({ where: { propertyId: RIVERBEND_ID } });
  const assets = await Asset.findAll({ where: { propertyId: RIVERBEND_ID } });
  const locByName = new Map(locations.map((l) => [l.name, l]));
  const assetByName = new Map(assets.map((a) => [a.name, a]));

  const workTypes = await WorkType.findAll();
  const wtByKey = new Map(workTypes.map((w) => [`${w.category}/${w.key}`, w]));

  return { property, plan, owner, locByName, assetByName, wtByKey };
}

async function seed() {
  assertSafeDatabase();
  const ctx = await loadContext();

  // Validate every reference the fixture uses BEFORE inserting anything.
  const problems = [];
  for (const row of F) {
    const wt = ctx.wtByKey.get(row.wt);
    if (!wt) problems.push(`unknown work type "${row.wt}" (${row.t})`);
    else {
      const [cat] = row.wt.split("/");
      if (wt.category !== cat) problems.push(`work type "${row.wt}" category mismatch (db=${wt.category})`);
    }
    if (row.loc && !ctx.locByName.has(row.loc)) problems.push(`unknown Location "${row.loc}" (${row.t})`);
    if (row.asset && !ctx.assetByName.has(row.asset)) problems.push(`unknown Asset "${row.asset}" (${row.t})`);
    if (row.x != null && (row.x < 0 || row.x > 100 || row.y < 0 || row.y > 100)) problems.push(`coord out of range (${row.t})`);
  }
  if (problems.length) {
    console.error("  ✗ Fixture references do not match this database:");
    for (const p of problems) console.error(`     - ${p}`);
    process.exit(1);
  }

  const existing = await WorkOrder.count({ where: { propertyId: RIVERBEND_ID, title: { [Op.like]: `%${TAG}` } } });
  if (existing > 0) {
    console.log(`  ! ${existing} QA-MAP Work Orders already exist. Run "npm run qa:map:cleanup" first if you want a fresh set.\n`);
    process.exit(1);
  }

  const t = await sequelize.transaction();
  let woCount = 0;
  let costCount = 0;
  let costTotal = 0;
  try {
    for (const [i, row] of F.entries()) {
      const wt = ctx.wtByKey.get(row.wt);
      const loc = row.loc ? ctx.locByName.get(row.loc) : null;
      const asset = row.asset ? ctx.assetByName.get(row.asset) : null;
      const createdAt = isoDaysAgo(row.d);
      const [category] = row.wt.split("/");

      const wo = await WorkOrder.create(
        {
          propertyId: RIVERBEND_ID,
          // For a handful of asset-linked rows, deliberately leave
          // locationId null so the report's COALESCE(wo.location_id,
          // a.location_id) fallback gets exercised.
          locationId: loc ? loc.id : null,
          assetId: asset ? asset.id : null,
          title: `${row.t} ${TAG}`,
          description: `${MARKER}\n(fixture #${i + 1})`,
          status: row.s,
          priority: row.p,
          category,
          workTypeId: wt.id,
          mapX: row.x,
          mapY: row.y,
          dueDate: OVERDUE_TITLES.has(row.t) ? dateOnlyDaysAgo(4) : null,
          completedAt: row.s === "completed" ? createdAt : null,
          assignedMembershipId: ["assigned", "in_progress"].includes(row.s) ? ctx.owner.id : null,
        },
        { transaction: t }
      );

      // Sequelize manages created_at on insert; set the real reported date
      // directly so date-range filtering has something to bite on.
      await sequelize.query("UPDATE work_orders SET created_at = :c, updated_at = :c WHERE id = :id", {
        replacements: { c: createdAt.toISOString(), id: wo.id },
        transaction: t,
      });

      woCount += 1;

      for (const [j, amount] of (row.c || []).entries()) {
        await WorkOrderCostEntry.create(
          {
            workOrderId: wo.id,
            type: COST_TYPES[(i + j) % COST_TYPES.length],
            amount,
            note: `${MARKER}`,
            costDate: dateOnlyDaysAgo(Math.max(row.d - j, 0)),
            createdByUserId: ctx.owner.user.id,
          },
          { transaction: t }
        );
        costCount += 1;
        costTotal += amount;
      }
    }
    await t.commit();
  } catch (err) {
    await t.rollback();
    console.error("  ✗ Seed failed, transaction rolled back:", err.message);
    process.exit(1);
  }

  console.log(`  ✓ Created ${woCount} QA Work Orders + ${costCount} Cost Entries ($${costTotal.toLocaleString()}) on "${ctx.property.name}".\n`);
  await printReport(ctx);
  await sequelize.close();
}

async function cleanup() {
  assertSafeDatabase();

  const rows = await WorkOrder.findAll({
    where: { propertyId: RIVERBEND_ID, title: { [Op.like]: `%${TAG}` } },
    attributes: ["id", "title", "description"],
  });
  // Belt-and-braces: only rows that ALSO carry the description marker.
  const ids = rows.filter((r) => (r.description || "").startsWith(MARKER.slice(0, 20))).map((r) => r.id);

  if (ids.length === 0) {
    console.log("  Nothing to clean up — no QA-MAP Work Orders found.\n");
    await sequelize.close();
    return;
  }

  const t = await sequelize.transaction();
  try {
    const costs = await WorkOrderCostEntry.destroy({ where: { workOrderId: { [Op.in]: ids } }, transaction: t });
    const wos = await WorkOrder.destroy({ where: { id: { [Op.in]: ids } }, transaction: t });
    await t.commit();
    console.log(`  ✓ Removed ${wos} QA Work Orders and ${costs} Cost Entries. No other rows were touched.\n`);
  } catch (err) {
    await t.rollback();
    console.error("  ✗ Cleanup failed, transaction rolled back:", err.message);
    process.exit(1);
  }
  await sequelize.close();
}

async function status() {
  assertSafeDatabase();
  const ctx = await loadContext();
  const n = await WorkOrder.count({ where: { propertyId: RIVERBEND_ID, title: { [Op.like]: `%${TAG}` } } });
  console.log(`  ${n} QA-MAP Work Orders currently on "${ctx.property.name}".\n`);
  if (n > 0) await printReport(ctx);
  await sequelize.close();
}

async function printReport(ctx) {
  const rows = await WorkOrder.findAll({
    where: { propertyId: RIVERBEND_ID, title: { [Op.like]: `%${TAG}` } },
    include: [
      { model: WorkType, as: "workType", attributes: ["label", "category"] },
      { model: WorkOrderCostEntry, as: "costEntries", attributes: ["amount"] },
    ],
    order: [["createdAt", "ASC"]],
  });

  const by = (fn) => {
    const m = new Map();
    for (const r of rows) {
      const k = fn(r);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const spend = rows.reduce((s, r) => s + r.costEntries.reduce((x, c) => x + Number(c.amount), 0), 0);
  const mapped = rows.filter((r) => r.mapX != null).length;
  const now = Date.now();
  const bucket = (r) => {
    const days = (now - new Date(r.createdAt).getTime()) / 86400000;
    if (days <= 30) return "≤ 30d";
    if (days <= 90) return "31–90d";
    if (days <= 180) return "91–180d";
    if (days <= 365) return "181–365d";
    if (days <= 730) return "1–2y";
    return "> 2y";
  };

  console.log(`  Property        : ${ctx.property.name} (${RIVERBEND_ID})`);
  console.log(`  QA Work Orders  : ${rows.length}  (mapped ${mapped} · unmapped ${rows.length - mapped})`);
  console.log(`  QA total spend  : $${spend.toLocaleString()}`);
  console.log(`  By category     : ${by((r) => r.workType?.category).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`  By work type    : ${by((r) => r.workType?.label).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`  By status       : ${by((r) => r.status).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`  By priority     : ${by((r) => r.priority).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`  By age bucket   : ${by(bucket).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log("");
}

const cmd = process.argv[2];
if (cmd === "seed") await seed();
else if (cmd === "cleanup") await cleanup();
else if (cmd === "status") await status();
else {
  console.log("Usage: node scripts/qa-map-fixture.mjs <seed|cleanup|status>");
  process.exit(1);
}
