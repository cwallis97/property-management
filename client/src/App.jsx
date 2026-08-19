import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Portfolio from "./pages/Portfolio";
import PropertyDetail from "./pages/PropertyDetail";
import WorkOrderDetail from "./pages/WorkOrderDetail";
import AssetDetail from "./pages/AssetDetail";
import Assets from "./pages/Assets";
import WorkOrders from "./pages/WorkOrders";
import Reports from "./pages/Reports";
import Vendors from "./pages/Vendors";
import VendorDetail from "./pages/VendorDetail";
import Documents from "./pages/Documents";
import Settings from "./pages/Settings";
import AppShell from "./layouts/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicRoute from "./components/PublicRoute";
import { DEV_BYPASS_AUTH } from "./components/devAuthBypass";

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Root → redirect to /login (or /dashboard in dev, since DEV_BYPASS_AUTH
            skips the login screen entirely for local preview) */}
        <Route
          path="/"
          element={<Navigate to={DEV_BYPASS_AUTH ? "/dashboard" : "/login"} replace />}
        />

        {/* Public routes (redirect if logged in) */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicRoute>
              <Signup />
            </PublicRoute>
          }
        />

        {/* Protected app shell (redirect if not logged in) */}
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/portfolio/:propertyId" element={<PropertyDetail />} />
          <Route path="/portfolio/:propertyId/work-orders/:workOrderId" element={<WorkOrderDetail />} />
          <Route path="/portfolio/:propertyId/assets/:assetId" element={<AssetDetail />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/work-orders" element={<WorkOrders />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/vendors/:vendorId" element={<VendorDetail />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Catch-all → redirect to root */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
