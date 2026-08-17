import { Router } from "express";
import { listAssetsForProperty, createAsset } from "../controllers/assetController.js";

const router = Router({ mergeParams: true });

router.get("/", listAssetsForProperty);
router.post("/", createAsset);

export default router;
