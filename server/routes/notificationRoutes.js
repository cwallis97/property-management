import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "../controllers/notificationController.js";

// Notification Center V1 — every route is recipient-self-scoped inside the
// controller (recipient_user_id = req.user.id). No capability gate: a
// notification read is inherently self-scoped, and there is deliberately
// no organization-wide notification surface.
const router = Router();
router.use(requireAuth);

router.get("/", listNotifications);
router.get("/unread-count", getUnreadCount);
router.post("/read-all", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);

export default router;
