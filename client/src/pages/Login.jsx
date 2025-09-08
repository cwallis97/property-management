import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";

export default function Login() {
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      alert("Login successful!");
      navigate("/dashboard"); // go to dashboard after login
    } catch (error) {
      console.error("Login error:", error.message);
      alert(error.message);
    }
  }

  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      background: "linear-gradient(135deg, #4c6ef5, #15aabf)"
    }}>
      <div style={{
        background: "#fff",
        padding: "2rem",
        borderRadius: "16px",
        boxShadow: "0 8px 20px rgba(0,0,0,0.1)",
        width: "350px"
      }}>
        <h2 style={{ textAlign: "center", marginBottom: "1.5rem" }}>Login</h2>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ fontWeight: "bold" }}>Email</label>
            <input
              name="email"
              type="email"
              placeholder="Enter your email"
              style={{ width: "100%", padding: "10px", marginTop: "5px", borderRadius: "8px", border: "1px solid #ccc" }}
            />
          </div>
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ fontWeight: "bold" }}>Password</label>
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              style={{ width: "100%", padding: "10px", marginTop: "5px", borderRadius: "8px", border: "1px solid #ccc" }}
            />
          </div>
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "12px",
              background: "#4c6ef5",
              color: "#fff",
              fontWeight: "bold",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "0.3s"
            }}
            onMouseOver={(e) => e.target.style.background = "#364fc7"}
            onMouseOut={(e) => e.target.style.background = "#4c6ef5"}
          >
            Sign In
          </button>
        </form>
        <p style={{ marginTop: "1rem", textAlign: "center" }}>
          Don’t have an account? <a href="/signup">Sign up</a>
        </p>
      </div>
    </div>
  );
}
