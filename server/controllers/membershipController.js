import { Op } from "sequelize";
import { Membership, User } from "../models/index.js";
import { CAPABILITIES, requireCapability } from "../authorization/capabilities.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

// A member's role may only ever be changed TO one of these via this
// endpoint — "owner" is deliberately excluded from both directions: it can
// never be assigned (no ownership transfer in V1) and, separately below, a
// Membership that's already "owner" can never be changed away from it
// either. Same single-company assumption used throughout this app
// (Property Scope, Vendor creation, etc.) — members are always listed/
// edited relative to req.companyIds[0], not a company picker.
const EDITABLE_ROLES = ["admin", "manager", "technician"];

function serializeMember(membership) {
  const user = membership.user;
  return {
    membershipId: membership.id,
    userId: user.id,
    name: user.displayName || user.email,
    email: user.email,
    role: membership.role,
  };
}

export async function listCompanyMembers(req, res) {
  const companyId = req.companyIds[0];
  if (!requireCapability(req, res, companyId, CAPABILITIES.USERS_MANAGE)) return;

  const members = await Membership.findAll({
    where: { companyId },
    include: { model: User, as: "user", attributes: ["id", "email", "displayName"] },
    order: [["createdAt", "ASC"]],
  });

  res.json(members.map(serializeMember));
}

export async function updateMemberRole(req, res) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: "Invalid membership id." });
  }

  // Tenant check first, exactly like every other controller in this app:
  // resolve the target row scoped to companies the caller actually belongs
  // to, so a cross-Company id always 404s rather than ever reaching the
  // authorization check below.
  const membership = await Membership.findOne({
    where: { id: req.params.id, companyId: { [Op.in]: req.companyIds } },
    include: { model: User, as: "user", attributes: ["id", "email", "displayName"] },
  });
  if (!membership) return res.status(404).json({ error: "Member not found." });

  if (!requireCapability(req, res, membership.companyId, CAPABILITIES.USERS_MANAGE)) return;

  const { role } = req.body;
  if (!EDITABLE_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${EDITABLE_ROLES.join(", ")}` });
  }

  // Owner protection — the schema has no separate "primary owner" flag
  // beyond role itself, and today exactly one Membership is ever created
  // with role "owner" (at Company auto-provisioning). Treating that role as
  // immutable through this endpoint is the smallest rule that can never
  // leave a Company without an owner or demote it by accident. Ownership
  // transfer is a deliberately separate, unbuilt feature.
  if (membership.role === "owner") {
    return res.status(400).json({ error: "The owner's role cannot be changed." });
  }

  // Self-protection — an Admin changing their own role through this same
  // UI could accidentally lock themselves out of Settings mid-session.
  // Every other capability check already re-derives role from the
  // database on every request, so this isn't a security backstop, only a
  // deliberate guard against an easy, avoidable mistake.
  if (membership.userId === req.user.id) {
    return res.status(400).json({ error: "You cannot change your own role." });
  }

  membership.role = role;
  await membership.save();

  res.json(serializeMember(membership));
}
