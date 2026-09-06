import { useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  // SOC 2 Phase 1 — the API client redirects here with ?reason=disabled
  // after a request is rejected because this account's access was revoked
  // (distinct from an ordinary expired session).
  const accessDisabled = searchParams.get("reason") === "disabled";

  async function handleLogin(e) {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/dashboard");
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-700 animate-gradient-x">
      <div className="relative bg-white/10 backdrop-blur-xl p-10 rounded-3xl shadow-2xl border border-white/20 w-full max-w-md">
        <h2 className="text-3xl font-extrabold text-center text-white drop-shadow-lg mb-6">
          Welcome Back 👑
        </h2>
        {accessDisabled && (
          <div className="mb-6 rounded-xl border border-amber-300/40 bg-amber-500/15 px-4 py-3 text-sm text-amber-50">
            Your access has been disabled. Contact your administrator.
          </div>
        )}
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-200">Email</label>
            <input
              name="email"
              type="email"
              placeholder="Enter your email"
              className="w-full px-4 py-3 mt-2 rounded-xl bg-white/20 border border-white/30 text-white placeholder-gray-300 focus:ring-2 focus:ring-pink-500 focus:outline-none transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200">Password</label>
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              className="w-full px-4 py-3 mt-2 rounded-xl bg-white/20 border border-white/30 text-white placeholder-gray-300 focus:ring-2 focus:ring-pink-500 focus:outline-none transition"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-600 text-white font-bold rounded-xl shadow-lg hover:shadow-pink-500/50 transform hover:scale-105 transition-all duration-300 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p className="text-sm text-gray-300 text-center mt-6">
          Don’t have an account?{" "}
          <a href="/signup" className="text-pink-400 font-semibold hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
