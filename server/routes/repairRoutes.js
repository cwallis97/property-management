import { Router } from "express";
import { listRepairsForPin, createRepair } from "../controllers/repairController.js";

const router = Router({ mergeParams: true });

router.get("/", listRepairsForPin);
router.post("/", createRepair);

export default router;
