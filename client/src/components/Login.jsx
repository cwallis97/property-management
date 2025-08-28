// client/src/components/Login.jsx
import React from "react";

export default function Login() {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Login</h2>
        <form>
          <label style={styles.label}>Email</label>
          <input type="email" placeholder="Enter your email" style={styles.input} />

          <label style={styles.label}>Password</label>
          <input type="password" placeholder="••••••••" style={styles.input} />

          <button type="submit" style={styles.button}>Sign In</button>

          <div style={styles.links}>
            <a href="/signup">Create Account</a> | <a href="#">Forgot Password?</a>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    background: "linear-gradient(to right, #1f2937, #4b5563)",
  },
  card: {
    background: "#fff",
    padding: "2rem",
    borderRadius: "12px",
    boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
    width: "320px",
  },
  title: {
    textAlign: "center",
    marginBottom: "1.5rem",
    color: "#111827",
  },
  label: {
    display: "block",
    marginBottom: "0.5rem",
    fontWeight: "bold",
    color: "#374151",
  },
  input: {
    width: "100%",
    padding: "0.75rem",
    marginBottom: "1rem",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "1rem",
  },
  button: {
    width: "100%",
    padding: "0.75rem",
    background: "#2563eb",
    border: "none",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "1rem",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "background 0.3s",
  },
  links: {
    textAlign: "center",
    marginTop: "1rem",
    fontSize: "0.9rem",
  },
};
