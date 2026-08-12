/**
 * routes/etsy.js — Etsy shop integration (Etsy Open API v3).
 *
 * What this file does:
 *   1. CONNECT   — OAuth 2.0 (PKCE) flow: user clicks "Connect Etsy" in the
 *                  app -> Etsy's own permission page -> back here -> we save
 *                  the tokens for that MP store. One MP store = one Etsy shop.
 *   2. STATUS    — is this store connected? which shop?
 *   3. HELPERS   — shipping profiles list, seller-taxonomy search
 *                  (both needed to create a listing).
 *   4. PUBLISH   — create a DRAFT listing on Etsy with title/tags/description
 *                  (from the app's SEO) + upload the generated photos.
 *                  Draft = the seller reviews it on Etsy and presses Publish
 *                  there (that is when Etsy charges its own $0.20 listing fee).
 *
 * Secrets: ETSY_API_KEY (the app "keystring") lives ONLY in Render env vars.
 * User tokens live ONLY in the etsy_connections table. Browser never sees them.
 *
 * Env vars used:
 *   ETSY_API_KEY   — required. From your app on developers.etsy.com
 *   ETSY_REDIRECT  — optional. Defaults to <this backend>/api/etsy/callback
 *   APP_URL        — optional. Where to send the browser after connect
 *                    (defaults to the GitHub Pages app).
 */
import { Router } from 'express'
import crypto from 'node:crypto'
import { q } from '../db.js'
import { requireUser } from '../auth.js'

const router = Router()

const APP_URL = process.env.APP_URL || 'https://aasadkhankhi-nova.github.io/MP-PHASE-II/app/'
const BACKEND_URL = process.env.BACKEND_URL || 'https://mp-backend-rw3i.onrender.com'
const REDIRECT = process.env.ETSY_REDIRECT || `${BACKEND_URL}/api/etsy/callback`
// ALL the permissions we will ever need — asked once, so users never
// have to re-connect when we add features (orders, reviews, digital files).
const SCOPES = 'listings_r listings_w listings_d shops_r shops_w transactions_r feedback_r email_r'

// Etsy credentials. Etsy's v3 API requires the x-api-key HEADER to be
// "keystring:shared_secret" (both, colon-separated), while the OAuth
// client_id is the keystring ALONE. We support either setup:
//   ETSY_API_KEY = keystring  +  ETSY_SHARED_SECRET = secret   (preferred)
//   ETSY_API_KEY = "keystring:secret"                          (also works)
const rawKey = () => process.env.ETSY_API_KEY || ''
const key = () => rawKey().split(':')[0]                         // keystring only (OAuth client_id)
const secret = () => process.env.ETSY_SHARED_SECRET || rawKey().split(':')[1] || ''
const apiKeyHdr = () => (secret() ? `${key()}:${secret()}` : key())  // full x-api-key header value

// ---------- tiny helpers ----------

// PKCE: random secret + its SHA256 hash (Etsy requires this flow).
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const makeVerifier = () => b64url(crypto.randomBytes(32))
const challengeOf = (v) => b64url(crypto.createHash('sha256').update(v).digest())

// The OAuth "state" survives the round-trip to Etsy in this in-memory map.
// (10-minute TTL; if the server restarts mid-flow the user just clicks again.)
const STATES = new Map()
function putState(data) {
  const id = b64url(crypto.randomBytes(16))
  STATES.set(id, { ...data, exp: Date.now() + 10 * 60 * 1000 })
  // sweep old entries so the map never grows forever
  for (const [k, v] of STATES) if (v.exp < Date.now()) STATES.delete(k)
  return id
}

// Does this MP store belong to the logged-in user?
async function ownStore(storeId, userId) {
  const r = await q('select id from stores where id=$1 and user_id=$2', [storeId, userId])
  return r.length > 0
}

// Load a store's Etsy connection; refresh the access token if it is
// about to expire (Etsy tokens live only 1 hour).
async function getConn(storeId) {
  const rows = await q('select * from etsy_connections where store_id=$1', [storeId])
  if (!rows.length) return null
  let c = rows[0]
  if (new Date(c.expires_at).getTime() - Date.now() < 60 * 1000) {
    const r = await fetch('https://api.etsy.com/v3/public/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKeyHdr() },
      body: JSON.stringify({ grant_type: 'refresh_token', client_id: key(), refresh_token: c.refresh_token }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error('Etsy token refresh failed: ' + (j.error_description || j.error || r.status))
    const expiresAt = new Date(Date.now() + (j.expires_in || 3600) * 1000)
    await q('update etsy_connections set access_token=$1, refresh_token=$2, expires_at=$3 where store_id=$4',
      [j.access_token, j.refresh_token, expiresAt, storeId])
    c = { ...c, access_token: j.access_token, refresh_token: j.refresh_token, expires_at: expiresAt }
  }
  return c
}

// One call to Etsy's API with the right headers. Throws on error.
async function etsy(conn, path, opts = {}) {
  const res = await fetch('https://api.etsy.com/v3/application' + path, {
    ...opts,
    headers: {
      'x-api-key': apiKeyHdr(),
      authorization: `Bearer ${conn.access_token}`,
      ...(opts.body && !(opts.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(j.error || `Etsy HTTP ${res.status}`), { status: res.status })
  return j
}

// ---------- 1. connect flow ----------

// GET /api/etsy/connect?storeId=...  (logged-in)
// Returns the Etsy permission-page URL; the frontend sends the browser there.
router.get('/connect', requireUser, async (req, res) => {
  try {
    if (!key()) return res.status(503).json({ ok: false, error: 'ETSY_API_KEY server par set nahi hai' })
    const { storeId } = req.query
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const verifier = makeVerifier()
    const state = putState({ verifier, storeId, userId: req.user.id })
    const url = 'https://www.etsy.com/oauth/connect' +
      `?response_type=code&client_id=${encodeURIComponent(key())}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&state=${state}&code_challenge=${challengeOf(verifier)}&code_challenge_method=S256`
    res.json({ ok: true, url })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// GET /api/etsy/callback?code=...&state=...
// Etsy sends the browser here after the user presses "Allow".
// We swap the code for tokens, find the shop, save everything, then
// send the browser back to the app.
router.get('/callback', async (req, res) => {
  const back = (msg) => res.redirect(APP_URL + (msg ? `#etsy=${encodeURIComponent(msg)}` : ''))
  try {
    const { code, state, error, error_description } = req.query
    if (error) return back('error:' + (error_description || error))
    const st = STATES.get(state)
    STATES.delete(state)
    if (!st || st.exp < Date.now()) return back('error:Session expire ho gayi — dobara Connect dabayein')

    // code -> tokens
    const tr = await fetch('https://api.etsy.com/v3/public/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKeyHdr() },
      body: JSON.stringify({ grant_type: 'authorization_code', client_id: key(), redirect_uri: REDIRECT, code, code_verifier: st.verifier }),
    })
    const tok = await tr.json()
    if (!tr.ok) return back('error:' + (tok.error_description || tok.error || 'token exchange failed'))

    // Etsy access tokens look like "12345678.xxxxx" — the number is the user id.
    const etsyUserId = String(tok.access_token).split('.')[0]
    const conn = { access_token: tok.access_token }

    // find the user's shop (id + name)
    const shopRes = await etsy(conn, `/users/${etsyUserId}/shops`)
    const shop = shopRes.shop_id ? shopRes : (shopRes.results && shopRes.results[0])
    if (!shop) return back('error:Is Etsy account par koi shop nahi mili')

    const expiresAt = new Date(Date.now() + (tok.expires_in || 3600) * 1000)
    // save (or replace) this store's connection
    await q(
      `insert into etsy_connections (store_id, user_id, etsy_user_id, shop_id, shop_name, access_token, refresh_token, expires_at, scopes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (store_id) do update set etsy_user_id=$3, shop_id=$4, shop_name=$5, access_token=$6, refresh_token=$7, expires_at=$8, scopes=$9, connected_at=now()`,
      [st.storeId, st.userId, etsyUserId, String(shop.shop_id), shop.shop_name || '', tok.access_token, tok.refresh_token, expiresAt, SCOPES]
    )
    back('connected:' + (shop.shop_name || 'shop'))
  } catch (e) { back('error:' + e.message) }
})

// ---------- 2. status / disconnect ----------

// GET /api/etsy/status?storeId=...
router.get('/status', requireUser, async (req, res) => {
  try {
    const { storeId } = req.query
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const rows = await q('select shop_id, shop_name, connected_at from etsy_connections where store_id=$1', [storeId])
    res.json({ ok: true, connected: rows.length > 0, shop: rows[0] || null, keyReady: !!key() })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// POST /api/etsy/disconnect { storeId }
router.post('/disconnect', requireUser, async (req, res) => {
  try {
    const { storeId } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    await q('delete from etsy_connections where store_id=$1', [storeId])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// ---------- 3. data needed to build a listing ----------

// GET /api/etsy/shipping-profiles?storeId=...
// The seller's saved shipping rules — a listing must point at one of these.
router.get('/shipping-profiles', requireUser, async (req, res) => {
  try {
    const { storeId } = req.query
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const r = await etsy(conn, `/shops/${conn.shop_id}/shipping-profiles`)
    res.json({ ok: true, profiles: (r.results || []).map((p) => ({ id: p.shipping_profile_id, title: p.title })) })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// GET /api/etsy/taxonomy?q=wall
// Search Etsy's category tree by name (e.g. "wall decor" -> taxonomy id).
// The full tree is fetched once and cached in memory for 24h.
let TAXO = { at: 0, flat: [] }
router.get('/taxonomy', requireUser, async (req, res) => {
  try {
    if (Date.now() - TAXO.at > 24 * 3600 * 1000 || !TAXO.flat.length) {
      const r = await fetch('https://api.etsy.com/v3/application/seller-taxonomy/nodes', { headers: { 'x-api-key': apiKeyHdr() } })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'taxonomy fetch failed')
      // flatten the tree into "Parent > Child > Leaf" labels
      const flat = []
      const walk = (nodes, trail) => {
        for (const n of nodes || []) {
          const label = trail ? `${trail} > ${n.name}` : n.name
          flat.push({ id: n.id, label })
          walk(n.children, label)
        }
      }
      walk(j.results, '')
      TAXO = { at: Date.now(), flat }
    }
    const qq = String(req.query.q || '').toLowerCase().trim()
    const hits = qq ? TAXO.flat.filter((n) => n.label.toLowerCase().includes(qq)).slice(0, 20) : TAXO.flat.slice(0, 20)
    res.json({ ok: true, nodes: hits })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// ---------- 4. publish (draft) ----------

// POST /api/etsy/publish
// { storeId, title, description, tags[], price, quantity,
//   taxonomyId, shippingProfileId, images: [dataUrl...] (max 10) }
// Creates a DRAFT listing + uploads the photos. Seller publishes on Etsy.
router.post('/publish', requireUser, async (req, res) => {
  try {
    const { storeId, title, description, tags = [], price, quantity = 1, taxonomyId, shippingProfileId, images = [] } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    if (!title || !price || !taxonomyId || !shippingProfileId) {
      return res.status(400).json({ ok: false, error: 'title, price, category aur shipping profile lazmi hain' })
    }

    // 1) the draft listing itself
    const listing = await etsy(conn, `/shops/${conn.shop_id}/listings`, {
      method: 'POST',
      body: JSON.stringify({
        title: String(title).slice(0, 140),
        description: description || title,
        tags: tags.slice(0, 13),
        price: Number(price),
        quantity: Number(quantity) || 1,
        taxonomy_id: Number(taxonomyId),
        shipping_profile_id: Number(shippingProfileId),
        who_made: 'i_did',            // required by Etsy: who made it
        when_made: 'made_to_order',   // typical for print-on-demand
        state: 'draft',               // NEVER auto-publish — seller reviews first
      }),
    })

    // 2) upload photos (max 10, order preserved)
    let uploaded = 0
    const imgErrors = []
    for (const dataUrl of images.slice(0, 10)) {
      try {
        const [head, b64] = String(dataUrl).split(',')
        const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg'
        const bytes = Buffer.from(b64, 'base64')
        const fd = new FormData()
        fd.append('image', new Blob([bytes], { type: mime }), `photo-${uploaded + 1}.${mime.includes('png') ? 'png' : 'jpg'}`)
        fd.append('rank', String(uploaded + 1))
        await etsy(conn, `/shops/${conn.shop_id}/listings/${listing.listing_id}/images`, { method: 'POST', body: fd })
        uploaded++
      } catch (e) { imgErrors.push(e.message) }
    }

    res.json({
      ok: true,
      listingId: listing.listing_id,
      uploaded,
      imgErrors,
      // handy link straight to the draft in the seller's Etsy dashboard
      url: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listing.listing_id}`,
    })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// GET /api/etsy/listings?storeId=...&state=draft|active
// Peek at the shop's existing listings (first page) — shown in Settings.
router.get('/listings', requireUser, async (req, res) => {
  try {
    const { storeId, state = 'active' } = req.query
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const r = await etsy(conn, `/shops/${conn.shop_id}/listings?state=${encodeURIComponent(state)}&limit=25`)
    res.json({ ok: true, count: r.count || 0, listings: (r.results || []).map((l) => ({ id: l.listing_id, title: l.title, state: l.state, views: l.views })) })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

export default router
