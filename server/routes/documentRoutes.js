import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  listDocuments,
  createDocument,
  updateDocument,
  replaceDocumentFile,
  archiveDocument,
  getDocumentFile,
} from "../controllers/documentController.js";
import { DOCUMENT_ALLOWED_MIME_TYPES } from "../models/index.js";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // Same 15MB cap as Site Plan — consistency over premature tuning.

// Buffered in memory, not multer's own disk storage — nothing is written
// to disk until AFTER attachment ownership has been checked in the
// controller, same discipline as Site Plan upload.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!DOCUMENT_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
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

// Flat/top-level, not nested under /api/properties/:id — a Document can
// attach to a Property, Asset, Work Order, or Vendor, so there is no
// single parent route it belongs under (mirrors /api/vendors' own flat,
// company-scoped mounting).
const router = Router();
router.use(requireAuth);

router.get("/", listDocuments);
router.post("/", handleUpload, createDocument);
router.put("/:id", updateDocument);
router.put("/:id/file", handleUpload, replaceDocumentFile);
router.delete("/:id", archiveDocument);
router.get("/:id/file", getDocumentFile);

export default router;
