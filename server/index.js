import "dotenv/config";
import express from "express";
import cors from "cors";
import { sequelize } from "./models/index.js";
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
import { errorHandler } from "./middleware/errorHandler.js";
import { ensureUploadDir as ensureSitePlanUploadDir } from "./utils/sitePlanStorage.js";
import { ensureUploadDir as ensureDocumentUploadDir } from "./utils/documentStorage.js";

const app = express();
// CORS_ORIGIN: comma-separated allowlist (e.g. Vercel staging URL). Falls
// back to permissive for local dev if unset.
const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : {}));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

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
app.use("/api/invites", inviteRoutes);
app.use("/api/audit-events", auditEventRoutes);
app.use("/api/search", searchRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 4000;

async function start() {
  await sequelize.authenticate();
  console.log("Database connection established.");
  await ensureSitePlanUploadDir();
  await ensureDocumentUploadDir();
  app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
