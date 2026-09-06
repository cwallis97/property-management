// Phase 0 SOC 2 hardening — shared server-side length caps for
// user-controlled free-text fields. Every controller already validates
// *type* (string / non-empty); this adds a maximum so a single request
// can't stash an unbounded blob in a column. Over-limit input is rejected
// with 400 — never silently truncated.
//
// The limits are deliberately generous (a real work-order description or
// vendor note can be long); they exist to stop abuse, not to constrain
// legitimate content. Changing a limit here changes it everywhere the
// helper is used.

export const TEXT_LIMITS = {
  // Names, titles, labels, single-line identifiers.
  name: 255,
  // Contact-ish single-line fields.
  email: 320,
  phone: 64,
  // Postal addresses (can wrap a couple of lines).
  address: 500,
  // Multi-paragraph bodies: descriptions, notes.
  longText: 10000,
};

// Returns an error string when `value` is invalid for the given rules, or
// null when it is acceptable. Does NOT trim or otherwise mutate the
// value — callers keep their existing handling of the accepted value.
//
// Options:
//   field      – name used in the error message (default "value")
//   max        – maximum length in characters (required in practice)
//   required   – true => undefined / null / "" (after trim) is an error
//   allowNull  – true => an explicit null is accepted and returns null
export function textFieldError(value, { field = "value", max, required = false, allowNull = false } = {}) {
  if (value === undefined) {
    return required ? `${field} is required.` : null;
  }
  if (value === null) {
    if (allowNull) return null;
    return required ? `${field} is required.` : `${field} must be a string.`;
  }
  if (typeof value !== "string") {
    return `${field} must be a string.`;
  }
  if (required && value.trim() === "") {
    return `${field} is required.`;
  }
  if (max != null && value.length > max) {
    return `${field} must be ${max} characters or fewer.`;
  }
  return null;
}
