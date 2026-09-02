import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { globalSearch } from "../controllers/searchController.js";

// Global Search V1 — flat/top-level, not nested under any one resource,
// because a search deliberately spans every entity type and every active
// accessible Property (never the frontend Property Scope). No capability
// gate on the route itself — it's a read, open to any authenticated
// member, exactly like every other GET; the per-entity authorization is
// constrained inside the SQL by searchController (see resolveSearchScope).
const router = Router();
router.use(requireAuth);

router.get("/", globalSearch);

export default router;
