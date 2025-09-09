import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";

export default function Signup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleSignup(e) {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
      setLoading(true);
      await createUserWithEmailAndPassword(auth, email, password);
      navigate("/dashboard");
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-700 animate-gradient-xy">
      <div className="relative bg-white/10 backdrop-blur-xl p-10 rounded-3xl shadow-2xl border border-white/20 w-full max-w-md">
        <h2 className="text-3xl font-extrabold text-center text-white drop-shadow-lg mb-6">
          Create Your Account ✨
        </h2>
        <form onSubmit={handleSignup} className="space-y-6">
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
          <div>
            <label className="block text-sm font-medium text-gray-200">Confirm Password</label>
            <input
              name="confirmPassword"
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
            {loading ? "Creating..." : "Sign Up"}
          </button>
        </form>
        <p className="text-sm text-gray-300 text-center mt-6">
          Already have an account?{" "}
          <a href="/login" className="text-pink-400 font-semibold hover:underline">
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}
