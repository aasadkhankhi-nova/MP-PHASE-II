/**
 * Listings.jsx — Create listings: photos + SEO, all in ONE press.
 * A listing = chosen designs + chosen mockups + category/keywords.
 * The wizard's final "Create listing" button does EVERYTHING:
 *   1. generates the product photos (compose.js engine)
 *   2. generates the Etsy SEO (title, tags, description, ALT) via AI
 * There is no separate SEO screen/button — SEO is part of creating a listing.
 * Two views in one file:
 *   Listings   — the list of all listings (cards, with copyable SEO fields)
 *   ListingWizard — one listing opened: pick designs, pick mockups
 *                   (whole sets or singles), press Create listing.
 */
import React, { useState, useEffect } from 'react'
import { useApp } from '../store/AppState.jsx'
import { Empty, confirmDel } from '../components/ui.jsx'
import { dnumLabel } from '../store/helpers.js'
import { desDnum, runGeneration } from '../store/compose.js'
import { uid } from '../store/helpers.js'
import { genSeo, getGeminiKey, etsy } from '../api.js'

export default function Listings() {
  const app = useApp()
  const [openId, setOpenId] = useState(null)  // which listing is open in the wizard

  // Create an empty draft listing and open it.
  const create = async () => {
    const L = { id: uid(), name: 'Listing ' + (app.ws.listings.length + 1), designIds: [], mockupIds: [], category: '', keywords: '', outputs: [], report: null, created: Date.now() }
    await app.updListing(L.id, L, true)
    setOpenId(L.id)
  }

  if (openId) {
    const L = app.ws.listings.find((x) => x.id === openId)
    if (L) return <ListingWizard L={L} onBack={() => setOpenId(null)} />
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>🧾 Listings <span className="chip">{app.ws.listings.length}</span></h3>
        <p className="muted">Ek listing = designs + mockups ka combo → generated photos + SEO.</p>
        <button className="btn" onClick={create}>＋ New listing</button>
      </div>
      <div className="grid">
        {app.ws.listings.map((L) => (
          <div key={L.id} className="card">
            <b className="ellip">{L.name}</b>
            <div style={{ display: 'flex', gap: 5, margin: '8px 0', flexWrap: 'wrap' }}>
              <span className="chip">{L.designIds.length} designs</span>
              <span className="chip">{L.mockupIds.length} mockups</span>
              <span className={'chip' + (L.outputs?.length ? ' ok' : '')}>{L.outputs?.length || 0} outputs</span>
              {L.seo && <span className="chip ok">✨ SEO</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn sm" onClick={() => setOpenId(L.id)}>Open</button>
              <button className="btn sm danger" onClick={() => confirmDel(`listing "${L.name}"`) && app.delListing(L.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>
      {!app.ws.listings.length && <Empty>Abhi koi listing nahi.</Empty>}
    </>
  )
}

/** The opened listing: 3 steps (designs, mockups, generate) on one page. */
function ListingWizard({ L, onBack }) {
  const app = useApp()
  const [prog, setProg] = useState(null)   // generation progress {i, n, name}
  const set = (patch) => app.updListing(L.id, patch)

  // toggle helpers for the pick-grids
  const togDesign = (id) =>
    set({ designIds: L.designIds.includes(id) ? L.designIds.filter((x) => x !== id) : [...L.designIds, id] })
  const togMockup = (id) =>
    set({ mockupIds: L.mockupIds.includes(id) ? L.mockupIds.filter((x) => x !== id) : [...L.mockupIds, id] })
  // toggle a whole SET of mockups at once
  const togSet = (sid) => {
    const ids = app.ws.mockups.filter((m) => (m.setIds || []).includes(sid)).map((m) => m.id)
    const all = ids.every((id) => L.mockupIds.includes(id))
    set({ mockupIds: all ? L.mockupIds.filter((id) => !ids.includes(id)) : [...new Set([...L.mockupIds, ...ids])] })
  }

  // "Create listing" = the ONE button that does the whole job:
  // photos first (compose.js engine), then Etsy SEO (AI) — no separate SEO step.
  const createListing = async () => {
    const designs = app.ws.designs.filter((d) => L.designIds.includes(d.id))
    const mockups = app.ws.mockups.filter((m) => L.mockupIds.includes(m.id))
    if (!designs.length) return alert('Kam az kam 1 design select karein')
    if (!mockups.length) return alert('Kam az kam 1 mockup select karein')
    const noBox = mockups.filter((m) => !(m.boxes || []).length)
    if (noBox.length && !window.confirm(`${noBox.length} mockup(s) me boxes nahi hain — un par design center me lagega. Jari rakhein?`)) return

    // --- part 1: product photos ---
    const r = await runGeneration({ mockups, designs, onProgress: (i, n, name) => setProg({ label: `${i + 1} / ${n} — ${name}` }) })
    // outputs stay local (large); the "missed" report tells which boxes found no design
    await set({ outputs: r.outputs, report: { missed: r.missed, at: Date.now() } })

    // --- part 2: Etsy SEO (needs the user's Gemini key from Settings) ---
    let seoErr = null
    if (getGeminiKey()) {
      setProg({ label: '✨ SEO ban raha hai…' })
      try {
        const images = designs.slice(0, 3).map((d) => d.dataUrl.split(',')[1])
        const res = await genSeo({ images, category: L.category || 'Canvas Wall Art', keywords: L.keywords || '' })
        await set({ seo: res.seo })
      } catch (e) { seoErr = String(e.message || e) }
    } else {
      seoErr = 'API key nahi mili — Settings (apne naam par click) me Gemini key dalein, phir dobara Create listing dabayein.'
    }
    await set({ seoErr })
    setProg(null)
  }

  return (
    <>
      <div className="card">
        <div className="topbar" style={{ marginBottom: 6 }}>
          <input value={L.name} onChange={(e) => set({ name: e.target.value })} style={{ fontWeight: 700, fontSize: 16, minWidth: 240 }} />
          <button className="btn sm ghost" onClick={onBack}>← Back</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Category (e.g. Canvas Wall Art)" value={L.category} onChange={(e) => set({ category: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
          <input placeholder="Keywords (optional)" value={L.keywords} onChange={(e) => set({ keywords: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
        </div>
      </div>

      {/* STEP 1: pick designs (each card shows its Design # chip) */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>1 · Designs <span className="chip">{L.designIds.length} selected</span></h3>
        <div className="grid">
          {app.ws.designs.map((d) => (
            <div key={d.id} className={'card item-card pick' + (L.designIds.includes(d.id) ? ' sel' : '')} onClick={() => togDesign(d.id)}>
              <div className="thumb" style={{ background: d.variant === 'light-design' ? '#1e293b' : '#f1f3f9' }}>
                <img src={d.dataUrl} alt={d.name} style={{ objectFit: 'contain' }} />
              </div>
              <span className="chip">{dnumLabel(desDnum(d))}</span>
              <b className="ellip">{d.name}</b>
            </div>
          ))}
        </div>
        {!app.ws.designs.length && <Empty>Pehle Designs screen par designs upload karein.</Empty>}
      </div>

      {/* STEP 2: pick mockups — set buttons toggle whole groups */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>2 · Mockups <span className="chip">{L.mockupIds.length} selected</span></h3>
        {app.ws.sets.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {app.ws.sets.map((s) => (
              <button key={s.id} className="chip clickable" onClick={() => togSet(s.id)}>🗂️ {s.name} (toggle all)</button>
            ))}
          </div>
        )}
        <div className="grid">
          {app.ws.mockups.map((m) => (
            <div key={m.id} className={'card item-card pick' + (L.mockupIds.includes(m.id) ? ' sel' : '')} onClick={() => togMockup(m.id)}>
              <div className="thumb"><img src={m.dataUrl} alt={m.name} /></div>
              <b className="ellip">{m.name}</b>
              <span className="chip">{(m.boxes || []).length} boxes</span>
            </div>
          ))}
        </div>
        {!app.ws.mockups.length && <Empty>Pehle Mockups screen par photos upload karein.</Empty>}
      </div>

      {/* STEP 3: the one big button — photos + SEO together */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>3 · Create listing</h3>
        <p className="muted">Ye button sab kuch karega: {L.mockupIds.length} product photos + Etsy SEO (title, tags, description, ALT).</p>
        {prog ? (
          <p className="muted">⏳ {prog.label}</p>
        ) : (
          <button className="btn" onClick={createListing}>🧾 Create listing</button>
        )}
        {L.report && L.report.missed.length > 0 && (
          <p className="muted" style={{ color: 'var(--warn)', marginTop: 10 }}>
            ⚠ {L.report.missed.length} box(es) ko design nahi mila: {L.report.missed.slice(0, 6).join(' · ')}{L.report.missed.length > 6 ? '…' : ''}
          </p>
        )}
        {L.seoErr && <p className="muted" style={{ color: 'var(--warn)', marginTop: 8 }}>⚠ SEO: {L.seoErr}</p>}
      </div>

      {/* Etsy SEO fields — filled automatically by Create listing; copy into Etsy */}
      {L.seo && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>✨ Etsy SEO <span className="chip ok">ready</span></h3>
          <SeoField label="Title" value={L.seo.title} />
          <SeoField label="Tags" value={(L.seo.tags || []).join(', ')} />
          <SeoField label="Description" value={L.seo.description} multi />
          <SeoField label="ALT text" value={L.seo.alt} multi />
        </div>
      )}

      {/* Send to Etsy — appears once photos are generated. Creates a DRAFT
          on the connected Etsy shop; the seller publishes it on Etsy. */}
      {L.outputs?.length > 0 && <EtsyPublish L={L} onSaved={(patch) => set(patch)} />}

      {/* eslint-disable-next-line */}
      {/* results of this listing (Results screen shows all listings together) */}
      {L.outputs?.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>📦 Outputs <span className="chip ok">{L.outputs.length}</span></h3>
          <div className="grid">
            {L.outputs.map((o) => (
              <div key={o.id} className="card item-card">
                <div className="thumb"><img src={o.dataUrl} alt={o.name} /></div>
                <b className="ellip">{o.name}</b>
                <a className="btn sm ghost" style={{ marginTop: 6, textAlign: 'center', textDecoration: 'none' }} href={o.dataUrl} download={o.name + '.jpg'}>⬇ PNG</a>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/** One labeled read-only SEO field with a Copy button (input or textarea). */
function SeoField({ label, value, multi }) {
  const copy = () => navigator.clipboard.writeText(value || '')
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="topbar" style={{ margin: '0 0 4px' }}>
        <span className="muted" style={{ fontWeight: 600 }}>{label}</span>
        <button className="btn sm ghost" onClick={copy}>📋 Copy</button>
      </div>
      {multi ? (
        <textarea readOnly value={value || ''} rows={3} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: 8, fontSize: 13 }} />
      ) : (
        <input readOnly value={value || ''} style={{ width: '100%' }} />
      )}
    </div>
  )
}

/**
 * EtsyPublish — the "📤 Send to Etsy" card inside an opened listing.
 * Shows only after photos exist. Flow:
 *   - if the current store has no Etsy connection -> point to Settings
 *   - else: small form (price, quantity, shipping profile, category search)
 *     -> Send -> backend creates a DRAFT listing + uploads the photos
 *   - the returned link opens the draft in Etsy's own listing editor
 * Title/tags/description come from the listing's SEO (or the name as fallback).
 */
function EtsyPublish({ L, onSaved }) {
  const app = useApp()
  const [st, setSt] = useState(null)          // Etsy connection status
  const [profiles, setProfiles] = useState([])
  const [profileId, setProfileId] = useState('')
  const [taxoQ, setTaxoQ] = useState('')      // category search text
  const [taxoHits, setTaxoHits] = useState([])
  const [taxoId, setTaxoId] = useState(null)
  const [taxoLabel, setTaxoLabel] = useState('')
  const [price, setPrice] = useState(L.price || '')
  const [qty, setQty] = useState(L.qty || 999)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  // check the connection once (per store)
  useEffect(() => {
    etsy.status(app.curStoreId).then(setSt).catch(() => setSt({ connected: false, keyReady: false }))
  }, [app.curStoreId])

  // load shipping profiles as soon as we know Etsy is connected
  useEffect(() => {
    if (st?.connected) {
      etsy.shippingProfiles(app.curStoreId)
        .then((r) => { setProfiles(r.profiles); if (r.profiles[0]) setProfileId(String(r.profiles[0].id)) })
        .catch((e) => setMsg('⚠ ' + e.message))
    }
  }, [st?.connected, app.curStoreId])

  // category search (small delay so we don't call on every keystroke)
  useEffect(() => {
    if (!taxoQ.trim() || taxoId) { setTaxoHits([]); return }
    const t = setTimeout(() => {
      etsy.taxonomy(taxoQ).then((r) => setTaxoHits(r.nodes)).catch(() => {})
    }, 350)
    return () => clearTimeout(t)
  }, [taxoQ, taxoId])

  const send = async () => {
    setMsg(null); setBusy(true)
    try {
      if (!price) throw new Error('Price likhein')
      if (!taxoId) throw new Error('Category chunein (search kar ke list me se click karein)')
      if (!profileId) throw new Error('Shipping profile chunein')
      const r = await etsy.publish({
        storeId: app.curStoreId,
        title: L.seo?.title || L.name,
        description: L.seo?.description || L.name,
        tags: L.seo?.tags || [],
        price: Number(price),
        quantity: Number(qty) || 1,
        taxonomyId: taxoId,
        shippingProfileId: Number(profileId),
        images: (L.outputs || []).slice(0, 10).map((o) => o.dataUrl),
      })
      await onSaved({ etsy: { listingId: r.listingId, url: r.url, at: Date.now() }, price, qty })
      setMsg(`✅ Draft ban gaya! ${r.uploaded} photos upload huin.` + (r.imgErrors?.length ? ` (⚠ ${r.imgErrors.length} photo fail)` : ''))
    } catch (e) {
      setMsg('⚠ ' + (e.message || e))
    } finally { setBusy(false) }
  }

  if (!st) return null
  if (!st.keyReady) return null   // integration not switched on yet — hide quietly
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>📤 Send to Etsy</h3>
      {!st.connected ? (
        <p className="muted">Is store ki Etsy shop connect nahi hai — Settings (apne naam par click) me 🛍️ Etsy section se connect karein.</p>
      ) : (
        <>
          <p className="muted">Draft listing banegi <b>{st.shop?.shop_name}</b> par — publish aap Etsy par khud karenge (Etsy ki $0.20 listing fee publish par lagti hai).</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <input placeholder="Price (USD)" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 130 }} />
            <input placeholder="Quantity" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 110 }} />
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)} style={{ minWidth: 200 }}>
              {!profiles.length && <option value="">— shipping profile —</option>}
              {profiles.map((p) => <option key={p.id} value={p.id}>🚚 {p.title}</option>)}
            </select>
          </div>
          {/* category: type to search Etsy's tree, click a result to lock it */}
          <input
            placeholder="Category search (e.g. wall decor)"
            value={taxoId ? taxoLabel : taxoQ}
            onChange={(e) => { setTaxoId(null); setTaxoQ(e.target.value) }}
            style={{ width: '100%', marginBottom: 6 }}
          />
          {taxoHits.length > 0 && !taxoId && (
            <div style={{ marginBottom: 8 }}>
              {taxoHits.map((n) => (
                <p key={n.id} className="muted clickable" style={{ margin: '3px 0', cursor: 'pointer' }}
                  onClick={() => { setTaxoId(n.id); setTaxoLabel(n.label); setTaxoHits([]) }}>
                  📁 {n.label}
                </p>
              ))}
            </div>
          )}
          <button className="btn" disabled={busy} onClick={send}>{busy ? '⏳ Bhej raha hai…' : '📤 Send to Etsy (draft)'}</button>
          {L.etsy?.url && (
            <p className="muted" style={{ marginTop: 8 }}>
              🔗 <a className="lnk" href={L.etsy.url} target="_blank" rel="noreferrer">Etsy par draft kholein</a>
            </p>
          )}
        </>
      )}
      {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  )
}
