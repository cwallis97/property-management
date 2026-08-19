import { DataTypes } from "sequelize";

// Deliberately independent of both `type` and work_order_vendors: `type`
// still answers "what kind of expense" (labor/material/vendor/equipment/
// other) and is completely unchanged by this migration; work_order_vendors
// answers "did this Vendor work on this job" (participation). vendor_id
// here answers a third, narrower question — "did this specific dollar
// amount actually go to this Vendor" — so Vendor-attributable spend is
// never inferred from "the Work Order has this Vendor assigned, therefore
// all its costs belong to them." Nullable: most cost entries (internal
// labor, property-purchased materials) never have a Vendor at all, and
// every existing row simply gets NULL here, changing nothing about it.
export async function up({ context: queryInterface }) {
  await queryInterface.addColumn("work_order_cost_entries", "vendor_id", {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: "vendors", key: "id" },
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  });

  await queryInterface.addIndex("work_order_cost_entries", ["vendor_id"]);
}

export async function down({ context: queryInterface }) {
  await queryInterface.removeColumn("work_order_cost_entries", "vendor_id");
}
