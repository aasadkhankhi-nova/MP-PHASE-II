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
 * refreshSession — login-token ki meyaad (~1 ghanta) khatam hone par
 * refresh_token se NAYA token le kar session taza karta hai — user ko
 * dobara login nahi karna parta. Ek waqt me ek hi refresh chalta hai.
 */
let REFRESHING = null
async function refreshSession() {
  const s = getSession()
  if (!s?.refresh_token) return null
  if (REFRESHING) return REFRESHING
  REFRESHING = (async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.session?.access_token) return null
      const next = {
        ...s,
        access_token: j.session.access_token,
        refresh_token: j.session.refresh_token || s.refresh_token,
        exp: Date.now() + Math.max(60, (j.session.expires_in || 3600) - 120) * 1000,
      }
      setSession(next)
      return next
    } catch { return null } finally { REFRESHING = null }
  })()
  return REFRESHING
}

/**
 * api — generic request helper.
 * - adds JSON headers + the auth token
 * - token purana ho (exp guzar gaya) to PEHLE khud refresh karta hai
 * - 401 par ek bar refresh kar ke request DOBARA bhejta hai;
 *   refresh bhi fail ho tab hi session saaf hota hai (Login screen)
 * - on any error it throws with the server's error message
 */
export async function api(path, options = {}) {
  let s = getSession()
  // token expiry ke qareeb/paar? pehle hi taza kar lo
  if (s?.refresh_token && s.exp && Date.now() > s.exp) {
    s = (await refreshSession()) || s
  }
  const doFetch = (sess) => fetch(`${getApiBase()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(sess?.access_token ? { Authorization: `Bearer ${sess.access_token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  })
  let res = await doFetch(s)
  if (res.status === 401 && s?.refresh_token) {
    const ns = await refreshSession()
    if (ns) res = await doFetch(ns)
  }
  if (res.status === 401) { setSession(null) }
  if (!res.ok) {
    let msg = `API ${res.status}`
    try { const j = await res.json(); msg = j.error || msg } catch {}
    throw new Error(msg)
  }
  return res.json()
}

// ---- user's own AI provider + key (for the SEO feature) ----
// Saved ONLY in this browser (localStorage) — never on our server.
// Shape: { prov: 'gemini', keys: { gemini:'', groq:'', openrouter:'' } }
export const AI_PROVIDERS = [
  { id: 'openai', label: 'OpenAI (ChatGPT — gpt-5-mini)', help: 'platform.openai.com/api-keys' },
  { id: 'gemini', label: 'Google Gemini', help: 'aistudio.google.com/apikey' },
  { id: 'groq', label: 'Groq (free — vision)', help: 'console.groq.com' },
  { id: 'openrouter', label: 'OpenRouter (free models)', help: 'openrouter.ai' },
]
export const getAI = () => { try { return JSON.parse(localStorage.getItem('mp_ai') || '{}') } catch { return {} } }
export const setAI = (ai) => localStorage.setItem('mp_ai', JSON.stringify(ai))
// The ACTIVE provider's key. (Old name kept — screens gate SEO on this.)
// Falls back to the old single-key storage so nobody's saved key is lost.
export const getGeminiKey = () => {
  const ai = getAI()
  return (ai.keys || {})[ai.prov || 'gemini'] || localStorage.getItem('mp_gemini_key') || ''
}

// ---- simple endpoints ----
export const health = () => api('/api/health')                                        // is the backend alive?
export const genSeo = (payload) => {
  const ai = getAI()
  return api('/api/seo/generate', { method: 'POST', body: JSON.stringify({ ...payload, apiKey: getGeminiKey(), provider: ai.prov || 'gemini' }) })  // AI SEO (user's own provider+key)
}

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
    const m = payload.user_metadata || {}
    user = { id: payload.sub, email: payload.email, name: m.full_name || m.name || '' }
  } catch {}
  const sess = {
    access_token: token,
    refresh_token: p.get('refresh_token') || null,   // auto-refresh ke liye
    exp: Date.now() + Math.max(60, (Number(p.get('expires_in')) || 3600) - 120) * 1000,
    user,
  }
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

// ---- bot protection (Cloudflare Turnstile — Supabase's supported captcha) ----
// Leave '' to keep captcha OFF. To switch it on: make a free Turnstile
// widget at dash.cloudflare.com, paste its PUBLIC "site key" here, and put
// its SECRET key in Supabase -> Auth -> Attack Protection -> Captcha.
export const TURNSTILE_SITE_KEY = ''

// ---- auth (email + password, backed by Supabase Auth) ----
// Pull a friendly display name out of Supabase's user object (if any).
const nameOf = (u) => u?.user_metadata?.full_name || [u?.user_metadata?.first_name, u?.user_metadata?.last_name].filter(Boolean).join(' ') || ''

export async function authLogin(email, password, captchaToken = '') {
  const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, captchaToken }) })
  const u = r.session.user
  const sess = { access_token: r.session.access_token, refresh_token: r.session.refresh_token || null, exp: Date.now() + Math.max(60, (r.session.expires_in || 3600) - 120) * 1000, user: { id: u?.id, email: u?.email || email, name: nameOf(u) } }
  setSession(sess)
  return sess
}
// meta = profile fields saved on the account (first_name, last_name, dob, full_name)
export async function authSignup(email, password, meta = {}, captchaToken = '') {
  const r = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, meta, captchaToken }) })
  if (r.session?.access_token) {
    const u = r.session.user || r.user
    const sess = { access_token: r.session.access_token, refresh_token: r.session.refresh_token || null, exp: Date.now() + Math.max(60, (r.session.expires_in || 3600) - 120) * 1000, user: { id: u?.id, email, name: nameOf(u) || meta.full_name || '' } }
    setSession(sess)
    return sess
  }
  return null // Supabase may require email confirmation first — caller shows a message
}

// After signup: user types the 6-digit code from their email.
// On success Supabase returns a real session -> user is logged in.
export async function authVerify(email, code) {
  const r = await api('/api/auth/verify', { method: 'POST', body: JSON.stringify({ email, token: code }) })
  const sess = { access_token: r.session.access_token, refresh_token: r.session.refresh_token || null, exp: Date.now() + Math.max(60, (r.session.expires_in || 3600) - 120) * 1000, user: { id: r.session.user?.id, email: r.session.user?.email || email } }
  setSession(sess)
  return sess
}

// Ask Supabase to send the verification email again.
export const authResend = (email) => api('/api/auth/resend', { method: 'POST', body: JSON.stringify({ email }) })

// Change the logged-in user's password (Account screen).
// The auth token identifies the user, so only the new password is needed.
export const authChangePassword = (password, currentPassword = '', currentEmail = '') =>
  api('/api/auth/password', { method: 'PUT', body: JSON.stringify({ password, currentPassword, currentEmail }) })

// Update the display name (first/last) stored on the account.
export const authUpdateProfile = (firstName, lastName) => api('/api/auth/profile', { method: 'PUT', body: JSON.stringify({ firstName, lastName }) })

// Change the login email (password is checked first; Supabase then emails
// a confirmation link to finish the change).
export const authChangeEmail = (email, password, currentEmail) => api('/api/auth/email', { method: 'PUT', body: JSON.stringify({ email, password, currentEmail }) })

// ---- Etsy integration (everything runs through OUR backend; Etsy tokens
//      never touch the browser). One MP store = one Etsy shop. ----
export const etsy = {
  status: (storeId) => api(`/api/etsy/status?storeId=${storeId}`),                       // connected? which shop?
  connections: () => api('/api/etsy/connections'),                                       // sab stores ke shop-names (sidebar switcher)
  connectUrl: (storeId) => api(`/api/etsy/connect?storeId=${storeId}`),                  // returns Etsy permission-page URL
  disconnect: (storeId) => api('/api/etsy/disconnect', { method: 'POST', body: JSON.stringify({ storeId }) }),
  shippingProfiles: (storeId) => api(`/api/etsy/shipping-profiles?storeId=${storeId}`),  // for the publish form
  taxonomy: (query) => api(`/api/etsy/taxonomy?q=${encodeURIComponent(query)}`),         // category search
  listings: (storeId, state = 'active', offset = 0) => api(`/api/etsy/listings?storeId=${storeId}&state=${state}&offset=${offset}`),
  counts: (storeId) => api(`/api/etsy/counts?storeId=${storeId}`),               // per-state totals for the tabs
  listing: (storeId, id) => api(`/api/etsy/listing?storeId=${storeId}&id=${id}`), // one listing, full detail
  sections: (storeId) => api(`/api/etsy/sections?storeId=${storeId}`),            // shop's own sections (for the editor)
  update: (storeId, id, patch) => api('/api/etsy/listing/update', { method: 'POST', body: JSON.stringify({ storeId, id, patch }) }), // save edits to Etsy
  properties: (storeId, taxonomyId) => api(`/api/etsy/properties?storeId=${storeId}&taxonomyId=${taxonomyId}`), // category ke attribute dropdowns
  setProperty: (storeId, id, propertyId, valueIds, values) => api('/api/etsy/listing/property', { method: 'POST', body: JSON.stringify({ storeId, id, propertyId, valueIds, values }) }),
  returnPolicies: (storeId) => api(`/api/etsy/return-policies?storeId=${storeId}`),
  enums: () => api('/api/etsy/enums'),   // who_made / when_made ke current options
  inventory: (storeId, id) => api(`/api/etsy/inventory?storeId=${storeId}&id=${id}`),                  // variations (per-combo price/qty)
  saveInventory: (storeId, id, inv) => api('/api/etsy/inventory/update', { method: 'POST', body: JSON.stringify({ storeId, id, ...inv }) }),
  addImage: (storeId, id, dataUrl, rank) => api('/api/etsy/listing/image', { method: 'POST', body: JSON.stringify({ storeId, id, dataUrl, rank }) }),
  delImage: (storeId, id, imageId) => api('/api/etsy/listing/image/delete', { method: 'POST', body: JSON.stringify({ storeId, id, imageId }) }),
  orderImages: (storeId, id, order) => api('/api/etsy/listing/image/order', { method: 'POST', body: JSON.stringify({ storeId, id, order }) }),
  setAlt: (storeId, id, imageId, alt, rank) => api('/api/etsy/listing/image/alt', { method: 'POST', body: JSON.stringify({ storeId, id, imageId, alt, rank }) }),
  taxonomyTree: () => api('/api/etsy/taxonomy/tree'),
  varImages: (storeId, id) => api(`/api/etsy/varimages?storeId=${encodeURIComponent(storeId)}&id=${encodeURIComponent(id)}`),
  personalization: (storeId, id) => api(`/api/etsy/personalization?storeId=${encodeURIComponent(storeId)}&id=${encodeURIComponent(id)}`),
  copyListing: (storeId, id) => api('/api/etsy/listing/copy', { method: 'POST', body: JSON.stringify({ storeId, id }) }),
  createFull: (storeId, data) => api('/api/etsy/listing/create-full', { method: 'POST', body: JSON.stringify({ storeId, data }) }),
  savePersonalization: (storeId, id, questions) => api('/api/etsy/personalization', { method: 'POST', body: JSON.stringify({ storeId, id, questions }) }),
  saveVarImages: (storeId, id, links) => api('/api/etsy/varimages', { method: 'POST', body: JSON.stringify({ storeId, id, links }) }),
  partners: (storeId) => api(`/api/etsy/partners?storeId=${encodeURIComponent(storeId)}`),
  readiness: (storeId) => api(`/api/etsy/readiness?storeId=${encodeURIComponent(storeId)}`),
  createSection: (storeId, title) => api('/api/etsy/section/create', { method: 'POST', body: JSON.stringify({ storeId, title }) }),
  createReturnPolicy: (storeId, data) => api('/api/etsy/return-policy/create', { method: 'POST', body: JSON.stringify({ storeId, ...data }) }),
  createShipProfile: (storeId, data) => api('/api/etsy/shipping-profile/create', { method: 'POST', body: JSON.stringify({ storeId, ...data }) }),
  // Photo-editor: Etsy CDN image -> dataURL (backend proxy se, CORS ke bina)
  imageData: async (url) => {
    const s = getSession()
    const res = await fetch(`${getApiBase()}/api/etsy/imgfetch?url=${encodeURIComponent(url)}`, {
      headers: s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {},
    })
    if (!res.ok) throw new Error('image load nahi hui (' + res.status + ')')
    const blob = await res.blob()
    return new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob) })
  },
  addVideo: (storeId, id, dataUrl, name) => api('/api/etsy/listing/video', { method: 'POST', body: JSON.stringify({ storeId, id, dataUrl, name }) }),
  delVideo: (storeId, id, videoId) => api('/api/etsy/listing/video/delete', { method: 'POST', body: JSON.stringify({ storeId, id, videoId }) }),
  setState: (storeId, id, state) => api('/api/etsy/listing/state', { method: 'POST', body: JSON.stringify({ storeId, id, state }) }), // publish / deactivate
  index: (storeId, state, fresh) => api(`/api/etsy/index?storeId=${storeId}&state=${state}${fresh ? '&fresh=1' : ''}`),   // POORI shop ka index; fresh=1 = cache chhor kar naya scan
  deleteListing: (storeId, id) => api('/api/etsy/listing/delete', { method: 'POST', body: JSON.stringify({ storeId, id }) }),
  publish: (payload) => api('/api/etsy/publish', { method: 'POST', body: JSON.stringify(payload) }), // draft + photos
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
