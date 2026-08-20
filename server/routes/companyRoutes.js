import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { listMyCompanies, updateCompany } from "../controllers/companyController.js";

const router = Router();

router.use(requireAuth);
router.get("/", listMyCompanies);
router.put("/:id", updateCompany);

export default router;
