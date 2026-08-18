import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { listWorkOrderCosts, createWorkOrderCost } from "../controllers/workOrderCostController.js";

const router = Router();
router.use(requireAuth);
router.get("/:workOrderId/costs", listWorkOrderCosts);
router.post("/:workOrderId/costs", createWorkOrderCost);

export default router;
