import React from "react";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";

export default function Dashboard() {
  return (
    <div className="flex flex-col min-h-screen font-sans bg-gray-50">
      {/* Navbar */}
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

      {/* Placeholder content */}
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="bg-white shadow rounded-xl p-10 text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Property Management
          </h1>
          <p className="text-gray-500">
            The dashboard is being rebuilt. Map, pins, and repair tracking are
            coming soon.
          </p>
        </div>
      </main>
    </div>
  );
}
