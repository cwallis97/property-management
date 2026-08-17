import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  listProperties,
  createProperty,
  getProperty,
  updateProperty,
  deleteProperty,
} from "../controllers/propertyController.js";
import pinRoutes from "./pinRoutes.js";
import locationRoutes from "./locationRoutes.js";
import assetRoutes from "./assetRoutes.js";

const router = Router();

router.use(requireAuth);

router.get("/", listProperties);
router.post("/", createProperty);
router.get("/:id", getProperty);
router.put("/:id", updateProperty);
router.delete("/:id", deleteProperty);

router.use("/:propertyId/pins", pinRoutes);
router.use("/:propertyId/locations", locationRoutes);
router.use("/:propertyId/assets", assetRoutes);

export default router;
