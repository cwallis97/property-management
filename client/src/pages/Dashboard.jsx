import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc 
} from "firebase/firestore";
import SitePlan from "../components/SitePlan.jsx";
import Sidebar from "../components/Sidebar.jsx";

export default function Dashboard() {
  const [imageUrl, setImageUrl] = useState("");
  const [lots, setLots] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState("satellite");

  // ✅ Load user data from Firestore on mount
  useEffect(() => {
    const fetchData = async () => {
      if (!auth.currentUser) return;

      const userDoc = doc(collection(db, "users"), auth.currentUser.uid);
      const snapshot = await getDoc(userDoc);

      if (snapshot.exists()) {
        const data = snapshot.data();
        setImageUrl(data.imageUrl || "");
        setLots(data.lots || []);
      }
    };

    fetchData();
  }, []);

  // ✅ Save user data to Firestore whenever it changes
  useEffect(() => {
    const saveData = async () => {
      if (!auth.currentUser) return;

      const userDoc = doc(collection(db, "users"), auth.currentUser.uid);
      await setDoc(userDoc, { imageUrl, lots });
    };

    saveData();
  }, [imageUrl, lots]);

  function addLot({ name, x, y }) {
    const id = lots.length ? Math.max(...lots.map(l => l.id)) + 1 : 1;
    const lot = { 
      id, 
      name, 
      x, 
      y, 
      status: "Needs Review", 
      layer: activeTab,  // 👈 track which layer this lot belongs to
      repairs: [] 
    };
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

  // ✅ Filter lots by active layer
  const filteredLots = lots.filter(l => l.layer === activeTab);
  const selected = lots.find(l => l.id === selectedId) || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", fontFamily: "Arial" }}>
      
      {/* ✅ Top Navbar */}
      <header style={{ background: "#4c6ef5", color: "white", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>WallisWorks PM</strong>
        <div>
          {auth.currentUser?.email && (
            <span style={{ marginRight: "16px" }}>{auth.currentUser.email}</span>
          )}
          <button 
            style={{ padding: "6px 12px", background: "#f87171", color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}
            onClick={() => signOut(auth)}
          >
            Logout
          </button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1 }}>
        
        {/* ✅ Sidebar */}
        <aside style={{ width: 260, borderRight: "1px solid #e2e8f0", padding: 16, background: "#f8fafc" }}>
          <h3 style={{ marginBottom: 16 }}>Layers</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {["satellite", "water", "electrical"].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "10px",
                  textAlign: "left",
                  border: "none",
                  borderRadius: "8px",
                  background: activeTab === tab ? "#4c6ef5" : "white",
                  color: activeTab === tab ? "white" : "#334155",
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 24 }}>
            <h4 style={{ fontSize: "14px", marginBottom: 8, color: "#64748b" }}>Site Plan URL</h4>
            <input
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://example.com/plan.jpg"
              style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
            />
          </div>

          <Sidebar lot={selected} onAddRepair={addRepairToSelected} />
        </aside>

        {/* ✅ Main Content */}
        <main style={{ flex: 1, padding: 24 }}>
          <h1 style={{ marginBottom: 8 }}>Property Management</h1>
          <p style={{ color: "#64748b", marginBottom: 16 }}>
            Active Layer: <strong>{activeTab}</strong>
          </p>

          <SitePlan
            imageUrl={imageUrl}
            lots={filteredLots} 
            onAddLot={addLot}
            onSelectLot={setSelectedId}
          />

          <div style={{ marginTop: 16, color: "#64748b", fontSize: 12 }}>
            Lots: {filteredLots.length} {selected ? `• Selected: ${selected.name}` : ""}
          </div>
        </main>
      </div>
    </div>
  );
}
