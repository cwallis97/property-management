import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { sequelize, User, Company, Membership } from "../models/index.js";

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;

if (!FIREBASE_PROJECT_ID) {
  throw new Error(
    "FIREBASE_PROJECT_ID is not set. Add it to server/.env (see server/.env.example)."
  );
}

// Verifies Firebase ID tokens directly against Google's published signing
// keys. No service account / Admin SDK credential is required for this —
// only the (public) Firebase project ID.
const client = jwksClient({
  jwksUri:
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  cache: true,
  cacheMaxAge: 60 * 60 * 1000,
  rateLimit: true,
});

function getSigningKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

// Verifies the bearer token and resolves/creates the corresponding User row
// — the one piece of work every authenticated route needs, regardless of
// whether it also needs Company/Membership context. Shared by requireAuth
// and requireFirebaseUser below so the two never verify tokens two
// different ways; they only differ in what happens AFTER the User is
// resolved. Resolves the User, or throws an Error with `.status` set for
// the caller to turn into a response.
function verifyFirebaseUser(req) {
  return new Promise((resolve, reject) => {
    const authHeader = req.headers.authorization || "";
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      const err = new Error("Missing or malformed Authorization header.");
      err.status = 401;
      return reject(err);
    }

    jwt.verify(
      token,
      getSigningKey,
      {
        algorithms: ["RS256"],
        issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
        audience: FIREBASE_PROJECT_ID,
      },
      async (err, decoded) => {
        if (err || !decoded?.sub) {
          const authErr = new Error("Invalid or expired token.");
          authErr.status = 401;
          return reject(authErr);
        }

        try {
          const [user] = await User.findOrCreate({
            where: { firebaseUid: decoded.sub },
            defaults: {
              email: decoded.email ?? "",
              displayName: decoded.name ?? null,
            },
          });

          // Global account kill switch (SOC 2 Phase 1). Fail closed
          // BEFORE any email sync or Company/Membership work — a globally
          // disabled person has no access to anything, including
          // accepting an invitation. The distinct `code` lets the client
          // tell "your access was revoked" apart from "your session
          // expired" and sign the user out with a clear message.
          if (user.disabledAt != null) {
            const disabledErr = new Error("Your access has been disabled. Contact your administrator.");
            disabledErr.status = 403;
            disabledErr.code = "ACCESS_DISABLED";
            return reject(disabledErr);
          }

          if (decoded.email && user.email !== decoded.email) {
            user.email = decoded.email;
            await user.save();
          }

          resolve(user);
        } catch (dbErr) {
          reject(dbErr);
        }
      }
    );
  });
}

// The standard gate for every normal authenticated route — resolves the
// User (see verifyFirebaseUser above), then loads their Memberships,
// auto-provisioning a brand-new Company the first time someone with zero
// Memberships is ever seen. Behavior here is unchanged from before this
// file was refactored to share verifyFirebaseUser with requireFirebaseUser.
export function requireAuth(req, res, next) {
  verifyFirebaseUser(req)
    .then(async (user) => {
      // Only ACTIVE Memberships (SOC 2 Phase 1) — a Membership with
      // disabled_at set grants nothing and must never appear in
      // req.memberships. This one filter is the canonical enforcement
      // point: capability resolution, Property Access, search scope,
      // reports, documents, and actor resolution all read req.memberships,
      // so none of them need their own disabled check.
      let memberships = await Membership.findAll({
        where: { userId: user.id, disabledAt: null },
        include: { model: Company, as: "company" },
      });

      // Auto-provision a first Company ONLY for a genuinely new person who
      // has never had any Membership. A user whose every Membership is
      // disabled has zero ACTIVE ones but must NOT be handed a fresh
      // throwaway Company on their next login — their access to the
      // Company they belonged to was revoked, so fail closed with the
      // same ACCESS_DISABLED signal a globally disabled user gets.
      if (memberships.length === 0) {
        const everHadMembership = await Membership.count({ where: { userId: user.id } });
        if (everHadMembership > 0) {
          return res.status(403).json({
            error: "Your access has been disabled. Contact your administrator.",
            code: "ACCESS_DISABLED",
          });
        }
        memberships = await sequelize.transaction(async (t) => {
          const company = await Company.create(
            { name: `${user.displayName || user.email}'s Company` },
            { transaction: t }
          );
          const membership = await Membership.create(
            { userId: user.id, companyId: company.id, role: "owner" },
            { transaction: t }
          );
          membership.company = company;
          return [membership];
        });
      }

      req.user = user;
      req.memberships = memberships;
      req.companyIds = memberships.map((m) => m.companyId);
      next();
    })
    .catch((err) => {
      if (err.status) {
        const body = { error: err.message };
        if (err.code) body.code = err.code;
        return res.status(err.status).json(body);
      }
      next(err);
    });
}

// A deliberately narrower gate: resolves and attaches req.user only, with
// no Membership loading and — critically — no Company auto-provisioning.
// Exists for exactly one case: an invitee accepting an invitation. That
// visitor may have zero Memberships at the moment they authenticate, and
// requireAuth's normal behavior would auto-provision them a throwaway
// Company before invite-acceptance ever got a chance to add them to the
// COMPANY THEY WERE ACTUALLY INVITED TO. Using this instead of requireAuth
// for that one route means acceptInvite is entirely responsible for
// creating the Membership itself — nothing here creates one.
export function requireFirebaseUser(req, res, next) {
  verifyFirebaseUser(req)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch((err) => {
      if (err.status) {
        const body = { error: err.message };
        if (err.code) body.code = err.code;
        return res.status(err.status).json(body);
      }
      next(err);
    });
}
