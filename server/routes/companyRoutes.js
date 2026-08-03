import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { listMyCompanies } from "../controllers/companyController.js";

const router = Router();

router.use(requireAuth);
router.get("/", listMyCompanies);

export default router;
