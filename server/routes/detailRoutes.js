import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getPin, updatePin, deletePin } from "../controllers/pinController.js";
import { getRepair, updateRepair, deleteRepair } from "../controllers/repairController.js";
import { getLocation, updateLocation, archiveLocation } from "../controllers/locationController.js";

const pinRouter = Router();
pinRouter.use(requireAuth);
pinRouter.get("/:id", getPin);
pinRouter.put("/:id", updatePin);
pinRouter.delete("/:id", deletePin);

const repairRouter = Router();
repairRouter.use(requireAuth);
repairRouter.get("/:id", getRepair);
repairRouter.put("/:id", updateRepair);
repairRouter.delete("/:id", deleteRepair);

const locationRouter = Router();
locationRouter.use(requireAuth);
locationRouter.get("/:id", getLocation);
locationRouter.put("/:id", updateLocation);
locationRouter.delete("/:id", archiveLocation);

export { pinRouter, repairRouter, locationRouter };
