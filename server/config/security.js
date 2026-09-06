// Phase 0 SOC 2 hardening — all API security configuration read from the
// environment, resolved at app-construction time (not module load) so the
// test suite can build several apps with different env without a process
// restart. Nothing here has a hardcoded secret or certificate.

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseIntEnv(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ── CORS ──────────────────────────────────────────────────────────────
// Fail-closed in production: an explicit CORS_ORIGIN allowlist is
// mandatory. If it is missing, createApp() throws before the server ever
// starts listening — a misconfigured deploy must fail loudly, never
// silently accept every origin. In development / test the previous
// permissive behavior is kept for local convenience.
export function resolveCorsOptions() {
  const origins = parseList(process.env.CORS_ORIGIN);

  if (isProduction()) {
    if (origins.length === 0) {
      throw new Error(
        "CORS_ORIGIN is not set. In production the API refuses to start without an explicit " +
          "comma-separated origin allowlist (e.g. CORS_ORIGIN=https://app.example.com). " +
          "It will never fall back to allowing all origins."
      );
    }
    return { origin: origins, credentials: false, maxAge: 600 };
  }

  // Dev / test: use the allowlist if one was provided, otherwise reflect
  // the request origin so a local SPA on any port just works.
  if (origins.length > 0) return { origin: origins, credentials: false };
  return { origin: true, credentials: false };
}

// ── Body size limits ──────────────────────────────────────────────────
// Applies only to parsed request bodies (JSON / urlencoded). Multipart
// file uploads are handled by multer with its own 15 MB per-file cap and
// never pass through these parsers.
export function jsonBodyLimit() {
  return process.env.JSON_BODY_LIMIT || "1mb";
}

// ── Rate limiting ─────────────────────────────────────────────────────
// IP-based, in-memory (single-process). If the API is ever run as more
// than one instance behind a load balancer, this must move to a shared
// store (e.g. a Redis-backed store) so the limit is enforced across
// instances — until then each instance counts independently.
export function rateLimitConfig() {
  return {
    windowMs: parseIntEnv(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    // Generous ceiling for an interactive SPA (dashboards, search-as-you-
    // type, polling the unread-count endpoint every 60s). Ordinary use
    // comes nowhere near this; it exists to blunt scripted abuse.
    globalMax: parseIntEnv(process.env.RATE_LIMIT_GLOBAL_MAX, 1000),
    // Tighter budget for the abuse-prone surfaces: search (expensive
    // trigram queries) and the invitation endpoints (token guessing /
    // invite spam). Still well above any legitimate interactive rate.
    strictMax: parseIntEnv(process.env.RATE_LIMIT_STRICT_MAX, 100),
  };
}

// ── trust proxy ───────────────────────────────────────────────────────
// Only trust X-Forwarded-* when TRUST_PROXY is explicitly configured
// (e.g. TRUST_PROXY=1 for a single proxy hop on a PaaS). Left unset, the
// socket address is used directly — correct for local development and the
// safe default, since a permissive trust-proxy setting lets a client
// spoof its IP and evade the rate limiter.
export function trustProxySetting() {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === "") return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : raw; // number of hops, or a named preset like "loopback"
}

// ── Helmet ────────────────────────────────────────────────────────────
// This is a JSON API plus a handful of same-origin authenticated binary
// file responses (Documents, Site Plans). A Content-Security-Policy has
// nothing to constrain on a JSON body, and the frontend — a separate
// origin served by its own host — is where a page CSP belongs, so it is
// deliberately disabled here (see client/vercel.json for the browser-
// facing headers). Cross-Origin-Opener / -Resource / -Embedder policies
// are also disabled: the API is intentionally consumed cross-origin by
// the SPA and the CORS allowlist above is the real boundary. Everything
// else Helmet sets by default is kept — most importantly
// X-Content-Type-Options: nosniff, X-Frame-Options: DENY, and
// Referrer-Policy — plus HSTS, but only in production (it is meaningless
// and potentially confusing over plain-HTTP local development).
export function helmetOptions() {
  return {
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    frameguard: { action: "deny" }, // X-Frame-Options: DENY — nothing frames an API
    referrerPolicy: { policy: "no-referrer" },
    hsts: isProduction()
      ? { maxAge: 15552000, includeSubDomains: true, preload: false }
      : false,
  };
}

// ── Database TLS ──────────────────────────────────────────────────────
// Returns the `dialectOptions` object for Sequelize. When DB_SSL=true the
// connection is encrypted AND the server certificate is verified by
// default (DB_SSL_REJECT_UNAUTHORIZED must be explicitly set to "false"
// to opt out, e.g. for a managed provider that only presents a
// self-signed intermediate and does not publish a CA bundle). A
// provider CA bundle can be supplied verbatim via DB_SSL_CA (PEM
// contents, not a path) — never hardcoded here. DB_SSL unset / "false"
// (the local-development default) produces no SSL options at all.
export function databaseDialectOptions() {
  if (process.env.DB_SSL !== "true") return {};

  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false";
  const ssl = { require: true, rejectUnauthorized };

  const ca = process.env.DB_SSL_CA;
  if (ca && ca.trim()) ssl.ca = ca;

  return { ssl };
}
