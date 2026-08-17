import { Router } from "express";
import { listLocationsForProperty, createLocation } from "../controllers/locationController.js";

const router = Router({ mergeParams: true });

router.get("/", listLocationsForProperty);
router.post("/", createLocation);

export default router;
