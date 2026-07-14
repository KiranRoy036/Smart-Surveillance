import { motion } from "framer-motion"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

type Mode = "login" | "register"

export default function AdminLogin() {
  const [mode, setMode] = useState<Mode>("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const nav = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setLoading(true)

    try {
      if (mode === "login") {
        const resp = await fetch("http://127.0.0.1:8000/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        })
        const data = await resp.json()
        if (!resp.ok) {
          setError(data.detail || "Invalid username or password")
        } else {
          localStorage.setItem("auth_user", JSON.stringify(data.user))
          nav("/admin-dashboard")
        }
      } else {
        const resp = await fetch("http://127.0.0.1:8000/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, role: "admin" }),
        })
        const data = await resp.json()
        if (!resp.ok) {
          setError(data.detail || "Registration failed")
        } else {
          setSuccess("Admin registered successfully. You can now log in.")
          setMode("login")
          setUsername("")
          setPassword("")
        }
      }
    } catch {
      setError("Cannot reach server. Is the backend running?")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.wrapper}>
      <motion.video
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        style={styles.video}
        autoPlay
        muted
        loop
        playsInline
      >
        <source src="/videos/16-9.mp4" type="video/mp4" />
      </motion.video>

      <motion.div
        initial={{ y: "100vh" }}
        animate={{ y: "0vh" }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={styles.formSide}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          style={styles.formContainer}
        >
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            style={styles.title}
          >
            Admin
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            style={styles.subtitle}
          >
            {mode === "login" ? "Secure access to control systems" : "Create a new admin account"}
          </motion.p>

          {/* Mode toggle */}
          <div style={styles.toggle}>
            <button
              onClick={() => { setMode("login"); setError(""); setSuccess("") }}
              style={{ ...styles.toggleBtn, ...(mode === "login" ? styles.toggleActive : {}) }}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode("register"); setError(""); setSuccess("") }}
              style={{ ...styles.toggleBtn, ...(mode === "register" ? styles.toggleActive : {}) }}
            >
              Register
            </button>
          </div>

          <motion.form
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            onSubmit={handleSubmit}
            style={styles.form}
          >
            <div style={styles.formGroup}>
              <label style={styles.label}>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={styles.input}
                placeholder="Enter username"
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                placeholder="Enter password"
                required
              />
            </div>

            {error && (
              <motion.div
                style={styles.error}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {error}
              </motion.div>
            )}

            {success && (
              <motion.div
                style={styles.successMsg}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {success}
              </motion.div>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.02, boxShadow: "0 6px 25px rgba(193, 0, 0, 0.5)" }}
              whileTap={{ scale: 0.98 }}
              style={styles.submitBtn}
            >
              {loading ? (
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  ⏳
                </motion.span>
              ) : mode === "login" ? "Sign In" : "Register"}
            </motion.button>
          </motion.form>

          <p style={styles.backLink}>
            <span onClick={() => nav("/")} style={styles.link}>
              Back to Home
            </span>
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}

const styles: any = {
  wrapper: {
    height: "100vh",
    overflow: "hidden",
    position: "relative",
    color: "white",
    fontFamily: "Inter, system-ui",
    background: "#020617"
  },
  video: {
    position: "absolute",
    top: 0, left: 0,
    width: "100%", height: "100%",
    objectFit: "cover",
    zIndex: 0
  },
  formSide: {
    position: "fixed",
    top: 0, left: 0,
    width: "100vw", height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(10, 15, 30, 0.55)",
    backdropFilter: "blur(30px)",
    WebkitBackdropFilter: "blur(30px)",
    zIndex: 5
  },
  formContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    maxWidth: "420px",
    padding: "0 20px"
  },
  title: {
    fontSize: "2.8rem",
    fontWeight: 800,
    marginBottom: 12,
    background: "linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent"
  },
  subtitle: {
    fontSize: "0.95rem",
    color: "#a0aec0",
    marginBottom: 20
  },
  toggle: {
    display: "flex",
    gap: 4,
    marginBottom: 20,
    background: "rgba(15, 23, 42, 0.5)",
    borderRadius: 10,
    padding: 4,
    border: "1px solid rgba(255,255,255,0.08)"
  },
  toggleBtn: {
    padding: "8px 28px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: "#94a3b8",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s"
  },
  toggleActive: {
    background: "linear-gradient(135deg, #c20000 0%, #ff1744 100%)",
    color: "white"
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    width: "100%",
    padding: "40px 35px",
    borderRadius: "16px",
    background: "rgba(15, 23, 42, 0.4)",
    backdropFilter: "blur(30px)",
    WebkitBackdropFilter: "blur(30px)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)"
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  label: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#e2e8f0",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },
  input: {
    padding: "14px 18px",
    borderRadius: "10px",
    border: "1.5px solid rgba(255, 255, 255, 0.15)",
    background: "rgba(30, 41, 59, 0.6)",
    color: "white",
    fontSize: "1rem",
    outline: "none",
    boxSizing: "border-box" as const
  },
  error: {
    color: "#ffb3ba",
    fontSize: "0.85rem",
    padding: "12px 14px",
    background: "rgba(255, 107, 107, 0.12)",
    borderRadius: "8px",
    border: "1px solid rgba(255, 107, 107, 0.35)"
  },
  successMsg: {
    color: "#86efac",
    fontSize: "0.85rem",
    padding: "12px 14px",
    background: "rgba(34, 197, 94, 0.1)",
    borderRadius: "8px",
    border: "1px solid rgba(34, 197, 94, 0.3)"
  },
  submitBtn: {
    padding: "14px 32px",
    marginTop: 8,
    borderRadius: "10px",
    border: "none",
    background: "linear-gradient(135deg, #c20000 0%, #ff1744 100%)",
    color: "white",
    fontSize: "1rem",
    fontWeight: 700,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },
  backLink: {
    marginTop: 28,
    fontSize: "0.9rem",
    color: "#cbd5e1"
  },
  link: {
    color: "#60a5fa",
    cursor: "pointer",
    fontWeight: 600
  }
}
