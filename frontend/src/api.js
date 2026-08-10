// Central API client + auth session.
export function getApiBase() {
  return localStorage.getItem('mp_api_base') || import.meta.env.VITE_API_BASE || 'http://localhost:4000'
}
export function setApiBase(url) {
  localStorage.setItem('mp_api_base', String(url || '').replace(/\/+$/, ''))
}

export function getSession() {
  try { return JSON.parse(localStorage.getItem('mp_session') || 'null') } catch { return null }
}
export function setSession(s) {
  if (s) localStorage.setItem('mp_session', JSON.stringify(s))
  else localStorage.removeItem('mp_session')
}

export async function api(path, options = {}) {
  const s = getSession()
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  })
  if (res.status === 401) { setSession(null) }
  if (!res.ok) {
    let msg = `API ${res.status}`
    try { const j = await res.json(); msg = j.error || msg } catch {}
    throw new Error(msg)
  }
  return res.json()
}

export const health = () => api('/api/health')
export const genSeo = (payload) => api('/api/seo/generate', { method: 'POST', body: JSON.stringify(payload) })

export async function authLogin(email, password) {
  const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  const sess = { access_token: r.session.access_token, user: { id: r.session.user?.id, email: r.session.user?.email || email } }
  setSession(sess)
  return sess
}
export async function authSignup(email, password) {
  const r = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) })
  if (r.session?.access_token) {
    const sess = { access_token: r.session.access_token, user: { id: r.session.user?.id || r.user?.id, email } }
    setSession(sess)
    return sess
  }
  return null // email confirmation may be required
}

export const cloudStores = {
  list: () => api('/api/stores'),
  create: (name) => api('/api/stores', { method: 'POST', body: JSON.stringify({ name }) }),
  rename: (id, name) => api(`/api/stores/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  remove: (id) => api(`/api/stores/${id}`, { method: 'DELETE' }),
}
export const cloudWs = {
  pull: (storeId) => api(`/api/workspace/${storeId}`),
  push: (storeId, ws) => api(`/api/workspace/${storeId}`, { method: 'PUT', body: JSON.stringify({ ws }) }),
}
export async function uploadImage(dataUrl, name) {
  const [head, b64] = String(dataUrl).split(',')
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/png'
  const r = await api('/api/upload', { method: 'POST', body: JSON.stringify({ b64, mime, name }) })
  return r.url
}
