import { DataTypes } from "sequelize";

export const DOCUMENT_CATEGORIES = [
  "warranty",
  "invoice_receipt",
  "inspection",
  "permit",
  "estimate_bid",
  "manual",
  "vendor_compliance",
  "other",
];

// A Document attaches to exactly one operational record — Property, Asset,
// Work Order, or Vendor (Location deliberately deferred: none of the
// product's real examples needed it, and adding an unused nullable column
// now would be exactly the kind of premature schema surface this codebase
// has consistently avoided). Four nullable FKs with a CHECK enforcing
// "exactly one set", not a generic entityType/entityId column — a
// polymorphic id can't carry a real foreign-key constraint, so nothing at
// the database level would stop a client from pairing the wrong type with
// an id, which is a real tenant-safety gap plain FKs close for free.
//
// companyId is direct and required (mirrors Vendor's own precedent) rather
// than only derivable through whichever attachment happens to be set — the
// four attachment types have four structurally different ownership chains
// (Property: direct; Asset/Work Order: via their Property; Vendor: direct
// Company, no Property at all), so a single validated-at-write-time
// companyId collapses every tenant-scoping query to one universal
// `WHERE company_id IN (...)` regardless of attachment type.
//
// RESTRICT on all four attachment FKs — a Document is historical record
// (an invoice, an inspection report), the same category as WorkOrderNote/
// WorkOrderCostEntry/WorkOrderVendor, all of which already protect their
// parent from cascading deletion; it is not a core operational entity like
// Asset/WorkOrder themselves; RESTRICT is the more conservative,
// consistent choice.
export async function up({ context: queryInterface }) {
  await queryInterface.createTable("documents", {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: queryInterface.sequelize.literal("gen_random_uuid()") },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "companies", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    property_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "properties", key: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    },
    asset_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "assets", key: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    },
    work_order_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "work_orders", key: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    },
    vendor_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "vendors", key: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    },
    name: { type: DataTypes.STRING, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: false, defaultValue: "other" },
    original_filename: { type: DataTypes.STRING, allowNull: false },
    stored_filename: { type: DataTypes.STRING, allowNull: false },
    mime_type: { type: DataTypes.STRING, allowNull: false },
    file_size: { type: DataTypes.INTEGER, allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    uploaded_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    // One-way soft-delete (matches Location/Asset/WorkType), never a
    // reversible status like Vendor.status — archiving a document means
    // "hide it, keep it forever," not "temporarily paused."
    archived_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex("documents", ["company_id"]);
  await queryInterface.addIndex("documents", ["property_id"]);
  await queryInterface.addIndex("documents", ["asset_id"]);
  await queryInterface.addIndex("documents", ["work_order_id"]);
  await queryInterface.addIndex("documents", ["vendor_id"]);

  await queryInterface.sequelize.query(`
    ALTER TABLE documents
    ADD CONSTRAINT documents_exactly_one_target
    CHECK (num_nonnulls(property_id, asset_id, work_order_id, vendor_id) = 1)
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE documents
    ADD CONSTRAINT documents_category_check
    CHECK (category IN (${DOCUMENT_CATEGORIES.map((c) => `'${c}'`).join(", ")}))
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("documents");
}
