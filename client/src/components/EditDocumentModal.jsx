import { useRef, useState } from "react";
import { IconX } from "./icons";
import { DOCUMENT_CATEGORIES } from "../utils/documents";
import { updateDocument, replaceDocumentFile } from "../utils/api";

const ACCEPTED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const ACCEPTED_ACCEPT_ATTR = ".pdf,.png,.jpg,.jpeg";

// Metadata (name/category/notes) is always editable here. Replacing the
// underlying file is an optional extra step in the same form — a new file
// is only sent if the user actually picks one — rather than a third modal
// for something this small.
export default function EditDocumentModal({ document, onClose, onUpdated }) {
  const [name, setName] = useState(document.name);
  const [category, setCategory] = useState(document.category);
  const [notes, setNotes] = useState(document.notes ?? "");
  const [replacementFile, setReplacementFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  function handleFileChosen(chosen) {
    if (!chosen) return;
    if (!ACCEPTED_MIME_TYPES.includes(chosen.type)) {
      setError("Replacement file must be a PDF, PNG, or JPG.");
      return;
    }
    setReplacementFile(chosen);
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let updated = await updateDocument(document.id, {
        name: name.trim(),
        category,
        notes: notes.trim() || null,
      });
      if (replacementFile) {
        updated = await replaceDocumentFile(document.id, replacementFile);
      }
      onUpdated(updated);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-gray-900/40 px-4 py-8 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Edit Document</h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-50 hover:text-gray-600"
            aria-label="Close"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-900">Name</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-900">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {DOCUMENT_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                    category === c.value ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-900">Replace file</label>
              {replacementFile && (
                <button type="button" onClick={() => setReplacementFile(null)} className="text-xs font-medium text-gray-400 hover:text-gray-600">
                  Clear
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => handleFileChosen(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-500 transition hover:border-gray-400 hover:text-gray-700"
            >
              {replacementFile ? replacementFile.name : `Currently: ${document.originalFilename} (optional)`}
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
