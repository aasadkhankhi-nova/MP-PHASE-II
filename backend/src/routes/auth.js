/**
 * routes/auth.js — Signup & login endpoints.
 * We proxy to Supabase Auth's REST API (called GoTrue) so the frontend
 * only ever talks to OUR backend. On success the frontend receives a
 * session (access_token) and stores it for later requests.
 */
import { Router } from 'express'

const router = Router()
const gotrue = (path) => `${process.env.SUPABASE_URL}/auth/v1${path}`
const headers = () => ({ 'content-type': 'application/json', apikey: process.env.SUPABASE_ANON_KEY })

// POST /api/auth/signup { email, password, meta, captchaToken }
// meta = profile fields (first_name, last_name, dob, full_name) saved on
// the account as user_metadata. captchaToken = Turnstile token (optional;
// required only when Captcha protection is switched ON in Supabase).
// NOTE: Supabase may require email confirmation — in that case there is
// no session yet and the frontend shows "check your email".
router.post('/signup', async (req, res) => {
  try {
    const { email, password, meta = {}, captchaToken } = req.body
    const body = { email, password, data: meta }
    if (captchaToken) body.gotrue_meta_security = { captcha_token: captchaToken }
    const r = await fetch(gotrue('/signup'), { method: 'POST', headers: headers(), body: JSON.stringify(body) })
    const j = await r.json()
    if (!r.ok) return res.status(r.status).json({ ok: false, error: j.msg || j.error_description || j.message || 'signup failed' })
    res.json({ ok: true, session: j.session || j, user: j.user || j })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// POST /api/auth/login { email, password, captchaToken } -> { session }
router.post('/login', async (req, res) => {
  try {
    const { email, password, captchaToken } = req.body
    const body = { email, password }
    if (captchaToken) body.gotrue_meta_security = { captcha_token: captchaToken }
    const r = await fetch(gotrue('/token?grant_type=password'), { method: 'POST', headers: headers(), body: JSON.stringify(body) })
    const j = await r.json()
    if (!r.ok) return res.status(r.status).json({ ok: false, error: j.msg || j.error_description || j.message || 'login failed' })
    res.json({ ok: true, session: j })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// POST /api/auth/refresh { refresh_token } -> { session }
// Login-token ~1 ghante me expire hota hai; frontend is se chupchap naya
// token le leta hai — user ko dobara login nahi karna parta.
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body
    if (!refresh_token) return res.status(400).json({ ok: false, error: 'refresh_token required' })
    const r = await fetch(gotrue('/token?grant_type=refresh_token'), { method: 'POST', headers: headers(), body: JSON.stringify({ refresh_token }) })
    const j = await r.json()
    if (!r.ok) return res.status(r.status).json({ ok: false, error: j.msg || j.error_description || j.message || 'refresh failed' })
    res.json({ ok: true, session: j })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// POST /api/auth/verify { email, token }
// User typed the 6-digit code from their email. We ask Supabase to check it.
// If correct, Supabase returns a full session (access_token) = user is logged in.
router.post('/verify', async (req, res) => {
  try {
    const { email, token } = req.body
    const r = await fetch(gotrue('/verify'), { method: 'POST', headers: headers(), body: JSON.stringify({ type: 'signup', email, token }) })
    const j = await r.json()
    if (!r.ok) return res.status(r.status).json({ ok: false, error: j.msg || j.error_description || j.message || 'wrong or expired code' })
    res.json({ ok: true, session: j })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// POST /api/auth/resend { email }
// Sends the verification email again (e.g. user did not receive it).
// Note: Supabase free plan sends max ~2 emails/hour with the default sender.
router.post('/resend', async (req, res) => {
  try {
    const { email } = req.body
    const r = await fetch(gotrue('/resend'), { method: 'POST', headers: headers(), body: JSON.stringify({ type: 'signup', email }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(r.status).json({ ok: false, error: j.msg || j.error_description || j.message || 'resend failed' })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// PUT /api/auth/password { password }
// Changes the LOGGED-IN user's password. We forward the user's own
// Bearer token to Supabase, so each user can only change their own password.
router.put('/password', async (req, res) => {
  try {
    const { password, currentPassword, currentEmail } = req.body
    if (!password || password.length < 6) return res.status(400).json({ ok: false, error: 'password kam az kam 6 harf ka ho' })
    const authz = req.headers.authorization || ''
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'login required' })
    // extra safety: if the current password was given, verify it first
    if (currentPassword && currentEmail) {
      const chk = await fetch(gotrue('/token?grant_type=password'), { method: 'POST', headers: headers(), body: JSON.stringify({ email: currentEmail, password: currentPassword }) })
      if (!chk.ok) return res.status(401).json({ ok: false, error: 'Current password ghalat hai' })
    }
    const r = await fetch(gotrue('/user'), {
      method: 'PUT',
      headers: { ...headers(), authorization: authz },
      body: JSON.stringify({ password }),
    })
    const j = await r.json()
    if (!r.ok) return res.status(r.status).json({ ok: false, error: j.msg || j.error_description || j.message || 'password change failed' })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// PUT /api/auth/profile { firstName, lastName }
// Updates the display name stored on the account (user_metadata).
router.put('/profile', async (req, res) => {
  try {
    const { firstName = '', lastName = '' } = req.body
    const authz = req.headers.authorization || ''
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'login required' })
    const full = `${String(firstName).trim()} ${String(lastName).trim()}`.trim()
    const r = await fetch(gotrue('/user'), {
      method: 'PUT',
      headers: { ...headers(), authorization: authz },
      body: JSON.stringify({ data: { first_name: firstName, last_name: lastName, full_name: full } }),
    })
    const j = await r.json()
    if (!r.ok) return res.status(r.status).json({ ok: false, error: j.msg || j.message || 'profile update failed' })
    res.json({ ok: true, name: full })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// PUT /api/auth/email { email, password, currentEmail }
// Changes the login email. We first CHECK the password (so nobody with a
// stolen open session can silently steal the account), then ask Supabase —
// which emails a confirmation link to finish the change.
router.put('/email', async (req, res) => {
  try {
    const { email, password, currentEmail } = req.body
    const authz = req.headers.authorization || ''
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'login required' })
    if (!email || !password || !currentEmail) return res.status(400).json({ ok: false, error: 'nayi email aur password dono chahiye' })
    const chk = await fetch(gotrue('/token?grant_type=password'), { method: 'POST', headers: headers(), body: JSON.stringify({ email: currentEmail, password }) })
    if (!chk.ok) return res.status(401).json({ ok: false, error: 'Password ghalat hai' })
    const r = await fetch(gotrue('/user'), { method: 'PUT', headers: { ...headers(), authorization: authz }, body: JSON.stringify({ email }) })
    const j = await r.json()
    if (!r.ok) return res.status(r.status).json({ ok: false, error: j.msg || j.message || 'email change failed' })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

export default router
