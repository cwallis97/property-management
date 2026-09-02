import { Op } from "sequelize";
import { Property } from "../models/index.js";
import { getAccessiblePropertyIds } from "./propertyAccess.js";
import { CAPABILITIES, hasCapability } from "./capabilities.js";

// Resolves, up front, everything Global Search needs to constrain its
// queries BEFORE any row is read — never a broad query followed by a
// JavaScript filter.
//
//  - activePropertyIds: the union, across EVERY one of the caller's
//    Memberships, of the ACTIVE Properties that Membership may access.
//    Property Access is evaluated per Company/Membership (that is
//    getAccessiblePropertyIds' own contract), never off req.companyIds[0],
//    so a user who is unrestricted in Company A and restricted in Company
//    B gets exactly A's active Properties plus B's granted-and-active
//    Properties. Archived Properties are excluded here, which is also what
//    keeps every Location / Asset / Work Order / property-attached
//    Document beneath an archived Property out of search for free.
//
//  - companyIds: every Company the caller belongs to — used for the two
//    Company-scoped surfaces (Vendors, which the directory makes visible
//    to every member; and Documents, whose company_id column is the outer
//    tenant bound before the per-attachment Property check).
//
//  - usersManageCompanyIds: ONLY the Companies where the caller
//    independently holds USERS_MANAGE. People results are scoped to these
//    Companies alone — being an Admin in Company A never exposes Company
//    B's people just because the caller is also a (non-managing) Manager
//    or Technician there. Empty array => People search is skipped entirely.
export async function resolveSearchScope(req) {
  const companyIds = [...new Set(req.companyIds)];

  const activeProps = await Property.findAll({
    where: { companyId: { [Op.in]: companyIds }, status: "active" },
    attributes: ["id", "companyId"],
  });
  const activeByCompany = new Map();
  for (const p of activeProps) {
    if (!activeByCompany.has(p.companyId)) activeByCompany.set(p.companyId, []);
    activeByCompany.get(p.companyId).push(p.id);
  }

  const accessible = new Set();
  const usersManageCompanyIds = [];

  for (const membership of req.memberships) {
    const companyActive = activeByCompany.get(membership.companyId) ?? [];
    // null => unrestricted for this Company: every active Property counts.
    const granted = await getAccessiblePropertyIds(req, membership.companyId);
    if (granted === null) {
      for (const id of companyActive) accessible.add(id);
    } else {
      const grantedSet = new Set(granted);
      for (const id of companyActive) if (grantedSet.has(id)) accessible.add(id);
    }

    if (hasCapability(req, membership.companyId, CAPABILITIES.USERS_MANAGE)) {
      usersManageCompanyIds.push(membership.companyId);
    }
  }

  return {
    companyIds,
    activePropertyIds: [...accessible],
    usersManageCompanyIds,
  };
}
