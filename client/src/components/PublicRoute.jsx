import { Navigate } from "react-router-dom";
import { auth } from "../firebase";
import { useEffect, useState } from "react";
import { DEV_BYPASS_AUTH } from "./devAuthBypass";

export default function PublicRoute({ children }) {
  const [loading, setLoading] = useState(!DEV_BYPASS_AUTH);
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (DEV_BYPASS_AUTH) return;
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (DEV_BYPASS_AUTH) {
    return children;
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
