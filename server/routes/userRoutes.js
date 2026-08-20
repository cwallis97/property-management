import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getCurrentUser, updateCurrentUser } from "../controllers/userController.js";

const router = Router();

router.use(requireAuth);
router.get("/me", getCurrentUser);
router.put("/me", updateCurrentUser);

export default router;
