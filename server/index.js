import "dotenv/config";
import { sequelize } from "./models/index.js";
import { createApp } from "./app.js";
import { createShutdownHandler } from "./shutdown.js";
import { ensureUploadDir as ensureSitePlanUploadDir } from "./utils/sitePlanStorage.js";
import { ensureUploadDir as ensureDocumentUploadDir } from "./utils/documentStorage.js";

const PORT = process.env.PORT || 4000;

async function start() {
  await sequelize.authenticate();
  console.log("Database connection established.");
  await ensureSitePlanUploadDir();
  await ensureDocumentUploadDir();

  const app = createApp();
  const server = app.listen(PORT, () => console.log(`API listening on port ${PORT}`));

  const shutdown = createShutdownHandler({ server, sequelize });
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
