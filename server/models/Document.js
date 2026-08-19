import { DataTypes, Model } from "sequelize";

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

// Same allowed-type list as SitePlan, defined independently rather than
// imported — Document and SitePlan are conceptually separate storage
// concerns that happen to share a value today, not a single coupled
// concept that should be forced to change together later.
export const DOCUMENT_ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];

export class Document extends Model {}

export function initDocumentModel(sequelize) {
  Document.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      companyId: { type: DataTypes.UUID, allowNull: false, field: "company_id" },
      // Exactly one of these four is ever set — enforced by a DB CHECK
      // constraint (see the migration), not just application logic.
      propertyId: { type: DataTypes.UUID, allowNull: true, field: "property_id" },
      assetId: { type: DataTypes.UUID, allowNull: true, field: "asset_id" },
      workOrderId: { type: DataTypes.UUID, allowNull: true, field: "work_order_id" },
      vendorId: { type: DataTypes.UUID, allowNull: true, field: "vendor_id" },
      name: { type: DataTypes.STRING, allowNull: false },
      category: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "other",
        validate: { isIn: [DOCUMENT_CATEGORIES] },
      },
      originalFilename: { type: DataTypes.STRING, allowNull: false, field: "original_filename" },
      storedFilename: { type: DataTypes.STRING, allowNull: false, field: "stored_filename" },
      mimeType: {
        type: DataTypes.STRING,
        allowNull: false,
        field: "mime_type",
        validate: { isIn: [DOCUMENT_ALLOWED_MIME_TYPES] },
      },
      fileSize: { type: DataTypes.INTEGER, allowNull: false, field: "file_size" },
      notes: { type: DataTypes.TEXT, allowNull: true },
      uploadedByUserId: { type: DataTypes.UUID, allowNull: true, field: "uploaded_by_user_id" },
      // One-way soft-delete, same convention as Location/Asset/WorkType —
      // never a reversible status like Vendor.status.
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: "archived_at" },
    },
    {
      sequelize,
      modelName: "Document",
      tableName: "documents",
      underscored: true,
    }
  );
  return Document;
}
