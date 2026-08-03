import { DataTypes } from "sequelize";

export const SEVERITY_LEVELS = ["low", "medium", "high"];
export const REPAIR_STATUSES = ["open", "in_progress", "completed"];

export async function up({ context: queryInterface }) {
  await queryInterface.createTable("repairs", {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: queryInterface.sequelize.literal("gen_random_uuid()"),
    },
    pin_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "pins", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    description: { type: DataTypes.TEXT, allowNull: false },
    cost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    vendor: { type: DataTypes.STRING, allowNull: true },
    invoice_url: { type: DataTypes.STRING, allowNull: true },
    photo_urls: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    warranty_info: { type: DataTypes.TEXT, allowNull: true },
    chargeback_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    reimbursement_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    severity: { type: DataTypes.STRING, allowNull: false, defaultValue: "low" },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: "open" },
    repair_date: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex("repairs", ["pin_id"]);

  await queryInterface.sequelize.query(`
    ALTER TABLE repairs
    ADD CONSTRAINT repairs_severity_check
    CHECK (severity IN (${SEVERITY_LEVELS.map((s) => `'${s}'`).join(", ")}))
  `);

  await queryInterface.sequelize.query(`
    ALTER TABLE repairs
    ADD CONSTRAINT repairs_status_check
    CHECK (status IN (${REPAIR_STATUSES.map((s) => `'${s}'`).join(", ")}))
  `);
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("repairs");
}
