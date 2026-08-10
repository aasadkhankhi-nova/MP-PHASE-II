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

// ---- Google sign-in (Supabase OAuth) ----
// Supabase project URL is PUBLIC info (safe to keep in frontend code).
// The secret keys live only on the backend / dashboards, never here.
const SUPABASE_URL = 'https://upsqhucsiswyhlsnqirq.supabase.co'

// Build the URL that starts the "Continue with Google" flow.
// We send the user to Supabase -> Supabase sends them to Google's own
// account picker -> after choosing, Google sends them back to our app
// with a login token in the URL (#access_token=...).
export function googleSignInUrl() {
  // redirect back to exactly this page (works on GitHub Pages and locally)
  const back = window.location.origin + window.location.pathname
  return `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`
}

// Called once at app start (main.jsx). If the URL contains tokens from a
// Google login, save them as our session and clean the URL.
export function captureOAuthSession() {
  const hash = window.location.hash || ''
  if (!hash.includes('access_token=')) {
    // Google/Supabase may also send back an error (e.g. user pressed cancel)
    if (hash.includes('error_description=')) {
      const p = new URLSearchParams(hash.slice(1))
      localStorage.setItem('mp_oauth_err', p.get('error_description') || 'Google login failed')
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    return null
  }
  const p = new URLSearchParams(hash.slice(1))
  const token = p.get('access_token')
  // The token is a JWT: its middle part is base64 JSON with the user's id + email.
  let user = {}
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    user = { id: payload.sub, email: payload.email }
  } catch {}
  const sess = { access_token: token, user }
  setSession(sess)
  // Remove the tokens from the address bar (looks clean + safer)
  history.replaceState(null, '', window.location.pathname + window.location.search)
  return sess
}

// Login screen shows this once if Google login came back with an error.
export function takeOAuthError() {
  const e = localStorage.getItem('mp_oauth_err')
  if (e) localStorage.removeItem('mp_oauth_err')
  return e
}

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

// After signup: user types the 6-digit code from their email.
// On success Supabase returns a real session -> user is logged in.
export async function authVerify(email, code) {
  const r = await api('/api/auth/verify', { method: 'POST', body: JSON.stringify({ email, token: code }) })
  const sess = { access_token: r.session.access_token, user: { id: r.session.user?.id, email: r.session.user?.email || email } }
  setSession(sess)
  return sess
}

// Ask Supabase to send the verification email again.
export const authResend = (email) => api('/api/auth/resend', { method: 'POST', body: JSON.stringify({ email }) })

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
