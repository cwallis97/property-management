import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { listCompanyMembers, updateMemberRole, updateMemberPropertyAccess } from "../controllers/membershipController.js";
import { updateMembershipStatus } from "../controllers/accessLifecycleController.js";

// Flat/top-level, not nested under /api/companies/:id — mirrors /api/vendors'
// and /api/documents' existing flat, company-scoped mounting: the target
// Company is always the caller's own (req.companyIds[0]), never a client-
// supplied id in the URL.
const router = Router();
router.use(requireAuth);

router.get("/", listCompanyMembers);
router.put("/:id", updateMemberRole);
router.put("/:id/property-access", updateMemberPropertyAccess);
// SOC 2 Phase 1 — disable / re-enable a Membership (Company-level
// offboarding). USERS_MANAGE, owner-protected, audited.
router.patch("/:id/status", updateMembershipStatus);

export default router;
