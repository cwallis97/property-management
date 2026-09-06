import express from "express";
import cors from "cors";
import helmet from "helmet";

import propertyRoutes from "./routes/propertyRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import companyRoutes from "./routes/companyRoutes.js";
import membershipRoutes from "./routes/membershipRoutes.js";
import { pinRouter, repairRouter, locationRouter, assetRouter, workOrderRouter } from "./routes/detailRoutes.js";
import workOrderNoteRoutes from "./routes/workOrderNoteRoutes.js";
import workOrderCostRoutes from "./routes/workOrderCostRoutes.js";
import workTypeRoutes from "./routes/workTypeRoutes.js";
import vendorRoutes from "./routes/vendorRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import inviteRoutes from "./routes/inviteRoutes.js";
import auditEventRoutes from "./routes/auditEventRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";

import { errorHandler } from "./middleware/errorHandler.js";
import { healthHandler } from "./middleware/health.js";
import { buildRateLimiters } from "./middleware/rateLimiters.js";
import { resolveCorsOptions, jsonBodyLimit, helmetOptions, trustProxySetting } from "./config/security.js";

// Builds a fully-wired Express app. Configuration (CORS allowlist, body
// limits, rate-limit budgets, HSTS) is read from the environment HERE,
// at construction time, not at module load — so the test suite can spin
// up several apps with different env in one process. In production a
// missing CORS_ORIGIN makes resolveCorsOptions() throw, which propagates
// out of this function and aborts startup before the server ever listens
// (fail-closed).
export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  const trustProxy = trustProxySetting();
  if (trustProxy !== false) app.set("trust proxy", trustProxy);

  // Security headers first, before anything can respond. See
  // config/security.js#helmetOptions for why CSP / cross-origin policies
  // are deliberately off for this JSON+file API.
  app.use(helmet(helmetOptions()));

  app.use(cors(resolveCorsOptions()));

  const limit = jsonBodyLimit();
  app.use(express.json({ limit }));
  app.use(express.urlencoded({ extended: false, limit }));

  // Health check is defined before the global limiter and explicitly
  // skipped by it (see rateLimiters.js) so an uptime monitor is never
  // throttled.
  app.get("/api/health", healthHandler);

  const { globalLimiter, strictLimiter } = buildRateLimiters();
  app.use(globalLimiter);

  app.use("/api/properties", propertyRoutes);
  app.use("/api/pins", pinRouter);
  app.use("/api/repairs", repairRouter);
  app.use("/api/locations", locationRouter);
  app.use("/api/assets", assetRouter);
  app.use("/api/work-orders", workOrderRouter);
  app.use("/api/work-orders", workOrderNoteRoutes);
  app.use("/api/work-orders", workOrderCostRoutes);
  app.use("/api/work-types", workTypeRoutes);
  app.use("/api/vendors", vendorRoutes);
  app.use("/api/documents", documentRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/companies", companyRoutes);
  app.use("/api/members", membershipRoutes);
  // Stricter budget for the abuse-prone surfaces: expensive search
  // queries and invitation create / preview / accept.
  app.use("/api/invites", strictLimiter, inviteRoutes);
  app.use("/api/audit-events", auditEventRoutes);
  app.use("/api/search", strictLimiter, searchRoutes);
  app.use("/api/notifications", notificationRoutes);

  app.use(errorHandler);

  return app;
}
