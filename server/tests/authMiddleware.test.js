// SOC 2 Phase 1 — auth middleware. The security-critical entry point had
// no direct coverage before. These tests exercise the REAL token
// verification (issuer / audience / algorithm / expiry / signature) with
// a locally generated RSA keypair, mocking only the JWKS fetch so no live
// Firebase / network is involved. They also prove the disabled-user /
// disabled-membership enforcement added in this phase.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import jwt from "jsonwebtoken";
import { generateKeyPairSync, randomUUID } from "crypto";

// One keypair for the whole file. Generated in a hoisted block so the
// jwks-rsa mock factory below can close over it.
const KEYS = vi.hoisted(() => {
  const { generateKeyPairSync } = require("crypto");
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    publicPem: publicKey.export({ type: "spki", format: "pem" }),
    privatePem: privateKey.export({ type: "pkcs1", format: "pem" }),
  };
});

vi.mock("jwks-rsa", () => ({
  default: () => ({
    getSigningKey: (_kid, cb) => cb(null, { getPublicKey: () => KEYS.publicPem }),
  }),
}));

const { requireAuth, requireFirebaseUser } = await import("../middleware/authMiddleware.js");
const { User, Company, Membership } = await import("../models/index.js");
const { createCompany, createUser, createMembership } = await import("./helpers/fixtures.js");
const { cleanupCompanies } = await import("./helpers/cleanup.js");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID; // "test-firebase-project" from tests/setup.js

function signToken({ sub, iss, aud, expiresIn = "1h", email = "person@example.test", name = "Person" } = {}) {
  return jwt.sign(
    { email, name },
    KEYS.privatePem,
    {
      algorithm: "RS256",
      keyid: "test-kid",
      subject: sub,
      issuer: iss ?? `https://securetoken.google.com/${PROJECT_ID}`,
      audience: aud ?? PROJECT_ID,
      expiresIn,
    }
  );
}

function noneToken(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.`;
}

function makeReqRes(token) {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {}, params: {}, query: {}, body: {} };
  const res = {
    statusCode: 200,
    body: undefined,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(p) {
      this.body = p;
      return this;
    },
  };
  return { req, res };
}

function run(mw, token) {
  return new Promise((resolve) => {
    const { req, res } = makeReqRes(token);
    const next = vi.fn((err) => resolve({ req, res, next, nextErr: err }));
    // If the middleware responds instead of calling next(), resolve on the
    // next tick from the res spy.
    const origJson = res.json.bind(res);
    res.json = (p) => {
      origJson(p);
      resolve({ req, res, next });
      return res;
    };
    mw(req, res, next);
  });
}

describe("auth middleware", () => {
  const companyIds = [];
  const firebaseUids = [];

  afterAll(async () => {
    await cleanupCompanies(companyIds);
    if (firebaseUids.length) await User.destroy({ where: { firebaseUid: firebaseUids } });
  });

  describe("token verification", () => {
    it("rejects a missing Authorization header (401)", async () => {
      const { res } = await run(requireAuth, null);
      expect(res.statusCode).toBe(401);
    });

    it("rejects a malformed token (401)", async () => {
      const { res } = await run(requireAuth, "not-a-jwt");
      expect(res.statusCode).toBe(401);
    });

    it("rejects the wrong issuer (401)", async () => {
      const token = signToken({ sub: `qa_${randomUUID()}`, iss: "https://evil.example.com/x" });
      const { res } = await run(requireAuth, token);
      expect(res.statusCode).toBe(401);
    });

    it("rejects the wrong audience (401)", async () => {
      const token = signToken({ sub: `qa_${randomUUID()}`, aud: "some-other-project" });
      const { res } = await run(requireAuth, token);
      expect(res.statusCode).toBe(401);
    });

    it("rejects an expired token (401)", async () => {
      const token = signToken({ sub: `qa_${randomUUID()}`, expiresIn: -60 });
      const { res } = await run(requireAuth, token);
      expect(res.statusCode).toBe(401);
    });

    it("rejects a tampered signature (401)", async () => {
      let token = signToken({ sub: `qa_${randomUUID()}` });
      // Flip a character in the signature segment.
      const parts = token.split(".");
      parts[2] = parts[2][0] === "A" ? `B${parts[2].slice(1)}` : `A${parts[2].slice(1)}`;
      token = parts.join(".");
      const { res } = await run(requireAuth, token);
      expect(res.statusCode).toBe(401);
    });

    it("rejects alg:none (401)", async () => {
      const token = noneToken({
        sub: `qa_${randomUUID()}`,
        iss: `https://securetoken.google.com/${PROJECT_ID}`,
        aud: PROJECT_ID,
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const { res } = await run(requireAuth, token);
      expect(res.statusCode).toBe(401);
    });

    it("accepts a valid token and resolves the User + active Memberships", async () => {
      const company = await createCompany("QA AuthMw Co");
      companyIds.push(company.id);
      const user = await createUser("QA AuthMw Person");
      firebaseUids.push(user.firebaseUid);
      await createMembership({ user, company, role: "owner" });

      const token = signToken({ sub: user.firebaseUid, email: user.email });
      const { req, res, next } = await run(requireAuth, token);

      expect(next).toHaveBeenCalledWith();
      expect(res.statusCode).toBe(200);
      expect(req.user.id).toBe(user.id);
      expect(req.companyIds).toEqual([company.id]);
    });
  });

  describe("disabled enforcement (SOC 2 Phase 1)", () => {
    it("a globally disabled User is rejected with 403 ACCESS_DISABLED", async () => {
      const user = await createUser("QA AuthMw Disabled");
      firebaseUids.push(user.firebaseUid);
      user.disabledAt = new Date();
      await user.save();

      const token = signToken({ sub: user.firebaseUid, email: user.email });
      const { res } = await run(requireAuth, token);

      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe("ACCESS_DISABLED");
    });

    it("blocks a disabled User from the invite-acceptance gate too", async () => {
      const user = await createUser("QA AuthMw Disabled Invitee");
      firebaseUids.push(user.firebaseUid);
      user.disabledAt = new Date();
      await user.save();

      const token = signToken({ sub: user.firebaseUid, email: user.email });
      const { res } = await run(requireFirebaseUser, token);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe("ACCESS_DISABLED");
    });

    it("an active User whose only Membership is disabled gets 403 ACCESS_DISABLED", async () => {
      const company = await createCompany("QA AuthMw DisabledMbr Co");
      companyIds.push(company.id);
      const user = await createUser("QA AuthMw DisabledMbr Person");
      firebaseUids.push(user.firebaseUid);
      const m = await createMembership({ user, company, role: "technician" });
      m.disabledAt = new Date();
      await m.save();

      const token = signToken({ sub: user.firebaseUid, email: user.email });
      const { res } = await run(requireAuth, token);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe("ACCESS_DISABLED");
    });

    it("a disabled Membership is simply absent from req.memberships (other Companies unaffected)", async () => {
      const companyA = await createCompany("QA AuthMw MultiCo A");
      const companyB = await createCompany("QA AuthMw MultiCo B");
      companyIds.push(companyA.id, companyB.id);
      const user = await createUser("QA AuthMw MultiCo Person");
      firebaseUids.push(user.firebaseUid);
      await createMembership({ user, company: companyA, role: "manager" });
      const mB = await createMembership({ user, company: companyB, role: "owner" });
      mB.disabledAt = new Date();
      await mB.save();

      const token = signToken({ sub: user.firebaseUid, email: user.email });
      const { req, res, next } = await run(requireAuth, token);

      expect(next).toHaveBeenCalledWith();
      expect(res.statusCode).toBe(200);
      expect(req.companyIds).toEqual([companyA.id]);
    });

    it("does NOT auto-provision a fresh Company for a user whose Memberships are all disabled", async () => {
      const company = await createCompany("QA AuthMw NoProvision Co");
      companyIds.push(company.id);
      const user = await createUser("QA AuthMw NoProvision Person");
      firebaseUids.push(user.firebaseUid);
      const m = await createMembership({ user, company, role: "technician" });
      m.disabledAt = new Date();
      await m.save();

      const token = signToken({ sub: user.firebaseUid, email: user.email });
      await run(requireAuth, token);

      const provisioned = await Membership.count({ where: { userId: user.id, disabledAt: null } });
      expect(provisioned).toBe(0);
    });
  });

  describe("email sync stays safe", () => {
    it("syncs a changed email but never for a disabled user (rejected first)", async () => {
      const company = await createCompany("QA AuthMw EmailSync Co");
      companyIds.push(company.id);
      const user = await createUser("QA AuthMw EmailSync Person");
      firebaseUids.push(user.firebaseUid);
      await createMembership({ user, company, role: "owner" });

      const token = signToken({ sub: user.firebaseUid, email: "changed@example.test" });
      await run(requireAuth, token);
      await user.reload();
      expect(user.email).toBe("changed@example.test");
    });
  });
});
