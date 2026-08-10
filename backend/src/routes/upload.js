// Image upload -> Supabase Storage (public bucket "images"), returns a permanent URL.
// Uses the SERVICE key — server-side only, never sent to the browser.
import { Router } from 'express'
import { requireUser } from '../auth.js'

const router = Router()
router.use(requireUser)

let bucketReady = false
async function ensureBucket() {
  if (bucketReady) return
  const r = await fetch(`${process.env.SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
    body: JSON.stringify({ id: 'images', name: 'images', public: true }),
  })
  if (r.ok || r.status === 409 || r.status === 400) bucketReady = true // 409/400 = already exists
}

// POST /api/upload { b64, mime, name }  ->  { ok, url }
router.post('/', async (req, res) => {
  try {
    const { b64, mime = 'image/png', name = 'img' } = req.body
    if (!b64) return res.status(400).json({ ok: false, error: 'b64 required' })
    await ensureBucket()
    const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png'
    const safe = String(name).replace(/[^a-z0-9-_]/gi, '_').slice(0, 40)
    const path = `${req.user.id}/${Date.now()}-${safe}.${ext}`
    const buf = Buffer.from(b64, 'base64')
    if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ ok: false, error: 'image too large (max 8MB)' })
    const up = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/images/${path}`, {
      method: 'POST',
      headers: { 'content-type': mime, authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
      body: buf,
    })
    if (!up.ok) {
      const t = await up.text()
      return res.status(500).json({ ok: false, error: `storage: ${up.status} ${t.slice(0, 150)}` })
    }
    res.json({ ok: true, url: `${process.env.SUPABASE_URL}/storage/v1/object/public/images/${path}` })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

export default router
