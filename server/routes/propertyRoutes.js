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

const router = Router();

router.use(requireAuth);

router.get("/", listProperties);
router.post("/", createProperty);
router.get("/:id", getProperty);
router.put("/:id", updateProperty);
router.delete("/:id", deleteProperty);

router.use("/:propertyId/pins", pinRoutes);

export default router;
