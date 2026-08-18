import { Router } from "express";
import multer from "multer";
import { uploadSitePlan, getSitePlan, getSitePlanFile } from "../controllers/sitePlanController.js";
import { SITE_PLAN_ALLOWED_MIME_TYPES } from "../models/index.js";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB — generous for a scanned/photographed site plan, small enough to not be a DoS vector

// Buffered in memory (not multer's own disk storage) so nothing is written
// to disk until AFTER property ownership has been checked in the
// controller — an unauthorized upload attempt never touches the
// filesystem. Fine at this size limit.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!SITE_PLAN_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error("UNSUPPORTED_FILE_TYPE"));
    }
    cb(null, true);
  },
});

function handleUpload(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: `File too large. Max size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.` });
    }
    return res.status(400).json({ error: "File type must be PDF, PNG, or JPG." });
  });
}

const router = Router({ mergeParams: true });

router.get("/", getSitePlan);
router.post("/", handleUpload, uploadSitePlan);
router.get("/file", getSitePlanFile);

export default router;
