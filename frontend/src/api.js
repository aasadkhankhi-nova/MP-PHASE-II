/**
 * api.js — The ONLY place the frontend talks to the backend from.
 * Every screen imports functions from here; nobody calls fetch() directly.
 *
 * Backend = our Express server on Render (see /backend folder).
 * The login token (from Supabase Auth) is stored in localStorage and
 * automatically attached to every request as "Authorization: Bearer ...".
 */

// Which backend to call. Priority:
// 1. URL the user saved manually (Account screen)  2. build-time env  3. production default.
export function getApiBase() {
  return localStorage.getItem('mp_api_base') || import.meta.env.VITE_API_BASE || 'https://mp-backend-rw3i.onrender.com'
}
export function setApiBase(url) {
  localStorage.setItem('mp_api_base', String(url || '').replace(/\/+$/, ''))
}

// ---- login session (token + user info) kept in localStorage ----
export function getSession() {
  try { return JSON.parse(localStorage.getItem('mp_session') || 'null') } catch { return null }
}
export function setSession(s) {
  if (s) localStorage.setItem('mp_session', JSON.stringify(s))
  else localStorage.removeItem('mp_session')
}

/**
 * api — generic request helper.
 * - adds JSON headers + the auth token
 * - on 401 (expired login) it clears the session so the app shows Login again
 * - on any error it throws with the server's error message
 */
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

// ---- simple endpoints ----
export const health = () => api('/api/health')                                        // is the backend alive?
export const genSeo = (payload) => api('/api/seo/generate', { method: 'POST', body: JSON.stringify(payload) })  // AI SEO

// ---- auth (email + password, backed by Supabase Auth) ----
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
  return null // Supabase may require email confirmation first — caller shows a message
}

// ---- cloud data (all scoped to the logged-in user on the server) ----
export const cloudStores = {
  list: () => api('/api/stores'),
  create: (name) => api('/api/stores', { method: 'POST', body: JSON.stringify({ name }) }),
  rename: (id, name) => api(`/api/stores/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  remove: (id) => api(`/api/stores/${id}`, { method: 'DELETE' }),
}
export const cloudWs = {
  pull: (storeId) => api(`/api/workspace/${storeId}`),                                    // download a store's data
  push: (storeId, ws) => api(`/api/workspace/${storeId}`, { method: 'PUT', body: JSON.stringify({ ws }) }), // upload it
}

// Upload one image to Supabase Storage (via backend). Returns a permanent URL.
export async function uploadImage(dataUrl, name) {
  const [head, b64] = String(dataUrl).split(',')
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/png'
  const r = await api('/api/upload', { method: 'POST', body: JSON.stringify({ b64, mime, name }) })
  return r.url
}
