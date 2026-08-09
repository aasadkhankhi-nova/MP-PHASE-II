// Central API client. VITE_API_BASE is set at build time (Render URL in production).
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

export async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return res.json()
}

export const health = () => api('/api/health')
