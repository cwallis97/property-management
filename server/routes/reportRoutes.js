import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getMaintenanceSpendSummary, getMaintenanceSpendWorkOrders } from "../controllers/reportController.js";

const router = Router();
router.use(requireAuth);
router.get("/maintenance-spend", getMaintenanceSpendSummary);
router.get("/maintenance-spend/work-orders", getMaintenanceSpendWorkOrders);

export default router;
