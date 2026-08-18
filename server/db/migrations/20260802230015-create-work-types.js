import { DataTypes } from "sequelize";
import { randomUUID } from "crypto";

// The category list a WorkType belongs to — the exact same values
// work_orders.category will use (added in the next migration). Category
// itself stays a plain validated string (see WorkOrder), not a table; only
// WorkType needs real normalization, for the reasons in the architecture
// report (stable identity, rename-without-rewrite, future per-company
// customization, reliable report grouping).
const CATEGORIES = [
  "water",
  "sewer",
  "electrical",
  "roads",
  "concrete",
  "trees_landscaping",
  "buildings_facilities",
  "general_other",
];

// Intentionally small, manufactured-housing-first V1 taxonomy. Every
// category gets an "Other" escape hatch. All seeded rows are global
// (company_id null) — available to every company — never company-specific;
// per-company custom Work Types are a later milestone this schema already
// supports without a migration (see the company_id column below).
const SEED_WORK_TYPES = {
  water: [
    ["line_repair", "Line Repair"],
    ["meter_repair", "Meter Repair"],
    ["valve_repair", "Valve Repair"],
    ["other", "Other"],
  ],
  sewer: [
    ["line_cleaning", "Line Cleaning"],
    ["main_repair", "Main Repair"],
    ["lateral_repair", "Lateral Repair"],
    ["lift_station", "Lift Station"],
    ["backup", "Backup"],
    ["other", "Other"],
  ],
  electrical: [
    ["pedestal_repair", "Pedestal Repair"],
    ["streetlight", "Streetlight"],
    ["transformer", "Transformer"],
    ["other", "Other"],
  ],
  roads: [
    ["pothole_repair", "Pothole Repair"],
    ["grading", "Grading"],
    ["other", "Other"],
  ],
  concrete: [
    ["sidewalk_repair", "Sidewalk Repair"],
    ["slab_repair", "Slab Repair"],
    ["other", "Other"],
  ],
  trees_landscaping: [
    ["tree_removal", "Tree Removal"],
    ["trimming", "Trimming"],
    ["general_landscaping", "General Landscaping"],
    ["other", "Other"],
  ],
  buildings_facilities: [
    ["clubhouse", "Clubhouse"],
    ["common_area", "Common Area"],
    ["other", "Other"],
  ],
  general_other: [["other", "Other"]],
};

export async function up({ context: queryInterface }) {
  await queryInterface.createTable("work_types", {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: queryInterface.sequelize.literal("gen_random_uuid()") },
    category: { type: DataTypes.STRING, allowNull: false },
    key: { type: DataTypes.STRING, allowNull: false },
    label: { type: DataTypes.STRING, allowNull: false },
    // null = system/global, visible to every company. Reserved for future
    // company-specific custom Work Types; unused (always null) in 8A.
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "companies", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    // Soft-retire, same convention as Location/Asset/WorkOrder — an
    // archived WorkType stays valid for any WorkOrder still referencing it,
    // it just stops appearing as a selectable option for new ones.
    archived_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex("work_types", ["category"]);

  // NULL is never equal to NULL in a plain unique index, so global rows
  // (company_id null) and future company-owned rows each need their own
  // partial unique index to actually enforce "no duplicate key within a
  // category" in their respective scope.
  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX work_types_global_category_key_unique ON work_types (category, key) WHERE company_id IS NULL
  `);
  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX work_types_company_category_key_unique ON work_types (company_id, category, key) WHERE company_id IS NOT NULL
  `);

  const now = new Date();
  const rows = [];
  for (const category of CATEGORIES) {
    for (const [key, label] of SEED_WORK_TYPES[category]) {
      rows.push({
        id: randomUUID(),
        category,
        key,
        label,
        company_id: null,
        archived_at: null,
        created_at: now,
        updated_at: now,
      });
    }
  }
  await queryInterface.bulkInsert("work_types", rows);
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("work_types");
}
