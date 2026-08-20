import { Router } from "express";
import { requireAuth, requireFirebaseUser } from "../middleware/authMiddleware.js";
import {
  listPendingInvites,
  createInvite,
  revokeInvite,
  getInvitePreview,
  acceptInvite,
} from "../controllers/inviteController.js";

const router = Router();

// Admin-facing management, keyed by the invitation's own id — needs full
// requireAuth (Company/Membership context) since these all act on "my
// Company's invitations."
router.get("/", requireAuth, listPendingInvites);
router.post("/", requireAuth, createInvite);
router.delete("/:id", requireAuth, revokeInvite);

// Invitee-facing redemption, keyed by the unguessable token instead of an
// id — deliberately under a distinct /token/ path so there's never any
// ambiguity between the two id shapes. getInvitePreview is public (the
// visitor may not be signed in yet); acceptInvite needs an authenticated
// identity but explicitly not requireAuth's Company auto-provisioning (see
// requireFirebaseUser's own comment for why).
router.get("/token/:token", getInvitePreview);
router.post("/token/:token/accept", requireFirebaseUser, acceptInvite);

export default router;
