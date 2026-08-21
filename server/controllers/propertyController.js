import { Op } from "sequelize";
import { Property, Pin, PROPERTY_STATUSES } from "../models/index.js";
import { CAPABILITIES, requireCapability } from "../authorization/capabilities.js";
import { getAccessiblePropertyIds, requirePropertyAccess } from "../authorization/propertyAccess.js";

// Defaults to active-only — the same "archived is excluded unless asked
// for" convention every other list-with-archive-state endpoint in this app
// follows. Every ordinary picker (Portfolio Assets/Work Orders/Documents/
// Reports filters, the global Property Scope selector, the global Add
// Document target picker) calls this with no query param at all, so they
// all correctly stop offering archived Properties for free. Portfolio's own
// Active/Archived/All toggle is the one caller that passes ?status=
// explicitly.
export async function listProperties(req, res) {
  const { status } = req.query;
  if (status !== undefined && status !== "all" && !PROPERTY_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: all, ${PROPERTY_STATUSES.join(", ")}` });
  }

  const where = { companyId: { [Op.in]: req.companyIds } };
  if (status === undefined) where.status = "active";
  else if (status !== "all") where.status = status;

  // Same single-current-company assumption already used by Vendor
  // creation, Membership listing, and Invitation creation elsewhere in
  // this app (req.companyIds[0]) — Property Access is per-Membership, and
  // nothing in the product yet distinguishes between multiple companies
  // for one user.
  const accessiblePropertyIds = await getAccessiblePropertyIds(req, req.companyIds[0]);
  if (accessiblePropertyIds) where.id = { [Op.in]: accessiblePropertyIds };

  const properties = await Property.findAll({
    where,
    order: [["createdAt", "DESC"]],
  });
  res.json(properties);
}

export async function createProperty(req, res) {
  const { name, address, sitePlanUrl, companyId } = req.body;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required." });
  }

  const targetCompanyId = companyId ?? req.companyIds[0];
  if (!req.companyIds.includes(targetCompanyId)) {
    return res.status(403).json({ error: "You are not a member of that company." });
  }
  if (!requireCapability(req, res, targetCompanyId, CAPABILITIES.PROPERTY_CREATE)) return;

  const property = await Property.create({
    companyId: targetCompanyId,
    name,
    address: address ?? null,
    sitePlanUrl: sitePlanUrl ?? null,
  });
  res.status(201).json(property);
}

export async function getProperty(req, res) {
  const property = await Property.findOne({
    where: { id: req.params.id, companyId: { [Op.in]: req.companyIds } },
    include: { model: Pin, as: "pins" },
  });

  if (!property) return res.status(404).json({ error: "Property not found." });
  if (!(await requirePropertyAccess(req, res, property.companyId, property.id))) return;
  res.json(property);
}

// Gated on PROPERTY_LIFECYCLE rather than a general "property.edit" — in
// practice this endpoint is only ever called today to change `status`
// (Settings' Archive/Restore action). name/address editing has no frontend
// UI yet; if a general Edit Property feature is built later, that's the
// moment to reconsider whether it needs its own, less-restrictive
// capability rather than reusing this one.
export async function updateProperty(req, res) {
  const property = await Property.findOne({
    where: { id: req.params.id, companyId: { [Op.in]: req.companyIds } },
  });
  if (!property) return res.status(404).json({ error: "Property not found." });
  if (!(await requirePropertyAccess(req, res, property.companyId, property.id))) return;
  if (!requireCapability(req, res, property.companyId, CAPABILITIES.PROPERTY_LIFECYCLE)) return;

  const { name, address, sitePlanUrl, status } = req.body;
  if (name !== undefined) property.name = name;
  if (address !== undefined) property.address = address;
  if (sitePlanUrl !== undefined) property.sitePlanUrl = sitePlanUrl;
  // Archive/Restore Property — same generic-update pattern as Vendor's
  // status field (see updateVendor). Never touches any child Location,
  // Asset, Work Order, Cost Entry, or Document; only this row's own status
  // changes, in either direction.
  if (status !== undefined) {
    if (!PROPERTY_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${PROPERTY_STATUSES.join(", ")}` });
    }
    property.status = status;
  }
  await property.save();

  res.json(property);
}

// Unused by any current frontend (nothing implements permanent Property
// deletion yet — see the Product Bible), but a real, mounted, destructive
// route regardless. Gated the same as archive/restore so a direct API call
// can't reach it without Admin-level authorization even though no UI
// exposes it today.
export async function deleteProperty(req, res) {
  const property = await Property.findOne({
    where: { id: req.params.id, companyId: { [Op.in]: req.companyIds } },
  });
  if (!property) return res.status(404).json({ error: "Property not found." });
  if (!(await requirePropertyAccess(req, res, property.companyId, property.id))) return;
  if (!requireCapability(req, res, property.companyId, CAPABILITIES.PROPERTY_LIFECYCLE)) return;

  await property.destroy();
  res.status(204).send();
}
