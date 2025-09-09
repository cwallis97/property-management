import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";
import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import SitePlan from "../components/SitePlan.jsx";
import Sidebar from "../components/Sidebar.jsx";

export default function Dashboard() {
  const [imageUrl, setImageUrl] = useState("");
  const [lots, setLots] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState("satellite");

  // ✅ Load user data from Firestore
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

  // ✅ Save user data to Firestore
  useEffect(() => {
    const saveData = async () => {
      if (!auth.currentUser) return;
      const userDoc = doc(collection(db, "users"), auth.currentUser.uid);
      await setDoc(userDoc, { imageUrl, lots });
    };
    saveData();
  }, [imageUrl, lots]);

  function addLot({ name, x, y }) {
    const id = lots.length ? Math.max(...lots.map((l) => l.id)) + 1 : 1;
    const lot = {
      id,
      name,
      x,
      y,
      status: "Needs Review",
      layer: activeTab,
      repairs: [],
    };
    setLots((prev) => [...prev, lot]);
    setSelectedId(id);
  }

  function addRepairToSelected(r) {
    if (!selectedId) return;
    setLots((prev) =>
      prev.map((l) =>
        l.id === selectedId
          ? { ...l, repairs: [...(l.repairs || []), r] }
          : l
      )
    );
  }

  const filteredLots = lots.filter((l) => l.layer === activeTab);
  const selected = lots.find((l) => l.id === selectedId) || null;

  return (
    <div className="flex flex-col min-h-screen font-sans bg-gray-50">
      {/* ✅ Navbar */}
      <header className="bg-blue-600 text-white px-6 py-3 flex justify-between items-center shadow-md">
        <strong className="text-lg tracking-wide">WallisWorks PM</strong>
        <div className="flex items-center gap-4">
          {auth.currentUser && (
            <span className="text-sm">
              {auth.currentUser.displayName || auth.currentUser.email}
            </span>
          )}
          <button
            onClick={() => signOut(auth)}
            className="bg-red-500 hover:bg-red-600 transition px-3 py-1 rounded-md text-sm font-medium"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* ✅ Sidebar */}
        <aside className="w-72 border-r border-gray-200 bg-white p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Layers</h3>
            <div className="flex flex-col gap-2">
              {["satellite", "water", "electrical"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-lg text-left shadow-sm transition ${
                    activeTab === tab
                      ? "bg-blue-600 text-white font-semibold"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            <div className="mt-6">
              <h4 className="text-sm font-medium text-gray-500 mb-2">
                Site Plan URL
              </h4>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/plan.jpg"
                className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-8">
            <Sidebar lot={selected} onAddRepair={addRepairToSelected} />
          </div>
        </aside>

        {/* ✅ Main Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Property Management
          </h1>
          <p className="text-gray-500 mb-6">
            Active Layer:{" "}
            <span className="font-semibold text-blue-600">{activeTab}</span>
          </p>

          <div className="bg-white shadow rounded-xl p-4">
            <SitePlan
              imageUrl={imageUrl}
              lots={filteredLots}
              onAddLot={addLot}
              onSelectLot={setSelectedId}
            />
          </div>

          <div className="mt-4 text-sm text-gray-500">
            Lots: {filteredLots.length}{" "}
            {selected ? `• Selected: ${selected.name}` : ""}
          </div>
        </main>
      </div>
    </div>
  );
}
