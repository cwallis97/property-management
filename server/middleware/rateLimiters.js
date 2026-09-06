import rateLimit from "express-rate-limit";
import { rateLimitConfig } from "../config/security.js";

// Two IP-based limiters (see config/security.js#rateLimitConfig for the
// numbers and the single-process caveat).
//
//  - globalLimiter: a high ceiling across the whole API, skipping only
//    /api/health so an uptime monitor polling it can never be throttled.
//  - strictLimiter: a tighter budget for the abuse-prone surfaces
//    (Global Search, invitations), mounted on those routers specifically.
//
// Both return the standard `RateLimit-*` headers (draft-7) and a plain
// JSON 429 body consistent with the rest of the API's error shape.

const JSON_429 = { error: "Too many requests. Please slow down and try again shortly." };

export function buildRateLimiters() {
  const { windowMs, globalMax, strictMax } = rateLimitConfig();

  const common = {
    windowMs,
    // draft-6: separate RateLimit-Limit / -Remaining / -Reset headers —
    // the most widely understood form for clients and for debugging.
    standardHeaders: "draft-6",
    legacyHeaders: false,
    message: JSON_429,
  };

  const globalLimiter = rateLimit({
    ...common,
    limit: globalMax,
    skip: (req) => req.path === "/api/health",
  });

  const strictLimiter = rateLimit({
    ...common,
    limit: strictMax,
  });

  return { globalLimiter, strictLimiter };
}
