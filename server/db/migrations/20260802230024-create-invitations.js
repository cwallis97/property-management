import { DataTypes } from "sequelize";

export const INVITE_ROLES = ["admin", "manager", "technician"];

// A real, persisted invitation record rather than a stateless signed token
// — deliberately chosen (per the same reasoning that put a `current` flag
// on WorkOrderVendor and a status enum on Vendor/Property instead of
// something purely computed): a DB row gives one-time redemption,
// expiration, cancellation, and auditability all as plain columns anyone
// reading this table can see directly, rather than encoded in a token's
// payload that only decodes correctly at the moment it's verified. The
// token itself is still an unguessable secret (64 hex chars from
// crypto.randomBytes(32)) — it's the lookup key, not a container for
// claims; Company and role are always read from this row, never trusted
// from the token or the client.
export async function up({ context: queryInterface }) {
  await queryInterface.createTable("invitations", {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false, defaultValue: queryInterface.sequelize.literal("gen_random_uuid()") },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "companies", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    email: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false },
    token: { type: DataTypes.STRING, allowNull: false, unique: true },
    invited_by_user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    accepted_at: { type: DataTypes.DATE, allowNull: true },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex("invitations", ["company_id"]);
  await queryInterface.addIndex("invitations", ["email"]);

  await queryInterface.sequelize.query(`
    ALTER TABLE invitations
    ADD CONSTRAINT invitations_role_check
    CHECK (role IN (${INVITE_ROLES.map((r) => `'${r}'`).join(", ")}))
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("invitations");
}
