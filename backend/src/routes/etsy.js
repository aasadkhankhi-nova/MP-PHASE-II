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
    const l = await etsy(conn, `/listings/${encodeURIComponent(id)}?includes=Images`)
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
        images: (l.images || []).map((im) => im.url_570xN || im.url_fullxfull).filter(Boolean),
        personalization: { enabled: !!l.is_personalizable, required: !!l.personalization_is_required, instructions: l.personalization_instructions || '' },
        section_id: l.shop_section_id || null,
        autoRenew: !!l.should_auto_renew,
        taxonomyId: l.taxonomy_id || null,
        whoMade: l.who_made || null,
        whenMade: l.when_made || null,
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
    if (patch.shippingProfileId !== undefined && patch.shippingProfileId) body.shipping_profile_id = Number(patch.shippingProfileId)
    if (patch.returnPolicyId !== undefined && patch.returnPolicyId) body.return_policy_id = Number(patch.returnPolicyId)
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
        offerings: [{ price: Number(p.price), quantity: Number(p.quantity) || 0, is_enabled: !!p.enabled }],
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

export default router
