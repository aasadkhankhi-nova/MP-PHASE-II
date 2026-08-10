// Verifies the Supabase Auth access token sent by the frontend (Authorization: Bearer ...)
import 'dotenv/config'

const CACHE = new Map() // token -> { user, exp }

export async function requireUser(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ ok: false, error: 'login required' })
    const hit = CACHE.get(token)
    if (hit && hit.exp > Date.now()) { req.user = hit.user; return next() }
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
    })
    if (!r.ok) return res.status(401).json({ ok: false, error: 'invalid or expired session' })
    const user = await r.json()
    CACHE.set(token, { user, exp: Date.now() + 5 * 60 * 1000 })
    if (CACHE.size > 500) CACHE.clear()
    req.user = user
    next()
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
}
