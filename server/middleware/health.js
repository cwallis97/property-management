import { sequelize } from "../models/index.js";

// GET /api/health — liveness + database reachability.
//
// Runs the cheapest possible round-trip (`SELECT 1`) so an orchestrator /
// uptime monitor gets a true "can this instance actually serve requests"
// answer, not just "the process is up." Never touches application tables
// and never runs a schema query. On failure it returns 503 with a
// generic body — no driver message, connection string, or stack trace.
// This endpoint is deliberately excluded from the rate limiter.
export async function healthHandler(_req, res) {
  try {
    await sequelize.query("SELECT 1");
    return res.json({ ok: true, database: "ok" });
  } catch {
    return res.status(503).json({ ok: false, database: "unavailable" });
  }
}
