import React, { useEffect, useState } from "react";
import { loadState, saveState } from "./services/storage.js";
import SitePlan from "./components/SitePlan.jsx";
import Sidebar from "./components/Sidebar.jsx";

export default function App() {
  const [imageUrl, setImageUrl] = useState("");
  const [lots, setLots] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const s = loadState();
    setImageUrl(s.imageUrl || "");
    setLots(s.lots || []);
  }, []);

  useEffect(() => {
    saveState({ imageUrl, lots });
  }, [imageUrl, lots]);

  function addLot({ name, x, y }) {
    const id = lots.length ? Math.max(...lots.map(l => l.id)) + 1 : 1;
    const lot = { id, name, x, y, status: "Needs Review", repairs: [] };
    setLots(prev => [...prev, lot]);
    setSelectedId(id);
  }

  function addRepairToSelected(r) {
    if (!selectedId) return;
    setLots(prev =>
      prev.map(l =>
        l.id === selectedId
          ? { ...l, repairs: [...(l.repairs || []), r] }
          : l
      )
    );
  }

  const selected = lots.find(l => l.id === selectedId) || null;

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "Arial" }}>
      <div style={{ width: 260, borderRight: "1px solid #e2e8f0" }}>
        <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0" }}>
          <strong>PM Builder</strong>
        </div>
        <div style={{ padding: 16 }}>
          <div
            style={{
              marginBottom: 8,
              fontSize: 12,
              color: "#64748b",
            }}
          >
            Site plan image URL
          </div>
          <input
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            placeholder="https://example.com/plan.jpg"
            style={{ width: "100%" }}
          />
          <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
            Tip: paste a direct JPEG/PNG URL for now.
          </div>
        </div>
        <Sidebar lot={selected} onAddRepair={addRepairToSelected} />
      </div>

      <div style={{ flex: 1, padding: 24 }}>
        <h1>Property Management</h1>
        <p style={{ color: "#64748b" }}>
          Click the map to add a lot. Click a marker to select it, then add a
          repair in the sidebar.
        </p>
        <SitePlan
          imageUrl={imageUrl}
          lots={lots}
          onAddLot={addLot}
          onSelectLot={setSelectedId}
        />
        <div style={{ marginTop: 16, color: "#64748b", fontSize: 12 }}>
          Lots: {lots.length} {selected ? `• Selected: ${selected.name}` : ""}
        </div>
      </div>
    </div>
  );
}
