import { Router } from "express";
import { listWorkOrdersForProperty, createWorkOrder } from "../controllers/workOrderController.js";

const router = Router({ mergeParams: true });

router.get("/", listWorkOrdersForProperty);
router.post("/", createWorkOrder);

export default router;
