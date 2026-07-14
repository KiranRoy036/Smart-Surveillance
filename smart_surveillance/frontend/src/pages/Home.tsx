import { motion } from "framer-motion"
import { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"

export default function Home() {
  const navigate = useNavigate()
  const [loginMode, setLoginMode] = useState<"landing" | "admin" | "viewer" | "register" | null>(null)
  const [adminUsername, setAdminUsername] = useState("")
  const [adminPassword, setAdminPassword] = useState("")
  const [viewerUsername, setViewerUsername] = useState("")
  const [viewerPassword, setViewerPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [hoveredAdmin, setHoveredAdmin] = useState(false)
  const [hoveredViewer, setHoveredViewer] = useState(false)
  const [hoveredRegister, setHoveredRegister] = useState(false)
  const [regUsername, setRegUsername] = useState("")
  const [regPassword, setRegPassword] = useState("")
  const [regRole, setRegRole] = useState<"admin" | "viewer">("viewer")

  const titleContainerRef = useRef<HTMLDivElement>(null)
  const beamOverlayRef = useRef<HTMLDivElement>(null)
  const lightWrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const DURATION = 12000 // matches cameraPan 12s
    let raf: number

    // Implement cubic-bezier(0.4, 0, 0.2, 1) — same easing as CSS cameraPan
    const cubicBezierEase = (() => {
      const p1x = 0.4, p1y = 0, p2x = 0.2, p2y = 1
      const calcBezier = (t: number, a: number, b: number) =>
        ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t
      return (progress: number) => {
        if (progress === 0 || progress === 1) return progress
        let lo = 0, hi = 1, t = progress
        for (let i = 0; i < 24; i++) {
          const x = calcBezier(t, p1x, p2x)
          if (Math.abs(x - progress) < 0.00001) break
          if (x < progress) lo = t; else hi = t
          t = (lo + hi) / 2
        }
        return calcBezier(t, p1y, p2y)
      }
    })()

    // cameraPan keyframes: [normalizedTime, angleDeg]
    const keyframes = [
      [0, 5], [0.10, 5],
      [0.20, 45], [0.35, 45],
      [0.45, 15], [0.65, 15],
      [0.75, 35], [0.90, 35],
      [1.00, 5]
    ]

    const getAngleDeg = (t: number): number => {
      for (let i = 0; i < keyframes.length - 1; i++) {
        const [t0, a0] = keyframes[i]
        const [t1, a1] = keyframes[i + 1]
        if (t <= t1) {
          const segLen = t1 - t0
          if (segLen < 0.001) return a0 // hold segment — no interpolation
          const raw = (t - t0) / segLen
          const eased = cubicBezierEase(raw)
          return a0 + (a1 - a0) * eased
        }
      }
      return 5
    }

    const animate = () => {
      // Read the CSS animation's OWN currentTime — perfect sync, zero drift
      const anim = lightWrapperRef.current?.getAnimations()[0]
      const currentMs = anim ? (anim.currentTime as number ?? 0) : 0
      const t = (currentMs % DURATION) / DURATION
      const angleDeg = getAngleDeg(t)
      const angleRad = (angleDeg * Math.PI) / 180

      if (titleContainerRef.current && beamOverlayRef.current) {
        const rect = titleContainerRef.current.getBoundingClientRect()
        // CCTV container is at clamp(20px, 5vw, 60px)
        const vw = window.innerWidth / 100
        const cctvOffset = Math.max(20, Math.min(60, 5 * vw))
        const bodyHeight = Math.max(20, Math.min(40, 4 * vw))
        const pivotX = Math.min(10, 2 * vw)

        // CCTV lens pivot: left: cctvOffset + transformOrigin, top: cctvOffset + center of bodyHeight
        const pivotPageX = cctvOffset + pivotX
        const pivotPageY = cctvOffset + (bodyHeight / 2)
        const lx = pivotPageX - rect.left
        const ly = pivotPageY - rect.top
        // Half-angle matches original light cone clipPath geometry (~14deg)
        const halfCone = (14 * Math.PI) / 180
        const far = 4000
        const p1x = lx + far * Math.cos(angleRad - halfCone)
        const p1y = ly + far * Math.sin(angleRad - halfCone)
        const p2x = lx + far * Math.cos(angleRad + halfCone)
        const p2y = ly + far * Math.sin(angleRad + halfCone)
        beamOverlayRef.current.style.clipPath =
          `polygon(${lx}px ${ly}px, ${p1x}px ${p1y}px, ${p2x}px ${p2y}px)`
      }
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [])

  const handleAdminClick = () => {
    setLoginMode("admin")
    setError("")
  }

  const handleViewerClick = () => {
    setLoginMode("viewer")
    setError("")
  }

  const handleBack = () => {
    setLoginMode(null)
    setAdminUsername("")
    setAdminPassword("")
    setViewerUsername("")
    setViewerPassword("")
    setError("")
  }

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const resp = await fetch("http://127.0.0.1:8000/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: adminUsername, password: adminPassword }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setError(data.detail || "Invalid username or password")
      } else if (data.user.role !== "admin") {
        setError("This account is not an admin")
      } else {
        localStorage.setItem("authToken", "logged-in")
        localStorage.setItem("role", data.user.role)
        localStorage.setItem("username", data.user.username)
        navigate("/admin-dashboard")
      }
    } catch {
      setError("Cannot reach server. Is the backend running?")
    } finally {
      setLoading(false)
    }
  }

  const handleViewerLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const resp = await fetch("http://127.0.0.1:8000/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: viewerUsername, password: viewerPassword }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setError(data.detail || "Invalid username or password")
      } else if (data.user.role !== "viewer") {
        setError("This account is not a viewer")
      } else {
        localStorage.setItem("authToken", "logged-in")
        localStorage.setItem("role", data.user.role)
        localStorage.setItem("username", data.user.username)
        navigate("/viewer-dashboard")
      }
    } catch {
      setError("Cannot reach server. Is the backend running?")
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterClick = () => {
    setLoginMode("register")
    setError("")
  }

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const resp = await fetch("http://127.0.0.1:8000/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: regUsername, password: regPassword, role: regRole }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setError(data.detail || "Registration failed")
      } else {
        setRegUsername("")
        setRegPassword("")
        setLoginMode(regRole)
        setError("Registered successfully! Please log in.")
      }
    } catch {
      setError("Cannot reach server. Is the backend running?")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.animatedBackground}>
        <div style={styles.cctvContainer}>
          <div style={styles.cctvStand}></div>
          <div style={styles.cctvBody}>
            <div style={styles.cctvLens}>
              <div style={styles.cctvLightReflect}></div>
            </div>
          </div>
        </div>
      </div>
      {/* Light cone — ref used to read CSS animation currentTime for clip-path sync */}
      <div ref={lightWrapperRef} style={styles.cctvLightWrapper}>
        <div style={styles.cctvLightCone}></div>
      </div>

      {/* Landing Content - moves to left when login is selected */}
      <motion.div
        initial={{ opacity: 1, x: 0 }}
        animate={{
          opacity: loginMode ? 0 : 1,
          x: loginMode ? -400 : 0
        }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{
          ...styles.landingContent,
          pointerEvents: loginMode ? "none" : "auto"
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.9 }}
          style={styles.center}
        >
          {/* Title with spotlight effect: dark base layer + white JS-clipped overlay */}
          <div ref={titleContainerRef} style={{ position: "relative" }}>
            {/* Dark base layer - always visible as dark/grey */}
            <motion.h1
              style={styles.title}
              variants={{
                hidden: { opacity: 1 },
                show: { opacity: 1, transition: { staggerChildren: 0.08 } }
              }}
              initial="hidden"
              animate="show"
            >
              {"Smart Surveillance".split("").map((char, index) => (
                <motion.span
                  key={index}
                  variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                  style={{ display: "inline-block" }}
                >
                  {char === " " ? "\u00A0" : char}
                </motion.span>
              ))}
            </motion.h1>

            {/* White overlay - clip-path set by JS each frame to match beam triangle */}
            <div ref={beamOverlayRef} style={styles.beamClipWrapper}>
              <motion.h1
                style={styles.titleOverlay}
                variants={{
                  hidden: { opacity: 1 },
                  show: { opacity: 1, transition: { staggerChildren: 0.08 } }
                }}
                initial="hidden"
                animate="show"
              >
                {"Smart Surveillance".split("").map((char, index) => (
                  <motion.span
                    key={index}
                    variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                    style={{ display: "inline-block" }}
                  >
                    {char === " " ? "\u00A0" : char}
                  </motion.span>
                ))}
              </motion.h1>
            </div>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            transition={{ delay: 0.6 }}
            style={styles.subtitle}
          >
            AI Powered Real-Time Monitoring System
          </motion.p>

          <motion.div
            style={styles.buttons}
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.18 } }
            }}
          >
            <motion.button
              variants={pop}
              onMouseEnter={() => setHoveredAdmin(true)}
              onMouseLeave={() => setHoveredAdmin(false)}
              animate={{
                scale: hoveredAdmin ? 1.02 : 1,
                background: hoveredAdmin
                  ? "linear-gradient(135deg, #7f1d1d 0%, #ef4444 100%)"
                  : "linear-gradient(135deg, #0f172a 0%, #7f1d1d 100%)",
                boxShadow: hoveredAdmin
                  ? "0 10px 25px -5px rgba(239, 68, 68, 0.3)"
                  : "0 4px 6px -1px rgba(0, 0, 0, 0.3)"
              }}
              transition={{ duration: 0.2 }}
              style={styles.btnPrimary}
              onClick={handleAdminClick}
            >
              <img
                src="/icons/admin.png"
                alt="admin"
                style={{
                  width: "32px",
                  height: "32px",
                  marginRight: "16px",
                  opacity: 0.9,
                  filter: "invert(1)"
                }}
              />
              <span>Login as Admin</span>
            </motion.button>

            <motion.button
              variants={pop}
              onMouseEnter={() => setHoveredViewer(true)}
              onMouseLeave={() => setHoveredViewer(false)}
              animate={{
                scale: hoveredViewer ? 1.02 : 1,
                background: hoveredViewer
                  ? "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)"
                  : "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
                boxShadow: hoveredViewer
                  ? "0 10px 25px -5px rgba(59, 130, 246, 0.3)"
                  : "0 4px 6px -1px rgba(0, 0, 0, 0.3)"
              }}
              transition={{ duration: 0.2 }}
              style={styles.btnSecondary}
              onClick={handleViewerClick}
            >
              <img
                src="/icons/bellboy.png"
                alt="viewer"
                style={{
                  width: "32px",
                  height: "32px",
                  marginRight: "16px",
                  opacity: 0.9,
                  filter: "invert(1)"
                }}
              />
              <span>Login as Viewer</span>
            </motion.button>

            <motion.button
              variants={pop}
              onMouseEnter={() => setHoveredRegister(true)}
              onMouseLeave={() => setHoveredRegister(false)}
              animate={{
                color: hoveredRegister ? "#ffffff" : "#94a3b8"
              }}
              transition={{ duration: 0.2 }}
              style={styles.btnTextOnly}
              onClick={handleRegisterClick}
            >
              Don't have an account? <b>Register</b>
            </motion.button>
          </motion.div>
        </motion.div>
      </motion.div>




      {/* Admin Login Form */}
      {(loginMode === "admin" || loginMode === "viewer" || loginMode) && (
        <motion.div
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          style={styles.formSide}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={styles.formContainer}
          >
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              style={styles.formTitle}
            >
              {loginMode === "admin" ? "Admin Login" : loginMode === "viewer" ? "Viewer Login" : "Register"}
            </motion.h1>

            <motion.form
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              onSubmit={loginMode === "admin" ? handleAdminLogin : loginMode === "viewer" ? handleViewerLogin : handleRegisterSubmit}
              style={styles.form}
            >
              <div style={styles.formGroup}>
                <label style={styles.label}>Username or Email</label>
                <input
                  type="text"
                  value={loginMode === "admin" ? adminUsername : loginMode === "viewer" ? viewerUsername : regUsername}
                  onChange={(e) => {
                    if (loginMode === "admin") setAdminUsername(e.target.value)
                    else if (loginMode === "viewer") setViewerUsername(e.target.value)
                    else setRegUsername(e.target.value)
                  }}
                  style={styles.input}
                  placeholder="Enter your username or email"
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Password</label>
                <input
                  type="password"
                  value={loginMode === "admin" ? adminPassword : loginMode === "viewer" ? viewerPassword : regPassword}
                  onChange={(e) => {
                    if (loginMode === "admin") setAdminPassword(e.target.value)
                    else if (loginMode === "viewer") setViewerPassword(e.target.value)
                    else setRegPassword(e.target.value)
                  }}
                  style={styles.input}
                  placeholder="Enter your password"
                  required
                />
              </div>

              {error && <div style={styles.error}>{error}</div>}

              {loginMode === "register" && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Register as</label>
                  <div style={styles.roleToggle}>
                    <button
                      type="button"
                      onClick={() => setRegRole("viewer")}
                      style={{
                        ...styles.roleBtn,
                        ...(regRole === "viewer" ? styles.roleBtnActive : {})
                      }}
                    >
                      Viewer
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegRole("admin")}
                      style={{
                        ...styles.roleBtn,
                        ...(regRole === "admin" ? styles.roleBtnActiveAdmin : {})
                      }}
                    >
                      Admin
                    </button>
                  </div>
                </div>
              )}

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.02, backgroundColor: "#333333" }}
                whileTap={{ scale: 0.98 }}
                style={styles.submitBtn}
              >
                {loading ? "Processing..." : loginMode === "admin" ? "Login as Admin" : loginMode === "viewer" ? "Login as Viewer" : "Register"}
              </motion.button>
            </motion.form>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              style={styles.backLink}
            >
              <a onClick={handleBack} style={styles.link}>
                Back to Home
              </a>
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

const pop = {
  hidden: { opacity: 0, scale: 0.8, y: 20 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0
  }
}

const styles: any = {
  wrapper: {
    height: "100vh",
    overflow: "hidden",
    position: "relative",
    color: "#f0f4ffff",
    fontFamily: "Google Sans Medium, sans-serif",
    background: "#ffffff"
  },

  animatedBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background: "linear-gradient(135deg, #020617 0%, #0f172a 50%, #1e293b 100%)",
    zIndex: 0,
    overflow: "hidden"
  },

  cctvContainer: {
    position: "absolute",
    top: "clamp(20px, 5vw, 60px)",
    left: "clamp(20px, 5vw, 60px)",
    zIndex: 3
  },

  cctvStand: {
    position: "absolute",
    top: "clamp(2px, 1vw, 10px)",
    left: "clamp(-15px, -3vw, -40px)",
    width: "clamp(25px, 5vw, 50px)",
    height: "clamp(6px, 1vw, 12px)",
    backgroundColor: "#334155",
    borderRadius: "4px",
    transform: "rotate(20deg)",
    transformOrigin: "right center",
    boxShadow: "inset 0 4px 6px rgba(0,0,0,0.3)"
  },

  cctvBody: {
    position: "absolute",
    width: "clamp(50px, 8vw, 90px)",
    height: "clamp(20px, 4vw, 40px)",
    backgroundColor: "#1e293b",
    borderRadius: "10px",
    border: "clamp(1px, 0.2vw, 2px) solid #475569",
    zIndex: 2,
    boxShadow: "0 15px 25px -5px rgba(0, 0, 0, 0.6), inset 0 2px 4px rgba(255,255,255,0.1)",
    transformOrigin: "min(10px, 2vw) center",
    animation: "cameraPan 12s cubic-bezier(0.4, 0, 0.2, 1) infinite"
  },

  cctvLens: {
    position: "absolute",
    right: "clamp(-2px, -0.5vw, -6px)",
    top: "clamp(1px, 0.4vw, 4px)",
    width: "clamp(22px, 2.5vw, 28px)",
    height: "clamp(22px, 2.5vw, 28px)",
    backgroundColor: "#020617",
    borderRadius: "50%",
    border: "clamp(1px, 0.3vw, 3px) solid #64748b",
    boxShadow: "inset 0 0 10px #000"
  },

  cctvLightReflect: {
    position: "absolute",
    top: "clamp(1px, 0.4vw, 4px)",
    left: "clamp(1px, 0.4vw, 4px)",
    width: "clamp(4px, 0.8vw, 8px)",
    height: "clamp(4px, 0.8vw, 8px)",
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: "50%",
  },

  cctvLightWrapper: {
    position: "absolute",
    top: "clamp(20px, 5vw, 60px)",
    left: "clamp(20px, 5vw, 60px)",
    width: "clamp(50px, 8vw, 90px)",
    height: "clamp(20px, 4vw, 40px)",
    transformOrigin: "min(10px, 2vw) center",
    animation: "cameraPan 12s cubic-bezier(0.4, 0, 0.2, 1) infinite",
    pointerEvents: "none",
    zIndex: 20
  },

  cctvLightCone: {
    position: "absolute",
    top: "-500px",
    left: "80px",
    width: "200vh",
    height: "1000px",
    background: "linear-gradient(90deg, #ffffff 0%, rgba(255, 255, 255, 0.4) 40%, transparent 100%)",
    clipPath: "polygon(0 520px, 100% 0%, 100% 100%)",
    transformOrigin: "0 520px",
    pointerEvents: "none",
    mixBlendMode: "difference" as const
  },

  landingContent: {
    width: "100%",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    zIndex: 25
  },

  center: {
    textAlign: "center",
    zIndex: 2,
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center"
  },

  title: {
    fontSize: "clamp(3.5rem, 8vw, 9rem)",
    fontWeight: 700,
    letterSpacing: "clamp(-3px, -1vw, -7px)",
    marginTop: 0,
    marginBottom: 10,
    fontFamily: "Google Sans Bold, sans-serif",
    color: "#2a2a3a",
    textAlign: "center" as const
  },

  subtitle: {
    marginBottom: 40,
    fontSize: "clamp(0.9rem, 1.5vw, 1.2rem)",
    color: "#ffffff",
    padding: "0 20px"
  },

  buttons: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    justifyContent: "center",
    alignItems: "center",
    marginTop: "40px"
  },

  btnPrimary: {
    padding: "20px 40px",
    borderRadius: 50,
    border: "1px solid rgba(239, 68, 68, 0.2)",
    color: "#f8fafc",
    fontSize: "1.1rem",
    fontFamily: "Google Sans Medium, sans-serif",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    width: "clamp(280px, 80vw, 320px)",
    transition: "all 0.3s ease",
    backdropFilter: "blur(10px)"
  },

  btnSecondary: {
    padding: "20px 40px",
    borderRadius: 50,
    border: "1px solid rgba(59, 130, 246, 0.2)",
    color: "#f8fafc",
    fontSize: "1.1rem",
    fontFamily: "Google Sans Medium, sans-serif",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    width: "clamp(280px, 80vw, 320px)",
    transition: "all 0.3s ease",
    backdropFilter: "blur(10px)"
  },

  btnTextOnly: {
    background: "none",
    border: "none",
    color: "#94a3b8",
    fontSize: "1.1rem",
    cursor: "pointer",
    fontFamily: "Google Sans Medium, sans-serif",
    marginTop: "20px",
    padding: "10px",
    transition: "color 0.2s ease"
  },

  divisionLine: {
    width: "3px",
    height: "100vh",
    backdropFilter: "blur(10px)",
    position: "absolute",
    left: "50%",
    top: 0,
    zIndex: 10,
    transformOrigin: "top",
    transform: "translateX(-50%)",
    boxShadow: "0 0 20px rgba(199,0,0,0.1)"
  },

  formSide: {
    width: "50%",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#ffffff",
    padding: "20px",
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 5,
    boxShadow: "-10px 0 40px rgba(0, 0, 0, 0.08)"
  },

  formContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    maxWidth: "420px"
  },

  formTitle: {
    fontSize: "2.5rem",
    fontWeight: 700,
    letterSpacing: "-1px",
    marginBottom: 40,
    fontFamily: "Google Sans Medium, sans-serif",
    color: "#000000"
  },

  form: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    width: "100%",
    padding: "40px",
    borderRadius: "16px",
    background: "#ffffff",
    border: "1px solid #f1f5f9",
    boxShadow: "0 4px 24px rgba(0, 0, 0, 0.04)"
  },

  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    textAlign: "left"
  },

  label: {
    fontSize: "0.95rem",
    fontWeight: 500,
    color: "#475569"
  },

  input: {
    padding: "14px 16px",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#0f172a",
    fontSize: "1rem",
    transition: "all 0.3s ease",
    outline: "none",
    boxSizing: "border-box" as const
  },

  error: {
    color: "#ef4444",
    fontSize: "0.9rem",
    padding: "12px",
    background: "#fef2f2",
    borderRadius: "8px",
    border: "1px solid #fee2e2"
  },

  helperText: {
    color: "#64748b",
    fontSize: "0.9rem",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    padding: "12px"
  },

  submitBtn: {
    padding: "15px 28px",
    marginTop: 10,
    borderRadius: 8,
    border: "none",
    color: "white",
    background: "#000000",
    fontSize: "1.1rem",
    fontfamily: "Google Sans Bold, sans-serif",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.3s ease",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)"
  },

  backLink: {
    marginTop: 24,
    fontSize: "0.95rem",
    color: "#64748b"
  },

  link: {
    color: "#000000",
    textDecoration: "underline",
    fontWeight: 500,
    cursor: "pointer",
    transition: "opacity 0.3s ease"
  },

  roleToggle: {
    display: "flex",
    gap: 8,
    width: "100%"
  },

  roleBtn: {
    flex: 1,
    padding: "10px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#64748b",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s ease"
  },

  roleBtnActive: {
    background: "#1e3a8a",
    color: "white",
    border: "1px solid #1e3a8a"
  },

  roleBtnActiveAdmin: {
    background: "#7f1d1d",
    color: "white",
    border: "1px solid #7f1d1d"
  },

  beamClipWrapper: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "visible" as const,
    pointerEvents: "none" as const
    // clipPath is set dynamically by useEffect / requestAnimationFrame
  },

  titleOverlay: {
    fontSize: "clamp(3.5rem, 8vw, 9rem)",
    fontWeight: 700,
    letterSpacing: "clamp(-3px, -1vw, -7px)",
    fontFamily: "Google Sans Bold, sans-serif",
    color: "#ffffff",
    margin: 0,
    marginBottom: 10,
    padding: 0,
    whiteSpace: "nowrap" as const,
    textAlign: "center" as const
  }
}
