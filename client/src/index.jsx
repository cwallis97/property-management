import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./pages/Login.jsx";  
import "./index.css";  // 👈 Tailwind CSS is loaded here

function App() {
  return (
    <Router>
      <Routes>
        {/* Dashboard / homepage */}
        <Route
          path="/"
          element={
            <h1 className="text-4xl font-bold text-blue-600 text-center mt-8">
              Dashboard (Home)
            </h1>
          }
        />

        {/* Fancy login page */}
        <Route path="/login" element={<Login />} />
      </Routes>
    </Router>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
