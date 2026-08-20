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
    <div className="flex min-h-screen items-center justify-center bg-surface-subtle px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-xs font-bold text-accent-ink">P</span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">PropertyOS</span>
        </div>

        {status === "loading" && <p className="text-sm text-ink-secondary">Loading invitation…</p>}

        {status === "not-found" && (
          <div>
            <h1 className="text-lg font-semibold text-ink">Invitation not found</h1>
            <p className="mt-2 text-sm text-ink-secondary">This invitation link is invalid. Ask your admin to send a new one.</p>
          </div>
        )}

        {status === "error" && (
          <div>
            <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
            <p className="mt-2 text-sm text-ink-secondary">Please try again in a moment.</p>
          </div>
        )}

        {status === "ready" && invite && invite.status !== "pending" && (
          <div>
            <h1 className="text-lg font-semibold text-ink">Invitation unavailable</h1>
            <p className="mt-2 text-sm text-ink-secondary">{STATUS_MESSAGE[invite.status] || "This invitation is no longer valid."}</p>
          </div>
        )}

        {status === "ready" && invite && invite.status === "pending" && (
          <div>
            <h1 className="text-lg font-semibold text-ink">You're invited to join {invite.companyName}</h1>
            <p className="mt-1.5 text-sm text-ink-secondary">
              <span className="font-medium text-ink-secondary">{invite.email}</span> · joining as{" "}
              <span className="font-medium text-ink-secondary">{roleLabel[invite.role] || invite.role}</span>
            </p>

            {firebaseUser === undefined && <p className="mt-6 text-sm text-ink-muted">Checking sign-in status…</p>}

            {firebaseUser === null && (
              <div className="mt-6">
                <div className="mb-4 inline-flex rounded-lg border border-line bg-surface-subtle p-1">
                  <button
                    type="button"
                    onClick={() => setAuthMode("signup")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      authMode === "signup" ? "bg-surface text-ink shadow-sm" : "text-ink-secondary hover:text-ink-secondary"
                    }`}
                  >
                    Create account
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode("signin")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      authMode === "signin" ? "bg-surface text-ink shadow-sm" : "text-ink-secondary hover:text-ink-secondary"
                    }`}
                  >
                    I already have an account
                  </button>
                </div>

                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink">Email</label>
                    <input
                      type="email"
                      value={invite.email}
                      disabled
                      className="w-full rounded-lg border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink-secondary"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink">Password</label>
                    <input
                      type="password"
                      autoFocus
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong"
                    />
                  </div>
                  {authError && <p className="text-sm text-red-600 dark:text-red-400">{authError}</p>}
                  <button
                    type="submit"
                    disabled={authSubmitting}
                    className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {authSubmitting ? "Please wait…" : authMode === "signup" ? "Create account" : "Sign in"}
                  </button>
                </form>
              </div>
            )}

            {firebaseUser && emailMatches && (
              <div className="mt-6">
                <p className="mb-3 text-sm text-ink-secondary">
                  Signed in as <span className="font-medium text-ink-secondary">{firebaseUser.email}</span>.
                </p>
                {acceptError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{acceptError}</p>}
                <button
                  type="button"
                  disabled={accepting}
                  onClick={handleAccept}
                  className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {accepting ? "Joining…" : `Join ${invite.companyName}`}
                </button>
              </div>
            )}

            {firebaseUser && !emailMatches && (
              <div className="mt-6">
                <p className="text-sm text-red-600 dark:text-red-400">
                  You're signed in as {firebaseUser.email}, but this invitation is for {invite.email}. Sign out and sign in with
                  the invited email to continue.
                </p>
                <button
                  type="button"
                  onClick={() => signOut(auth)}
                  className="mt-3 w-full rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-subtle"
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
