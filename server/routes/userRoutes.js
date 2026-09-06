import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getCurrentUser, updateCurrentUser } from "../controllers/userController.js";
import { updateUserStatus } from "../controllers/accessLifecycleController.js";

const router = Router();

router.use(requireAuth);
router.get("/me", getCurrentUser);
router.put("/me", updateCurrentUser);
// SOC 2 Phase 1 — global account disable / re-enable (all Companies).
// USERS_MANAGE in a shared Company, cannot target a Company owner or self,
// audited, revokes Firebase refresh tokens. Backend control — not
// surfaced in the Phase 1 UI (the Users page does Company-level Membership
// disable instead).
router.patch("/:id/status", updateUserStatus);

export default router;
