// Builds a safe `Content-Disposition` header value for a file download
// response. Two properties matter for security:
//
//   1. The filename shown to the user is derived from the stored
//      `originalFilename` but stripped of anything that could break out
//      of the header, mislead the browser, or leak a path — directory
//      separators, control characters, quotes, and leading dots are all
//      removed. A cleared-to-empty name falls back to a generic default.
//   2. Both the ASCII `filename=` and the RFC 5987 `filename*=UTF-8''`
//      forms are emitted so a non-ASCII original name still renders
//      correctly in modern browsers without the raw bytes ever appearing
//      unencoded in the header.
//
// The on-disk stored name (a server-generated UUID) is never exposed;
// only the user-facing original name is, sanitized.

// Removes C0 control characters (code points 0-31) and DEL (127).
function stripControlChars(str) {
  let out = "";
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c > 31 && c !== 127) out += ch;
  }
  return out;
}

function sanitizeFilename(name, fallback) {
  if (typeof name !== "string") return fallback;
  const cleaned = stripControlChars(name)
    .replace(/[\\/]/g, "_") // path separators
    .replace(/"/g, "") // quote that would terminate the header token
    .replace(/^\.+/, "") // leading dots ("..", hidden-file leading dot)
    .trim()
    .slice(0, 200);
  return cleaned || fallback;
}

// `disposition` is "attachment" (force a download — the default and the
// right choice for user-uploaded documents) or "inline" (allow the
// browser to render it in place — used for Site Plans, which the app
// views rather than downloads).
export function contentDispositionHeader(originalFilename, { disposition = "attachment", fallback = "download" } = {}) {
  const safe = sanitizeFilename(originalFilename, fallback);
  // ASCII fallback token: any non-printable-ASCII byte becomes "_".
  const asciiOnly = safe.replace(/[^ -~]/g, "_");
  const encoded = encodeURIComponent(safe);
  return `${disposition}; filename="${asciiOnly}"; filename*=UTF-8''${encoded}`;
}

// Applies the standard hardening headers for an authenticated binary file
// response: no MIME sniffing, a sanitized Content-Disposition, and a
// no-store cache directive (these responses are per-user and must never
// be cached by a shared proxy). The caller still sets Content-Type from
// the stored, validated MIME type.
export function setFileResponseHeaders(res, { originalFilename, disposition, fallback }) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", contentDispositionHeader(originalFilename, { disposition, fallback }));
  res.setHeader("Cache-Control", "private, no-store");
}
