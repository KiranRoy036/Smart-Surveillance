import { useEffect, useState } from "react"

type Props = {
  scenario: string;
  token?: string | null; // unique token for start/stop control
}

export default function CameraFeed({ scenario, token = null }: Props) {

  const [reload, setReload] = useState(0)
  const [connected, setConnected] = useState(false)

  // backend stream url, include token when provided so backend knows how to
  // shut itself down when requested by a stop call.
  const url = `http://127.0.0.1:8000/stream/${scenario}?t=${reload}` +
    (token ? `&token=${token}` : "");

  // when scenario changes → reconnect stream
  useEffect(() => {
    setConnected(false)
    setReload(prev => prev + 1)
  }, [scenario])

  // auto reconnect every 10s if backend restarted
  useEffect(() => {
    const interval = setInterval(() => {
      setReload(prev => prev + 1)
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  // when component unmounts or token changes, inform backend to stop the
  // previous stream (if a token was being used). this prevents dangling
  // processing after the user navigates away.
  useEffect(() => {
    return () => {
      if (token) {
        fetch(`http://127.0.0.1:8000/stop?token=${token}`, { method: "POST" })
          .catch(() => {});
      }
    };
  }, [token]);

  return (
    <div style={styles.container}>

    {!connected && (
      <div style={styles.overlay}>
      Connecting to camera...
      </div>
    )}

    <img
    src={url}
    alt="Live camera"
    style={styles.feed}
    onLoad={() => setConnected(true)}
    onError={() => setConnected(false)}
    />

    </div>
  )
}


const styles: any = {

  container: {
    width: "100%",
    height: "100%",
    position: "relative",
    background: "black",
    borderRadius: 10,
    overflow: "hidden"
  },

  feed: {
    width: "100%",
    height: "100%",
    objectFit: "contain"
  },

  overlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#9ca3af",
    fontSize: 14,
    background: "rgba(0,0,0,0.5)",
    zIndex: 2
  }
}
