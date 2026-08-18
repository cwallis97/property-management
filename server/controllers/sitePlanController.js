import { Op } from "sequelize";
import { Property, SitePlan, WorkOrder, SITE_PLAN_ALLOWED_MIME_TYPES } from "../models/index.js";
import { saveSitePlanFile, deleteSitePlanFile, getFilePath, acceptedExtensionsForMimeType } from "../utils/sitePlanStorage.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

async function findOwnedProperty(propertyId, companyIds) {
  if (!isValidUUID(propertyId)) return null;
  return Property.findOne({ where: { id: propertyId, companyId: { [Op.in]: companyIds } } });
}

// Belt-and-suspenders alongside multer's own MIME check: reject anything
// whose declared original extension doesn't match an allowed type, so a
// spoofed Content-Type still can't get past both checks together. A MIME
// type may legitimately map to more than one extension (image/jpeg is
// either .jpg or .jpeg), so this accepts any of them rather than a single
// canonical one.
function originalFilenameExtensionMatches(originalname, mimeType) {
  const acceptedExtensions = acceptedExtensionsForMimeType(mimeType);
  if (acceptedExtensions.length === 0) return false;
  const lowerName = originalname.toLowerCase();
  return acceptedExtensions.some((ext) => lowerName.endsWith(ext));
}

export async function uploadSitePlan(req, res) {
  const property = await findOwnedProperty(req.params.propertyId, req.companyIds);
  if (!property) return res.status(404).json({ error: "Property not found." });

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }
  if (!SITE_PLAN_ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
    return res.status(400).json({ error: `File type must be one of: ${SITE_PLAN_ALLOWED_MIME_TYPES.join(", ")}` });
  }
  if (!originalFilenameExtensionMatches(req.file.originalname, req.file.mimetype)) {
    return res.status(400).json({ error: "File extension does not match its detected type." });
  }

  const existing = await SitePlan.findOne({ where: { propertyId: property.id } });

  const storedFilename = await saveSitePlanFile(req.file.buffer, req.file.mimetype);

  if (existing) {
    const oldStoredFilename = existing.storedFilename;
    existing.storedFilename = storedFilename;
    existing.originalFilename = req.file.originalname;
    existing.mimeType = req.file.mimetype;
    existing.fileSize = req.file.size;
    await existing.save();
    // Replacing the plan invalidates any Work Order coordinates placed
    // against the old image's canvas — a position that was "on the shed"
    // in the old image could be anywhere in the new one. The Work Orders
    // themselves (title, status, notes, Location/Asset relationships,
    // history) are never touched, only the now-meaningless coordinates.
    await WorkOrder.update(
      { mapX: null, mapY: null },
      { where: { propertyId: property.id, mapX: { [Op.ne]: null } } }
    );
    await deleteSitePlanFile(oldStoredFilename);
    return res.json(existing);
  }

  const sitePlan = await SitePlan.create({
    propertyId: property.id,
    storedFilename,
    originalFilename: req.file.originalname,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
  });
  res.status(201).json(sitePlan);
}

export async function getSitePlan(req, res) {
  const property = await findOwnedProperty(req.params.propertyId, req.companyIds);
  if (!property) return res.status(404).json({ error: "Property not found." });

  const sitePlan = await SitePlan.findOne({ where: { propertyId: property.id } });
  if (!sitePlan) return res.status(404).json({ error: "No site plan uploaded for this property." });

  res.json(sitePlan);
}

export async function getSitePlanFile(req, res) {
  const property = await findOwnedProperty(req.params.propertyId, req.companyIds);
  if (!property) return res.status(404).json({ error: "Property not found." });

  const sitePlan = await SitePlan.findOne({ where: { propertyId: property.id } });
  if (!sitePlan) return res.status(404).json({ error: "No site plan uploaded for this property." });

  res.setHeader("Content-Type", sitePlan.mimeType);
  res.sendFile(getFilePath(sitePlan.storedFilename), (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: "Site plan file could not be read." });
    }
  });
}
