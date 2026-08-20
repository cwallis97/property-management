import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { listCompanyMembers, updateMemberRole } from "../controllers/membershipController.js";

// Flat/top-level, not nested under /api/companies/:id — mirrors /api/vendors'
// and /api/documents' existing flat, company-scoped mounting: the target
// Company is always the caller's own (req.companyIds[0]), never a client-
// supplied id in the URL.
const router = Router();
router.use(requireAuth);

router.get("/", listCompanyMembers);
router.put("/:id", updateMemberRole);

export default router;
