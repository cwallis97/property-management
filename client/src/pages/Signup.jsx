import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";

export default function Signup() {
  const navigate = useNavigate();

  async function handleSignup(e) {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      alert("Account created successfully!");
      navigate("/login"); // go to login after signup
    } catch (error) {
      console.error("Signup error:", error.message);
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
        <h2 style={{ textAlign: "center", marginBottom: "1.5rem" }}>Create Account</h2>
        <form onSubmit={handleSignup}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ fontWeight: "bold" }}>Name</label>
            <input
              type="text"
              placeholder="Enter your name"
              style={{ width: "100%", padding: "10px", marginTop: "5px", borderRadius: "8px", border: "1px solid #ccc" }}
            />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ fontWeight: "bold" }}>Email</label>
            <input
              name="email"
              type="email"
              placeholder="Enter your email"
              style={{ width: "100%", padding: "10px", marginTop: "5px", borderRadius: "8px", border: "1px solid #ccc" }}
            />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ fontWeight: "bold" }}>Password</label>
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              style={{ width: "100%", padding: "10px", marginTop: "5px", borderRadius: "8px", border: "1px solid #ccc" }}
            />
          </div>
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ fontWeight: "bold" }}>Confirm Password</label>
            <input
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
            Sign Up
          </button>
        </form>
        <p style={{ marginTop: "1rem", textAlign: "center" }}>
          Already have an account? <a href="/login">Log in</a>
        </p>
      </div>
    </div>
  );
}
