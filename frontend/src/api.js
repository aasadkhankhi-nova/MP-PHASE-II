// Central API client. Priority: user-saved URL (Settings) -> build-time env -> localhost.
export function getApiBase() {
  return localStorage.getItem('mp_api_base') || import.meta.env.VITE_API_BASE || 'http://localhost:4000'
}
export function setApiBase(url) {
  localStorage.setItem('mp_api_base', String(url || '').replace(/\/+$/, ''))
}

export async function api(path, options = {}) {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return res.json()
}

export const health = () => api('/api/health')
export const genSeo = (payload) => api('/api/seo/generate', { method: 'POST', body: JSON.stringify(payload) })
