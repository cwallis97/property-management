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

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or malformed Authorization header." });
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
        return res.status(401).json({ error: "Invalid or expired token." });
      }

      try {
        const [user] = await User.findOrCreate({
          where: { firebaseUid: decoded.sub },
          defaults: {
            email: decoded.email ?? "",
            displayName: decoded.name ?? null,
          },
        });

        if (decoded.email && user.email !== decoded.email) {
          user.email = decoded.email;
          await user.save();
        }

        let memberships = await Membership.findAll({
          where: { userId: user.id },
          include: { model: Company, as: "company" },
        });

        if (memberships.length === 0) {
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
      } catch (dbErr) {
        next(dbErr);
      }
    }
  );
}
