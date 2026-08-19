// Local-disk storage for uploaded Documents. Deliberately isolated behind
// this small module — same discipline as sitePlanStorage.js, so swapping
// to real production object storage later means replacing only these
// functions, never the model, controller, or route/auth logic that call
// them. See the Product Bible for the explicit production-storage
// requirement this module exists to satisfy: real customer Document
// uploads must not run on ephemeral local disk in production.
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";

const UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads", "documents");

const MIME_TO_EXT = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
};

const MIME_TO_ACCEPTED_EXTENSIONS = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

// Server-generated names only match this shape, so getFilePath can safely
// reject anything else before ever touching the filesystem — defense in
// depth even though storedFilename should never originate from a request.
const STORED_FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg)$/;

export async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export function extensionForMimeType(mimeType) {
  return MIME_TO_EXT[mimeType] ?? null;
}

export function acceptedExtensionsForMimeType(mimeType) {
  return MIME_TO_ACCEPTED_EXTENSIONS[mimeType] ?? [];
}

function assertSafeStoredFilename(storedFilename) {
  if (!STORED_FILENAME_RE.test(storedFilename)) {
    throw new Error("Refusing to resolve an unsafe stored filename.");
  }
}

export function getFilePath(storedFilename) {
  assertSafeStoredFilename(storedFilename);
  return path.join(UPLOAD_DIR, storedFilename);
}

// Generates the on-disk filename and writes the buffer — the caller never
// chooses the filename (never derived from the client's original filename
// or any other request input), which is what rules out path traversal.
export async function saveDocumentFile(buffer, mimeType) {
  const ext = extensionForMimeType(mimeType);
  if (!ext) throw new Error(`Unsupported mime type: ${mimeType}`);

  const storedFilename = `${randomUUID()}${ext}`;
  await fs.writeFile(getFilePath(storedFilename), buffer);
  return storedFilename;
}

export async function deleteDocumentFile(storedFilename) {
  try {
    await fs.unlink(getFilePath(storedFilename));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}
