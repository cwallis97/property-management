import { Router } from "express";
import { listPinsForProperty, createPin } from "../controllers/pinController.js";
import repairRoutes from "./repairRoutes.js";

const router = Router({ mergeParams: true });

router.get("/", listPinsForProperty);
router.post("/", createPin);

router.use("/:pinId/repairs", repairRoutes);

export default router;
