import crypto from "crypto";
import { Op } from "sequelize";
import { sequelize, Invitation, Membership, User, Company, Property, PropertyAccess, INVITE_ROLES } from "../models/index.js";
import { CAPABILITIES, requireCapability } from "../authorization/capabilities.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_EXPIRY_DAYS = 7;

function isValidUUID(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

// 64 hex chars from a CSPRNG — the lookup key for redemption, not a
// container for claims. Company and role are always read from the stored
// row this token points at, never decoded from the token itself.
function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// "pending" is whatever's left once none of these three is true — derived
// at read time, never a fourth column that could drift from them.
function deriveStatus(invitation) {
  if (invitation.acceptedAt) return "accepted";
  if (invitation.revokedAt) return "revoked";
  if (new Date(invitation.expiresAt) < new Date()) return "expired";
  return "pending";
}

// Never includes the token — that's returned exactly once, in
// createInvite's own response, so the Admin can copy the link at the
// moment of creation. Re-serving it later (e.g. from the pending-invites
// list) would make an unguessable secret needlessly easy to leak via a
// screen-share or export.
function serializeInvite(invitation) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: deriveStatus(invitation),
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    invitedBy: invitation.invitedBy
      ? { id: invitation.invitedBy.id, name: invitation.invitedBy.displayName || invitation.invitedBy.email }
      : null,
    // null = All Properties (the default), matching every other
    // null-means-unrestricted convention in Property Access V1. Only ever
    // consulted at acceptance — see acceptInvite.
    propertyIds: invitation.propertyIds ?? null,
  };
}

export async function listPendingInvites(req, res) {
  const companyId = req.companyIds[0];
  if (!requireCapability(req, res, companyId, CAPABILITIES.USERS_MANAGE)) return;

  const invitations = await Invitation.findAll({
    where: { companyId, acceptedAt: null, revokedAt: null },
    include: { model: User, as: "invitedBy", attributes: ["id", "email", "displayName"] },
    order: [["createdAt", "DESC"]],
  });

  res.json(invitations.map(serializeInvite));
}

export async function createInvite(req, res) {
  const companyId = req.companyIds[0];
  if (!requireCapability(req, res, companyId, CAPABILITIES.USERS_MANAGE)) return;

  const { email: rawEmail, role, propertyIds: rawPropertyIds } = req.body;
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "A valid email is required." });
  }
  if (!INVITE_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${INVITE_ROLES.join(", ")}` });
  }

  // propertyIds is optional and only meaningful for a Manager/Technician
  // invite — undefined/null means "All Properties" (the default, same as
  // Membership.accessMode's own default), matching the smallest-safe-
  // workflow recommendation: a plain invite with no property selection
  // still works exactly as before this milestone. An Admin invite may
  // never carry a restriction — Admin is always unrestricted (see
  // propertyAccess.js) regardless of what a client sends.
  let propertyIds = null;
  if (role !== "admin" && rawPropertyIds !== undefined && rawPropertyIds !== null) {
    if (!Array.isArray(rawPropertyIds) || rawPropertyIds.length === 0) {
      return res.status(400).json({ error: "Select at least one property, or choose All Properties." });
    }
    const uniqueIds = [...new Set(rawPropertyIds)];
    if (uniqueIds.some((id) => !isValidUUID(id))) {
      return res.status(400).json({ error: "Invalid property id." });
    }
    const owned = await Property.findAll({ where: { id: { [Op.in]: uniqueIds }, companyId }, attributes: ["id"] });
    if (owned.length !== uniqueIds.length) {
      return res.status(400).json({ error: "One or more properties are invalid." });
    }
    propertyIds = uniqueIds;
  }

  // Already a member of this Company under that email?
  const existingMember = await Membership.findOne({
    where: { companyId },
    include: { model: User, as: "user", where: { email }, attributes: [] },
  });
  if (existingMember) {
    return res.status(409).json({ error: "This person is already a member of your company." });
  }

  // A still-valid pending invite for the same email already exists —
  // reject rather than silently creating a second active one.
  const existingPending = await Invitation.findOne({
    where: { companyId, email, acceptedAt: null, revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
  });
  if (existingPending) {
    return res.status(409).json({ error: "An invitation is already pending for this email." });
  }

  const invitation = await Invitation.create({
    companyId,
    email,
    role,
    propertyIds,
    token: generateToken(),
    invitedByUserId: req.user.id,
    expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
  });

  const company = await Company.findByPk(companyId, { attributes: ["name"] });

  res.status(201).json({
    ...serializeInvite(invitation),
    token: invitation.token,
    companyName: company.name,
  });
}

export async function revokeInvite(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid invitation id." });
  }

  const invitation = await Invitation.findOne({
    where: { id: req.params.id, companyId: { [Op.in]: req.companyIds } },
  });
  if (!invitation) return res.status(404).json({ error: "Invitation not found." });

  if (!requireCapability(req, res, invitation.companyId, CAPABILITIES.USERS_MANAGE)) return;

  if (invitation.acceptedAt) {
    return res.status(400).json({ error: "This invitation has already been accepted." });
  }
  if (!invitation.revokedAt) {
    invitation.revokedAt = new Date();
    await invitation.save();
  }

  res.json(serializeInvite(invitation));
}

// PUBLIC — no auth required. Reachable only by whoever holds the actual
// unguessable token; returns the minimum needed to render "You've been
// invited to join {company} as {role}" before the visitor has signed in at
// all. No other Company data, no member list, nothing beyond this.
export async function getInvitePreview(req, res) {
  const invitation = await Invitation.findOne({
    where: { token: req.params.token },
    include: { model: Company, as: "company", attributes: ["name"] },
  });
  if (!invitation) return res.status(404).json({ error: "Invitation not found." });

  res.json({
    email: invitation.email,
    role: invitation.role,
    companyName: invitation.company.name,
    status: deriveStatus(invitation),
  });
}

// Authenticated via requireFirebaseUser (resolves req.user, but performs no
// Company auto-provisioning — see authMiddleware.js). Company and role are
// read exclusively from the stored invitation; the request body is never
// consulted for either, so a client cannot influence what it's redeemed
// into even by accident.
export async function acceptInvite(req, res) {
  const invitation = await Invitation.findOne({
    where: { token: req.params.token },
    include: { model: Company, as: "company", attributes: ["name"] },
  });
  if (!invitation) return res.status(404).json({ error: "Invitation not found." });

  const status = deriveStatus(invitation);
  if (status === "accepted") return res.status(400).json({ error: "This invitation has already been used." });
  if (status === "revoked") return res.status(400).json({ error: "This invitation has been cancelled." });
  if (status === "expired") return res.status(400).json({ error: "This invitation has expired." });

  if (req.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return res.status(403).json({
      error: `This invitation is for ${invitation.email}. Sign in with that email to accept it.`,
    });
  }

  // Idempotent against a duplicate Membership — if this exact User is
  // somehow already a member of this Company (e.g. a second accept
  // attempt, or they'd already joined some other way), never create a
  // second row; just let acceptance still mark the invitation used. An
  // already-existing Membership's access is left exactly as it is — this
  // path is about NEW membership creation only, never silently changing
  // access for someone who already belongs to the Company some other way.
  let existingMembership = await Membership.findOne({
    where: { userId: req.user.id, companyId: invitation.companyId },
  });

  if (!existingMembership) {
    // Re-validated against the Company now, not trusted as still-true from
    // whenever the invite was created — a selected Property could have
    // been removed in the meantime. propertyIds is never blindly trusted:
    // an empty valid set (everything originally selected is now gone)
    // fails safely rather than silently falling back to All Properties,
    // which the inviter never actually chose.
    let accessMode = "all";
    let grantedPropertyIds = [];
    if (invitation.role !== "admin" && Array.isArray(invitation.propertyIds) && invitation.propertyIds.length > 0) {
      const owned = await Property.findAll({
        where: { id: { [Op.in]: invitation.propertyIds }, companyId: invitation.companyId },
        attributes: ["id"],
      });
      if (owned.length === 0) {
        return res.status(409).json({
          error: "The properties selected for this invitation are no longer available. Ask an admin to send a new invitation.",
        });
      }
      accessMode = "restricted";
      grantedPropertyIds = owned.map((p) => p.id);
    }

    await sequelize.transaction(async (t) => {
      existingMembership = await Membership.create(
        { userId: req.user.id, companyId: invitation.companyId, role: invitation.role, accessMode },
        { transaction: t }
      );
      if (accessMode === "restricted") {
        await PropertyAccess.bulkCreate(
          grantedPropertyIds.map((propertyId) => ({ membershipId: existingMembership.id, propertyId })),
          { transaction: t }
        );
      }
    });
  }

  invitation.acceptedAt = new Date();
  await invitation.save();

  res.json({
    companyId: invitation.companyId,
    companyName: invitation.company.name,
    role: existingMembership.role,
  });
}
