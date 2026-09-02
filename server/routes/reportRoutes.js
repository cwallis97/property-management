import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getMaintenanceSpendSummary, getMaintenanceSpendWorkOrders, getWorkOrdersReport } from "../controllers/reportController.js";

const router = Router();
router.use(requireAuth);
// Every route below is further gated on CAPABILITIES.REPORTS_READ inside
// its own controller action (this app's established inline-guard
// convention — see authorization/capabilities.js) rather than as router
// middleware, since each action needs a resolved companyId first.
router.get("/maintenance-spend", getMaintenanceSpendSummary);
router.get("/maintenance-spend/work-orders", getMaintenanceSpendWorkOrders);
// The one shared dataset behind Reports' Work Orders tab AND Property Site
// Map's Analyze mode — see getWorkOrdersReport's own comment.
router.get("/work-orders", getWorkOrdersReport);

export default router;
