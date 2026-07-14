import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import CameraFeed from "../components/CameraFeed";

type Camera = {
  id: string;
  name: string;
  scenario: string;
};

export default function Viewer() {

  // temporary mock cameras
  const cameras: Camera[] = [
    { id: "cam1", name: "Entrance", scenario: "behavior" },
    { id: "cam2", name: "Parking", scenario: "metro_line" },
    { id: "cam3", name: "Lobby", scenario: "behavior" },
    { id: "cam4", name: "Backyard", scenario: "metro_line" }
  ];

  const [selected, setSelected] = useState<Camera | null>(null);
  const [tokens, setTokens] = useState<Record<string, string>>({}); // map cameraId->token

  // Ensure page background matches viewer container (hide decorative blobs)
  React.useEffect(() => {
    const prevBg = document.body.style.background;
    document.body.style.background = "#e6e4f4";
    const blobs = Array.from(document.querySelectorAll('.bg-blob')) as HTMLElement[];
    const prevDisplays = blobs.map(b => b.style.display || "");
    blobs.forEach(b => b.style.display = "none");
    return () => {
      document.body.style.background = prevBg;
      blobs.forEach((b, i) => b.style.display = prevDisplays[i]);
    };
  }, []);

  // helper functions to start/stop processing for a given camera
  const startStream = (cam: Camera) => {
    if (tokens[cam.id]) return; // already running
    const tok = crypto.randomUUID();
    setTokens(prev => ({ ...prev, [cam.id]: tok }));
    return tok;
  };

  const stopStream = (camId: string) => {
    const tok = tokens[camId];
    if (tok) {
      fetch(`http://127.0.0.1:8000/stop?token=${tok}`, { method: "POST" }).catch(() => { });
      setTokens(prev => {
        const p = { ...prev };
        delete p[camId];
        return p;
      });
    }
  };

  // if the component unmounts while streams are active, make sure they're
  // torn down to avoid lingering work on the backend.
  useEffect(() => {
    return () => {
      Object.values(tokens).forEach(tok => {
        fetch(`http://127.0.0.1:8000/stop?token=${tok}`, { method: "POST" }).catch(() => { });
      });
    };
  }, [tokens]);

  // ---------------- SINGLE CAMERA VIEW ----------------
  if (selected) {
    const currentToken = tokens[selected.id] || null;
    return (
      <div style={styles.fullscreen}>
        <div style={styles.topbar}>
          <button
            style={styles.backBtn}
            onClick={() => {
              if (currentToken) stopStream(selected.id);
              setSelected(null);
            }}
          >
            ← Back to grid
          </button>
          <span style={styles.title}>{selected.name}</span>
          <button
            style={styles.streamBtn}
            onClick={() => {
              if (currentToken) {
                stopStream(selected.id);
              } else {
                startStream(selected);
              }
            }}
          >
            {currentToken ? "Stop" : "Start"}
          </button>
        </div>

        <div style={styles.singleFeed}>
          <CameraFeed scenario={selected.scenario} token={currentToken} />
        </div>
      </div>
    );
  }

  // ---------------- GRID VIEW ----------------
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      style={styles.container}
    >
      <h1 style={styles.heading}>Live Monitoring</h1>

      <div style={styles.grid}>
        {cameras.map(cam => {
          const running = Boolean(tokens[cam.id]);
          return (
            <div
              key={cam.id}
              style={styles.card}
              onClick={() => {
                // open and also ensure processing is running
                if (!tokens[cam.id]) startStream(cam);
                setSelected(cam);
              }}
            >
              <div style={styles.cardTitle}>{cam.name}</div>

              {/* start/stop control */}
              <button
                style={styles.streamBtn}
                onClick={e => {
                  e.stopPropagation();
                  running ? stopStream(cam.id) : startStream(cam);
                }}
              >
                {running ? "Stop" : "Start"}
              </button>

              {/* IMPORTANT: No live stream in grid */}
              <div style={styles.feedWrapper}>
                <div style={styles.preview}>
                  Click to open live feed
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* hidden feeds keep connections alive for cameras that are running */}
      {Object.entries(tokens).map(([camId, tok]) => {
        const cam = cameras.find(c => c.id === camId);
        if (!cam) return null;
        return (
          <div key={camId} style={{ display: "none" }}>
            <CameraFeed scenario={cam.scenario} token={tok} />
          </div>
        );
      })}
    </motion.div>
  );
}

const styles: any = {

  container: {
    maxWidth: 1200,
    margin: "0 auto",
    minHeight: "100vh",
    background: "#e6e4f4",
    color: "#374151",
    fontFamily: "Google Sans, Inter, -apple-system, system-ui",
    boxSizing: "border-box",
    padding: "40px"
  },

  heading: {
    marginBottom: 24,
    fontSize: 60,
    fontWeight: 700,
    color: "#1a1a1a",
    paddingLeft: 0,
    textShadow: "2px 2px 4px rgba(0,0,0,0.05)"
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 32
  },

  card: {
    background: "#ffffff",
    borderRadius: 24,
    padding: 24,
    cursor: "pointer",
    border: "none",
    transition: "all 0.2s ease",
    boxShadow: "10px 10px 20px rgba(166, 171, 189, 0.6), -10px -10px 20px #ffffff, inset 2px 2px 8px rgba(255,255,255,0.8), inset -2px -2px 8px rgba(0,0,0,0.05)"
  },

  cardTitle: {
    fontSize: 18,
    marginBottom: 16,
    color: "#1a1a1a",
    fontWeight: 700
  },

  feedWrapper: {
    height: 300,
    overflow: "hidden",
    borderRadius: 16,
    marginTop: 16,
    border: "none",
    boxShadow: "inset 4px 4px 8px rgba(0,0,0,0.05), inset -4px -4px 8px rgba(255,255,255,0.8)"
  },

  preview: {
    height: "100%",
    background: "#f0f0f5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7280",
    fontSize: 15,
    borderRadius: 16,
    padding: 18
  },

  fullscreen: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#e6e4f4"
  },

  topbar: {
    padding: "16px 24px",
    background: "#ffffff",
    display: "flex",
    alignItems: "center",
    gap: 16,
    borderBottom: "none",
    boxShadow: "0 4px 12px rgba(166, 171, 189, 0.3)"
  },

  title: {
    color: "#1a1a1a",
    fontSize: 20,
    fontWeight: 700
  },

  backBtn: {
    background: "#ffffff",
    border: "none",
    color: "#374151",
    padding: "10px 20px",
    borderRadius: 16,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
    transition: "all 0.2s ease",
    boxShadow: "4px 4px 8px rgba(166, 171, 189, 0.6), -4px -4px 8px #ffffff, inset 2px 2px 6px rgba(255,255,255,0.8), inset -2px -2px 6px rgba(0,0,0,0.05)"
  },

  streamBtn: {
    marginLeft: "auto",
    padding: "12px 30px",
    background: "#8b5cf6",
    border: "none",
    borderRadius: 16,
    color: "white",
    cursor: "pointer",
    fontSize: 18,
    fontFamily: "Google Sans, sans-serif",
    fontWeight: "600",
    transition: "all 0.2s ease",
    boxShadow: "6px 6px 16px rgba(139, 92, 246, 0.3), inset 3px 3px 6px rgba(255, 255, 255, 0.4), inset -3px -3px 6px rgba(0, 0, 0, 0.15)"
  },

  singleFeed: {
    flex: 1,
    background: "#e6e4f4",
    padding: 24
  }
};
