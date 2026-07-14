/**
 * backend.ts — central API base URL
 *
 * In Docker:  nginx serves the frontend on port 5173 (mapped from 80)
 *             and proxies /api, /stream, /cameras, /upload, /stop → backend:8000
 *             So we use a relative base "" (empty string) — no hostname needed.
 *
 * In dev:     set VITE_API_BASE in frontend/.env.local to override:
 *             VITE_API_BASE=http://127.0.0.1:8000
 */
export const BASE = import.meta.env.VITE_API_BASE ?? "";
