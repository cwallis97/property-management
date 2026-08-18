import "dotenv/config";
import express from "express";
import cors from "cors";
import { sequelize } from "./models/index.js";
import propertyRoutes from "./routes/propertyRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import companyRoutes from "./routes/companyRoutes.js";
import { pinRouter, repairRouter, locationRouter, assetRouter, workOrderRouter } from "./routes/detailRoutes.js";
import workOrderNoteRoutes from "./routes/workOrderNoteRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/properties", propertyRoutes);
app.use("/api/pins", pinRouter);
app.use("/api/repairs", repairRouter);
app.use("/api/locations", locationRouter);
app.use("/api/assets", assetRouter);
app.use("/api/work-orders", workOrderRouter);
app.use("/api/work-orders", workOrderNoteRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/companies", companyRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 4000;

async function start() {
  await sequelize.authenticate();
  console.log("Database connection established.");
  app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
