/**
 * auth.js — Login-token verification middleware.
 * The frontend sends "Authorization: Bearer <access_token>" (issued by
 * Supabase Auth at login). We verify it by asking Supabase who the user is.
 * On success, req.user = { id, email, ... } and the route continues.
 * A tiny in-memory cache avoids re-verifying the same token for 5 minutes.
 */
import 'dotenv/config'

const CACHE = new Map() // token -> { user, exp }

export async function requireUser(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ ok: false, error: 'login required' })

    // cached and still fresh? skip the network call
    const hit = CACHE.get(token)
    if (hit && hit.exp > Date.now()) { req.user = hit.user; return next() }

    // ask Supabase Auth to validate the token
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
    })
    if (!r.ok) return res.status(401).json({ ok: false, error: 'invalid or expired session' })
    const user = await r.json()

    CACHE.set(token, { user, exp: Date.now() + 5 * 60 * 1000 })
    if (CACHE.size > 500) CACHE.clear()  // simple memory guard
    req.user = user
    next()
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
}
