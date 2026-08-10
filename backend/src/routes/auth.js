// Signup / login proxied through the backend (Supabase GoTrue REST)
import { Router } from 'express'

const router = Router()
const gotrue = (path) => `${process.env.SUPABASE_URL}/auth/v1${path}`
const headers = () => ({ 'content-type': 'application/json', apikey: process.env.SUPABASE_ANON_KEY })

router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body
    const r = await fetch(gotrue('/signup'), { method: 'POST', headers: headers(), body: JSON.stringify({ email, password }) })
    const j = await r.json()
    if (!r.ok) return res.status(r.status).json({ ok: false, error: j.msg || j.error_description || j.message || 'signup failed' })
    res.json({ ok: true, session: j.session || j, user: j.user || j })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const r = await fetch(gotrue('/token?grant_type=password'), { method: 'POST', headers: headers(), body: JSON.stringify({ email, password }) })
    const j = await r.json()
    if (!r.ok) return res.status(r.status).json({ ok: false, error: j.msg || j.error_description || j.message || 'login failed' })
    res.json({ ok: true, session: j })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

export default router
