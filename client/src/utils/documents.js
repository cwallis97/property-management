// Shared by AddDocumentModal, EditDocumentModal, EntityDocuments, the
// global Documents page, and DocumentTable — one place these can never
// drift apart, same convention as utils/workOrders.js's WORK_ORDER_CATEGORIES.
export const DOCUMENT_CATEGORIES = [
  { value: "warranty", label: "Warranty" },
  { value: "invoice_receipt", label: "Invoice / Receipt" },
  { value: "inspection", label: "Inspection" },
  { value: "permit", label: "Permit" },
  { value: "estimate_bid", label: "Estimate / Bid" },
  { value: "manual", label: "Manual" },
  { value: "vendor_compliance", label: "Vendor / Compliance" },
  { value: "other", label: "Other" },
];

export const documentCategoryLabel = Object.fromEntries(DOCUMENT_CATEGORIES.map((c) => [c.value, c.label]));

export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
