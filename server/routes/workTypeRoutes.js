import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { listWorkTypes } from "../controllers/workTypeController.js";

const router = Router();
router.use(requireAuth);
router.get("/", listWorkTypes);

export default router;
