import { useState } from "react";
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import CameraFeed from "../components/CameraFeed";

// Custom Slider Component
interface CustomSliderProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  style?: React.CSSProperties;
  showTicks?: boolean;
}

function CustomSlider({ min, max, step, value, onChange, style, showTicks = true }: CustomSliderProps) {
  const range = max - min;
  const progress = ((value - min) / range) * 100;

  // Padding around the visible inner track (prevents it from touching the rounded container edges)
  const padding = 22;
  const trackInset = 12; // additional inset so inner track doesn't sit flush to outer rounded corners

  // Generate tick positions
  const ticks = [];
  for (let i = min; i <= max; i += step) {
    ticks.push(i);
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        ...style
      }}
    >
      {/* Claymorphism slider track */}
      <div
        style={{
          position: "relative",
          height: "70px",
          display: "flex",
          alignItems: "center",
          paddingLeft: `${padding}px`,
          paddingRight: `${padding}px`,
          borderRadius: "30px",
          background: "linear-gradient(145deg, #f4f4ff, #d8d8ff)",
          boxShadow: "12px 12px 24px rgba(0,0,0,0.12), -12px -12px 24px rgba(255,255,255,0.8)"
        }}
      >
        {/* Inner track */}
        <div
          style={{
            position: "absolute",
            left: `${padding + trackInset}px`,
            right: `${padding + trackInset}px`,
            height: "22px",
            background: "#e7e7ff",
            borderRadius: "16px",
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 1,
            boxShadow: "inset 4px 4px 10px rgba(0,0,0,0.12), inset -4px -4px 10px rgba(255,255,255,0.8)"
          }}
        />

        {/* Tick dots */}
        {showTicks &&
          ticks.map((tick) => {
            const tickProgress = ((tick - min) / range) * 100;
            return (
              <div
                key={tick}
                style={{
                  position: "absolute",
                  left: `calc(${padding + trackInset}px + ${tickProgress}% * (100% - ${(padding + trackInset) * 2}px) / 100%)`,
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: "14px",
                  height: "14px",
                  backgroundColor: "#f2f2ff",
                  borderRadius: "50%",
                  border: "1px solid rgba(0,0,0,0.12)",
                  boxShadow: "2px 2px 4px rgba(0,0,0,0.08), -2px -2px 4px rgba(255,255,255,0.9)",
                  zIndex: 2
                }}
              />
            );
          })}

        {/* Active thumb (clay-style) */}
        <div
          style={{
            position: "absolute",
            left: `calc(${padding + trackInset}px + ${progress}% * (100% - ${(padding + trackInset) * 2}px) / 100%)`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "38px",
            height: "38px",
            background: "linear-gradient(145deg, #ffffff, #d0d0ff)",
            borderRadius: "50%",
            zIndex: 3,
            boxShadow: "6px 6px 16px rgba(0,0,0,0.18), -6px -6px 16px rgba(255,255,255,0.85)",
            transition: "left 0.05s ease-out"
          }}
        />

        {/* Hidden input range for interaction */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            top: 0,
            left: 0,
            cursor: "pointer",
            opacity: 0,
            zIndex: 4
          }}
        />
      </div>
    </div>
  );
}

export default function Admin() {
  const [scenario, setScenario] = useState<string | null>(null);
  const [status, setStatus] = useState("Idle");
  const [runningThreshold, setRunningThreshold] = useState(1.5);
  const [loiteringThreshold, setLoiteringThreshold] = useState(10);
  const [activeZones, setActiveZones] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState(0);
  const [peopleCount, setPeopleCount] = useState(0);
  const [safetyScore, setSafetyScore] = useState(100);
  const [activityLevel, setActivityLevel] = useState(0);
  const [events, setEvents] = useState<any[]>([]);
  const [behaviorConf, setBehaviorConf] = useState({ normal: 100, loitering: 0, fast_movement: 0 });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  
  const [activeReport, setActiveReport] = useState<any>(null);
  const dismissedReportsRef = React.useRef<Set<string>>(new Set());
  const [activeEventTab, setActiveEventTab] = useState<'events' | 'alerts'>('events');
  const [eventViewMode, setEventViewMode] = useState<'timeline' | 'source'>('source');

  // Clear stale events from previous sessions on mount
  React.useEffect(() => {
    fetch("http://127.0.0.1:8000/api/clear-events", { method: "POST" }).catch(() => {});
  }, []);

  // Format Unix timestamp using browser local time: "03:09:42 AM"
  const formatEventTime = (ts: number) => {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  React.useEffect(() => {
    const interval = setInterval(() => {
      fetch("http://127.0.0.1:8000/api/stats")
        .then(res => res.json())
        .then(data => {
          setPeopleCount(data.peopleCount || 0);
          setSafetyScore(data.safetyScore != null ? data.safetyScore : 100);
          setActivityLevel(data.activityLevel || 0);
          setEvents(data.events || []);
          setActiveAlerts(data.events ? data.events.filter((e: any) => e.severity === 'error' || e.severity === 'warning').length : 0);
          if (data.behavior) {
            setBehaviorConf(data.behavior || { normal: 100, loitering: 0, fast_movement: 0 });
          }
        })
        .catch(err => console.error("Failed to fetch stats", err));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const [scenarioDropdownOpen, setScenarioDropdownOpen] = useState(false); // track scenario dropdown state
  const [activeScenariosOpen, setActiveScenariosOpen] = useState(false); // track active scenarios badge dropdown
  type Camera = {
    id: string;
    name: string;
    status: string;
    source: string;              // URL used for display (blob or http)
    type: "ip" | "webcam" | "file";
    serverSource?: string;       // path that backend can open (for files)
  };

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [fullScreenCameraId, setFullScreenCameraId] = useState<string | null>(null);
  const [drawingLine, setDrawingLine] = useState(false);
  const [savedCamera, setSavedCamera] = useState<Camera | null>(null);
  const [activeScenarioCamId, setActiveScenarioCamId] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<Record<string, "connecting" | "ok" | "error">>({});
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});
  const [videoDims, setVideoDims] = useState<Record<string, { w: number; h: number }>>({});
  const [streamToken, setStreamToken] = useState<string | null>(null);  // unique token for backend stop

  // Per-camera running state: camera_id -> { scenario, savedCamera }
  const [cameraRunning, setCameraRunning] = useState<Record<string, { scenario: string; saved: Camera }>>({});

  // Inference throttle: 1 = every frame (Quality), 2 = every 2nd (Balanced), 3 = every 3rd (Performance)
  const [inferEvery, setInferEvery] = useState(2);

  const selectedDims = selectedCamera ? videoDims[selectedCamera] : undefined;
  const videoReady = !!selectedDims; // have natural size

  // pause currently playing video when entering draw mode, resume when leaving
  React.useEffect(() => {
    if (drawingLine) {
      const vids = Array.from(document.querySelectorAll<HTMLVideoElement>('video[data-cam-id]'));
      vids.forEach(v => v.pause());
    }
    // do not auto-play when drawingLine turns false; user can manually resume
  }, [drawingLine]);

  const handleLogout = () => {
    // simple logout: navigate to home / login
    window.location.href = "/";
  };

  // make sure any playing videos are paused when the scenario stops; this is
  // mostly defensive since the camera object itself will be replaced (which
  // should change the src), but pausing avoids transient motion and gives
  // better feedback to the user.
  React.useEffect(() => {
    if (status === "Idle") {
      const vids = Array.from(document.querySelectorAll<HTMLVideoElement>('video[data-cam-id]'));
      vids.forEach(v => v.pause());
    }
  }, [status]);
  const [showAddCameraModal, setShowAddCameraModal] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [newCameraName, setNewCameraName] = useState("");
  const [newCameraSource, setNewCameraSource] = useState("");
  const [newCameraType, setNewCameraType] = useState<"ip" | "webcam" | "file">("ip");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // scenario-specific helper state
  const [linePoints, setLinePoints] = useState<Array<{ x: number; y: number }>>([]);
  const [restrictedPoint, setRestrictedPoint] = useState<{ x: number; y: number } | null>(null);

  // zone drawing state
  const [drawingZone, setDrawingZone] = useState(false);
  const [zonePoints, setZonePoints] = useState<Array<{ x: number; y: number }>>([]);
  const [zoneClosed, setZoneClosed] = useState(false);

  const handleStartScenario = async () => {
    if (!scenario) return;

    // guard missing scenario config
    if (scenario === "metro_line") {
      if (linePoints.length < 2 || !restrictedPoint) {
        alert("Please draw the safety line (two clicks) and select a restricted-side point before starting.");
        return;
      }
    }
    if (scenario === "zone_detection") {
      if (zonePoints.length < 3 || !zoneClosed) {
        alert("Please draw and close a zone (minimum 3 points) before starting.");
        return;
      }
    }

    if (status === "Running") {
      // ── STOP: tell backend to stop this camera's worker ──────────────────
      if (activeScenarioCamId) {
        fetch(`http://127.0.0.1:8000/cameras/stop?camera_id=${activeScenarioCamId}`, { method: "POST" })
          .catch(() => { });
      }
      // also signal legacy stop if token exists (backward compat)
      if (streamToken) {
        fetch(`http://127.0.0.1:8000/stop?token=${streamToken}`, { method: "POST" })
          .catch(() => { });
        setStreamToken(null);
      }

      setStatus("Idle");
      let updatedList = cameras;
      if (savedCamera && activeScenarioCamId) {
        updatedList = cameras.map(c =>
          c.id === activeScenarioCamId ? savedCamera : c
        );
        setCameras(updatedList);
      }
      setSavedCamera(null);
      setActiveScenarioCamId(null);
      setSelectedCamera(updatedList.length ? updatedList[0].id : null);
      setLinePoints([]);
      setRestrictedPoint(null);
      setZonePoints([]);
      setZoneClosed(false);
      setDrawingZone(false);
      setScenario(null);
      setStreamStatus({});
      return;
    }

    // ── START: resolve video param, then call /cameras/start ──────────────
    setStatus("Running");
    setDrawingLine(false);
    setDrawingZone(false);
    
    if (selectedCamera) {
      dismissedReportsRef.current.delete(selectedCamera);
    }

    const cam = cameras.find(c => c.id === selectedCamera);
    if (!cam) return;

    if (cam.type === "file" && !cam.serverSource && !cam.source.startsWith("blob:")) {
      alert("Please upload the video file via the upload button before starting a scenario.");
      setStatus("Idle");
      return;
    }

    // Resolve server-side video path
    let videoParam: string | undefined;
    if (cam.type === "file") {
      if (cam.serverSource) {
        videoParam = cam.serverSource;
      } else if (cam.source.startsWith("blob:")) {
        try {
          const blobResp = await fetch(cam.source);
          const blob = await blobResp.blob();
          const file = new File([blob], cam.name);
          const form = new FormData();
          form.append("file", file);
          const resp = await fetch("http://127.0.0.1:8000/upload", { method: "POST", body: form });
          const data = await resp.json();
          videoParam = data.location;
          setCameras(prev => prev.map(c => c.id === cam.id ? { ...c, serverSource: videoParam } : c));
        } catch (err) {
          console.error("failed to upload blob video", err);
        }
      } else {
        videoParam = cam.source;
      }
    } else if (cam.source) {
      videoParam = cam.source;
    }

    // Build the /cameras/start request body
    // camera_id IS the cam.id — we use the same UUID to key the worker
    // so /cameras/stream/{cam.id} gives us the MJPEG for this specific camera
    const body: Record<string, string | undefined> = {
      camera_id: cam.id,
      scenario,
      video: videoParam,
    };
    if (scenario === "metro_line" && linePoints.length === 2 && restrictedPoint) {
      const [p1, p2] = linePoints;
      body.line = `${p1.x},${p1.y},${p2.x},${p2.y}`;
      body.restricted_point = `${restrictedPoint.x},${restrictedPoint.y}`;
    }
    if (scenario === "zone_detection" && zonePoints.length >= 3) {
      body.zone = zonePoints.map(p => `${p.x},${p.y}`).join(";");
    }

    try {
      const resp = await fetch("http://127.0.0.1:8000/cameras/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const err = await resp.json();
        alert(`Failed to start camera: ${err.detail}`);
        setStatus("Idle");
        return;
      }
    } catch (err) {
      console.error("cameras/start failed", err);
      setStatus("Idle");
      return;
    }

    // Point the camera tile at the per-camera MJPEG stream endpoint
    const streamUrl = `http://127.0.0.1:8000/cameras/stream/${cam.id}`;
    console.log("Multi-cam stream:", streamUrl);

    setSavedCamera(cam);
    setActiveScenarioCamId(cam.id);
    setStreamStatus(prev => ({ ...prev, [cam.id]: "connecting" }));
    const updated: Camera = { ...cam, source: streamUrl, type: "ip", name: "Scenario Output" };
    setCameras(prev => prev.map(c => (c.id === cam.id ? updated : c)));
    setSelectedCamera(cam.id);
  };

  // Per-camera start/stop — independent of the global status/scenario
  const handleStartCameraScenario = async (cam: Camera) => {
    if (!scenario) {
      alert("Please select a scenario first.");
      return;
    }

    // If this specific camera is already running, stop it
    if (cameraRunning[cam.id]) {
      fetch(`http://127.0.0.1:8000/cameras/stop?camera_id=${cam.id}`, { method: "POST" }).catch(() => { });
      const saved = cameraRunning[cam.id].saved;
      setCameras(prev => prev.map(c => c.id === cam.id ? saved : c));
      setCameraRunning(prev => { const n = { ...prev }; delete n[cam.id]; return n; });
      return;
    }

    dismissedReportsRef.current.delete(cam.id);

    // Guard scenario-specific requirements
    if (scenario === "metro_line" && (linePoints.length < 2 || !restrictedPoint)) {
      alert("Draw the line and restricted point first.");
      return;
    }
    if (scenario === "zone_detection" && (zonePoints.length < 3 || !zoneClosed)) {
      alert("Draw and close a zone first.");
      return;
    }

    // Resolve video param
    let videoParam: string | undefined;
    if (cam.type === "file") {
      if (cam.serverSource) {
        videoParam = cam.serverSource;
      } else if (cam.source.startsWith("blob:")) {
        try {
          const blobResp = await fetch(cam.source);
          const blob = await blobResp.blob();
          const file = new File([blob], cam.name);
          const form = new FormData();
          form.append("file", file);
          const resp = await fetch("http://127.0.0.1:8000/upload", { method: "POST", body: form });
          const data = await resp.json();
          videoParam = data.location;
          setCameras(prev => prev.map(c => c.id === cam.id ? { ...c, serverSource: videoParam } : c));
        } catch (err) { console.error("upload failed", err); }
      } else {
        videoParam = cam.source;
      }
    } else if (cam.source) {
      videoParam = cam.source;
    }

    const body: Record<string, string | number | undefined> = {
      camera_id: cam.id,
      scenario,
      video: videoParam,
      infer_every: inferEvery,
    };
    if (scenario === "metro_line" && linePoints.length === 2 && restrictedPoint) {
      const [p1, p2] = linePoints;
      body.line = `${p1.x},${p1.y},${p2.x},${p2.y}`;
      body.restricted_point = `${restrictedPoint.x},${restrictedPoint.y}`;
    }
    if (scenario === "zone_detection" && zonePoints.length >= 3) {
      body.zone = zonePoints.map(p => `${p.x},${p.y}`).join(";");
    }

    try {
      const resp = await fetch("http://127.0.0.1:8000/cameras/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const err = await resp.json();
        alert(`Failed to start: ${err.detail}`);
        return;
      }
    } catch (err) {
      console.error("cameras/start failed", err);
      return;
    }

    const streamUrl = `http://127.0.0.1:8000/cameras/stream/${cam.id}`;
    setCameraRunning(prev => ({ ...prev, [cam.id]: { scenario, saved: cam } }));
    setStreamStatus(prev => ({ ...prev, [cam.id]: "connecting" }));
    setCameras(prev => prev.map(c => c.id === cam.id
      ? { ...c, source: streamUrl, type: "ip" as const, name: `[${scenario}] ${c.name}` }
      : c
    ));
  };

  const handleAddCamera = () => {
    if (newCameraName.trim() && newCameraSource.trim()) {
      const newCamera = {
        id: `camera_${Date.now()}`,
        name: newCameraName,
        status: "Active",
        source: newCameraSource,
        type: newCameraType
      };
      setCameras([...cameras, newCamera]);
      setSelectedCamera(newCamera.id);
      setNewCameraName("");
      setNewCameraSource("");
      setNewCameraType("ip");
      setShowAddCameraModal(false);
    }
  };

  // Shared helper: DOM click → video pixel coords
  const getCoordsFromClick = (
    e: React.MouseEvent<HTMLDivElement>,
    cam: Camera
  ): { x: number; y: number } | null => {
    if (!videoDims[cam.id]) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const dims = videoDims[cam.id];
    const vw = dims.w, vh = dims.h;
    const scale = Math.min(rect.width / vw, rect.height / vh);
    const contentW = vw * scale, contentH = vh * scale;
    const offsetX = (rect.width - contentW) / 2;
    const offsetY = (rect.height - contentH) / 2;
    let cx = e.clientX - rect.left - offsetX;
    let cy = e.clientY - rect.top - offsetY;
    cx = Math.max(0, Math.min(contentW, cx));
    cy = Math.max(0, Math.min(contentH, cy));
    return { x: Math.round(cx * (vw / contentW)), y: Math.round(cy * (vh / contentH)) };
  };

  const handleVideoClick = (
    e: React.MouseEvent<HTMLDivElement>,
    cam: Camera
  ) => {
    if (selectedCamera !== cam.id || cam.id === activeScenarioCamId) return;

    // Line drawing
    if (scenario === "metro_line" && drawingLine) {
      const pt = getCoordsFromClick(e, cam);
      if (!pt) return;
      if (linePoints.length < 2) {
        setLinePoints([...linePoints, pt]);
      } else if (!restrictedPoint) {
        setRestrictedPoint(pt);
        setDrawingLine(false);
      }
      return;
    }

    // Zone drawing
    if (scenario === "zone_detection" && drawingZone && !zoneClosed) {
      const pt = getCoordsFromClick(e, cam);
      if (!pt) return;
      setZonePoints(prev => [...prev, pt]);
      return;
    }
  };

  const handleVideoRightClick = (
    e: React.MouseEvent<HTMLDivElement>,
    cam: Camera
  ) => {
    e.preventDefault();
    if (scenario === "zone_detection" && drawingZone && zonePoints.length >= 3) {
      setZoneClosed(true);
      setDrawingZone(false);
    }
  };

  const handleUploadVideo = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileURL = URL.createObjectURL(file);

    // upload the file so backend can access it for scenario processing
    const form = new FormData();
    form.append("file", file);
    let serverPath: string | undefined;
    try {
      const resp = await fetch("http://127.0.0.1:8000/upload", {
        method: "POST",
        body: form,
      });
      const data = await resp.json();
      serverPath = data.location;
    } catch (err) {
      console.error("upload failed", err);
    }

    const newCamera: Camera = {
      id: `camera_${Date.now()}`,
      name: file.name,
      status: "Video File",
      source: fileURL,
      type: "file",
      serverSource: serverPath,
    };
    setCameras([...cameras, newCamera]);
    setSelectedCamera(newCamera.id);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveCamera = (id: string) => {
    const filtered = cameras.filter(cam => cam.id !== id);
    setCameras(filtered);
    if (selectedCamera === id) {
      setSelectedCamera(filtered.length > 0 ? filtered[0].id : null);
    }
  };

  const getGridCols = () => {
    const count = fullScreenCameraId ? 1 : cameras.length + 1;
    if (count === 0 || count === 1) return 1;
    if (count === 2) return 2;
    if (count === 3) return 3;
    if (count === 4) return 2;
    return 3;
  };

  const renderCameraFeed = (camera: Camera) => {
    // common click handler and cursor style
    const isInteractive =
      (scenario === "metro_line" || scenario === "zone_detection") &&
      selectedCamera === camera.id &&
      camera.id !== activeScenarioCamId;

    const baseCursor = isInteractive ? "crosshair" : "default";

    const clickProps = {
      onClick: (e: React.MouseEvent<HTMLDivElement>) => handleVideoClick(e, camera),
    };

    // aspect ratio for this camera
    // until we know the real ratio default to square to avoid jumps
    const ratio = aspectRatios[camera.id] || 1;

    const wrapperStyle: React.CSSProperties = {
      width: "100%",
      position: "relative",
      aspectRatio: ratio,
      background: "black",
    };

    // helper that wraps content in a clickable overlay when in draw mode
    const withOverlay = (content: React.ReactNode) => {
      let wrapped = content;
      if ((drawingLine || drawingZone) && isInteractive) {
        wrapped = (
          <div style={{ position: "relative" }}>
            {content}
            <div
              style={{ position: "absolute", inset: 0, cursor: "crosshair" }}
              onClick={(e) => handleVideoClick(e as any, camera)}
              onContextMenu={(e) => handleVideoRightClick(e as any, camera)}
            />
          </div>
        );
      }
      // add SVG overlays (line + zone) always if we have video dims
      const dims = videoDims[camera.id];
      if (dims) {
        const makePct = (val: number, dim: number) => (val / dim) * 100;
        // Line overlay
        const linesPct = linePoints.map(p => ({
          x: makePct(p.x, dims.w),
          y: makePct(p.y, dims.h),
        }));
        const restrictedPct = restrictedPoint
          ? { x: makePct(restrictedPoint.x, dims.w), y: makePct(restrictedPoint.y, dims.h) }
          : null;
        // Zone overlay
        const zonePct = zonePoints.map(p => ({
          x: makePct(p.x, dims.w),
          y: makePct(p.y, dims.h),
        }));
        const zonePolyPts = zonePct.map(p => `${p.x}% ${p.y}%`).join(", ");

        wrapped = (
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            {wrapped}
            <svg
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {/* Line crossing overlay */}
              {linesPct.length >= 2 && (
                <line
                  x1={linesPct[0].x} y1={linesPct[0].y}
                  x2={linesPct[1].x} y2={linesPct[1].y}
                  stroke="#f59e0b" strokeWidth="0.6" // slightly thicker line
                />
              )}
              {linesPct.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="1.2" fill="#f59e0b" /> // larger anchor points
              ))}
              {restrictedPct && (
                <circle cx={restrictedPct.x} cy={restrictedPct.y} r="1.8" fill="#ef4444" /> // bigger restricted point
              )}
              {/* Zone overlay */}
              {zonePct.length >= 2 && !zoneClosed && zonePct.map((p, i) => {
                if (i === 0) return null;
                return (
                  <line
                    key={i}
                    x1={zonePct[i - 1].x} y1={zonePct[i - 1].y}
                    x2={p.x} y2={p.y}
                    stroke="#f97316" strokeWidth="0.6" strokeDasharray="1,0.5" // thicker zonal edge
                  />
                );
              })}
              {zonePct.map((p, i) => (
                <circle key={`zp-${i}`} cx={p.x} cy={p.y} r="1.2" fill="#f97316" />
              ))}
              {zoneClosed && zonePct.length >= 3 && (
                <polygon
                  points={zonePolyPts}
                  fill="rgba(239,68,68,0.25)"
                  stroke="#ef4444"
                  strokeWidth="0.6" // thicker closed zone border
                />
              )}
            </svg>
          </div>
        );
      }
      return wrapped;
    };

    // if this is a backend MJPEG stream, use <img> since <video> cannot handle
    // multipart/x-mixed-replace type
    if (
      camera.source.startsWith("http") &&
      camera.source.includes("/stream/") || camera.source.includes("/cameras/stream/")
    ) {
      // show status overlays for connecting/error
      const status = streamStatus[camera.id];
      return withOverlay(
        <div style={wrapperStyle}>
          {!videoReady && (
            <div style={{ ...styles.overlay, visibility: "visible" }}>
              Loading video…
            </div>
          )}
          {status === "connecting" && (
            <div style={styles.overlay}>Connecting…</div>
          )}
          {status === "error" && (
            <div style={styles.overlay}>Stream error – check console/server log</div>
          )}
          <img
            key={camera.id}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              cursor: baseCursor,
            }}
            src={camera.source}
            onLoad={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              if (img.naturalWidth && img.naturalHeight) {
                setAspectRatios(prev => ({
                  ...prev,
                  [camera.id]: img.naturalWidth / img.naturalHeight,
                }));
                setVideoDims(prev => ({
                  ...prev,
                  [camera.id]: { w: img.naturalWidth, h: img.naturalHeight },
                }));
              }
              setStreamStatus(prev => ({ ...prev, [camera.id]: "ok" }));
            }}
            onError={() => setStreamStatus(prev => ({ ...prev, [camera.id]: "error" }))}
          />
        </div>
      );
    }

    // For IP cameras (RTMP/HLS streams)
    if (camera.type === "ip" && camera.source.startsWith("http")) {
      return withOverlay(
        <div style={wrapperStyle}>
          <video
            key={camera.id}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
            controls={!drawingLine}
            autoPlay
            muted
            src={camera.source}
            onLoadedMetadata={(e) => {
              const vid = e.currentTarget as HTMLVideoElement;
              if (vid.videoWidth && vid.videoHeight) {
                setAspectRatios(prev => ({
                  ...prev,
                  [camera.id]: vid.videoWidth / vid.videoHeight,
                }));
              }
            }}
          />
        </div>
      );
    }
    // For webcam or live feeds
    if (camera.type === "webcam") {
      return (
        <div style={styles.cameraFeedContent} {...clickProps}>
          <div style={{ fontSize: "24px", marginBottom: "10px" }}></div>
          <p style={styles.cameraStatus}>{camera.source}</p>
        </div>
      );
    }
    // For uploaded video files
    if (camera.type === "file") {
      return withOverlay(
        <div style={wrapperStyle}>
          {!videoReady && (
            <div style={{ ...styles.overlay, visibility: "visible" }}>
              Loading video…
            </div>
          )}
          <video
            key={camera.id}
            data-cam-id={camera.id}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
            controls={!drawingLine}
            autoPlay={!drawingLine}
            loop
            src={camera.source}
            onLoadedMetadata={(e) => {
              const vid = e.currentTarget as HTMLVideoElement;
              if (vid.videoWidth && vid.videoHeight) {
                setAspectRatios(prev => ({
                  ...prev,
                  [camera.id]: vid.videoWidth / vid.videoHeight,
                }));
                setVideoDims(prev => ({
                  ...prev,
                  [camera.id]: { w: vid.videoWidth, h: vid.videoHeight },
                }));
              }
            }}
          />
        </div>
      );
    }
    return withOverlay(
      <div style={styles.cameraFeedContent}>
        <div style={styles.cameraIcon}></div>
        <p style={styles.cameraStatus}>{camera.status}</p>
      </div>
    );
  };

  // Threat Assessment Radar Calculation
  // Count loitering and running events from the event log for radar
  const loiteringEventCount = events.filter((e: any) => e.message && e.message.toLowerCase().includes('loiter')).length;
  const runningEventCount   = events.filter((e: any) => e.message && e.message.toLowerCase().includes('running')).length;
  const alertEventCount     = events.filter((e: any) => e.severity === 'error' || e.severity === 'warning').length;

  const threatStats = [
    Math.max(5, Math.min(100, (peopleCount / 20) * 100)),                           // Crowd density
    Math.max(5, activityLevel),                                                       // Activity
    Math.max(5, Math.min(100, alertEventCount * 10)),                                 // Alerts (event-based)
    Math.max(5, Math.min(100, behaviorConf.loitering || loiteringEventCount * 15)),  // Loitering
    Math.max(5, Math.min(100, behaviorConf.fast_movement || runningEventCount * 15)) // Erratic/Running
  ];

  const radarPoints = threatStats.map((val, i) => {
    // 5 points in a full 360 circle. Start at top: -90 degrees (-pi/2)
    const angle = (Math.PI * -0.5) + (i * ((Math.PI * 2) / 5));
    const px = 100 + val * Math.cos(angle);
    const py = 100 + val * Math.sin(angle);
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  });
  const polygonPoints = radarPoints.join(' ');

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", overflow: "hidden", background: "#e6e4f4", fontFamily: "Google Sans Medium", color: "#374151" }}>

      <style>{`
        button {
          transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s ease;
        }
        button:active {
          transform: scale(0.92);
          transition: transform 0.1s ease;
        }
        /* Hide scrollbar for cleaner look */
        ::-webkit-scrollbar {
          width: 8px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.1);
          border-radius: 4px;
        }
      `}</style>

      {/* SCROLL TRANSITION TOP BAR */}
      <div 
        style={{
          position: "fixed",
          top: 0, left: 0, right: 0,
          height: "80px",
          background: scrolled ? "rgba(255, 255, 255, 0.85)" : "transparent",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(12px)" : "none",
          boxShadow: scrolled ? "0 4px 20px rgba(0,0,0,0.05)" : "none",
          zIndex: 900,
          transition: "all 0.3s ease",
          pointerEvents: "none"
        }}
      />

      {/* ALWAYS VISIBLE LOGO (absolute/fixed) */}
      <div 
        style={{ ...styles.sidebarLogoWrapper, position: "fixed", top: "24px", left: "24px", zIndex: 1000, cursor: "pointer", paddingLeft: 0, marginBottom: 0 }}
        onClick={(e) => { e.stopPropagation(); setIsSidebarOpen(!isSidebarOpen); }}
      >
        <div style={styles.sidebarLogoIcon}>🛡️</div>
        <span style={styles.sidebarLogoText}>VisionAI</span>
      </div>

      {/* SLIDING SIDEBAR OVERLAY */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ x: -250 }}
            animate={{ x: 0 }}
            exit={{ x: -250 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            style={{
              position: "fixed",
              top: 0, bottom: 0, left: 0,
              width: "250px",
              background: "#ffffff",
              padding: "90px 20px 24px 20px", // top padding enough to clear the fixed logo
              boxShadow: "10px 0px 20px rgba(166, 171, 189, 0.3)",
              zIndex: 999,
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()} // Prevent clicking within menu from closing it
          >
            <div style={styles.sidebarNav}>
              <div style={{ ...styles.sidebarNavItem, ...styles.sidebarNavItemActive }}>
                <span style={{ marginRight: "12px" }}></span> Dashboard
              </div>
              <div style={styles.sidebarNavItem}>
                <span style={{ marginRight: "12px" }}></span> AI Insights
              </div>
              <div style={styles.sidebarNavItem}>
                <span style={{ marginRight: "12px" }}></span> Incidents
              </div>
              <div style={styles.sidebarNavItem}>
                <span style={{ marginRight: "12px" }}></span> Reports
              </div>
              <div style={styles.sidebarNavItem}>
                <span style={{ marginRight: "12px" }}></span> Settings
              </div>
            </div>

            <div style={styles.sidebarBottom}>
              <div style={styles.sidebarNavItem}>
                <span style={{ marginRight: "12px" }}></span> Support
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN CONTENT AREA */}
      <motion.div
        onClick={() => setIsSidebarOpen(false)} // Clicking outside closes the drawer
        onScroll={(e) => setScrolled((e.target as HTMLElement).scrollTop > 20)}
        initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        style={{ ...styles.pageContent, zIndex: 1, paddingLeft: isSidebarOpen ? "274px" : "24px", paddingTop: "80px", transition: "padding-left 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)" }}
      >
        {/* HEADER */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Smart Surveillance System</h1>
            <p style={styles.subtitle}>Real-time video analysis and event detection</p>
          </div>
          <div style={{ ...styles.headerRight, position: "relative" }}>
            <button style={{
              ...styles.badge,
              background: (status === "Running" || Object.keys(cameraRunning).length > 0) ? "#16a34a" : "#dc2626",
              color: "#ffffff"
            }} onClick={() => setActiveScenariosOpen(!activeScenariosOpen)}>
              {(status === "Running" || Object.keys(cameraRunning).length > 0) ? "Active ▼" : "Inactive"}
            </button>

            <AnimatePresence>
              {activeScenariosOpen && (Object.keys(cameraRunning).length > 0 || status === "Running") && (
                <motion.div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: "100px", /* align under badge roughly */
                    marginTop: "12px",
                    background: "#ffffff",
                    borderRadius: "20px",
                    padding: "16px",
                    minWidth: "250px",
                    zIndex: 9999,
                    boxShadow: "10px 10px 20px rgba(166, 171, 189, 0.6), -10px -10px 20px #ffffff, inset 2px 2px 8px rgba(255,255,255,0.8), inset -2px -2px 8px rgba(0,0,0,0.05)",
                  }}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <div style={{ fontWeight: 700, marginBottom: "12px", color: "#1a1a1a", fontSize: "16px" }}>Active Analysis</div>

                  {Object.keys(cameraRunning).length === 0 && status === "Running" && activeScenarioCamId && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", padding: "10px", background: "#f8f8f8", borderRadius: "12px", boxShadow: "inset 4px 4px 8px rgba(0,0,0,0.05), inset -4px -4px 8px rgba(255,255,255,0.8)" }}>
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a" }}>Global Scenario</div>
                        <div style={{ fontSize: "12px", color: "#6b7280" }}>{scenario}</div>
                      </div>
                      <button
                        style={{
                          padding: "6px 12px",
                          borderRadius: "10px",
                          border: "none",
                          background: "#ef4444",
                          color: "white",
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: "pointer",
                          boxShadow: "4px 4px 10px rgba(239, 68, 68, 0.3), -4px -4px 10px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.15)",
                        }}
                        onClick={handleStartScenario}
                      >
                        ■ Stop
                      </button>
                    </div>
                  )}

                  {Object.entries(cameraRunning).map(([camId, runData]) => {
                    const cam = cameras.find(c => c.id === camId) || runData.saved;
                    return (
                      <div key={camId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", padding: "10px", background: "#f8f8f8", borderRadius: "12px", boxShadow: "inset 4px 4px 8px rgba(0,0,0,0.05), inset -4px -4px 8px rgba(255,255,255,0.8)" }}>
                        <div style={{ marginRight: "12px", overflow: "hidden" }}>
                          <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "120px" }}>{cam.name}</div>
                          <div style={{ fontSize: "12px", color: "#6b7280" }}>{runData.scenario}</div>
                        </div>
                        <button
                          style={{
                            padding: "6px 12px",
                            borderRadius: "10px",
                            border: "none",
                            background: "#ef4444",
                            color: "white",
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: "pointer",
                            boxShadow: "4px 4px 10px rgba(239, 68, 68, 0.3), -4px -4px 10px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.15)",
                          }}
                          onClick={() => handleStartCameraScenario(cam)}
                        >
                          ■ Stop
                        </button>
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            <button style={styles.badge} onClick={handleLogout}>Logout</button>
          </div>
        </div>

        {/* MAIN LAYOUT GRID (2 Columns: Left content, Right sidebar) */}
        <div style={styles.mainGrid}>

          {/* LEFT COLUMN - Video & Analysis */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

            {/* VIDEO PANEL */}
            <div style={styles.videoPanel}>
              <div style={styles.videoPanelHeader}>
                <div style={styles.panelTitle}>
                  {fullScreenCameraId 
                    ? cameras.find(c => c.id === fullScreenCameraId)?.name || 'Camera Feed'
                    : 'Glance Overview'}
                </div>
              </div>

              <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ background: "#f3f4f6", padding: "8px 16px", borderRadius: "20px", fontSize: "13px", fontWeight: 600, color: "#4f46e5" }}>
                  👥 People detected in frame: {peopleCount}
                </div>
              </div>

              {cameras.length === 0 ? (
                <div style={styles.viewer}>
                  <div style={{ ...styles.viewerPlaceholder, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <button
                        onClick={() => setAddMenuOpen(!addMenuOpen)}
                        style={{
                          width: "80px", height: "80px", borderRadius: "50%", background: "#8b5cf6", color: "white",
                          fontSize: "40px", fontWeight: 300, border: "none", cursor: "pointer",
                          boxShadow: "10px 10px 20px rgba(139, 92, 246, 0.4), -10px -10px 20px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.1)",
                          display: "flex", justifyContent: "center", alignItems: "center",
                          transition: "transform 0.2s ease"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"}
                        onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                      >
                        +
                      </button>
                      <AnimatePresence>
                        {addMenuOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: "16px", background: "white", borderRadius: "16px", padding: "12px", boxShadow: "0 15px 35px rgba(0,0,0,0.15)", zIndex: 100, minWidth: "180px", border: "1px solid #e5e7eb" }}
                          >
                            <div
                              onClick={() => { setShowAddCameraModal(true); setAddMenuOpen(false); }}
                              style={{ padding: "12px 16px", cursor: "pointer", fontSize: "14px", fontWeight: 600, color: "#1f2937", borderRadius: "10px", transition: "background 0.2s", display: "flex", alignItems: "center", gap: "10px" }}
                              onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"}
                              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            >
                              <span style={{ fontSize: "18px" }}>📷</span> Add Camera
                            </div>
                            <div
                              onClick={() => { handleUploadVideo(); setAddMenuOpen(false); }}
                              style={{ padding: "12px 16px", cursor: "pointer", fontSize: "14px", fontWeight: 600, color: "#1f2937", borderRadius: "10px", transition: "background 0.2s", display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}
                              onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"}
                              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            >
                              <span style={{ fontSize: "18px" }}>📁</span> Upload Video
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <p style={{ ...styles.placeholderText, marginTop: "24px", color: "#6b7280" }}>Add Feed</p>
                    <p style={styles.placeholderSubtext}>Choose a camera or upload a video to begin monitoring</p>
                  </div>
                </div>
              ) : fullScreenCameraId ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <button
                    onClick={() => { setFullScreenCameraId(null); setSelectedCamera(null); }}
                    style={{ alignSelf: "flex-start", padding: "8px 16px", borderRadius: "10px", border: "none", background: "#e0e7ff", color: "#4f46e5", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "4px 4px 8px rgba(0,0,0,0.05)" }}
                  >
                    ← Back to Glance View
                  </button>
                  {cameras.filter(c => c.id === fullScreenCameraId).map(cam => (
                    <div
                      key={cam.id}
                      style={{
                        ...styles.cameraFeed,
                        border: "1px solid transparent"
                      }}
                    >
                      <div style={styles.cameraFeedHeader}>
                        <span style={styles.cameraName}></span>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {scenario && (
                            <button
                              style={{
                                padding: "6px 12px",
                                borderRadius: "10px",
                                border: "none",
                                background: cameraRunning[cam.id] ? "#ef4444" : "#8b5cf6",
                                color: "white",
                                fontWeight: 700,
                                fontSize: 12,
                                cursor: "pointer",
                                boxShadow: cameraRunning[cam.id]
                                  ? "4px 4px 10px rgba(239, 68, 68, 0.3), -4px -4px 10px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.15)"
                                  : "4px 4px 10px rgba(139, 92, 246, 0.3), -4px -4px 10px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.15)",
                                transition: "all 0.2s ease"
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartCameraScenario(cam);
                              }}
                            >
                              {cameraRunning[cam.id] ? "■ Stop" : "▶ Start"}
                            </button>
                          )}
                          <button
                            style={styles.removeButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveCamera(cam.id);
                              setFullScreenCameraId(null);
                            }}
                          >
                            X
                          </button>
                        </div>
                      </div>
                      {renderCameraFeed(cam)}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ ...styles.cameraGrid, gridTemplateColumns: `repeat(${getGridCols()}, 1fr)` }}>
                  {cameras.map(cam => (
                    <div
                      key={cam.id}
                      style={{
                        ...styles.cameraFeed,
                        cursor: "pointer",
                        border: "1px solid transparent",
                        transition: "transform 0.2s ease",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.02)"}
                      onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                      onClick={() => {
                        setSelectedCamera(cam.id);
                        setFullScreenCameraId(cam.id);
                      }}
                    >
                      <div style={styles.cameraFeedHeader}>
                        <span style={styles.cameraName}></span>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {scenario && (
                            <button
                              style={{
                                padding: "6px 12px",
                                borderRadius: "10px",
                                border: "none",
                                background: cameraRunning[cam.id] ? "#ef4444" : "#8b5cf6",
                                color: "white",
                                fontWeight: 700,
                                fontSize: 12,
                                cursor: "pointer",
                                boxShadow: cameraRunning[cam.id]
                                  ? "4px 4px 10px rgba(239, 68, 68, 0.3), -4px -4px 10px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.15)"
                                  : "4px 4px 10px rgba(139, 92, 246, 0.3), -4px -4px 10px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.15)",
                                transition: "all 0.2s ease"
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartCameraScenario(cam);
                              }}
                            >
                              {cameraRunning[cam.id] ? "■ Stop" : "▶ Start"}
                            </button>
                          )}
                          <button
                            style={styles.removeButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveCamera(cam.id);
                            }}
                          >
                            X
                          </button>
                        </div>
                      </div>
                      {renderCameraFeed(cam)}
                    </div>
                  ))}

                  {/* The visually balanced Add Feed Card for the Grid */}
                  <div
                    style={{
                      ...styles.cameraFeed,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      minHeight: "200px",
                      border: "2px dashed #d1d5db",
                      background: "transparent",
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setAddMenuOpen(!addMenuOpen); }}
                        style={{
                          width: "60px", height: "60px", borderRadius: "50%", background: "#8b5cf6", color: "white",
                          fontSize: "30px", fontWeight: 300, border: "none", cursor: "pointer",
                          boxShadow: "10px 10px 20px rgba(139, 92, 246, 0.3), -10px -10px 20px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.1)",
                          display: "flex", justifyContent: "center", alignItems: "center",
                          transition: "transform 0.2s ease"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"}
                        onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                      >
                        +
                      </button>
                      <AnimatePresence>
                        {addMenuOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: "16px", background: "white", borderRadius: "16px", padding: "12px", boxShadow: "0 15px 35px rgba(0,0,0,0.15)", zIndex: 100, minWidth: "180px", border: "1px solid #e5e7eb" }}
                          >
                            <div
                              onClick={(e) => { e.stopPropagation(); setShowAddCameraModal(true); setAddMenuOpen(false); }}
                              style={{ padding: "12px 16px", cursor: "pointer", fontSize: "14px", fontWeight: 600, color: "#1f2937", borderRadius: "10px", transition: "background 0.2s", display: "flex", alignItems: "center", gap: "10px" }}
                              onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"}
                              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            >
                              <span style={{ fontSize: "18px" }}>📷</span> Add Camera
                            </div>
                            <div
                              onClick={(e) => { e.stopPropagation(); handleUploadVideo(); setAddMenuOpen(false); }}
                              style={{ padding: "12px 16px", cursor: "pointer", fontSize: "14px", fontWeight: 600, color: "#1f2937", borderRadius: "10px", transition: "background 0.2s", display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}
                              onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"}
                              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            >
                              <span style={{ fontSize: "18px" }}>📁</span> Upload Video
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <div style={{ marginTop: "16px", color: "#6b7280", fontWeight: 600, fontSize: "14px" }}>Add Feed</div>
                  </div>
                </div>
              )}
            </div>



            {/* BOTTOM LEFT ANALYSIS CARDS */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              <div style={styles.monitorZonesSection}>
                <div style={{ fontSize: "18px", fontWeight: 700 }}>Threat Assessment</div>
                <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "20px" }}>AI generated risk vectors</div>

                {/* Radar Chart Live */}
                <div style={{ height: "240px", display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
                  {/* Full circle radar background rings */}
                  <div style={{ width: "200px", height: "200px", borderRadius: "50%", border: "1px solid #e5e7eb", position: "absolute" }} />
                  <div style={{ width: "150px", height: "150px", borderRadius: "50%", border: "1px solid #e5e7eb", position: "absolute" }} />
                  <div style={{ width: "100px", height: "100px", borderRadius: "50%", border: "1px solid #e5e7eb", position: "absolute" }} />
                  <div style={{ width: "50px", height: "50px", borderRadius: "50%", border: "1px solid #e5e7eb", position: "absolute" }} />

                  {/* Axis lines */}
                  <svg width="200" height="200" style={{ position: "absolute", zIndex: 1 }}>
                    {Array.from({ length: 5 }).map((_, i) => {
                      const angle = (Math.PI * -0.5) + (i * ((Math.PI * 2) / 5));
                      return (
                        <line 
                          key={i} 
                          x1="100" y1="100" 
                          x2={100 + 100 * Math.cos(angle)} 
                          y2={100 + 100 * Math.sin(angle)} 
                          stroke="#e5e7eb" strokeWidth="1" 
                        />
                      );
                    })}
                  </svg>

                  {/* Radial fill shape live */}
                  <svg width="200" height="200" style={{ position: "absolute", zIndex: 5, transition: "all 0.5s ease" }}>
                    <polygon points={polygonPoints} fill="rgba(139, 92, 246, 0.3)" stroke="#8b5cf6" strokeWidth="2" style={{ transition: "all 0.5s ease" }} />
                  </svg>
                  
                  {/* Vector Labels */}
                  <div style={{ position: "absolute", top: "0px", left: "50%", transform: "translateX(-50%)", fontSize: "11px", fontWeight: 600, color: "#6b7280" }}>Crowd</div>
                  <div style={{ position: "absolute", top: "35%", right: "-5px", fontSize: "11px", fontWeight: 600, color: "#6b7280" }}>Activity</div>
                  <div style={{ position: "absolute", bottom: "0px", right: "15%", fontSize: "11px", fontWeight: 600, color: "#6b7280" }}>Alerts</div>
                  <div style={{ position: "absolute", bottom: "0px", left: "15%", fontSize: "11px", fontWeight: 600, color: "#6b7280" }}>Loitering</div>
                  <div style={{ position: "absolute", top: "35%", left: "-5px", fontSize: "11px", fontWeight: 600, color: "#6b7280" }}>Erratic</div>
                </div>
              </div>

              <div style={styles.monitorZonesSection}>
                <div style={{ fontSize: "18px", fontWeight: 700 }}>Behavioral Confidence</div>
                <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "20px" }}>Model certainty metrics (Live)</div>

                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
                      <span>Normal Activity</span> <span style={{ color: "#8b5cf6" }}>{behaviorConf.normal}%</span>
                    </div>
                    <div style={{ background: "#f3f4f6", height: "8px", borderRadius: "4px", width: "100%" }}>
                      <div style={{ background: "#8b5cf6", height: "100%", borderRadius: "4px", width: `${behaviorConf.normal}%`, transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
                      <span>Suspicious Loitering</span> <span style={{ color: "#8b5cf6" }}>{behaviorConf.loitering}%</span>
                    </div>
                    <div style={{ background: "#f3f4f6", height: "8px", borderRadius: "4px", width: "100%" }}>
                      <div style={{ background: "#a78bfa", height: "100%", borderRadius: "4px", width: `${behaviorConf.loitering}%`, transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
                      <span>Fast/Erratic Movement</span> <span style={{ color: "#8b5cf6" }}>{behaviorConf.fast_movement}%</span>
                    </div>
                    <div style={{ background: "#f3f4f6", height: "8px", borderRadius: "4px", width: "100%" }}>
                      <div style={{ background: "#c4b5fd", height: "100%", borderRadius: "4px", width: `${behaviorConf.fast_movement}%`, transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN - Stats & Logs */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

            {/* Top circular stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", background: "#ffffff", padding: "24px", borderRadius: "24px", boxShadow: "10px 10px 20px rgba(166, 171, 189, 0.6), -10px -10px 20px #ffffff, inset 2px 2px 8px rgba(255,255,255,0.8), inset -2px -2px 8px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: "80px", height: "80px", borderRadius: "50%", border: "8px solid #f3f4f6", borderTopColor: "#4f46e5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", color: "#4f46e5", marginBottom: "12px", transform: "rotate(-45deg)" }}>
                  <div style={{ transform: "rotate(45deg)" }}>🛡️</div>
                </div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#4f46e5" }}>{safetyScore}%</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Safety Score</div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: "80px", height: "80px", borderRadius: "50%", border: "8px solid #f3f4f6", borderRightColor: "#a855f7", borderBottomColor: "#a855f7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", color: "#a855f7", marginBottom: "12px", transform: "rotate(45deg)" }}>
                  <div style={{ transform: "rotate(-45deg)" }}></div>
                </div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#a855f7" }}>{activityLevel}%</div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Activity Level</div>
              </div>
            </div>

            <div style={{ ...styles.controlPanel, height: "450px", display: "flex", flexDirection: "column" }}>
              <div style={{ ...styles.tabsContainer, justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: "12px" }}>
                  <button 
                    style={activeEventTab === 'events' ? styles.tabActive : styles.tabInactive}
                    onClick={() => setActiveEventTab('events')}
                  >
                    Event Log
                  </button>
                  <button 
                    style={activeEventTab === 'alerts' ? styles.tabActive : styles.tabInactive}
                    onClick={() => setActiveEventTab('alerts')}
                  >
                    Alerts ({activeAlerts})
                  </button>
                </div>
                <div style={{ display: "flex", background: "#f3f4f6", borderRadius: "10px", padding: "2px" }}>
                  <button 
                    onClick={() => setEventViewMode('timeline')}
                    style={{ 
                      padding: "4px 8px", fontSize: "10px", borderRadius: "8px", border: "none", 
                      background: eventViewMode === 'timeline' ? "white" : "transparent",
                      boxShadow: eventViewMode === 'timeline' ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
                      color: eventViewMode === 'timeline' ? "#1a1a1a" : "#6b7280",
                      fontWeight: 600, cursor: "pointer"
                    }}
                  >
                    Timeline
                  </button>
                  <button 
                    onClick={() => setEventViewMode('source')}
                    style={{ 
                      padding: "4px 8px", fontSize: "10px", borderRadius: "8px", border: "none", 
                      background: eventViewMode === 'source' ? "white" : "transparent",
                      boxShadow: eventViewMode === 'source' ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
                      color: eventViewMode === 'source' ? "#1a1a1a" : "#6b7280",
                      fontWeight: 600, cursor: "pointer"
                    }}
                  >
                    By Source
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", padding: "10px 0" }}>
                {(() => {
                  const filtered = activeEventTab === 'alerts' 
                    ? events.filter(e => e.severity === 'error' || e.severity === 'warning')
                    : events;

                  if (filtered.length === 0) {
                    return <div style={styles.emptyText}>No recent {activeEventTab} to display.</div>;
                  }

                  if (eventViewMode === 'timeline') {
                    return filtered.map((evt, idx) => (
                      <div key={idx} onClick={() => {
                        setActiveReport({
                          camera_id: evt.camera_id,
                          name: evt.name || "Camera",
                          peopleCount: peopleCount,
                          safetyScore: safetyScore,
                          activityLevel: activityLevel,
                          behavior: behaviorConf,
                          event: evt,
                        });
                      }} style={{ padding: "12px", borderRadius: "12px", background: "#f8f9fa", borderLeft: `4px solid ${evt.severity === 'error' ? '#ef4444' : evt.severity === 'warning' ? '#f59e0b' : '#3b82f6'}`, cursor: "pointer" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontSize: "13px", fontWeight: 700, color: "#1f2937" }}>{evt.type}</span>
                            <span style={{ fontSize: "10px", fontWeight: 600, color: "#8b5cf6", opacity: 0.8 }}>@{evt.name}</span>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <span style={{ fontSize: "11px", color: "#6b7280", display: "block" }}>{formatEventTime(evt.ts)}</span>
                            {evt.video_time && <span style={{ fontSize: "10px", color: "#8b5cf6", fontWeight: 600 }}>T+{evt.video_time}</span>}
                          </div>
                        </div>
                        <div style={{ fontSize: "13px", color: "#4b5563" }}>{evt.message}</div>
                      </div>
                    ));
                  } else {
                    // Grouped by Source
                    const grouped: Record<string, { events: any[], type: string }> = {};
                    filtered.forEach(e => {
                      const camId = e.camera_id;
                      const cam = cameras.find(c => c.id === camId);
                      const type = cam ? cam.type : "ip";
                      const name = e.name || "Unknown Source";
                      const key = `${type}_${name}`; // group by type and name combo to be safe
                      if (!grouped[key]) grouped[key] = { events: [], type };
                      grouped[key].events.push(e);
                    });

                    return Object.entries(grouped).map(([key, data], gIdx) => {
                      const isFile = data.type === 'file';
                      const name = key.split('_').slice(1).join('_');
                      const icon = isFile ? "📁" : "📹";
                      const label = isFile ? "Footage" : "CCTV Camera";

                      return (
                        <div key={key} style={{ marginBottom: "16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", padding: "6px 10px", background: isFile ? "rgba(79, 70, 229, 0.05)" : "rgba(22, 163, 74, 0.05)", borderRadius: "10px", border: isFile ? "1px solid rgba(79, 70, 229, 0.1)" : "1px solid rgba(22, 163, 74, 0.1)" }}>
                            <span style={{ fontSize: "14px" }}>{icon}</span>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span style={{ fontSize: "12px", fontWeight: 700, color: isFile ? "#4f46e5" : "#16a34a" }}>
                                {label}: {name}
                              </span>
                            </div>
                            <div style={{ flex: 1, height: "1px", background: "rgba(0,0,0,0.05)", margin: "0 4px" }} />
                            <span style={{ fontSize: "10px", color: "#9ca3af", fontWeight: 600 }}>{data.events.length}</span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingLeft: "10px" }}>
                            {data.events.map((evt, idx) => (
                              <div key={`${gIdx}-${idx}`} onClick={() => {
                                setActiveReport({
                                  camera_id: evt.camera_id,
                                  name: evt.name || name,
                                  peopleCount: peopleCount,
                                  safetyScore: safetyScore,
                                  activityLevel: activityLevel,
                                  behavior: behaviorConf,
                                  event: evt,
                                });
                              }} style={{ padding: "10px", borderRadius: "12px", background: "#ffffff", boxShadow: "2px 2px 5px rgba(0,0,0,0.02)", borderLeft: `3px solid ${evt.severity === 'error' ? '#ef4444' : evt.severity === 'warning' ? '#f59e0b' : '#3b82f6'}`, cursor: "pointer" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#1f2937" }}>{evt.type}</span>
                                  <div style={{ textAlign: "right", display: "flex", gap: "8px", alignItems: "baseline" }}>
                                    <span style={{ fontSize: "10px", color: "#6b7280" }}>{formatEventTime(evt.ts)}</span>
                                    {evt.video_time && <span style={{ fontSize: "10px", color: "#8b5cf6", fontWeight: 700 }}>T+{evt.video_time}</span>}
                                  </div>
                                </div>
                                <div style={{ fontSize: "12px", color: "#4b5563", lineHeight: 1.4 }}>{evt.message}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  }
                })()}
              </div>
            </div>

            {/* Settings / Controls (moved below logs or kept collapsable) */}
            <div style={{ ...styles.thresholdSection, marginTop: 0 }}>
              <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px" }}>Analysis Controls</div>

              {/* Select Scenario */}
              <div style={styles.controlSection}>
                <label style={styles.label}>Select Scenario</label>
                <div style={{ position: "relative" as const }}>
                  <div
                    style={{
                      ...styles.scenarioSelect,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                    onClick={() => setScenarioDropdownOpen(!scenarioDropdownOpen)}
                  >
                    <span>{scenario ? ({ behavior: "Behavior Detection", metro_line: "Line Crossing", zone_detection: "Zone Detection" } as Record<string, string>)[scenario] || scenario : "Choose a scenario"}</span>
                    <span style={{ fontSize: 16, color: "#9ca3af", marginLeft: 8 }}>▼</span>
                  </div>
                  <AnimatePresence>
                    {scenarioDropdownOpen && (
                      <motion.div
                        style={{
                          position: "absolute" as const,
                          top: "100%",
                          left: 0,
                          right: 0,
                          background: "#ffffff",
                          borderRadius: "10px",
                          border: "1px solid #e5e7eb",
                          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                          zIndex: 9999,
                          overflow: "hidden",
                          marginTop: "6px",
                        }}
                        initial={{ opacity: 0, maxHeight: 0 }}
                        animate={{ opacity: 1, maxHeight: 400 }}
                        exit={{ opacity: 0, maxHeight: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {[
                          { value: "", label: "Choose a scenario" },
                          { value: "behavior", label: "Behavior Detection" },
                          { value: "metro_line", label: "Line Crossing" },
                          { value: "zone_detection", label: "Zone Detection" },
                        ].map((opt) => (
                          <div
                            key={opt.value}
                            style={{
                              padding: "12px 16px",
                              fontSize: "14px",
                              cursor: "pointer",
                              background: scenario === opt.value || (!scenario && opt.value === "") ? "#f0f0f0" : "transparent",
                              color: "#1a1a1a",
                              fontWeight: scenario === opt.value ? 600 : 400,
                              borderBottom: "1px solid #f0f0f0",
                              transition: "background 0.15s ease",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = scenario === opt.value || (!scenario && opt.value === "") ? "#f0f0f0" : "transparent")}
                            onClick={() => {
                              setScenario(opt.value || null);
                              setLinePoints([]);
                              setRestrictedPoint(null);
                              setScenarioDropdownOpen(false);
                            }}
                          >
                            {opt.label}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* scenario-specific configuration */}
              {scenario === "metro_line" && (
                <div style={styles.controlSection}>
                  <p style={{ margin: "8px 0", fontSize: 13 }}>
                    {drawingLine
                      ? "Click two points to draw the line, then a third point for the restricted side."
                      : "Press the button below to start defining the line on the selected camera feed."}
                  </p>
                  <button
                    style={styles.startButton}
                    onClick={() => {
                      setDrawingLine(!drawingLine);
                      if (!drawingLine) {
                        setLinePoints([]);
                        setRestrictedPoint(null);
                      }
                    }}
                    disabled={!videoReady}
                  >
                    {drawingLine ? "Cancel Draw" : "Draw Line"}
                  </button>
                  {!videoReady && (
                    <p style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>
                      Wait for video to load before drawing
                    </p>
                  )}
                </div>
              )}

              {scenario === "zone_detection" && (
                <div style={styles.controlSection}>
                  <p style={{ margin: "8px 0", fontSize: 13 }}>
                    {drawingZone
                      ? "Click to add zone points. Right-click or press Close Zone when done."
                      : "Press Draw Zone to start defining a polygon on the camera feed."}
                  </p>
                  {!zoneClosed ? (
                    <button
                      style={styles.smallButton}
                      onClick={() => {
                        if (!drawingZone) {
                          setDrawingZone(true);
                          setZonePoints([]);
                          setZoneClosed(false);
                        } else if (zonePoints.length >= 3) {
                          setZoneClosed(true);
                          setDrawingZone(false);
                        } else {
                          setDrawingZone(false);
                          setZonePoints([]);
                        }
                      }}
                      disabled={!videoReady}
                    >
                      {!drawingZone ? "Draw Zone" : zonePoints.length >= 3 ? "Close Zone" : "Cancel"}
                    </button>
                  ) : (
                    <button
                      style={{ ...styles.smallButton, background: "#dc2626" }}
                      onClick={() => { setZonePoints([]); setZoneClosed(false); setDrawingZone(false); }}
                    >
                      Clear Zone
                    </button>
                  )}
                </div>
              )}

              <div style={styles.thresholdControl}>
                <label style={styles.thresholdLabel}>Inference Quality</label>
                <div style={styles.sliderContainer}>
                  <CustomSlider
                    min={1}
                    max={3}
                    step={1}
                    value={4 - inferEvery}
                    onChange={(val) => setInferEvery(4 - val)}
                    style={{ flex: 1 }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                  {["Performance", "Balanced", "Quality"].map((label, i) => (
                    <span
                      key={label}
                      style={{
                        fontSize: 18,
                        fontFamily: "Google Sans Medium",
                        fontWeight: (4 - inferEvery) === i + 1 ? 700 : 400,
                        color: (4 - inferEvery) === i + 1 ? "#6e52bb" : "#6b7280",
                        cursor: "pointer",
                        flex: 1,
                        textAlign: i === 0 ? "left" : i === 2 ? "right" : "center",
                      }}
                      onClick={() => setInferEvery(3 - i)}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <p style={styles.thresholdDescription}>
                  {inferEvery === 1 ? "Every frame — highest accuracy, most GPU load" :
                    inferEvery === 2 ? "Every 2nd frame — balanced accuracy and load" :
                      "Every 3rd frame — lightest load, boxes persist between frames"}
                </p>
              </div>

              <div style={styles.thresholdControl}>
                <label style={styles.thresholdLabel}>Loitering Threshold</label>
                <div style={styles.sliderContainer}>
                  <span style={{ minWidth: 64 }} />
                  <CustomSlider
                    min={5}
                    max={30}
                    step={1}
                    value={loiteringThreshold}
                    onChange={(val) => setLoiteringThreshold(val)}
                    style={{ flex: 1 }}
                    showTicks={false}
                  />
                  <span style={{ ...styles.thresholdValue, minWidth: 48 }}>{loiteringThreshold}s</span>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* HIDDEN FILE INPUT */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />

        {/* RESULT REPORT MODAL */}
        <AnimatePresence>
          {activeReport && (() => {
            const threatStats = [
              Math.max(5, Math.min(100, (activeReport.peopleCount / 20) * 100)), // Crowd density
              Math.max(5, activeReport.activityLevel), // Activity
              Math.max(5, Math.min(100, 100 - activeReport.safetyScore)), // Alerts (inverse of safety)
              Math.max(5, activeReport.behavior.loitering), // Loitering
              Math.max(5, activeReport.behavior.fast_movement) // Erratic
            ];

            const radarPoints = threatStats.map((val, i) => {
              const angle = (Math.PI * -0.5) + (i * ((Math.PI * 2) / 5));
              const px = 100 + val * Math.cos(angle);
              const py = 100 + val * Math.sin(angle);
              return `${px.toFixed(1)},${py.toFixed(1)}`;
            });
            const polygonPoints = radarPoints.join(' ');

            return (
              <div style={{ ...styles.modalOverlay, zIndex: 9999 }} onClick={() => setActiveReport(null)}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ ...styles.modal, width: "95%", maxWidth: "1000px", padding: "32px", background: "#f3f4f6", borderRadius: "24px", maxHeight: "90vh", overflowY: "auto" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: "24px", color: "#1f2937", display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "28px" }}>{activeReport.event?.severity === 'error' ? '🚨' : activeReport.event?.severity === 'warning' ? '⚠️' : '📊'}</span>
                        {activeReport.event ? activeReport.event.type : 'Event Detail'}: {activeReport.name}
                      </h2>
                      {activeReport.event && (
                        <p style={{ margin: "6px 0 0 0", fontSize: "14px", color: "#6b7280" }}>
                          {activeReport.event.message} — {formatEventTime(activeReport.event.ts)}{activeReport.event.video_time ? ` · T+${activeReport.event.video_time}` : ''}
                        </p>
                      )}
                    </div>
                    <button onClick={() => setActiveReport(null)} style={styles.modalCloseButton}>✕</button>
                  </div>

                  {/* Circular Stats Header */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", background: "#ffffff", padding: "24px", borderRadius: "24px", boxShadow: "0 4px 6px rgba(0,0,0,0.05)", marginBottom: "24px" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ width: "80px", height: "80px", borderRadius: "50%", border: "8px solid #f3f4f6", borderTopColor: "#4f46e5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", color: "#4f46e5", marginBottom: "12px", transform: "rotate(-45deg)" }}>
                        <div style={{ transform: "rotate(45deg)" }}>🛡️</div>
                      </div>
                      <div style={{ fontSize: "22px", fontWeight: 700, color: "#4f46e5" }}>{activeReport.safetyScore}%</div>
                      <div style={{ fontSize: "12px", color: "#6b7280" }}>Overall Safety Score</div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ width: "80px", height: "80px", borderRadius: "50%", border: "8px solid #f3f4f6", borderRightColor: "#a855f7", borderBottomColor: "#a855f7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", color: "#a855f7", marginBottom: "12px", transform: "rotate(45deg)" }}>
                        <div style={{ transform: "rotate(-45deg)" }}>🏃</div>
                      </div>
                      <div style={{ fontSize: "22px", fontWeight: 700, color: "#a855f7" }}>{activeReport.activityLevel}%</div>
                      <div style={{ fontSize: "12px", color: "#6b7280" }}>Average Activity Level</div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                    {/* Threat Assessment */}
                    <div style={{ ...styles.monitorZonesSection, background: "#ffffff", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
                      <div style={{ fontSize: "18px", fontWeight: 700 }}>Threat Assessment</div>
                      <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "20px" }}>Aggregated Risk Vectors</div>

                      <div style={{ height: "240px", display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
                        <div style={{ width: "200px", height: "200px", borderRadius: "50%", border: "1px solid #e5e7eb", position: "absolute" }} />
                        <div style={{ width: "150px", height: "150px", borderRadius: "50%", border: "1px solid #e5e7eb", position: "absolute" }} />
                        <div style={{ width: "100px", height: "100px", borderRadius: "50%", border: "1px solid #e5e7eb", position: "absolute" }} />
                        <div style={{ width: "50px", height: "50px", borderRadius: "50%", border: "1px solid #e5e7eb", position: "absolute" }} />

                        <svg width="200" height="200" style={{ position: "absolute", zIndex: 1 }}>
                          {Array.from({ length: 5 }).map((_, i) => {
                            const angle = (Math.PI * -0.5) + (i * ((Math.PI * 2) / 5));
                            return (
                              <line 
                                key={i} 
                                x1="100" y1="100" 
                                x2={100 + 100 * Math.cos(angle)} 
                                y2={100 + 100 * Math.sin(angle)} 
                                stroke="#e5e7eb" strokeWidth="1" 
                              />
                            );
                          })}
                        </svg>

                        <svg width="200" height="200" style={{ position: "absolute", zIndex: 5, transition: "all 0.5s ease" }}>
                          <polygon points={polygonPoints} fill="rgba(139, 92, 246, 0.4)" stroke="#8b5cf6" strokeWidth="2" style={{ transition: "all 0.5s ease" }} />
                        </svg>
                        
                        <div style={{ position: "absolute", top: "0px", left: "50%", transform: "translateX(-50%)", fontSize: "11px", fontWeight: 600, color: "#6b7280" }}>Crowd</div>
                        <div style={{ position: "absolute", top: "35%", right: "-5px", fontSize: "11px", fontWeight: 600, color: "#6b7280" }}>Activity</div>
                        <div style={{ position: "absolute", bottom: "0px", right: "15%", fontSize: "11px", fontWeight: 600, color: "#6b7280" }}>Alerts</div>
                        <div style={{ position: "absolute", bottom: "0px", left: "15%", fontSize: "11px", fontWeight: 600, color: "#6b7280" }}>Loitering</div>
                        <div style={{ position: "absolute", top: "35%", left: "-5px", fontSize: "11px", fontWeight: 600, color: "#6b7280" }}>Erratic</div>
                      </div>
                    </div>

                    {/* Behavioral Confidence */}
                    <div style={{ ...styles.monitorZonesSection, background: "#ffffff", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
                      <div style={{ fontSize: "18px", fontWeight: 700 }}>Behavioral Breakdown</div>
                      <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "20px" }}>Final cumulative analysis</div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
                            <span>Normal Activity</span> <span style={{ color: "#8b5cf6" }}>{activeReport.behavior.normal}%</span>
                          </div>
                          <div style={{ background: "#f3f4f6", height: "12px", borderRadius: "6px", width: "100%" }}>
                            <div style={{ background: "#8b5cf6", height: "100%", borderRadius: "6px", width: `${activeReport.behavior.normal}%` }} />
                          </div>
                        </div>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
                            <span>Suspicious Loitering</span> <span style={{ color: "#a78bfa" }}>{activeReport.behavior.loitering}%</span>
                          </div>
                          <div style={{ background: "#f3f4f6", height: "12px", borderRadius: "6px", width: "100%" }}>
                            <div style={{ background: "#a78bfa", height: "100%", borderRadius: "6px", width: `${activeReport.behavior.loitering}%` }} />
                          </div>
                        </div>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
                            <span>Fast/Erratic Movement</span> <span style={{ color: "#c4b5fd" }}>{activeReport.behavior.fast_movement}%</span>
                          </div>
                          <div style={{ background: "#f3f4f6", height: "12px", borderRadius: "6px", width: "100%" }}>
                            <div style={{ background: "#c4b5fd", height: "100%", borderRadius: "6px", width: `${activeReport.behavior.fast_movement}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ marginTop: "24px", display: "flex", justifyContent: "center" }}>
                    <button onClick={() => setActiveReport(null)} style={{ padding: "12px 32px", borderRadius: "24px", background: "#f9fafb", border: "1px solid #d1d5db", fontWeight: 600, color: "#374151", cursor: "pointer", fontSize: "16px" }}>
                        Close
                    </button>
                  </div>
                </motion.div>
              </div>
            );
          })()}
        </AnimatePresence>

        {/* ADD CAMERA MODAL */}
        {showAddCameraModal && (
          <div style={styles.modalOverlay} onClick={() => setShowAddCameraModal(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Add New Camera</h3>
                <button
                  style={styles.modalCloseButton}
                  onClick={() => setShowAddCameraModal(false)}
                >
                  X
                </button>
              </div>

              <div style={styles.modalBody}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Camera Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Front Door, Lobby"
                    value={newCameraName}
                    onChange={(e) => setNewCameraName(e.target.value)}
                    style={styles.formInput}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Camera Type</label>
                  <select
                    value={newCameraType}
                    onChange={(e) => setNewCameraType(e.target.value as any)}
                    style={styles.formSelect}
                  >
                    <option value="ip">IP Camera / Stream URL (RTMP, HLS, HTTP)</option>
                    <option value="webcam">Webcam / Local Camera</option>
                    <option value="file">Video File</option>
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>
                    {newCameraType === "ip" && "Stream URL"}
                    {newCameraType === "webcam" && "Webcam Device ID"}
                    {newCameraType === "file" && "File Path / URL"}
                  </label>
                  <input
                    type="text"
                    placeholder={
                      newCameraType === "ip"
                        ? "e.g., rtmp://camera.local/stream"
                        : newCameraType === "webcam"
                          ? "e.g., /dev/video0 or camera ID"
                          : "e.g., /path/to/video.mp4"
                    }
                    value={newCameraSource}
                    onChange={(e) => setNewCameraSource(e.target.value)}
                    style={styles.formInput}
                  />
                </div>

                <div style={styles.helpText}>
                  <strong>Examples:</strong>
                  <ul style={{ margin: "8px 0", paddingLeft: "20px", fontSize: "12px" }}>
                    <li>IP Camera: <code>rtmp://192.168.1.100/stream</code></li>
                    <li>IP Camera: <code>http://192.168.1.100:8080/video.m3u8</code></li>
                    <li>Webcam: <code>/dev/video0</code> (Linux) or device index</li>
                    <li>Video File: <code>/path/to/video.mp4</code> or URL</li>
                  </ul>
                </div>
              </div>

              <div style={styles.modalFooter}>
                <button
                  style={styles.cancelButton}
                  onClick={() => setShowAddCameraModal(false)}
                >
                  Cancel
                </button>
                <button
                  style={styles.confirmButton}
                  onClick={handleAddCamera}
                >
                  Add Camera
                </button>
              </div>
            </div>
          </div>
        )}

      </motion.div>
    </div>
  );
}



const styles: any = {
  sidebar: {
    width: "250px",
    background: "#ffffff",
    padding: "24px 20px",
    display: "flex",
    flexDirection: "column" as const,
    boxShadow: "10px 0px 20px rgba(166, 171, 189, 0.3), inset -2px 0px 8px rgba(0,0,0,0.02)",
    zIndex: 10
  },
  sidebarLogoWrapper: {
    display: "flex",
    alignItems: "center",
    marginBottom: "40px",
    paddingLeft: "10px"
  },
  sidebarLogoIcon: {
    fontSize: "24px",
    marginRight: "12px"
  },
  sidebarLogoText: {
    fontSize: "22px",
    fontWeight: "700",
    color: "#1a1a1a"
  },
  sidebarNav: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
    flex: 1
  },
  sidebarNavItem: {
    padding: "14px 20px",
    borderRadius: "16px",
    fontSize: "15px",
    fontWeight: "600",
    color: "#6b7280",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    transition: "all 0.2s ease",
    background: "transparent",
  },
  sidebarNavItemActive: {
    background: "linear-gradient(135deg, #a78bfa, #8b5cf6)",
    color: "white",
    boxShadow: "4px 4px 10px rgba(139, 92, 246, 0.3), -4px -4px 10px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.15)"
  },
  sidebarBottom: {
    marginTop: "auto",
    paddingTop: "20px"
  },

  pageContent: {
    flex: 1,
    padding: "24px",
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
    gap: "24px"
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#ffffff",
    padding: "16px 24px",
    borderRadius: "24px",
    boxShadow: "10px 10px 20px rgba(166, 171, 189, 0.6), -10px -10px 20px #ffffff, inset 2px 2px 8px rgba(255,255,255,0.8), inset -2px -2px 8px rgba(0,0,0,0.05)"
  },

  title: {
    margin: "0",
    fontSize: "32px",
    fontWeight: "700",
    color: "#1a1a1a",
    textShadow: "2px 2px 4px rgba(0,0,0,0.05)"
  },

  subtitle: {
    margin: "5px 0 0 0",
    fontSize: "15px",
    color: "#6b7280"
  },

  badge: {
    background: "#ffffff",
    padding: "10px 24px",
    borderRadius: "24px",
    border: "none",
    fontSize: "22px",
    fontFamily: "Google Sans, sans-serif",
    fontWeight: "600",
    color: "#1a1a1a",
    boxShadow: "6px 6px 12px rgba(166, 171, 189, 0.6), -6px -6px 12px #ffffff, inset 2px 2px 6px rgba(255,255,255,0.8), inset -2px -2px 6px rgba(0,0,0,0.05)",
    cursor: "pointer",
    transition: "all 0.2s ease"
  },

  monitorZonesSection: {
    background: "#ffffff",
    borderRadius: "24px",
    padding: "24px",
    border: "none",
    marginBottom: "24px",
    boxShadow: "10px 10px 20px rgba(166, 171, 189, 0.6), -10px -10px 20px #ffffff, inset 2px 2px 8px rgba(255,255,255,0.8), inset -2px -2px 8px rgba(0,0,0,0.05)"
  },

  sectionTitle: {
    fontWeight: "700",
    marginBottom: "16px",
    color: "#1a1a1a",
    fontSize: "28px"
  },

  mainGrid: {
    display: "grid",
    gridTemplateColumns: "3fr 1fr",
    gap: "24px",
    alignItems: "start" as const
  },

  videoPanel: {
    background: "#ffffff",
    borderRadius: "24px",
    padding: "24px",
    border: "none",
    gridRow: "1 / 3",
    boxShadow: "10px 10px 20px rgba(166, 171, 189, 0.6), -10px -10px 20px #ffffff, inset 2px 2px 8px rgba(255,255,255,0.8), inset -2px -2px 8px rgba(0,0,0,0.05)"
  },

  controlPanel: {
    background: "#ffffff",
    borderRadius: "24px",
    padding: "24px",
    border: "none",
    gridRow: "1",
    gridColumn: "2",
    height: "fit-content",
    boxShadow: "10px 10px 20px rgba(166, 171, 189, 0.6), -10px -10px 20px #ffffff, inset 2px 2px 8px rgba(255,255,255,0.8), inset -2px -2px 8px rgba(0,0,0,0.05)"
  },

  thresholdSection: {
    background: "#ffffff",
    borderRadius: "24px",
    padding: "24px",
    border: "none",
    gridRow: "2",
    gridColumn: "2",
    height: "fit-content",
    marginBottom: "0",
    boxShadow: "10px 10px 20px rgba(166, 171, 189, 0.6), -10px -10px 20px #ffffff, inset 2px 2px 8px rgba(255,255,255,0.8), inset -2px -2px 8px rgba(0,0,0,0.05)"
  },

  panelTitle: {
    fontWeight: "700",
    marginBottom: "16px",
    color: "#1a1a1a",
    fontSize: "24px"
  },

  controlSection: {
    marginBottom: "15px"
  },

  label: {
    fontSize: "13px",
    color: "#6b7280",
    display: "block",
    marginBottom: "8px"
  },

  scenarioSelect: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "16px",
    border: "none",
    background: "#f8f8f8",
    color: "#1a1a1a",
    fontSize: "14px",
    cursor: "pointer",
    outline: "none",
    boxShadow: "inset 4px 4px 8px rgba(0,0,0,0.05), inset -4px -4px 8px rgba(255,255,255,0.8)"
  },

  buttonRow: {
    display: "flex",
    gap: "16px",
    marginBottom: "0px"
  },

  startButton: {
    flex: 1,
    padding: "20px",
    borderRadius: "20px",
    border: "none",
    background: "#8b5cf6",
    color: "white",
    fontFamily: "Google Sans, sans-serif",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "18px",
    transition: "all 0.2s ease",
    boxShadow: "6px 6px 16px rgba(139, 92, 246, 0.3), -6px -6px 16px #ffffff, inset 3px 3px 6px rgba(255, 255, 255, 0.4), inset -3px -3px 6px rgba(0, 0, 0, 0.15)"
  },

  drawZoneButton: {
    flex: 1,
    padding: "20px",
    borderRadius: "20px",
    border: "none",
    background: "#ffffff",
    color: "#374151",
    fontFamily: "Google Sans, sans-serif",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "18px",
    transition: "all 0.2s ease",
    boxShadow: "6px 6px 12px rgba(166, 171, 189, 0.6), -6px -6px 12px #ffffff, inset 2px 2px 6px rgba(255,255,255,0.8), inset -2px -2px 6px rgba(0,0,0,0.05)"
  },

  smallButton: {
    padding: "8px 14px",
    borderRadius: "8px",
    border: "none",
    background: "#1a1a1a",
    color: "white",
    cursor: "pointer",
    fontSize: "13px",
    margin: "6px 0",
    fontWeight: "500"
  },

  statusBox: {
    marginTop: "20px",
    padding: "16px",
    borderRadius: "12px",
    background: "#f8f8f8",
    border: "1px solid #e5e7eb"
  },

  statusRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px",
    fontSize: "13px"
  },

  statusLabel: {
    color: "#6b7280"
  },

  statusValue: {
    fontWeight: "600",
    color: "#1a1a1a"
  },

  // new metric tile styles
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: "12px",
    margin: "20px 0"
  },

  metricTile: {
    padding: "16px",
    borderRadius: "20px",
    color: "white",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100px",
    fontSize: "14px",
    boxShadow: "6px 6px 12px rgba(166, 171, 189, 0.4), -6px -6px 12px #ffffff, inset 2px 2px 6px rgba(255,255,255,0.6), inset -2px -2px 6px rgba(0,0,0,0.02)",
    border: "none"
  },

  metricLabel: {
    fontSize: "14px",
    color: "rgba(255, 255, 255, 0.9)",
    marginBottom: "4px",
    textAlign: "center" as const,
    fontWeight: "500"
  },

  metricValue: {
    fontSize: "26px",
    fontWeight: 700,
    color: "white",
    textAlign: "center" as const
  },

  metricSelect: {
    padding: "6px 10px",
    borderRadius: "12px",
    border: "none",
    fontSize: "13px",
    width: "100%",
    textAlign: "center" as const,
    background: "#ffffff",
    color: "#1a1a1a",
    boxShadow: "inset 2px 2px 4px rgba(0,0,0,0.05), inset -2px -2px 4px rgba(255,255,255,0.8)"
  },

  metricsContainer: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px",
    margin: "24px 0"
  },

  metricsRow: {
    display: "flex",
    gap: "16px"
  },

  videoPanelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
    gap: "10px"
  },

  videoControls: {
    display: "flex",
    gap: "10px"
  },

  select: {
    padding: "10px 14px",
    borderRadius: "12px",
    border: "none",
    background: "#f8f8f8",
    color: "#1a1a1a",
    fontSize: "14px",
    cursor: "pointer",
    minWidth: "150px",
    outline: "none",
    boxShadow: "inset 4px 4px 8px rgba(0,0,0,0.05), inset -4px -4px 8px rgba(255,255,255,0.8)"
  },

  noCamera: {
    padding: "10px 14px",
    borderRadius: "12px",
    border: "none",
    background: "#f0f0f5",
    color: "#6b7280",
    fontSize: "14px",
    cursor: "pointer",
    boxShadow: "inset 4px 4px 8px rgba(0,0,0,0.05), inset -4px -4px 8px rgba(255,255,255,0.8)"
  },

  viewer: {
    height: "65vh",
    background: "#f0f0f5",
    borderRadius: "20px",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "inset 4px 4px 10px rgba(0,0,0,0.05), inset -4px -4px 10px rgba(255,255,255,0.8)"
  },

  cameraGrid: {
    display: "grid",
    gap: "15px",
    height: "auto"
  },

  cameraFeed: {
    background: "#f0f0f5",
    borderRadius: "20px",
    border: "none",
    overflow: "hidden",
    minHeight: "250px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    boxShadow: "inset 4px 4px 10px rgba(0,0,0,0.05), inset -4px -4px 10px rgba(255,255,255,0.8)"
  },

  cameraFeedHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 18px",
    background: "#ffffff",
    borderBottom: "none",
    boxShadow: "0 4px 8px rgba(0,0,0,0.03)"
  },

  cameraName: {
    fontSize: "14px",
    fontWeight: "700",
    color: "#1a1a1a"
  },

  removeButton: {
    background: "#ef4444",
    border: "none",
    color: "white",
    fontSize: "14px",
    fontWeight: "600",
    padding: "0",
    width: "30px",
    height: "30px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "10px",
    transition: "all 0.2s ease",
    boxShadow: "4px 4px 10px rgba(239, 68, 68, 0.3), -4px -4px 10px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.15)"
  },

  cameraFeedContent: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    height: "200px",
    gap: "10px"
  },

  cameraStatus: {
    fontSize: "12px",
    color: "#6b7280",
    margin: "0"
  },

  videoStream: {
    width: "100%",
    background: "black",
    borderRadius: "10px",
    objectFit: "cover" as const
  },

  modalOverlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.6)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000
  },

  modal: {
    background: "#ffffff",
    borderRadius: "24px",
    border: "none",
    width: "90%",
    maxWidth: "500px",
    boxShadow: "16px 16px 32px rgba(166, 171, 189, 0.4), -16px -16px 32px #ffffff"
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "24px 28px",
    borderBottom: "none",
    boxShadow: "0 4px 8px rgba(0,0,0,0.02)"
  },

  modalTitle: {
    margin: "0",
    fontSize: "22px",
    fontWeight: "700",
    color: "#1a1a1a"
  },

  modalCloseButton: {
    background: "#f8f8f8",
    border: "none",
    color: "#6b7280",
    fontSize: "16px",
    cursor: "pointer",
    padding: "0",
    width: "36px",
    height: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "12px",
    transition: "all 0.2s ease",
    boxShadow: "4px 4px 8px rgba(0,0,0,0.05), -4px -4px 8px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.8), inset -2px -2px 4px rgba(0,0,0,0.02)"
  },

  modalBody: {
    padding: "28px"
  },

  formGroup: {
    marginBottom: "16px"
  },

  formLabel: {
    display: "block",
    fontSize: "13px",
    fontWeight: "600",
    marginBottom: "8px",
    color: "#1a1a1a"
  },

  formInput: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: "16px",
    border: "none",
    background: "#f8f8f8",
    color: "#1a1a1a",
    fontSize: "14px",
    boxSizing: "border-box" as const,
    outline: "none",
    transition: "all 0.2s ease",
    boxShadow: "inset 4px 4px 8px rgba(0,0,0,0.05), inset -4px -4px 8px rgba(255,255,255,0.8)"
  },

  formSelect: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: "16px",
    border: "none",
    background: "#f8f8f8",
    color: "#1a1a1a",
    fontSize: "14px",
    cursor: "pointer",
    boxSizing: "border-box" as const,
    outline: "none",
    boxShadow: "inset 4px 4px 8px rgba(0,0,0,0.05), inset -4px -4px 8px rgba(255,255,255,0.8)"
  },

  helpText: {
    background: "#fdfdfd",
    padding: "16px",
    borderRadius: "16px",
    marginBottom: "16px",
    fontSize: "13px",
    color: "#6b7280",
    border: "none",
    boxShadow: "inset 2px 2px 6px rgba(0,0,0,0.03), inset -2px -2px 6px rgba(255,255,255,0.8)"
  },

  modalFooter: {
    display: "flex",
    gap: "12px",
    justifyContent: "flex-end",
    padding: "20px 28px",
    borderTop: "none",
    boxShadow: "0 -4px 8px rgba(0,0,0,0.02)"
  },

  cancelButton: {
    padding: "12px 20px",
    borderRadius: "16px",
    border: "none",
    background: "#ffffff",
    color: "#6b7280",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "14px",
    transition: "all 0.2s ease",
    boxShadow: "4px 4px 8px rgba(166, 171, 189, 0.4), -4px -4px 8px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.8), inset -2px -2px 4px rgba(0,0,0,0.02)"
  },

  confirmButton: {
    padding: "12px 24px",
    borderRadius: "16px",
    border: "none",
    background: "#8b5cf6",
    color: "white",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "14px",
    transition: "all 0.2s ease",
    boxShadow: "4px 4px 12px rgba(139, 92, 246, 0.3), -4px -4px 12px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.15)"
  },

  viewerPlaceholder: {
    textAlign: "center"
  },

  cameraIcon: {
    fontSize: "48px",
    marginBottom: "15px",
    opacity: 0.3
  },

  placeholderText: {
    margin: "0",
    fontSize: "18px",
    color: "#9ca3af",
    fontWeight: "500"
  },

  placeholderSubtext: {
    margin: "8px 0 0 0",
    fontSize: "14px",
    color: "#6b7280"
  },

  thresholdControl: {
    marginBottom: "20px"
  },

  thresholdLabel: {
    display: "block",
    fontSize: "18px",
    fontWeight: "500",
    marginBottom: "10px",
    color: "#1a1a1a"
  },

  sliderContainer: {
    display: "flex",
    alignItems: "center",
    gap: "15px",
    marginBottom: "8px"
  },

  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 12
  },

  slider: {
    flex: 1,
    height: "6px",
    borderRadius: "3px",
    background: "#e5e7eb",
    outline: "none",
    cursor: "pointer",
    WebkitAppearance: "none" as any,
    appearance: "none" as any
  },
  logoutBtn: {
    background: "#ffffff",
    padding: "8px 18px",
    borderRadius: "24px",
    border: "none",
    color: "#1a1a1a",
    fontSize: 14,
    fontWeight: 500,
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    cursor: "pointer"
  },

  thresholdValue: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#1a1a1a",
    minWidth: "48px",
    textAlign: "right"
  },

  thresholdDescription: {
    margin: "6px 0 0 0",
    fontSize: "12px",
    color: "#9ca3af"
  },

  updateButton: {
    width: "100%",
    padding: "20px",
    borderRadius: "20px",
    border: "none",
    background: "#ffffff",
    color: "#374151",
    fontFamily: "Google Sans, sans-serif",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "18px",
    transition: "all 0.2s ease",
    boxShadow: "6px 6px 12px rgba(166, 171, 189, 0.6), -6px -6px 12px #ffffff, inset 2px 2px 6px rgba(255,255,255,0.8), inset -2px -2px 6px rgba(0,0,0,0.05)"
  },

  bottomGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    marginTop: "0"
  },

  bottomPanel: {
    background: "#ffffff",
    borderRadius: "24px",
    padding: "24px",
    border: "none",
    boxShadow: "10px 10px 20px rgba(166, 171, 189, 0.6), -10px -10px 20px #ffffff, inset 2px 2px 8px rgba(255,255,255,0.8), inset -2px -2px 8px rgba(0,0,0,0.05)"
  },

  bottomPanelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px"
  },

  bottomButtons: {
    display: "flex",
    gap: "12px"
  },

  addButton: {
    padding: "10px 20px",
    borderRadius: "16px",
    border: "none",
    background: "#8b5cf6",
    color: "white",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "13px",
    transition: "all 0.2s ease",
    boxShadow: "4px 4px 10px rgba(139, 92, 246, 0.3), -4px -4px 10px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.15)"
  },

  uploadButton: {
    padding: "10px 20px",
    borderRadius: "16px",
    border: "none",
    background: "#ffffff",
    color: "#374151",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "13px",
    transition: "all 0.2s ease",
    boxShadow: "4px 4px 8px rgba(166, 171, 189, 0.4), -4px -4px 8px #ffffff, inset 2px 2px 4px rgba(255,255,255,0.8), inset -2px -2px 4px rgba(0,0,0,0.02)"
  },

  tabsContainer: {
    display: "flex",
    gap: "12px",
    marginBottom: "15px",
    borderBottom: "1px solid #f0f0f0",
    paddingBottom: "10px"
  },

  tabActive: {
    padding: "6px 0",
    background: "transparent",
    border: "none",
    color: "#1a1a1a",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    borderBottom: "2px solid #1a1a1a",
    paddingBottom: "8px",
    fontFamily: "inherit"
  },

  tabInactive: {
    padding: "6px 0",
    background: "transparent",
    border: "none",
    color: "#9ca3af",
    fontSize: "13px",
    fontWeight: "500",
    cursor: "pointer",
    borderBottom: "none",
    fontFamily: "inherit"
  },

  emptyText: {
    margin: "20px 0",
    fontSize: "13px",
    color: "#9ca3af"
  },

  customDropdown: {
    width: "100%",
    position: "relative" as const
  },

  customDropdownField: {
    position: "relative" as const,
    width: "100%",
    color: "#1a1a1a"
  },

  customDropdownInput: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "16px",
    border: "none",
    background: "#ffffff",
    color: "#1a1a1a",
    fontSize: "14px",
    cursor: "pointer",
    outline: "none",
    appearance: "none" as const,
    paddingRight: "32px",
    fontWeight: "600",
    boxShadow: "inset 4px 4px 8px rgba(0,0,0,0.05), inset -4px -4px 8px rgba(255,255,255,0.8)"
  },

  customDropdownIcon: {
    position: "absolute" as const,
    right: "14px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "#6b7280",
    fontSize: "12px",
    pointerEvents: "none" as const
  },

  customDropdownList: {
    position: "absolute" as const,
    top: "100%",
    left: 0,
    right: 0,
    background: "#ffffff",
    borderRadius: "16px",
    border: "none",
    boxShadow: "10px 10px 20px rgba(166, 171, 189, 0.4), -10px -10px 20px #ffffff",
    zIndex: 9999,
    overflow: "hidden",
    marginTop: "8px"
  },

  customDropdownListItem: {
    padding: "12px 16px",
    border: "none",
    background: "transparent",
    color: "#1a1a1a",
    fontSize: "14px",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "all 0.15s ease",
    borderBottom: "1px solid #f0f0f5",
    fontWeight: "500",
    display: "flex",
    alignItems: "center"
  },

  customDropdownButton: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "16px",
    border: "none",
    background: "#ffffff",
    color: "#1a1a1a",
    fontSize: "14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    transition: "all 0.2s ease",
    fontWeight: "600",
    marginBottom: "6px",
    boxShadow: "6px 6px 12px rgba(166, 171, 189, 0.4), -6px -6px 12px #ffffff"
  },

  customDropdownOptions: {
    position: "absolute" as const,
    top: "100%",
    left: 0,
    right: 0,
    background: "#ffffff",
    borderRadius: "16px",
    border: "none",
    boxShadow: "10px 10px 20px rgba(166, 171, 189, 0.4), -10px -10px 20px #ffffff",
    zIndex: 10,
    overflow: "hidden"
  },

  customDropdownOption: {
    width: "100%",
    padding: "12px 16px",
    border: "none",
    background: "transparent",
    color: "#1a1a1a",
    fontSize: "14px",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "background 0.15s ease",
    borderBottom: "1px solid #f0f0f5",
    fontWeight: "500"
  },

  emptyText2: {
    margin: "0 0 10px 0",
    fontSize: "13px",
    color: "#9ca3af"
  }
};
