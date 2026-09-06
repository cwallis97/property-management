// SOC 2 Phase 1 — Firebase refresh-token revocation boundary.
//
// The application's OWN, immediate, complete kill switch is
// `users.disabled_at` (enforced in authMiddleware on every request, zero
// added latency). This module is the *belt-and-braces* second layer: on a
// global user disable it asks Firebase to revoke that user's refresh
// tokens, so once their current ID token expires (Firebase ID tokens live
// ~1 hour) they cannot mint a new one either.
//
// Design decisions:
//
//   - We do NOT call verifyIdToken(token, true) on every request. That
//     would add a network round-trip to Google to every single API call
//     (latency, cost, and an availability dependency) to buy something the
//     local disabled_at check already provides instantly.
//
//   - firebase-admin is NOT a repo dependency. It is ~74 MB / 200+
//     transitive packages, adds several moderate advisories, and its
//     current release has a jose-v6 ESM load break. Instead this module
//     dynamically imports `firebase-admin/auth` at call time inside a
//     try/catch. A deployment that wants token revocation runs
//     `npm install firebase-admin` in its environment and provides
//     service-account credentials via env (see server/.env.example and
//     docs/soc2-readiness/access-lifecycle.md). Until then this is a
//     logged no-op and the disabled_at switch stands alone — which is
//     already a complete access cut.
//
//   - No credentials are ever read from a file in the repo. Credentials
//     come from FIREBASE_SERVICE_ACCOUNT_JSON (inline JSON, e.g. from a
//     secret manager) or GOOGLE_APPLICATION_CREDENTIALS (a path the
//     platform provides) or platform-native workload identity.
//
// Test seam: tests import this module and mock `revokeUserSessions`.

let cachedAdminAuth = null;
let initAttempted = false;

function credentialsConfigured() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_ADMIN_ENABLED === "true"
  );
}

async function getAdminAuth() {
  if (cachedAdminAuth) return cachedAdminAuth;
  if (initAttempted) return null;
  initAttempted = true;

  if (!credentialsConfigured()) return null;

  try {
    const { initializeApp, getApps, cert, applicationDefault } = await import("firebase-admin/app");
    const { getAuth } = await import("firebase-admin/auth");

    if (getApps().length === 0) {
      const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      initializeApp({
        credential: inlineJson ? cert(JSON.parse(inlineJson)) : applicationDefault(),
      });
    }
    cachedAdminAuth = getAuth();
    return cachedAdminAuth;
  } catch (err) {
    // Package missing, bad credentials, load error — never throw into the
    // disable flow. The local disabled_at switch has already taken
    // effect; this is the secondary layer.
    console.warn(
      "[sessionRevocation] firebase-admin unavailable — refresh-token revocation skipped. " +
        "The users.disabled_at switch is still the authoritative, immediate access cut. " +
        `(${err.message})`
    );
    return null;
  }
}

// Revoke a user's Firebase refresh tokens. Returns a small result object
// describing what happened (recorded verbatim into the audit event's
// metadata — never a token, never a credential):
//   { revoked: true }                          — Firebase call succeeded
//   { revoked: false, reason: "not_configured" } — no Admin SDK / creds
//   { revoked: false, reason: "error", detail } — call failed (logged)
export async function revokeUserSessions(firebaseUid) {
  if (!firebaseUid) return { revoked: false, reason: "no_uid" };

  const adminAuth = await getAdminAuth();
  if (!adminAuth) return { revoked: false, reason: "not_configured" };

  try {
    await adminAuth.revokeRefreshTokens(firebaseUid);
    return { revoked: true };
  } catch (err) {
    console.error(`[sessionRevocation] revokeRefreshTokens failed for uid ${firebaseUid}: ${err.message}`);
    return { revoked: false, reason: "error", detail: err.message?.slice(0, 200) ?? "unknown" };
  }
}

// Test-only reset of the lazy-init cache.
export function __resetForTests() {
  cachedAdminAuth = null;
  initAttempted = false;
}
