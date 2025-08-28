import express from "express";
import cors from "cors";
const app = express();
app.use(cors());
app.use(express.json());
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/lots", (_req, res) => {
  res.json([
    { id: 1, name: "Lot 1", status: "Needs Repair", cost: 0 },
    { id: 2, name: "Lot 2", status: "Completed", cost: 1200 }
  ]);
});
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
