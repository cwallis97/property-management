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
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Edit Document</h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-subtle hover:text-ink-secondary"
            aria-label="Close"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Name</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {DOCUMENT_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                    category === c.value ? "bg-accent text-accent-ink" : "bg-surface-subtle text-ink-secondary hover:bg-line"
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
              className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-secondary placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-sm font-medium text-ink">Replace file</label>
              {replacementFile && (
                <button type="button" onClick={() => setReplacementFile(null)} className="text-xs font-medium text-ink-muted hover:text-ink-secondary">
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
              className="w-full rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-sm font-medium text-ink-secondary transition hover:border-line-strong hover:text-ink-secondary"
            >
              {replacementFile ? replacementFile.name : `Currently: ${document.originalFilename} (optional)`}
            </button>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
