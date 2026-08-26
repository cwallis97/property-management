export function getCurrentUser(req, res) {
  res.json({
    ...req.user.toJSON(),
    companies: req.memberships.map((m) => ({
      id: m.company.id,
      name: m.company.name,
      role: m.role,
      // The caller's own Membership id for this Company — self-referential
      // (never another member's), same trust level as exposing the User's
      // own id already is. Needed so the frontend can know "which
      // assignee row is me" for My Work without a separate lookup.
      membershipId: m.id,
    })),
  });
}

// Deliberately scoped to req.user only — there is no id param, and none is
// accepted, because this can only ever operate on the caller's own row.
// No capability check either: every member, regardless of role, may edit
// their own display name. displayName is write-once from Firebase at
// account creation (see verifyFirebaseUser) and never re-synced from the
// token afterward, so a change made here is never silently overwritten by
// a later login — unlike `email`, which requireAuth does keep in sync with
// the Firebase token on every request.
export async function updateCurrentUser(req, res) {
  const { displayName } = req.body;
  if (displayName !== undefined) {
    if (displayName !== null && typeof displayName !== "string") {
      return res.status(400).json({ error: "displayName must be a string or null." });
    }
    req.user.displayName = displayName?.trim() || null;
  }

  await req.user.save();

  res.json({
    ...req.user.toJSON(),
    companies: req.memberships.map((m) => ({
      id: m.company.id,
      name: m.company.name,
      role: m.role,
      // The caller's own Membership id for this Company — self-referential
      // (never another member's), same trust level as exposing the User's
      // own id already is. Needed so the frontend can know "which
      // assignee row is me" for My Work without a separate lookup.
      membershipId: m.id,
    })),
  });
}
