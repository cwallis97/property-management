import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getPin, updatePin, deletePin } from "../controllers/pinController.js";
import { getRepair, updateRepair, deleteRepair } from "../controllers/repairController.js";
import { getLocation, updateLocation, archiveLocation } from "../controllers/locationController.js";
import { getAsset, updateAsset, archiveAsset } from "../controllers/assetController.js";
import { getWorkOrder, updateWorkOrder, archiveWorkOrder } from "../controllers/workOrderController.js";

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

const assetRouter = Router();
assetRouter.use(requireAuth);
assetRouter.get("/:id", getAsset);
assetRouter.put("/:id", updateAsset);
assetRouter.delete("/:id", archiveAsset);

const workOrderRouter = Router();
workOrderRouter.use(requireAuth);
workOrderRouter.get("/:id", getWorkOrder);
workOrderRouter.put("/:id", updateWorkOrder);
workOrderRouter.delete("/:id", archiveWorkOrder);

export { pinRouter, repairRouter, locationRouter, assetRouter, workOrderRouter };
