/**
 * routes/upload.js — Image upload to Supabase Storage.
 * The frontend sends a base64 image; we store it in the public "images"
 * bucket and return a permanent URL. The SERVICE key used here is secret
 * and exists only on the server (never in the browser).
 * Files are stored under <userId>/<timestamp>-<name>.<ext> so every
 * user's files stay in their own folder.
 */
import { Router } from 'express'
import { requireUser } from '../auth.js'

const router = Router()
router.use(requireUser)

// Supabase ki DO qism ki keys hain:
//   purani (legacy JWT, "eyJ..." se shuru)  -> Authorization: Bearer <key>
//   nayi  ("sb_secret_..." se shuru)        -> sirf apikey header (Bearer me
//                                              bhejo to "Invalid Compact JWS")
// Ye helper dono ko sahi tarah bhejta hai.
function sbHeaders(extra = {}) {
  const k = process.env.SUPABASE_SERVICE_KEY || ''
  return {
    apikey: k,
    ...(/^eyJ/.test(k) ? { authorization: `Bearer ${k}` } : {}),
    ...extra,
  }
}

// Create the "images" bucket once (safe to call again — 409/400 = exists).
let bucketReady = false
async function ensureBucket() {
  if (bucketReady) return
  const r = await fetch(`${process.env.SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: sbHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ id: 'images', name: 'images', public: true }),
  })
  if (r.ok || r.status === 409 || r.status === 400) bucketReady = true
}

// POST /api/upload { b64, mime, name } -> { ok, url }
router.post('/', async (req, res) => {
  try {
    const { b64, mime = 'image/png', name = 'img' } = req.body
    if (!b64) return res.status(400).json({ ok: false, error: 'b64 required' })
    await ensureBucket()

    const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png'
    const safe = String(name).replace(/[^a-z0-9-_]/gi, '_').slice(0, 40)  // sanitize file name
    const path = `${req.user.id}/${Date.now()}-${safe}.${ext}`

    const buf = Buffer.from(b64, 'base64')
    if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ ok: false, error: 'image too large (max 8MB)' })

    const up = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/images/${path}`, {
      method: 'POST',
      headers: sbHeaders({ 'content-type': mime }),
      body: buf,
    })
    if (!up.ok) {
      const t = await up.text()
      return res.status(500).json({ ok: false, error: `storage: ${up.status} ${t.slice(0, 150)}` })
    }
    // public URL (bucket is public, so no signing needed)
    res.json({ ok: true, url: `${process.env.SUPABASE_URL}/storage/v1/object/public/images/${path}` })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

export default router
