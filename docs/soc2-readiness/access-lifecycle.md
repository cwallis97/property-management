# Access Lifecycle & Deprovisioning

SOC 2 Readiness — Phase 1. This document is control evidence, not a
statement of compliance, and has not been reviewed by an auditor.

---

## Purpose

PropertyOS must be able to revoke a person's access **without deleting the
historical business records** that person created or was assigned. Before
Phase 1 there was no such mechanism: no user-disable flag, no way to
remove a member from a company, and (without the Firebase Admin SDK) no
way to revoke a session. A departed employee kept access until their ID
token expired (~1 hour) and their Membership was never removed.

## Control statement

> Authorized administrators (Owner / Admin) can immediately revoke a
> person's access to a company, or an authorized administrator can revoke
> a person's access to PropertyOS entirely. Revocation is enforced
> server-side on every request, is fully audited (actor, target, before /
> after state, timestamp, optional reason), preserves the person's
> configuration for a clean re-enable, never deletes historical records,
> and can never leave a company without an active owner.

## Two levels of disable

| Switch | Column | Meaning | Enforced by |
| --- | --- | --- | --- |
| **Membership disable** | `memberships.disabled_at` | Revokes access to **one company**. Other companies the person belongs to are unaffected. | `requireAuth` loads only `disabled_at IS NULL` Memberships, so a disabled Membership is absent from `req.memberships` and grants nothing downstream. |
| **Global user disable** | `users.disabled_at` | Revokes access to **PropertyOS entirely**, every company. | `authMiddleware.verifyFirebaseUser` returns `403 { code: "ACCESS_DISABLED" }` on every authenticated request, including invitation acceptance. |

Both are nullable timestamps. No `disabled_by` / `disable_reason` columns —
the actor and the optional reason are recorded on the `AuditEvent` row for
each transition (`docs/../server/models/AuditEvent.js`).

## What a disabled Membership grants: nothing

Because a disabled Membership never appears in `req.memberships`, every
downstream authorization surface denies automatically — there is **one
canonical enforcement point**, not a scattered `disabled_at IS NULL`
check:

- role / capability resolution (`authorization/capabilities.js`)
- Property Access (`authorization/propertyAccess.js`)
- global search scope (`authorization/searchScope.js`)
- Reports scope (`controllers/reportController.js`)
- Document scope (`authorization/documentAccess.js`)
- audit-log read, notification-inbox access, every create / update route

Queries about **other** people's Memberships are filtered explicitly, via
the shared helper `authorization/activeMembership.js`:

- **assignment eligibility** — `getAssignableMembers` and
  `resolveAssignedMembershipId` exclude disabled Memberships / disabled
  users; a disabled person cannot be assigned new work.
- **notification recipients** — `resolveUrgentWorkOrderRecipients` and a
  central filter in `notificationService.createNotifications` drop
  disabled recipients regardless of how the caller resolved them.
- **member list** — `listCompanyMembers` still returns disabled members
  (with a `status` field) so an admin can re-enable them.

Historical / current display is deliberately **not** filtered: a Work
Order still shows the name of a now-disabled assignee, so the record stays
readable.

## Who can disable / re-enable

| Action | Endpoint | Capability | Extra rules |
| --- | --- | --- | --- |
| Disable / re-enable a Membership | `PATCH /api/members/:id/status` | `USERS_MANAGE` (Owner / Admin) | Cannot disable the owner Membership. Cannot disable your own. Cannot leave the company with zero active owners. |
| Disable / re-enable a User globally | `PATCH /api/users/:id/status` | `USERS_MANAGE` in a company shared with the target | Target must not be the owner of any company. Cannot disable yourself. |

Managers and Technicians hold no `USERS_MANAGE` capability and cannot
reach either endpoint. The Membership action is exposed in the Users &
Roles settings page; the global User action is a backend control only in
Phase 1.

## Last-owner protection

- The **owner Membership can never be disabled** (`membership.role ===
  "owner"` → 400), mirroring the existing "owner role is immutable" rule.
- A **User who owns any company cannot be globally disabled** (400) —
  disabling them would orphan that company.
- A defensive `activeOwnerCount()` check additionally refuses any disable
  that would drop a company to zero active owners (future-proofing for a
  multi-owner model; today there is exactly one owner per company).
- Self-disable is refused for both actions.

## Reactivation — explicit state layering

- **Membership disable preserves** `role`, `access_mode`, and every
  `PropertyAccess` row. Nothing is cleared. Re-enable (`status: "active"`)
  restores exactly that configuration.
- **User re-enable clears only `users.disabled_at`.** It does **not**
  touch any Membership's `disabled_at`. A Membership that was separately
  disabled stays disabled until re-enabled on its own.
- Accepting an invitation **never** silently re-enables a disabled
  Membership — `acceptInvite` returns `403 ACCESS_DISABLED` and leaves the
  invite pending. Re-enabling is always an explicit administrative action.

## Firebase session revocation

The application's own immediate, complete kill switch is `users.disabled_at`,
enforced on every request with zero added latency.

`server/services/sessionRevocation.js` is the **secondary** layer: on a
global user disable it asks Firebase to revoke that user's refresh tokens
(`getAuth().revokeRefreshTokens(uid)`), so once their current ID token
expires (~1 hour) they cannot mint a new one.

Design choices:

- **`verifyIdToken(token, true)` is NOT called per request.** That would
  add a Google round-trip to every API call. The local `disabled_at`
  check already gives instant revocation.
- **`firebase-admin` is not a repo dependency** (≈74 MB / 200+ transitive
  packages / several moderate advisories / a current jose-v6 ESM load
  break). `sessionRevocation.js` dynamically imports `firebase-admin/auth`
  inside a `try/catch`: if the package **and** credentials are present it
  calls Firebase; otherwise it logs a structured warning and returns
  `{ revoked: false, reason: "not_configured" }`. Either way the outcome
  is recorded in the `refresh_tokens.revoked` audit event.
- **No credentials are read from a file in the repo.** See
  "External configuration required" below.

## Audit evidence

Every transition writes an `AuditEvent` (atomic, in the same transaction
as the state change), with `actor`, `entityType` + `entityId`,
`entityLabel` (point-in-time name), `before` / `after` `{ disabled }`, and
`metadata.reason`:

| Action | When |
| --- | --- |
| `membership.disabled` / `membership.enabled` | Company-level access revoked / restored |
| `user.disabled` / `user.enabled` | Global account revoked / restored |
| `refresh_tokens.revoked` | After a global disable — `metadata.result` records whether the Firebase call landed (never a token) |
| `membership.created` | A new member joined via invitation acceptance (actor = the new member) |

No secrets, tokens, or credentials are ever stored in an audit row.

## Client behaviour on revocation

When any API request returns `403 { code: "ACCESS_DISABLED" }` the API
client (`client/src/utils/api.js`) signs the Firebase session out and
navigates to `/login?reason=disabled`, which shows
"Your access has been disabled. Contact your administrator." — distinct
from an ordinary expired session (which returns to a normal login). The
navigation is a full-page load, so there is no redirect loop, and the
login page makes no authenticated calls.

## Assignment behaviour

Disabling a person **does not rewrite Work Orders.** Existing assignments
to a now-disabled Membership are left intact for the record. The disable
response and the member list both return `openAssignedWorkOrderCount` so
an admin can see what is still assigned and reassign it separately if they
choose. Deactivation is never blocked because assignments exist.

## Tests that prove the control

| File | Proves |
| --- | --- |
| `server/tests/authMiddleware.test.js` | Real RS256 verification (issuer / audience / algorithm / expiry / signature / `alg:none`); disabled User → 403; all-Memberships-disabled → 403; disabled Membership absent from `req.memberships`; no auto-provision for a disabled user; email sync safe. |
| `server/tests/offboarding.test.js` | Membership disable + audit + config preservation; assignment eligibility & rejection; role/access edits refused while disabled; notification exclusion; urgent-recipient exclusion; re-enable restores config; Technician cannot disable; idempotency; owner cannot be disabled; self cannot be disabled; owner cannot be globally disabled; global disable audits + revokes; re-enable layering (user vs membership); multi-company isolation; invite refusals. |

Run: `cd server && npm test` (also `npm run test:security`).

## Operational procedure — offboarding

1. In **Settings → Users & Roles**, find the person.
2. Click **Disable access**, enter a reason (e.g. "Employee left the
   company"), confirm. Access is revoked on their next request.
3. If the confirmation shows open assignments, decide whether to reassign
   them (not required).
4. For a full account shutdown across every company, an administrator runs
   `PATCH /api/users/:id/status` `{ "status": "disabled", "reason": "..." }`
   (backend control in Phase 1).
5. Verify the `membership.disabled` (and, for a global disable,
   `user.disabled` + `refresh_tokens.revoked`) entries in
   **Settings → Audit Log**.
6. To reinstate: **Re-enable access** (Membership) restores the prior role
   and property access; re-enabling a global account does **not**
   re-enable Memberships that were separately disabled.

## External configuration required (not in the repo)

To enable Firebase refresh-token revocation on global disable, the
deployment must:

1. `npm install firebase-admin` in the server environment (it is
   deliberately not a committed dependency).
2. Provide service-account credentials via **one** of:
   - `FIREBASE_SERVICE_ACCOUNT_JSON` — the service-account JSON as an
     inline string, from a secret manager (preferred);
   - `GOOGLE_APPLICATION_CREDENTIALS` — a path the platform mounts;
   - platform-native workload identity (`applicationDefault()`), with
     `FIREBASE_ADMIN_ENABLED=true` to opt in.
3. In the **Firebase console**: create the service account with the
   *Firebase Authentication Admin* role (or the minimal
   `firebaseauth.users.update` permission), and restrict its key.

Until this is configured, `refresh_tokens.revoked` audit events record
`{ revoked: false, reason: "not_configured" }` and the `users.disabled_at`
switch stands alone — which is already a complete, immediate access cut.

## Known Phase 1 gaps

- Global User disable has no UI (backend control only).
- No bulk offboarding.
- No scheduled / time-boxed access (e.g. contractor access expiring on a
  date) — a future Production Jobs milestone.
- `refresh_tokens.revoked` depends on the external Firebase Admin setup
  above; without it the belt-and-braces layer is a logged no-op.
- Reassignment of a disabled person's open Work Orders is manual.
