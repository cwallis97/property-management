import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth } from "../firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getInvitePreview, acceptInvite } from "../utils/api";

const roleLabel = { admin: "Admin", manager: "Manager", technician: "Technician" };

const STATUS_MESSAGE = {
  accepted: "This invitation has already been used.",
  revoked: "This invitation has been cancelled.",
  expired: "This invitation has expired. Ask an admin to send a new one.",
};

// Public route — the visitor is not necessarily signed in yet. Deliberately
// self-contained rather than reusing Login/Signup: those two navigate
// straight to /dashboard on success and this page needs its own outcome
// (accept the invitation, then navigate), so branching their existing flow
// on a redirect target risked touching a working, unrelated page for no
// real benefit. This never auto-redeems on page load, even if already
// signed in with a matching email — accepting is a real (one-time, POST)
// action gated behind an explicit click, so an email client's automated
// link-prefetch/safety-scan can never silently burn the invitation before
// the real person opens it.
export default function JoinInvite() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [invite, setInvite] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | not-found | error | ready

  const [firebaseUser, setFirebaseUser] = useState(undefined); // undefined = not yet resolved
  const [authMode, setAuthMode] = useState("signup"); // signup | signin
  const [password, setPassword] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState(null);

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState(null);

  useEffect(() => {
    getInvitePreview(token)
      .then((data) => {
        setInvite(data);
        setStatus("ready");
      })
      .catch((err) => {
        setStatus(err.status === 404 ? "not-found" : "error");
      });
  }, [token]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => setFirebaseUser(user));
    return () => unsubscribe();
  }, []);

  async function handleAuthSubmit(e) {
    e.preventDefault();
    if (authSubmitting) return;
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      if (authMode === "signup") {
        await createUserWithEmailAndPassword(auth, invite.email, password);
      } else {
        await signInWithEmailAndPassword(auth, invite.email, password);
      }
    } catch (err) {
      setAuthError(err.message || "Something went wrong. Please try again.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleAccept() {
    setAccepting(true);
    setAcceptError(null);
    try {
      await acceptInvite(token);
      navigate("/dashboard");
    } catch (err) {
      setAcceptError(err.message || "Something went wrong. Please try again.");
      setAccepting(false);
    }
  }

  const emailMatches = firebaseUser && firebaseUser.email?.toLowerCase() === invite?.email?.toLowerCase();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-900 text-xs font-bold text-white">P</span>
          <span className="text-[15px] font-semibold tracking-tight text-gray-900">PropertyOS</span>
        </div>

        {status === "loading" && <p className="text-sm text-gray-500">Loading invitation…</p>}

        {status === "not-found" && (
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Invitation not found</h1>
            <p className="mt-2 text-sm text-gray-500">This invitation link is invalid. Ask your admin to send a new one.</p>
          </div>
        )}

        {status === "error" && (
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Something went wrong</h1>
            <p className="mt-2 text-sm text-gray-500">Please try again in a moment.</p>
          </div>
        )}

        {status === "ready" && invite && invite.status !== "pending" && (
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Invitation unavailable</h1>
            <p className="mt-2 text-sm text-gray-500">{STATUS_MESSAGE[invite.status] || "This invitation is no longer valid."}</p>
          </div>
        )}

        {status === "ready" && invite && invite.status === "pending" && (
          <div>
            <h1 className="text-lg font-semibold text-gray-900">You're invited to join {invite.companyName}</h1>
            <p className="mt-1.5 text-sm text-gray-500">
              <span className="font-medium text-gray-700">{invite.email}</span> · joining as{" "}
              <span className="font-medium text-gray-700">{roleLabel[invite.role] || invite.role}</span>
            </p>

            {firebaseUser === undefined && <p className="mt-6 text-sm text-gray-400">Checking sign-in status…</p>}

            {firebaseUser === null && (
              <div className="mt-6">
                <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                  <button
                    type="button"
                    onClick={() => setAuthMode("signup")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      authMode === "signup" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Create account
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode("signin")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      authMode === "signin" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    I already have an account
                  </button>
                </div>

                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-900">Email</label>
                    <input
                      type="email"
                      value={invite.email}
                      disabled
                      className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-900">Password</label>
                    <input
                      type="password"
                      autoFocus
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                    />
                  </div>
                  {authError && <p className="text-sm text-red-600">{authError}</p>}
                  <button
                    type="submit"
                    disabled={authSubmitting}
                    className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {authSubmitting ? "Please wait…" : authMode === "signup" ? "Create account" : "Sign in"}
                  </button>
                </form>
              </div>
            )}

            {firebaseUser && emailMatches && (
              <div className="mt-6">
                <p className="mb-3 text-sm text-gray-500">
                  Signed in as <span className="font-medium text-gray-700">{firebaseUser.email}</span>.
                </p>
                {acceptError && <p className="mb-3 text-sm text-red-600">{acceptError}</p>}
                <button
                  type="button"
                  disabled={accepting}
                  onClick={handleAccept}
                  className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {accepting ? "Joining…" : `Join ${invite.companyName}`}
                </button>
              </div>
            )}

            {firebaseUser && !emailMatches && (
              <div className="mt-6">
                <p className="text-sm text-red-600">
                  You're signed in as {firebaseUser.email}, but this invitation is for {invite.email}. Sign out and sign in with
                  the invited email to continue.
                </p>
                <button
                  type="button"
                  onClick={() => signOut(auth)}
                  className="mt-3 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
