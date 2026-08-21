import { DataTypes } from "sequelize";

// An explicit grant: this Membership (a user's relationship to one
// specific Company — never User directly, so access is inherently
// per-Company, mirroring how `role` already works) may see/operate within
// this Property. Only ever consulted for a Membership whose
// access_mode = 'restricted' (see the prior migration) — for 'all'
// Memberships these rows are never created and never read.
//
// CASCADE on both FKs: a grant has no independent meaning once either side
// is gone — a user leaving a Company (Membership deleted) or a Property
// being permanently deleted should never leave an orphaned grant row
// behind. This is deliberately different from the RESTRICT-on-history
// pattern used for WorkOrderNote/WorkOrderCostEntry/Document elsewhere in
// this schema: a PropertyAccess row is a live permission, not a historical
// record, so there is nothing to protect by blocking its cascade.
//
// No company_id column — redundant. A grant's Company is always reachable
// through membership_id -> memberships.company_id, and every
// authorization check that consults this table already resolves the
// Membership (and therefore the Company) first, so duplicating it here
// would only be a second value that could theoretically drift from the
// first.
export async function up({ context: queryInterface }) {
  await queryInterface.createTable("property_access", {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: queryInterface.sequelize.literal("gen_random_uuid()") },
    membership_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "memberships", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    property_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "properties", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  // The membership_id index also serves as the primary lookup path
  // ("what can this Membership access") via the composite constraint
  // below; property_id gets its own index for the (currently unused, but
  // cheap to have ready) inverse lookup, "who has access to this Property."
  await queryInterface.addIndex("property_access", ["property_id"]);
  await queryInterface.addConstraint("property_access", {
    fields: ["membership_id", "property_id"],
    type: "unique",
    name: "property_access_membership_property_unique",
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("property_access");
}
