import { Router } from "express";
import { getLots } from "../controllers/lotController.js";

const router = Router();

router.get("/", getLots);

export default router;
