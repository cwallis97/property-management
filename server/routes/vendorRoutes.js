import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { listVendorsForCompany, createVendor, getVendor, updateVendor } from "../controllers/vendorController.js";

// Flat/top-level, not nested under /api/properties/:id — a Vendor is
// Company-scoped directly, not owned by any one Property (mirrors
// /api/work-types' existing flat, company-scoped mounting style).
const router = Router();
router.use(requireAuth);

router.get("/", listVendorsForCompany);
router.post("/", createVendor);
router.get("/:id", getVendor);
router.put("/:id", updateVendor);

export default router;
