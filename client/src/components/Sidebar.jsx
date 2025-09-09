import React, { useState } from "react";

export default function Sidebar({ lot, onAddRepair }) {
  const [desc, setDesc] = useState("");
  const [cost, setCost] = useState("");
  const [severity, setSeverity] = useState("low"); // ✅ default severity

  function handleAddRepair(e) {
    e.preventDefault();
    if (!desc || !cost) return;

    const repair = {
      id: Date.now(),
      description: desc,
      cost: parseFloat(cost),
      severity, // ✅ include severity in repair object
    };

    onAddRepair(repair);
    setDesc("");
    setCost("");
    setSeverity("low");
  }

  if (!lot) {
    return (
      <div style={{ padding: 16, fontSize: 14, color: "#64748b" }}>
        Select a lot to view details.
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ marginBottom: 8 }}>{lot.name}</h3>
      <ul style={{ marginBottom: 16, paddingLeft: 16 }}>
        {lot.repairs.map(r => (
          <li key={r.id} style={{ marginBottom: 6 }}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background:
                  r.severity === "high"
                    ? "#ef4444"
                    : r.severity === "medium"
                    ? "#facc15"
                    : "#22c55e",
                marginRight: 8,
              }}
            ></span>
            {r.description} – ${r.cost} ({r.severity})
          </li>
        ))}
      </ul>

      <form onSubmit={handleAddRepair} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <input
          type="text"
          placeholder="Repair description"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          style={{ padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
        />
        <input
          type="number"
          placeholder="Cost"
          value={cost}
          onChange={e => setCost(e.target.value)}
          style={{ padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
        />

        {/* ✅ Severity selector */}
        <select
          value={severity}
          onChange={e => setSeverity(e.target.value)}
          style={{ padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
        >
          <option value="low">Low (green)</option>
          <option value="medium">Medium (yellow)</option>
          <option value="high">High (red)</option>
        </select>

        <button
          type="submit"
          style={{
            padding: "10px",
            background: "#4c6ef5",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Add Repair
        </button>
      </form>
    </div>
  );
}
