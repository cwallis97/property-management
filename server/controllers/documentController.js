import { Op } from "sequelize";
import { Document, Property, Asset, WorkOrder, Vendor, User, DOCUMENT_CATEGORIES, DOCUMENT_ALLOWED_MIME_TYPES } from "../models/index.js";
import { saveDocumentFile, deleteDocumentFile, getFilePath, acceptedExtensionsForMimeType } from "../utils/documentStorage.js";
import { CAPABILITIES, requireCapability } from "../authorization/capabilities.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ATTACHMENT_FIELDS = ["propertyId", "assetId", "workOrderId", "vendorId"];

function isValidUUID(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

// Same belt-and-suspenders check as sitePlanController: a spoofed
// Content-Type still can't get past both the MIME allowlist AND the
// original filename's extension agreeing with it.
function originalFilenameExtensionMatches(originalname, mimeType) {
  const acceptedExtensions = acceptedExtensionsForMimeType(mimeType);
  if (acceptedExtensions.length === 0) return false;
  const lowerName = originalname.toLowerCase();
  return acceptedExtensions.some((ext) => lowerName.endsWith(ext));
}

// Never trusts a client-supplied companyId — the caller's company is
// always derived from whichever real, owned attachment target is
// resolved here. Exactly one of propertyId/assetId/workOrderId/vendorId
// must be present in the request body; each is independently re-verified
// against req.companyIds before anything is saved, mirroring the exact
// ownership-chain pattern every other controller in this app already
// uses (findOwnedProperty/findOwnedAsset/resolveVendorId, etc).
async function resolveAttachmentTarget(body, companyIds) {
  const provided = ATTACHMENT_FIELDS.filter((f) => body[f] !== undefined && body[f] !== null && body[f] !== "");
  if (provided.length !== 1) {
    return { error: { status: 400, body: { error: "Exactly one of propertyId, assetId, workOrderId, or vendorId is required." } } };
  }
  const field = provided[0];
  const id = body[field];
  if (!isValidUUID(id)) {
    return { error: { status: 400, body: { error: `Invalid ${field}.` } } };
  }

  if (field === "propertyId") {
    const property = await Property.findOne({ where: { id, companyId: { [Op.in]: companyIds } } });
    if (!property) return { error: { status: 404, body: { error: "Property not found." } } };
    return { attachment: { field, id: property.id, companyId: property.companyId } };
  }

  if (field === "assetId") {
    const asset = await Asset.findOne({
      where: { id, archivedAt: null },
      include: { model: Property, as: "property", where: { companyId: { [Op.in]: companyIds } }, attributes: ["id", "companyId"] },
    });
    if (!asset) return { error: { status: 404, body: { error: "Asset not found." } } };
    return { attachment: { field, id: asset.id, companyId: asset.property.companyId } };
  }

  if (field === "workOrderId") {
    const workOrder = await WorkOrder.findOne({
      where: { id, archivedAt: null },
      include: { model: Property, as: "property", where: { companyId: { [Op.in]: companyIds } }, attributes: ["id", "companyId"] },
    });
    if (!workOrder) return { error: { status: 404, body: { error: "Work order not found." } } };
    return { attachment: { field, id: workOrder.id, companyId: workOrder.property.companyId } };
  }

  // vendorId — deliberately no active/inactive gate here. Attaching a
  // document (an insurance certificate, a final invoice) is compatible
  // with any Vendor lifecycle state; unlike assigning NEW work, it never
  // implies "this vendor is currently available," so resolveVendorId's
  // inactive-rejection rule does not apply to Document attachment.
  const vendor = await Vendor.findOne({ where: { id, companyId: { [Op.in]: companyIds } } });
  if (!vendor) return { error: { status: 404, body: { error: "Vendor not found." } } };
  return { attachment: { field, id: vendor.id, companyId: vendor.companyId } };
}

async function findOwnedDocument(id, companyIds) {
  // No archivedAt filter — an archived Document must remain fully
  // resolvable (metadata and file) by anyone who could already see it;
  // "archived" only ever means "excluded from default listings", never
  // "inaccessible".
  return Document.findOne({ where: { id, companyId: { [Op.in]: companyIds } } });
}

const SERIALIZE_INCLUDE = [
  { model: Property, as: "property", attributes: ["id", "name"] },
  {
    model: Asset,
    as: "asset",
    attributes: ["id", "name"],
    include: [{ model: Property, as: "property", attributes: ["id", "name"] }],
  },
  {
    model: WorkOrder,
    as: "workOrder",
    attributes: ["id", "title"],
    include: [{ model: Property, as: "property", attributes: ["id", "name"] }],
  },
  { model: Vendor, as: "vendor", attributes: ["id", "name"] },
  { model: User, as: "uploadedBy", attributes: ["id", "displayName", "email"] },
];

function findDocumentWithIncludes(id) {
  return Document.findByPk(id, { include: SERIALIZE_INCLUDE });
}

// Property context is always resolved from the attachment target at read
// time, never stored redundantly on Document — same discipline as Asset's
// lifetimeSpend / Vendor's actualSpend/propertiesWorked. A Vendor-attached
// Document has no Property at all, since a Vendor isn't scoped to one.
function serializeDocument(doc) {
  let attachment;
  let property = null;

  if (doc.propertyId) {
    attachment = { type: "property", id: doc.propertyId, label: doc.property?.name ?? "Property" };
    property = doc.property ? { id: doc.property.id, name: doc.property.name } : null;
  } else if (doc.assetId) {
    attachment = { type: "asset", id: doc.assetId, label: doc.asset?.name ?? "Asset" };
    property = doc.asset?.property ? { id: doc.asset.property.id, name: doc.asset.property.name } : null;
  } else if (doc.workOrderId) {
    attachment = { type: "workOrder", id: doc.workOrderId, label: doc.workOrder?.title ?? "Work Order" };
    property = doc.workOrder?.property ? { id: doc.workOrder.property.id, name: doc.workOrder.property.name } : null;
  } else {
    attachment = { type: "vendor", id: doc.vendorId, label: doc.vendor?.name ?? "Vendor" };
  }

  const uploadedBy = doc.uploadedBy;
  return {
    id: doc.id,
    name: doc.name,
    category: doc.category,
    originalFilename: doc.originalFilename,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    notes: doc.notes,
    archivedAt: doc.archivedAt,
    createdAt: doc.createdAt,
    uploadedBy: uploadedBy ? { id: uploadedBy.id, name: uploadedBy.displayName || uploadedBy.email } : null,
    attachment,
    property,
  };
}

// Company-scoped, optionally narrowed to one attachment target — the same
// endpoint serves both the global Documents page (no filter) and every
// EntityDocuments section (one filter), so there is only ever one query
// shape to keep correct. Archived Documents are included; the frontend
// defaults to hiding them, same convention as Active/Completed/All
// elsewhere in this app.
export async function listDocuments(req, res) {
  const where = { companyId: { [Op.in]: req.companyIds } };

  for (const field of ATTACHMENT_FIELDS) {
    if (req.query[field] !== undefined) {
      if (!isValidUUID(req.query[field])) return res.status(400).json({ error: `Invalid ${field}.` });
      where[field] = req.query[field];
    }
  }

  const documents = await Document.findAll({ where, include: SERIALIZE_INCLUDE, order: [["createdAt", "DESC"]] });
  res.json(documents.map(serializeDocument));
}

export async function createDocument(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }
  if (!DOCUMENT_ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
    return res.status(400).json({ error: `File type must be one of: ${DOCUMENT_ALLOWED_MIME_TYPES.join(", ")}` });
  }
  if (!originalFilenameExtensionMatches(req.file.originalname, req.file.mimetype)) {
    return res.status(400).json({ error: "File extension does not match its detected type." });
  }

  const { name, category, notes } = req.body;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required." });
  }
  if (category !== undefined && category !== "" && !DOCUMENT_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${DOCUMENT_CATEGORIES.join(", ")}` });
  }

  // Attachment target (and the companyId it proves) is resolved and
  // re-verified BEFORE the file is written to disk — an unauthorized or
  // cross-company upload attempt never touches the filesystem, same
  // discipline as sitePlanController.
  const { attachment, error: attachmentError } = await resolveAttachmentTarget(req.body, req.companyIds);
  if (attachmentError) return res.status(attachmentError.status).json(attachmentError.body);
  if (!requireCapability(req, res, attachment.companyId, CAPABILITIES.DOCUMENT_MANAGE)) return;

  const storedFilename = await saveDocumentFile(req.file.buffer, req.file.mimetype);

  const document = await Document.create({
    companyId: attachment.companyId,
    [attachment.field]: attachment.id,
    name,
    category: category || undefined,
    originalFilename: req.file.originalname,
    storedFilename,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
    notes: notes || null,
    uploadedByUserId: req.user.id,
  });

  res.status(201).json(serializeDocument(await findDocumentWithIncludes(document.id)));
}

export async function updateDocument(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid document id." });
  }
  const document = await findOwnedDocument(req.params.id, req.companyIds);
  if (!document) return res.status(404).json({ error: "Document not found." });
  if (!requireCapability(req, res, document.companyId, CAPABILITIES.DOCUMENT_MANAGE)) return;

  const { name, category, notes } = req.body;

  if (name !== undefined) {
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name must be a non-empty string." });
    }
    document.name = name;
  }
  if (category !== undefined) {
    if (!DOCUMENT_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${DOCUMENT_CATEGORIES.join(", ")}` });
    }
    document.category = category;
  }
  if (notes !== undefined) {
    if (notes !== null && typeof notes !== "string") {
      return res.status(400).json({ error: "notes must be a string or null." });
    }
    document.notes = notes;
  }

  await document.save();
  res.json(serializeDocument(await findDocumentWithIncludes(document.id)));
}

// New file is saved and the row updated BEFORE the old file is removed —
// if saving the new file fails, the Document still points at its existing,
// working file untouched. If cleanup of the now-superseded old file fails
// afterward, that's logged and swallowed rather than failing the request:
// by that point the Document already correctly points at the new file,
// which is the property that actually matters.
export async function replaceDocumentFile(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid document id." });
  }
  const document = await findOwnedDocument(req.params.id, req.companyIds);
  if (!document) return res.status(404).json({ error: "Document not found." });
  if (!requireCapability(req, res, document.companyId, CAPABILITIES.DOCUMENT_MANAGE)) return;

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }
  if (!DOCUMENT_ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
    return res.status(400).json({ error: `File type must be one of: ${DOCUMENT_ALLOWED_MIME_TYPES.join(", ")}` });
  }
  if (!originalFilenameExtensionMatches(req.file.originalname, req.file.mimetype)) {
    return res.status(400).json({ error: "File extension does not match its detected type." });
  }

  const newStoredFilename = await saveDocumentFile(req.file.buffer, req.file.mimetype);
  const oldStoredFilename = document.storedFilename;

  document.storedFilename = newStoredFilename;
  document.originalFilename = req.file.originalname;
  document.mimeType = req.file.mimetype;
  document.fileSize = req.file.size;
  await document.save();

  try {
    await deleteDocumentFile(oldStoredFilename);
  } catch (err) {
    console.error(`Failed to remove superseded document file ${oldStoredFilename}:`, err);
  }

  res.json(serializeDocument(await findDocumentWithIncludes(document.id)));
}

// One-way soft-delete — the physical file is deliberately NOT removed.
// Archiving means "hide from default listings, keep forever," not
// deletion; see replaceDocumentFile for the one case (superseded by a
// confirmed new upload) where the underlying file genuinely is removed.
export async function archiveDocument(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid document id." });
  }
  const document = await findOwnedDocument(req.params.id, req.companyIds);
  if (!document) return res.status(404).json({ error: "Document not found." });
  if (!requireCapability(req, res, document.companyId, CAPABILITIES.DOCUMENT_MANAGE)) return;

  document.archivedAt = new Date();
  await document.save();
  res.json(serializeDocument(await findDocumentWithIncludes(document.id)));
}

export async function getDocumentFile(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid document id." });
  }
  const document = await findOwnedDocument(req.params.id, req.companyIds);
  if (!document) return res.status(404).json({ error: "Document not found." });

  res.setHeader("Content-Type", document.mimeType);
  res.sendFile(getFilePath(document.storedFilename), (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: "Document file could not be read." });
    }
  });
}
