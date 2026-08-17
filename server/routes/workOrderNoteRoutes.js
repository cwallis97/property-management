import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { listWorkOrderNotes, createWorkOrderNote } from "../controllers/workOrderNoteController.js";

const router = Router();
router.use(requireAuth);
router.get("/:workOrderId/notes", listWorkOrderNotes);
router.post("/:workOrderId/notes", createWorkOrderNote);

export default router;
