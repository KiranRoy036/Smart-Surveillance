import { motion, type Variants } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { useState } from "react"

export default function Landing() {
  const nav = useNavigate()
  const [hoveredButton, setHoveredButton] = useState<string | null>(null)

  return (
    <div style={styles.wrapper}>
      {/* Video background */}
      <video
        style={styles.video}
        autoPlay
        muted
        loop
        playsInline
      >
        <source src="/videos/16-9.mp4" type="video/mp4" />
      </video>

      <motion.div
        initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        style={styles.center}
      >
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8, ease: "easeOut" }}
          style={styles.title}
        >
          Smart Surveillance
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 0.6, duration: 0.7, ease: "easeOut" }}
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
            style={{
              ...styles.btnPrimary,
              ...(hoveredButton === "admin" ? styles.btnHovered : {}),
              height: hoveredButton === "viewer" ? "40px" : "auto"
            }}
            onMouseEnter={() => setHoveredButton("admin")}
            onMouseLeave={() => setHoveredButton(null)}
            onClick={() => nav("/admin")}
          >
            {hoveredButton === "admin" && (
              <img
                src="/icons/admin.png"
                alt="admin"
                style={{ width: "100px", height: "100px", marginRight: "8px", opacity: 0.5 }}
              />
            )}
            Admin Panel
          </motion.button>

          <motion.button
            variants={pop}
            style={{
              ...styles.btnSecondary,
              ...(hoveredButton === "viewer" ? styles.btnHovered : {}),
              height: hoveredButton === "admin" ? "40px" : "auto"
            }}
            onMouseEnter={() => setHoveredButton("viewer")}
            onMouseLeave={() => setHoveredButton(null)}
            onClick={() => nav("/viewer")}
          >
            {hoveredButton === "viewer" && (
              <img
                src="/icons/bellboy.png"
                alt="viewer"
                style={{ width: "100px", height: "100px", marginRight: "8px", opacity: 0.5 }}
              />
            )}
            Viewer Mode
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  )
}

const pop: Variants = {
  hidden: { opacity: 0, scale: 0.8, y: 20 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" }
  }
}

const styles: any = {
  wrapper: {
    height: "100vh",
    background: "#020617",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    color: "white",
    fontFamily: "Inter, system-ui"
  },

  video: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    zIndex: 0
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
    fontSize: "9rem",
    fontWeight: 700,

    letterSpacing: "-5px",
    marginBottom: 10,
    fontFamily: "Rinter, sans-serif"
  },

  subtitle: {
    marginBottom: 40,
    fontSize: "1.2rem"
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
    padding: "24px 56px",
    borderRadius: 14,
    border: "none",
    background: "linear-gradient(135deg, #c20000 0%, #ff1744 100%)",
    color: "white",
    fontSize: "1.3rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    transition: "all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)"
  },

  btnSecondary: {
    padding: "24px 56px",
    borderRadius: 14,
    border: "none",
    background: "linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)",
    color: "white",
    fontSize: "1.3rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    transition: "all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)"
  },

  btnHovered: {
    transform: "scale(1.25)",
    padding: "32px 68px",
    background: "linear-gradient(135deg, #1f2937 0%, #111827 100%)"
  }
}
