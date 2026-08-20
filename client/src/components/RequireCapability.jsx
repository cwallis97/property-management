import { Navigate } from "react-router-dom";
import SectionSpinner from "./SectionSpinner";
import { useAuth } from "../context/AuthContext";

// Same shape as ProtectedRoute (loading spinner, then a decision) but for
// authorization rather than authentication — used to gate a whole route
// (e.g. /settings) rather than one control on a page. Waits for the
// capability fetch to resolve before deciding anything, so a legitimate
// Admin never sees a flash-redirect while role is still loading. Backend
// authorization remains the real gate regardless — this only prevents a
// restricted user from landing on a page whose actions would all 403 anyway.
export default function RequireCapability({ capability, children }) {
  const { loading, hasCapability } = useAuth();

  if (loading) return <SectionSpinner />;

  if (!hasCapability(capability)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
