import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { listAuditEvents } from "../controllers/auditEventController.js";

const router = Router();
router.use(requireAuth);

router.get("/", listAuditEvents);

export default router;
