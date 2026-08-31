// Builds the exact req shape requireAuth (server/middleware/authMiddleware.js)
// attaches to a real request AFTER Firebase token verification — these
// tests deliberately start "after authentication," proving application
// authorization (Property Access, capabilities, Work Order Assignment,
// Audit) against real controllers and a real database, without depending
// on live Firebase or JWKS. If auth middleware itself ever needs direct
// coverage, that belongs in its own narrow suite with mocked JWKS
// responses — not folded into these.
export function reqFor(user, memberships, extra = {}) {
  return {
    user,
    memberships,
    companyIds: memberships.map((m) => m.companyId),
    params: {},
    query: {},
    body: {},
    ...extra,
  };
}

// Minimal Express Response stand-in — just enough surface for every
// controller in this app (status/json/send), nothing more.
export function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}
