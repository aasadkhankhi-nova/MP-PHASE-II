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
      ...(typeof opts.body === 'string' ? { 'content-type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(j.error || `Etsy HTTP ${res.status}`), { status: res.status })
  return j
}

// Build a form-encoded body the way Etsy's write endpoints expect:
// arrays (tags, materials) become one comma-separated value.
function form(obj) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    p.append(k, Array.isArray(v) ? v.join(',') : String(v))
  }
  return p
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
    // "Add shop" flow makes a placeholder workspace ("New shop") — give it
    // the REAL Etsy shop name now, so the sidebar shows the right thing.
    if (shop.shop_name) {
      try { await q(`update stores set name=$1 where id=$2 and user_id=$3 and name in ('New shop','Imported store')`, [shop.shop_name, st.storeId, st.userId]) } catch {}
    }
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
let TAXO = { at: 0, flat: [], tree: [] }
async function ensureTaxo() {
  if (Date.now() - TAXO.at < 24 * 3600 * 1000 && TAXO.flat.length) return
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
  // slim tree (id/name/children hi) — Category cascade-dropdowns ke liye
  const slim = (nodes) => (nodes || []).map((n) => ({ id: n.id, name: n.name, children: slim(n.children) }))
  TAXO = { at: Date.now(), flat, tree: slim(j.results || []) }
}
router.get('/taxonomy', requireUser, async (req, res) => {
  try {
    await ensureTaxo()
    const qq = String(req.query.q || '').toLowerCase().trim()
    const hits = qq ? TAXO.flat.filter((n) => n.label.toLowerCase().includes(qq)).slice(0, 20) : TAXO.flat.slice(0, 20)
    res.json({ ok: true, nodes: hits })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// GET /api/etsy/taxonomy/tree
// PURA category tree (Etsy ke apne Category dropdowns jaisa cascade banane ke liye).
router.get('/taxonomy/tree', requireUser, async (req, res) => {
  try { await ensureTaxo(); res.json({ ok: true, tree: TAXO.tree }) }
  catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// ---------- CREATE helpers: section / return policy / shipping profile ----------
// (Processing profiles aur production partners Etsy par hi bante hain — API nahi deti.)

// POST /api/etsy/section/create { storeId, title }
router.post('/section/create', requireUser, async (req, res) => {
  try {
    const { storeId, title } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    if (!String(title || '').trim()) return res.status(400).json({ ok: false, error: 'section ka naam chahiye' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const r = await etsy(conn, `/shops/${conn.shop_id}/sections`, { method: 'POST', body: form({ title: String(title).trim().slice(0, 24) }) })
    res.json({ ok: true, id: r.shop_section_id, title: r.title })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// POST /api/etsy/return-policy/create { storeId, acceptsReturns, acceptsExchanges, deadline }
// deadline (days) sirf tab jab returns/exchanges accept hon — Etsy: 7/14/21/30/45/60/90.
router.post('/return-policy/create', requireUser, async (req, res) => {
  try {
    const { storeId, acceptsReturns, acceptsExchanges, deadline } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const body = { accepts_returns: acceptsReturns ? 'true' : 'false', accepts_exchanges: acceptsExchanges ? 'true' : 'false' }
    if (acceptsReturns || acceptsExchanges) body.return_deadline = Number(deadline) || 30
    const r = await etsy(conn, `/shops/${conn.shop_id}/policies/return`, { method: 'POST', body: form(body) })
    res.json({ ok: true, id: r.return_policy_id })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// POST /api/etsy/shipping-profile/create
// { storeId, title, originCountry, originZip, minProcessing, maxProcessing,
//   primaryCost, secondaryCost, minDelivery, maxDelivery }
// Ek "Everywhere" destination ke saath profile banta hai — details Etsy par edit ho sakti hain.
router.post('/shipping-profile/create', requireUser, async (req, res) => {
  try {
    const { storeId, title, originCountry, originZip, minProcessing, maxProcessing, primaryCost, secondaryCost, minDelivery, maxDelivery } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    if (!String(title || '').trim() || !originCountry) return res.status(400).json({ ok: false, error: 'title aur origin country chahiye' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const body = {
      title: String(title).trim(),
      origin_country_iso: String(originCountry).toUpperCase(),
      primary_cost: Number(primaryCost) || 0,
      secondary_cost: Number(secondaryCost) || 0,
      min_processing_time: Number(minProcessing) || 1,
      max_processing_time: Number(maxProcessing) || 3,
      destination_region: 'none',              // "everywhere else" entry
    }
    if (originZip) body.origin_postal_code = String(originZip)
    if (minDelivery) body.min_delivery_days = Number(minDelivery)
    if (maxDelivery) body.max_delivery_days = Number(maxDelivery)
    const r = await etsy(conn, `/shops/${conn.shop_id}/shipping-profiles`, { method: 'POST', body: form(body) })
    res.json({ ok: true, id: r.shipping_profile_id })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// GET /api/etsy/readiness?storeId=...
// Shop ke PROCESSING profiles (Etsy "readiness states" — e.g. Made to order: 1-2 days).
// Ye Etsy par bante hain; API se sirf list milti hai (create ka endpoint nahi hai).
router.get('/readiness', requireUser, async (req, res) => {
  try {
    const { storeId } = req.query
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const r = await etsy(conn, `/shops/${conn.shop_id}/readiness-state-definitions`)
    const list = r.results || r.readiness_state_definitions || []
    res.json({
      ok: true,
      states: list.map((x) => ({
        id: x.readiness_state_definition_id || x.readiness_state_id || x.id,
        label: x.description || x.readiness_state ||
          (x.min_processing_time ? `${x.min_processing_time}–${x.max_processing_time} ${x.processing_time_unit || 'days'}` : `Profile ${x.readiness_state_definition_id || x.id}`),
      })).filter((x) => x.id),
    })
  } catch (e) {
    // purane shops par ye endpoint na ho to editor phir bhi chale
    res.json({ ok: true, states: [] })
  }
})

// GET /api/etsy/partners?storeId=...
// Shop ke production partners (Etsy → Settings → Production partners wale).
router.get('/partners', requireUser, async (req, res) => {
  try {
    const { storeId } = req.query
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const r = await etsy(conn, `/shops/${conn.shop_id}/production-partners`)
    res.json({ ok: true, partners: (r.results || []).map((p) => ({ id: p.production_partner_id, name: p.partner_name, location: p.location || '' })) })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
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
      body: form({
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

    // 2) upload photos (Etsy: max 20, order preserved)
    let uploaded = 0
    const imgErrors = []
    for (const dataUrl of images.slice(0, 20)) {
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

// GET /api/etsy/connections — ALL of this user's store->shop links in one go
// (feeds the sidebar shop-switcher: which store shows which Etsy shop name).
router.get('/connections', requireUser, async (req, res) => {
  try {
    const rows = await q('select store_id, shop_name from etsy_connections where user_id=$1', [req.user.id])
    res.json({ ok: true, connections: rows.map((r) => ({ storeId: r.store_id, shopName: r.shop_name })) })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// ---------- 5. shop browser (the "Etsy Store" screen — like Vela) ----------

// Turn Etsy's money object {amount:1398, divisor:100, currency_code:'USD'} into "13.98"
const money = (p) => (p && p.amount ? (p.amount / (p.divisor || 100)).toFixed(2) : null)

// GET /api/etsy/listings?storeId=...&state=active&offset=0&limit=25
// One page of the shop's listings WITH thumbnail, price, stock, views.
router.get('/listings', requireUser, async (req, res) => {
  try {
    const { storeId, state = 'active' } = req.query
    const limit = Math.min(50, parseInt(req.query.limit) || 25)
    const offset = Math.max(0, parseInt(req.query.offset) || 0)
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const r = await etsy(conn, `/shops/${conn.shop_id}/listings?state=${encodeURIComponent(state)}&limit=${limit}&offset=${offset}&includes=Images`)
    res.json({
      ok: true,
      count: r.count || 0,
      listings: (r.results || []).map((l) => ({
        id: l.listing_id,
        title: l.title,
        state: l.state,
        quantity: l.quantity,
        views: l.views,
        price: money(l.price),
        currency: l.price?.currency_code || 'USD',
        img: l.images?.[0]?.url_170x135 || l.images?.[0]?.url_570xN || null,
        ending: l.ending_timestamp ? new Date(l.ending_timestamp * 1000).toISOString().slice(0, 10) : null,
      })),
    })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// GET /api/etsy/counts?storeId=...
// How many listings in each state (for the tabs: Active 903 / Draft 4 / ...).
// One tiny request per state (limit=1 — we only need the count).
router.get('/counts', requireUser, async (req, res) => {
  try {
    const { storeId } = req.query
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const states = ['active', 'draft', 'expired', 'inactive', 'sold_out']
    const counts = {}
    for (const st of states) {
      try { const r = await etsy(conn, `/shops/${conn.shop_id}/listings?state=${st}&limit=1`); counts[st] = r.count || 0 }
      catch { counts[st] = 0 }
    }
    res.json({ ok: true, counts })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// GET /api/etsy/listing?storeId=...&id=...
// Full details of ONE listing (read-only detail view): all images,
// description, tags, price, personalization.
router.get('/listing', requireUser, async (req, res) => {
  try {
    const { storeId, id } = req.query
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const l = await etsy(conn, `/listings/${encodeURIComponent(id)}?includes=Images,Videos`)
    // current attribute values (Sleeve length: Short sleeve, ...) — best-effort
    let props = []
    try {
      const pr = await etsy(conn, `/shops/${conn.shop_id}/listings/${encodeURIComponent(id)}/properties`)
      props = (pr.results || []).map((p) => ({ propertyId: p.property_id, name: p.property_name, valueIds: p.value_ids || [], values: p.values || [] }))
    } catch {}
    res.json({
      ok: true,
      listing: {
        id: l.listing_id,
        title: l.title,
        state: l.state,
        description: l.description,
        tags: l.tags || [],
        materials: l.materials || [],
        quantity: l.quantity,
        views: l.views,
        favorites: l.num_favorers,
        price: money(l.price),
        currency: l.price?.currency_code || 'USD',
        url: l.url,
        images: (l.images || []).map((im) => ({
          id: im.listing_image_id,
          url: im.url_570xN || im.url_fullxfull,
          full: im.url_fullxfull || im.url_570xN || null,   // download ke liye
          alt: im.alt_text || '',                            // ⚠ warning jab khali ho
        })).filter((x) => x.url),
        video: l.videos?.[0] ? { id: l.videos[0].video_id, url: l.videos[0].video_url, thumb: l.videos[0].thumbnail_url } : null,
        personalization: { enabled: !!l.is_personalizable, required: !!l.personalization_is_required, instructions: l.personalization_instructions || '', charMax: l.personalization_char_count_max || null },
        hasVariations: !!l.has_variations,
        section_id: l.shop_section_id || null,
        autoRenew: !!l.should_auto_renew,
        taxonomyId: l.taxonomy_id || null,
        whoMade: l.who_made || null,
        whenMade: l.when_made || null,
        isSupply: !!l.is_supply,                              // "What is it?" — supply ya finished product
        type: l.type || 'physical',                           // physical | download | both
        partnerIds: (l.production_partners || []).map((p) => p.production_partner_id),
        readinessStateId: l.readiness_state_id || null,       // processing profile
        itemWeight: l.item_weight || '',
        weightUnit: l.item_weight_unit || 'oz',
        itemLength: l.item_length || '',
        itemWidth: l.item_width || '',
        itemHeight: l.item_height || '',
        dimUnit: l.item_dimensions_unit || 'in',
        shippingProfileId: l.shipping_profile_id || null,
        returnPolicyId: l.return_policy_id || null,
        properties: props,
        created: l.created_timestamp ? new Date(l.created_timestamp * 1000).toISOString().slice(0, 10) : null,
      },
    })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// ---------- 6. EDIT (E2): shop sections + save basic fields ----------

// GET /api/etsy/sections?storeId=...
// The shop's OWN sections (Trendy, Halloween, ...) for the Section dropdown.
router.get('/sections', requireUser, async (req, res) => {
  try {
    const { storeId } = req.query
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const r = await etsy(conn, `/shops/${conn.shop_id}/sections`)
    res.json({ ok: true, sections: (r.results || []).map((x) => ({ id: x.shop_section_id, title: x.title })) })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// POST /api/etsy/listing/update
// { storeId, id, patch: { title, description, tags[], materials[], sectionId, autoRenew } }
// Saves the basic fields straight to the live listing on Etsy (updateListing).
// (Price/quantity/variations live in Etsy's inventory system — that is the
//  next milestone, E4 — so they are not accepted here on purpose.)
router.post('/listing/update', requireUser, async (req, res) => {
  try {
    const { storeId, id, patch = {} } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const body = {}
    if (patch.title !== undefined) body.title = String(patch.title).slice(0, 140)
    if (patch.description !== undefined) body.description = String(patch.description)
    if (patch.tags !== undefined) body.tags = (patch.tags || []).slice(0, 13)
    if (patch.materials !== undefined) body.materials = (patch.materials || []).slice(0, 13)
    if (patch.sectionId !== undefined && patch.sectionId) body.shop_section_id = Number(patch.sectionId)
    if (patch.autoRenew !== undefined) body.should_auto_renew = patch.autoRenew ? 'true' : 'false'
    if (patch.whoMade !== undefined) body.who_made = String(patch.whoMade)
    if (patch.whenMade !== undefined) body.when_made = String(patch.whenMade)
    if (patch.isSupply !== undefined) body.is_supply = patch.isSupply ? 'true' : 'false'
    if (patch.type !== undefined && patch.type) body.type = String(patch.type)             // physical | download
    if (patch.taxonomyId !== undefined && patch.taxonomyId) body.taxonomy_id = Number(patch.taxonomyId)
    if (patch.partnerIds !== undefined) body.production_partner_ids = patch.partnerIds || []
    // shipping tab: processing profile + weight/dimensions
    if (patch.readinessStateId !== undefined && patch.readinessStateId) body.readiness_state_id = Number(patch.readinessStateId)
    if (patch.itemWeight !== undefined && patch.itemWeight !== '') body.item_weight = Number(patch.itemWeight)
    if (patch.weightUnit !== undefined && patch.weightUnit) body.item_weight_unit = String(patch.weightUnit)
    if (patch.itemLength !== undefined && patch.itemLength !== '') body.item_length = Number(patch.itemLength)
    if (patch.itemWidth !== undefined && patch.itemWidth !== '') body.item_width = Number(patch.itemWidth)
    if (patch.itemHeight !== undefined && patch.itemHeight !== '') body.item_height = Number(patch.itemHeight)
    if (patch.dimUnit !== undefined && patch.dimUnit) body.item_dimensions_unit = String(patch.dimUnit)
    if (patch.shippingProfileId !== undefined && patch.shippingProfileId) body.shipping_profile_id = Number(patch.shippingProfileId)
    if (patch.returnPolicyId !== undefined && patch.returnPolicyId) body.return_policy_id = Number(patch.returnPolicyId)
    // personalization (Vela's Personalization tab)
    if (patch.personalizable !== undefined) body.is_personalizable = patch.personalizable ? 'true' : 'false'
    if (patch.persRequired !== undefined) body.personalization_is_required = patch.persRequired ? 'true' : 'false'
    if (patch.persInstructions !== undefined) body.personalization_instructions = String(patch.persInstructions).slice(0, 1024)
    if (patch.persCharMax !== undefined && patch.persCharMax) body.personalization_char_count_max = Number(patch.persCharMax)
    if (!Object.keys(body).length) return res.status(400).json({ ok: false, error: 'kuch badla hi nahi' })
    const l = await etsy(conn, `/shops/${conn.shop_id}/listings/${encodeURIComponent(id)}`, { method: 'PATCH', body: form(body) })
    res.json({ ok: true, title: l.title })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// ---------- 7. EDIT (E3): category properties, enums, return policies ----------

// GET /api/etsy/properties?storeId=...&taxonomyId=...
// For a category, Etsy tells us WHICH attributes exist (Sleeve length,
// Neckline, Primary color, Holiday...) and the EXACT allowed options of each —
// the same lists Etsy shows in its own listing form.
router.get('/properties', requireUser, async (req, res) => {
  try {
    const { taxonomyId } = req.query
    if (!taxonomyId) return res.status(400).json({ ok: false, error: 'taxonomyId chahiye' })
    const r = await fetch(`https://api.etsy.com/v3/application/seller-taxonomy/nodes/${encodeURIComponent(taxonomyId)}/properties`, { headers: { 'x-api-key': apiKeyHdr() } })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || 'properties fetch failed')
    res.json({
      ok: true,
      properties: (j.results || []).map((p) => ({
        propertyId: p.property_id,
        name: p.display_name || p.name,
        required: !!p.is_required,
        multi: (p.max_values_allowed || 1) > 1,
        options: (p.possible_values || []).map((v) => ({ id: v.value_id, name: v.name })),
      })).filter((p) => p.options.length),   // only dropdown-style attributes
    })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// POST /api/etsy/listing/property { storeId, id, propertyId, valueIds[], values[] }
// Set (or clear) ONE attribute on the listing — e.g. Sleeve length = Short sleeve.
router.post('/listing/property', requireUser, async (req, res) => {
  try {
    const { storeId, id, propertyId, valueIds = [], values = [] } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    if (!valueIds.length) {
      // empty selection = remove the attribute from the listing
      await etsy(conn, `/shops/${conn.shop_id}/listings/${encodeURIComponent(id)}/properties/${encodeURIComponent(propertyId)}`, { method: 'DELETE' })
      return res.json({ ok: true, cleared: true })
    }
    await etsy(conn, `/shops/${conn.shop_id}/listings/${encodeURIComponent(id)}/properties/${encodeURIComponent(propertyId)}`, {
      method: 'PUT',
      body: form({ value_ids: valueIds, values }),
    })
    res.json({ ok: true })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// GET /api/etsy/return-policies?storeId=...
router.get('/return-policies', requireUser, async (req, res) => {
  try {
    const { storeId } = req.query
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const r = await etsy(conn, `/shops/${conn.shop_id}/policies/return`)
    res.json({
      ok: true,
      policies: (r.results || []).map((p) => ({
        id: p.return_policy_id,
        label: p.accepts_returns || p.accepts_exchanges
          ? `Returns${p.accepts_returns ? ' ✓' : ' ✗'} · Exchanges${p.accepts_exchanges ? ' ✓' : ' ✗'}${p.return_deadline ? ' · ' + p.return_deadline + ' days' : ''}`
          : 'No returns or exchanges',
      })),
    })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// GET /api/etsy/enums — who_made / when_made ke CURRENT allowed values.
// We read them from Etsy's own machine-readable spec (cached 24h) so the
// dropdowns never go stale when Etsy renames an era (e.g. 2020_2026).
let ENUMS = { at: 0, whoMade: [], whenMade: [] }
router.get('/enums', requireUser, async (_req, res) => {
  try {
    if (Date.now() - ENUMS.at > 24 * 3600 * 1000 || !ENUMS.whenMade.length) {
      const r = await fetch('https://www.etsy.com/openapi/generated/oas/3.0.0.json')
      const spec = await r.json()
      const found = { who_made: null, when_made: null }
      const walk = (o) => {
        if (!o || typeof o !== 'object') return
        for (const [k, v] of Object.entries(o)) {
          if ((k === 'who_made' || k === 'when_made') && v && Array.isArray(v.enum) && !found[k]) found[k] = v.enum
          walk(v)
        }
      }
      walk(spec)
      ENUMS = {
        at: Date.now(),
        whoMade: found.who_made || ['i_did', 'someone_else', 'collective'],
        whenMade: found.when_made || ['made_to_order', '2020_2026', '2010_2019', 'before_2010'],
      }
    }
    res.json({ ok: true, whoMade: ENUMS.whoMade, whenMade: ENUMS.whenMade })
  } catch (e) {
    // spec fetch failed -> sensible fallback so the editor still works
    res.json({ ok: true, whoMade: ['i_did', 'someone_else', 'collective'], whenMade: ['made_to_order', '2020_2026', '2010_2019', 'before_2010'] })
  }
})

// ---------- 8. EDIT (E4): variations / inventory ----------
// Etsy's inventory model: a listing has PRODUCTS (one per variation combo,
// e.g. "Unisex T-Shirt S / White"), each with OFFERINGS (price, quantity,
// on/off). price_on_property tells WHICH dimension the price varies by.

// GET /api/etsy/inventory?storeId=...&id=...
router.get('/inventory', requireUser, async (req, res) => {
  try {
    const { storeId, id } = req.query
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const r = await etsy(conn, `/listings/${encodeURIComponent(id)}/inventory`)
    res.json({
      ok: true,
      priceOnProperty: r.price_on_property || [],
      quantityOnProperty: r.quantity_on_property || [],
      skuOnProperty: r.sku_on_property || [],
      products: (r.products || []).map((p) => ({
        // the combo's name, e.g. "Unisex T-Shirt S / White"
        label: (p.property_values || []).map((v) => (v.values || []).join(', ')).join(' / ') || '—',
        sku: p.sku || '',
        // keep the raw property_values so we can echo them back EXACTLY on save
        propertyValues: (p.property_values || []).map((v) => ({ property_id: v.property_id, property_name: v.property_name, value_ids: v.value_ids, values: v.values })),
        price: money(p.offerings?.[0]?.price),
        quantity: p.offerings?.[0]?.quantity ?? 0,
        enabled: !!p.offerings?.[0]?.is_enabled,
        // Etsy (Oct 2025 se): physical listings ke har offering par readiness_state_id
        // zaruri hai — isay save par WAPAS bhejna parta hai warna Etsy reject karta hai
        readinessStateId: p.offerings?.[0]?.readiness_state_id || null,
      })),
    })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// POST /api/etsy/inventory/update
// { storeId, id, priceOnProperty[], quantityOnProperty[], skuOnProperty[],
//   products: [{sku, propertyValues, price, quantity, enabled}] }
// Etsy's rule: this endpoint REPLACES the whole inventory, so we send back
// every product (with its original property_values) + the edited numbers.
router.post('/inventory/update', requireUser, async (req, res) => {
  try {
    const { storeId, id, priceOnProperty = [], quantityOnProperty = [], skuOnProperty = [], products = [] } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    if (!products.length) return res.status(400).json({ ok: false, error: 'products khali hain' })
    const body = {
      products: products.map((p) => ({
        sku: p.sku || '',
        property_values: p.propertyValues || [],
        offerings: [{
          price: Number(p.price), quantity: Number(p.quantity) || 0, is_enabled: !!p.enabled,
          ...(p.readinessStateId ? { readiness_state_id: Number(p.readinessStateId) } : {}),
        }],
      })),
      price_on_property: priceOnProperty,
      quantity_on_property: quantityOnProperty,
      sku_on_property: skuOnProperty,
    }
    // inventory endpoint speaks JSON (string body -> our helper sets the JSON header)
    await etsy(conn, `/listings/${encodeURIComponent(id)}/inventory`, { method: 'PUT', body: JSON.stringify(body) })
    res.json({ ok: true })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// ---------- Personalization (Etsy ka NAYA multi-question system) ----------
// 5 questions tak: text_input / dropdown / unlabeled_upload (photo!) / labeled_upload
// + optional text questions par add_on_price ($0.20–$500).

// GET /api/etsy/personalization?storeId=...&id=...
router.get('/personalization', requireUser, async (req, res) => {
  try {
    const { storeId, id } = req.query
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const r = await etsy(conn, `/listings/${encodeURIComponent(id)}/personalization`)
    const list = r.personalization_questions || r.results || []
    res.json({
      ok: true,
      questions: list.map((q) => ({
        id: q.question_id || null,
        type: q.question_type || 'text_input',
        text: q.question_text || '',
        instructions: q.instructions || '',
        required: !!q.required,
        maxChars: q.max_allowed_characters || null,
        maxFiles: q.max_allowed_files || null,
        addOnPrice: q.add_on_price ? (q.add_on_price.amount ? q.add_on_price.amount / (q.add_on_price.divisor || 100) : Number(q.add_on_price) || null) : null,
        options: (q.options || []).map((o) => o.label),
      })),
    })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// POST /api/etsy/personalization { storeId, id, questions: [...] }
// REPLACES the listing's personalization questions (Etsy ka naya endpoint).
router.post('/personalization', requireUser, async (req, res) => {
  try {
    const { storeId, id, questions = [] } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const body = {
      personalization_questions: questions.slice(0, 5).map((q) => {
        const o = { question_type: q.type, question_text: String(q.text || '').slice(0, 45), required: !!q.required }
        if (q.id) o.question_id = q.id
        if (q.type === 'text_input') {
          o.max_allowed_characters = Math.min(1024, Math.max(1, Number(q.maxChars) || 256))
          if (!q.required && q.addOnPrice) o.add_on_price = Number(q.addOnPrice)
        }
        if (q.type === 'unlabeled_upload' || q.type === 'labeled_upload') {
          o.max_allowed_files = Math.min(10, Math.max(1, Number(q.maxFiles) || 1))
        }
        if (q.type === 'labeled_upload') o.options = (q.labels || []).map((l) => ({ label: String(l).slice(0, 45) }))
        if (q.type === 'dropdown') o.options = (q.options || []).slice(0, 30).map((l) => ({ label: String(l).slice(0, 20) }))
        if (q.type !== 'dropdown' && q.instructions) o.instructions = String(q.instructions)
        return o
      }),
    }
    await etsy(conn, `/shops/${conn.shop_id}/listings/${encodeURIComponent(id)}/personalization?supports_multiple_personalization_questions=true`, { method: 'POST', body: JSON.stringify(body) })
    res.json({ ok: true })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// GET /api/etsy/varimages?storeId=...&id=...
// Kis variation-option par kaunsi photo linki hui hai (buyer option chune to wahi dikhe).
router.get('/varimages', requireUser, async (req, res) => {
  try {
    const { storeId, id } = req.query
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const r = await etsy(conn, `/shops/${conn.shop_id}/listings/${encodeURIComponent(id)}/variation-images`)
    res.json({ ok: true, links: (r.results || []).map((x) => ({ propertyId: x.property_id, valueId: x.value_id, imageId: x.image_id })) })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// POST /api/etsy/varimages { storeId, id, links: [{propertyId, valueId, imageId}] }
// REPLACES the listing's variation-image links (Etsy updateVariationImages).
router.post('/varimages', requireUser, async (req, res) => {
  try {
    const { storeId, id, links = [] } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const body = { variation_images: links.map((l) => ({ property_id: Number(l.propertyId), value_id: Number(l.valueId), image_id: Number(l.imageId) })) }
    await etsy(conn, `/shops/${conn.shop_id}/listings/${encodeURIComponent(id)}/variation-images`, { method: 'POST', body: JSON.stringify(body) })
    res.json({ ok: true })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// ---------- 9. EDIT (E5): photos, video, publish ----------

// helper: turn a dataUrl into {bytes, mime}
function fromDataUrl(dataUrl) {
  const [head, b64] = String(dataUrl).split(',')
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream'
  return { bytes: Buffer.from(b64, 'base64'), mime }
}

// POST /api/etsy/listing/image { storeId, id, dataUrl, rank, alt }
// Upload ONE new photo to the listing (Etsy: max 20 photos per listing, Aug 2025 se).
router.post('/listing/image', requireUser, async (req, res) => {
  try {
    const { storeId, id, dataUrl, rank, alt } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const { bytes, mime } = fromDataUrl(dataUrl)
    const fd = new FormData()
    fd.append('image', new Blob([bytes], { type: mime }), `photo.${mime.includes('png') ? 'png' : 'jpg'}`)
    if (rank) fd.append('rank', String(rank))
    if (alt) fd.append('alt_text', String(alt).slice(0, 500))
    const r = await etsy(conn, `/shops/${conn.shop_id}/listings/${encodeURIComponent(id)}/images`, { method: 'POST', body: fd })
    res.json({ ok: true, imageId: r.listing_image_id })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// GET /api/etsy/imgfetch?url=...
// Photo-editor ke liye: Etsy CDN ki image ke pixels chahiye hote hain,
// magar browser ka CORS direct fetch rok deta hai — to backend utha kar deta hai.
// Sirf *.etsystatic.com allowed (security: koi aur URL fetch nahi hoga).
router.get('/imgfetch', requireUser, async (req, res) => {
  try {
    const u = new URL(String(req.query.url || ''))
    if (!/(^|\.)etsystatic\.com$/.test(u.hostname) || u.protocol !== 'https:') {
      return res.status(400).json({ ok: false, error: 'sirf Etsy ki images' })
    }
    const r = await fetch(u.href)
    if (!r.ok) return res.status(r.status).json({ ok: false, error: 'image fetch failed' })
    res.set('content-type', r.headers.get('content-type') || 'image/jpeg')
    res.set('cache-control', 'private, max-age=300')
    res.send(Buffer.from(await r.arrayBuffer()))
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// POST /api/etsy/listing/image/alt { storeId, id, imageId, alt, rank }
// Alt text set/change karna: Etsy me maujuda image ko usi ke listing_image_id
// ke saath dobara POST karte hain (file dobara upload NAHI hoti) + alt_text.
// rank saath bhejna zaruri hai warna Etsy usay rank 1 par le aata hai.
router.post('/listing/image/alt', requireUser, async (req, res) => {
  try {
    const { storeId, id, imageId, alt = '', rank } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const fd = new FormData()
    fd.append('listing_image_id', String(imageId))
    if (rank) fd.append('rank', String(rank))
    fd.append('alt_text', String(alt).slice(0, 500))
    await etsy(conn, `/shops/${conn.shop_id}/listings/${encodeURIComponent(id)}/images`, { method: 'POST', body: fd })
    res.json({ ok: true })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// POST /api/etsy/listing/image/delete { storeId, id, imageId }
router.post('/listing/image/delete', requireUser, async (req, res) => {
  try {
    const { storeId, id, imageId } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    await etsy(conn, `/shops/${conn.shop_id}/listings/${encodeURIComponent(id)}/images/${encodeURIComponent(imageId)}`, { method: 'DELETE' })
    res.json({ ok: true })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// POST /api/etsy/listing/image/order { storeId, id, order: [imageId...] }
// Re-rank existing photos: Etsy's way is re-POSTing each image id with its new rank.
router.post('/listing/image/order', requireUser, async (req, res) => {
  try {
    const { storeId, id, order = [] } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    for (let i = 0; i < order.length; i++) {
      const fd = new FormData()
      fd.append('listing_image_id', String(order[i]))
      fd.append('rank', String(i + 1))
      await etsy(conn, `/shops/${conn.shop_id}/listings/${encodeURIComponent(id)}/images`, { method: 'POST', body: fd })
    }
    res.json({ ok: true })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// POST /api/etsy/listing/video { storeId, id, dataUrl, name }
// Upload/replace the listing's video (Etsy: 1 video, max 100MB; our JSON
// transport comfortably carries ~15MB — the app's slideshow videos are ~5MB).
router.post('/listing/video', requireUser, async (req, res) => {
  try {
    const { storeId, id, dataUrl, name = 'listing-video.mp4' } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const { bytes, mime } = fromDataUrl(dataUrl)
    const fd = new FormData()
    fd.append('video', new Blob([bytes], { type: mime || 'video/mp4' }), name)
    fd.append('name', name)
    const r = await etsy(conn, `/shops/${conn.shop_id}/listings/${encodeURIComponent(id)}/videos`, { method: 'POST', body: fd })
    res.json({ ok: true, videoId: r.video_id })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// POST /api/etsy/listing/video/delete { storeId, id, videoId }
router.post('/listing/video/delete', requireUser, async (req, res) => {
  try {
    const { storeId, id, videoId } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    await etsy(conn, `/shops/${conn.shop_id}/listings/${encodeURIComponent(id)}/videos/${encodeURIComponent(videoId)}`, { method: 'DELETE' })
    res.json({ ok: true })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// POST /api/etsy/listing/state { storeId, id, state: 'active' | 'inactive' }
// PUBLISH (draft/inactive -> active) or deactivate. Publishing a brand-new
// draft is when Etsy charges its own $0.20 listing fee — the frontend
// always shows a confirm dialog before calling this.
router.post('/listing/state', requireUser, async (req, res) => {
  try {
    const { storeId, id, state } = req.body
    if (!['active', 'inactive'].includes(state)) return res.status(400).json({ ok: false, error: 'state sirf active/inactive ho sakti hai' })
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const l = await etsy(conn, `/shops/${conn.shop_id}/listings/${encodeURIComponent(id)}`, { method: 'PATCH', body: form({ state }) })
    res.json({ ok: true, state: l.state })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// ---------- 10. shop INDEX (powers the Vela-style filter sidebar) ----------
// One call fetches ALL listings of a state (pages of 100) with the facts
// needed for filtering: section, shipping profile, return policy, video.
// Cached in memory for 10 minutes per shop+state (Etsy rate-limit friendly).
const IDX_CACHE = new Map()
router.get('/index', requireUser, async (req, res) => {
  try {
    const { storeId, state = 'active' } = req.query
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    const ck = `${conn.shop_id}:${state}`
    const hit = IDX_CACHE.get(ck)
    if (hit && Date.now() - hit.at < 10 * 60 * 1000 && !req.query.fresh) return res.json({ ok: true, cached: true, listings: hit.listings })

    const listings = []
    let offset = 0, total = Infinity
    while (offset < total && offset < 5000) {   // safety cap
      const r = await etsy(conn, `/shops/${conn.shop_id}/listings?state=${encodeURIComponent(state)}&limit=100&offset=${offset}&includes=Images,Videos`)
      total = r.count || 0
      for (const l of r.results || []) {
        listings.push({
          id: l.listing_id,
          title: l.title,
          state: l.state,
          quantity: l.quantity,
          views: l.views,
          price: money(l.price),
          currency: l.price?.currency_code || 'USD',
          img: l.images?.[0]?.url_170x135 || l.images?.[0]?.url_570xN || null,
          ending: l.ending_timestamp ? new Date(l.ending_timestamp * 1000).toISOString().slice(0, 10) : null,
          created: l.created_timestamp || 0,
          sectionId: l.shop_section_id || null,
          shipId: l.shipping_profile_id || null,
          retId: l.return_policy_id || null,
          video: !!(l.videos && l.videos.length),
        })
      }
      if (!(r.results || []).length) break
      offset += 100
    }
    IDX_CACHE.set(ck, { at: Date.now(), listings })
    res.json({ ok: true, cached: false, listings })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

// POST /api/etsy/listing/delete { storeId, id } — permanently delete a listing on Etsy.
router.post('/listing/delete', requireUser, async (req, res) => {
  try {
    const { storeId, id } = req.body
    if (!storeId || !(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const conn = await getConn(storeId)
    if (!conn) return res.status(400).json({ ok: false, error: 'Etsy connected nahi hai' })
    await etsy(conn, `/listings/${encodeURIComponent(id)}`, { method: 'DELETE' })
    IDX_CACHE.clear()   // index is stale now
    res.json({ ok: true })
  } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }) }
})

export default router
