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
import { desDnum, runGeneration, composeMockup } from '../store/compose.js'
import PhotoEdit from './PhotoEdit.jsx'
import BoxEditor from './BoxEditor.jsx'
import { uid } from '../store/helpers.js'
import { genSeo, getGeminiKey, etsy } from '../api.js'
import { getProfiles } from '../store/profiles.js'
import { makeSlideshowVideo } from '../store/video.js'

export default function Listings({ onOpenEtsyListing }) {
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
    if (L) return <ListingWizard L={L} onBack={() => setOpenId(null)} onOpenEtsyListing={onOpenEtsyListing} />
  }

  // listings already sent to Etsy (draft or published) do NOT show here —
  // the work is done; they now live in Etsy Store (Draft/Active status).
  const pending = app.ws.listings.filter((L) => !L.etsy?.listingId)
  const done = app.ws.listings.filter((L) => !!L.etsy?.listingId)

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>🧾 Listings <span className="chip">{pending.length}</span></h3>
        <p className="muted">A listing = a combo of designs + mockups → generated photos + SEO.</p>
        <button className="btn" onClick={create}>＋ New listing</button>
        {done.length > 0 && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            ✅ {done.length} listing(s) already sent to Etsy (find them under Draft/Active status) — removed from here.{' '}
            <a className="lnk" style={{ cursor: 'pointer' }}
              onClick={() => { if (confirm(`${done.length} completed record(s) from the local list? (Nothing happens to the listings on Etsy)`)) done.forEach((L) => app.delListing(L.id)) }}>
              🗑 Clear records
            </a>
          </p>
        )}
      </div>
      <div className="grid">
        {pending.map((L) => (
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
      {!pending.length && <Empty>No pending listings.</Empty>}
    </>
  )
}

/** The opened listing: steps (designs, mockups, profile, generate, draft) on one page. */
function ListingWizard({ L, onBack, onOpenEtsyListing }) {
  const app = useApp()
  const [prog, setProg] = useState(null)   // generation progress {i, n, name}
  const [draftBusy, setDraftBusy] = useState(false)   // draft is being created on Etsy
  const [editOut, setEditOut] = useState(null)        // ✎ which output photo is open in the editor
  const [boxOut, setBoxOut] = useState(null)          // 📦 which mockup's boxes are being re-edited
  const [secs, setSecs] = useState(null)              // shop sections (live from Etsy)
  const [secIn, setSecIn] = useState('')              // ＋New section name
  const [secBusy, setSecBusy] = useState(false)
  const [regenBusy, setRegenBusy] = useState(null)    // 'title'|'tags'|'description' regeneration running
  const profiles = getProfiles(app.curStoreId)
  const set = (patch) => app.updListing(L.id, patch)
  const SEC_MAX = 20   // Etsy rule: max 20 sections per shop

  useEffect(() => {
    etsy.sections(app.curStoreId).then((r) => setSecs(r.sections)).catch(() => setSecs([]))
  }, [app.curStoreId])

  const addSection = async () => {
    const t = secIn.trim()
    if (!t) return
    setSecBusy(true)
    try {
      const r = await etsy.createSection(app.curStoreId, t)
      setSecs([...(secs || []), { id: r.id, title: r.title }])
      await set({ sectionId: String(r.id) })
      setSecIn('')
    } catch (e) { alert('⚠ Section could not be created: ' + (e.message || e)) } finally { setSecBusy(false) }
  }

  // ⟳ REGENERATE — only ONE field (title/tags/description) again. TEXT-ONLY
  // call: the image is not resent (vision info from the first generation is reused)
  // — so it costs almost no tokens (TOKEN-SAVER kept).
  const regen = async (field) => {
    if (!getGeminiKey()) return alert('No API key found — add your AI key in Settings')
    if (!L.seo) return
    setRegenBusy(field)
    try {
      const r = await genSeo({
        images: [], only: field,
        vision: L.seo.vision || null, prev: L.seo[field] || null,
        category: L.category || '', keywords: L.keywords || '',
      })
      await set({ seo: { ...L.seo, ...r.seo } })
    } catch (e) { alert('⚠ ' + (e.message || e)) } finally { setRegenBusy(null) }
  }

  // TOKEN-SAVER: design photos become 512px JPEGs before being sent to the AI
  // (light designs on a dark background, otherwise white-on-white can't be read)
  const shrink512 = (d) => new Promise((resolve) => {
    const im = new Image()
    im.onload = () => {
      const k = Math.min(1, 512 / Math.max(im.width, im.height))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k))
      const x = c.getContext('2d')
      x.fillStyle = d.variant === 'light-design' ? '#1e293b' : '#ffffff'
      x.fillRect(0, 0, c.width, c.height)
      x.drawImage(im, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', 0.85).split(',')[1])
    }
    im.onerror = () => resolve(null)
    im.src = d.dataUrl
  })

  // Each photo gets its OWN alt text — related ONLY to the design (the AI's 8 alt
  // variations are applied to photos in turn). File/mockup names are NEVER used.
  const altFor = (i, kind) => {
    if (kind === 'size') {
      const t = (L.seo?.title || '').split(',')[0].trim() || 'this design'
      return `Size chart for ${t}`.slice(0, 250)
    }
    const alts = (L.seo?.alts || []).filter(Boolean)
    let base = alts.length ? alts[i % alts.length] : (L.seo?.alt || L.seo?.title || '')
    // if there are too few variations and they repeat, append a design tag to make them unique
    const tags = L.seo?.tags || []
    if (alts.length && i >= alts.length && tags.length) {
      const t = tags[i % tags.length]
      base = (base.slice(0, Math.max(0, 246 - t.length)) + ' — ' + t)
    }
    return String(base).trim().slice(0, 250)
  }

  // 5 · FINAL: create a FREE hidden DRAFT on Etsy, then open THE SAME real edit page
  // used for active listings (100% the same — personalization,
  // variation photos, SKU, everything). The fee applies only when made Active.
  const makeDraft = async () => {
    const profile = profiles.find((x) => x.id === L.profileId)
    if (!profile) return alert('Choose a profile in step 3')
    if (!profile.details?.taxonomyId) return alert('No Category set in the profile — edit the profile from the 🧩 panel')
    if (!profile.shipping?.shippingProfileId) return alert('No Shipping profile set in the profile — edit the profile from the 🧩 panel')
    if (!L.seo && !window.confirm('🚀 Generate has not run — title/tags/description will be empty (you will have to write them on the edit page). Create the draft anyway?')) return
    if (!(L.sku || '').trim() && !window.confirm('SKU is empty (step 4) — create the draft without an SKU? (You can add it later on the edit page)')) return
    setDraftBusy(true)
    try {
      // each photo gets its OWN DESIGN-based alt (from the AI's alt variations)
      const photos = [
        ...(L.outputs || []).map((o, i) => ({ dataUrl: o.dataUrl, alt: altFor(i) })),
        // the profile's size-chart photos — AFTER the mockups
        ...((profile.photos) || []).map((x, i) => ({ dataUrl: x.dataUrl, alt: altFor(i, 'size') })),
      ]
      const fullDesc = ((L.seo?.description || '').trim() + (profile.desc2 ? '\n\n' + profile.desc2 : '')).trim() || (L.seo?.title || L.name)
      const r = await etsy.createFull(app.curStoreId, {
        title: L.seo?.title || L.name,
        description: fullDesc,
        tags: L.seo?.tags || [],
        materials: profile.materials || [],
        sku: (L.sku || '').trim(),          // the SKU you entered in step 4
        state: 'draft',             // hidden + FREE — fee only when Active
        images: photos.slice(0, 20).map((p) => ({ dataUrl: p.dataUrl, alt: p.alt })),
        video: L.video || null,
        // the section is not stored in the profile (your rule) — it comes from step 4
        details: { ...(profile.details || {}), sectionId: L.sectionId || undefined },
        shipping: profile.shipping || {},
        priceQty: { price: Number(profile.priceQty?.price) || 1, quantity: Number(profile.priceQty?.quantity) || 999 },
        variations: profile.variations || null,
      })
      await set({ etsy: { listingId: r.id, url: r.url, at: Date.now() } })
      // if any upload failed (photo/video), don't hide it — tell the user
      if (r.imgErrors?.length) alert(`⚠ Draft created, but ${r.imgErrors.length} item(s) could not be uploaded:\n` + r.imgErrors.slice(0, 4).join('\n'))
      onOpenEtsyListing && onOpenEtsyListing(r.id)
    } catch (e) { alert('⚠ ' + (e.message || e)) } finally { setDraftBusy(false) }
  }

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
    if (!designs.length) return alert('Select at least 1 design')
    if (!mockups.length) return alert('Select at least 1 mockup')
    const noBox = mockups.filter((m) => !(m.boxes || []).length)
    if (noBox.length && !window.confirm(`${noBox.length} mockup(s) have no boxes — the design will be centered on them. Continue?`)) return

    // --- part 1: product photos ---
    const r = await runGeneration({ mockups, designs, onProgress: (i, n, name) => setProg({ label: `${i + 1} / ${n} — ${name}` }) })
    // outputs stay local (large); the "missed" report tells which boxes found no design
    await set({ outputs: r.outputs, report: { missed: r.missed, at: Date.now() } })

    // --- part 2: Etsy SEO (needs the user's Gemini key from Settings) ---
    let seoErr = null
    if (getGeminiKey()) {
      setProg({ label: '✨ Generating SEO…' })
      try {
        // TOKEN-SAVER: send 512px JPEG versions, never full size
        const images = (await Promise.all(designs.slice(0, 3).map(shrink512))).filter(Boolean)
        const res = await genSeo({ images, category: L.category || 'Canvas Wall Art', keywords: L.keywords || '' })
        await set({ seo: res.seo })
      } catch (e) { seoErr = String(e.message || e) }
    } else {
      seoErr = 'No API key found — add your Gemini key in Settings (click your name), then press Create listing again.'
    }
    // --- part 3: MP4 slideshow video (the Phase I system) ---
    // errors are NOT hidden anymore — saved in vidErr and shown below step 4
    let vidErr = null
    try {
      setProg({ label: '🎬 Making video…' })
      const vid = await makeSlideshowVideo((r.outputs || []).slice(0, 6).map((o) => o.dataUrl))
      await set({ video: vid })
    } catch (e) { vidErr = String(e.message || e) }

    await set({ seoErr, vidErr })
    setProg(null)
  }

  return (
    <>
      <div className="card">
        <div className="topbar" style={{ marginBottom: 6 }}>
          <input value={L.name} onChange={(e) => set({ name: e.target.value })} style={{ fontWeight: 700, fontSize: 16, minWidth: 240 }} />
          <button className="btn sm ghost" onClick={onBack}>← Back</button>
        </div>
      </div>

      {/* STEP 1: pick designs — small tiles (like the Sets page), click = select */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>1 · Designs <span className="chip">{L.designIds.length} selected</span></h3>
        <div className="vphotos">
          {app.ws.designs.map((d) => (
            <span key={d.id} style={{ width: 106, textAlign: 'center', cursor: 'pointer' }} title={d.name} onClick={() => togDesign(d.id)}>
              <img src={d.dataUrl} alt=""
                className={'vphoto' + (L.designIds.includes(d.id) ? ' sel' : '')}
                style={{ width: 106, height: 106, objectFit: 'contain', background: d.variant === 'light-design' ? '#1e293b' : '#f1f3f9' }} />
              <span className="ellip muted" style={{ display: 'block', fontSize: 10.5 }}>{dnumLabel(desDnum(d))} · {d.name}</span>
            </span>
          ))}
        </div>
        {!app.ws.designs.length && <Empty>Upload designs on the Designs screen first.</Empty>}
      </div>

      {/* STEP 2: pick mockups — set chip = select/deselect the WHOLE set;
          click the small tiles below = pick single mockups */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>2 · Mockups <span className="chip">{L.mockupIds.length} selected</span></h3>
        {app.ws.sets.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {app.ws.sets.map((s) => {
              const ids = app.ws.mockups.filter((m) => (m.setIds || []).includes(s.id)).map((m) => m.id)
              const allOn = ids.length > 0 && ids.every((id) => L.mockupIds.includes(id))
              return (
                <button key={s.id} className={'chip clickable' + (allOn ? ' on' : '')} title={allOn ? 'Remove the whole set' : 'Select the whole set'}
                  onClick={() => togSet(s.id)}>🗂️ {s.name} ({ids.length}){allOn ? ' ✓' : ''}</button>
              )
            })}
          </div>
        )}
        <div className="vphotos">
          {app.ws.mockups.map((m) => (
            <span key={m.id} style={{ width: 106, textAlign: 'center', cursor: 'pointer' }} title={`${m.name} — ${(m.boxes || []).length} boxes`} onClick={() => togMockup(m.id)}>
              <img src={m.dataUrl} alt="" className={'vphoto' + (L.mockupIds.includes(m.id) ? ' sel' : '')}
                style={{ width: 106, height: 106 }} />
              <span className="ellip muted" style={{ display: 'block', fontSize: 10.5 }}>{m.name}</span>
            </span>
          ))}
        </div>
        {!app.ws.mockups.length && <Empty>Upload photos on the Mockups screen first.</Empty>}
      </div>

      {/* STEP 3: PROFILE — details/price/variations/shipping all come from it */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>3 · Profile <span className="chip">{L.profileId && profiles.find((x) => x.id === L.profileId) ? '✓ ' + profiles.find((x) => x.id === L.profileId).name : 'choose'}</span></h3>
        <p className="muted" style={{ fontSize: 13 }}>From the profile: materials, Details (category/attributes), price, variations, shipping, and the second part of the description. (You enter the SKU yourself on the last page.)</p>
        <select value={L.profileId || ''} onChange={(e) => set({ profileId: e.target.value })} style={{ minWidth: 240 }}>
          <option value="">⊞ Choose Profile</option>
          {profiles.map((pp) => <option key={pp.id} value={pp.id}>{pp.name}</option>)}
        </select>
        {!profiles.length && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>No profiles yet — create one with ⊞ Save as Profile on an Etsy listing's edit page.</p>}
      </div>

      {/* STEP 4: Listing setup — Section + SKU + hints (not part of the profile,
          set per listing) */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>4 · Listing setup <span className="chip">section · SKU · hints</span></h3>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>Shop section <span className="opt">Optional</span></label>
            <select value={L.sectionId || ''} onChange={(e) => set({ sectionId: e.target.value })} style={{ minWidth: 200 }}>
              <option value="">— no section —</option>
              {(secs || []).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            {secs === null && <span className="muted" style={{ fontSize: 11, display: 'block' }}>⏳ sections…</span>}
          </span>
          {secs !== null && secs.length < SEC_MAX && (
            <span>
              <label className="muted" style={{ fontSize: 12, display: 'block' }}>＋ Naya section ({secs.length}/{SEC_MAX})</label>
              <span style={{ display: 'flex', gap: 6 }}>
                <input placeholder="section name" value={secIn} maxLength={24} onChange={(e) => setSecIn(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addSection()} style={{ width: 180 }} />
                <button className="btn sm ghost" disabled={secBusy || !secIn.trim()} onClick={addSection}>{secBusy ? '⏳' : '＋ Add'}</button>
              </span>
            </span>
          )}
          {secs !== null && secs.length >= SEC_MAX && (
            <span className="chip">Etsy limit: {SEC_MAX}/{SEC_MAX} sections — cannot create a new one</span>
          )}
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>SKU (you enter it yourself)</label>
            <input placeholder="e.g. NCT-307" value={L.sku || ''} onChange={(e) => set({ sku: e.target.value })} style={{ width: 170 }} />
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Title hint (e.g. Tshirt, Sweatshirt…)" value={L.category} onChange={(e) => set({ category: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
          <input placeholder="Tag hint (optional keywords)" value={L.keywords} onChange={(e) => set({ keywords: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
        </div>
      </div>

      {/* STEP 5: the one big button — photos + SEO + video together */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>5 · Generate</h3>
        <p className="muted">This button does it all: {L.mockupIds.length} product photos + AI SEO (title, tags, 300-char description, ALT) + MP4 video.</p>
        {prog ? (
          <p className="muted">⏳ {prog.label}</p>
        ) : (
          <button className="btn" onClick={createListing}>🚀 Generate (photos + SEO + video)</button>
        )}
        {L.report && L.report.missed.length > 0 && (
          <p className="muted" style={{ color: 'var(--warn)', marginTop: 10 }}>
            ⚠ {L.report.missed.length} box(es) got no design: {L.report.missed.slice(0, 6).join(' · ')}{L.report.missed.length > 6 ? '…' : ''}
          </p>
        )}
        {L.seoErr && <p className="muted" style={{ color: 'var(--warn)', marginTop: 8 }}>⚠ SEO: {L.seoErr}</p>}
        {L.vidErr && <p className="muted" style={{ color: 'var(--warn)', marginTop: 8 }}>⚠ Video could not be made: {L.vidErr}</p>}
        {L.video && <p className="muted" style={{ color: 'var(--ok, #16a34a)', marginTop: 8 }}>🎬 Video ready — it will be uploaded to Etsy with the draft.</p>}
      </div>

      {/* Etsy SEO fields — filled automatically by Create listing; copy into Etsy */}
      {L.seo && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>✨ Etsy SEO <span className="chip ok">ready</span></h3>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>⟳ = regenerates ONLY that field (text-only call — the image is not resent, almost no tokens).</p>
          <SeoField label="Title" value={L.seo.title} onRegen={() => regen('title')} regenBusy={regenBusy === 'title'} />
          <SeoField label="Tags" value={(L.seo.tags || []).join(', ')} onRegen={() => regen('tags')} regenBusy={regenBusy === 'tags'} />
          <SeoField label="Description" value={L.seo.description} multi onRegen={() => regen('description')} regenBusy={regenBusy === 'description'} />
          <SeoField label="ALT text" value={L.seo.alt} multi />
        </div>
      )}

      {/* FINAL — creates a FREE hidden draft on Etsy and opens THE SAME real edit page
          used for active listings. Enter the SKU there, then at the bottom
          ⇧ Publish (Active, or keep as Draft). Fee only for Active ($0.20). */}
      {L.outputs?.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>6 · Final check & Publish</h3>
          {L.etsy?.listingId ? (
            <>
              <p className="muted">This listing already exists on Etsy — open its full edit page (photos, video, title, tags, details, variations, personalization, shipping — everything is there).</p>
              <button className="btn" onClick={() => onOpenEtsyListing && onOpenEtsyListing(L.etsy.listingId)}>📝 Open edit page</button>
              <p className="muted" style={{ marginTop: 8 }}>🔗 <a className="lnk" href={L.etsy.url} target="_blank" rel="noreferrer">View on Etsy</a></p>
            </>
          ) : (
            <>
              <p className="muted">
                This button creates a <b>hidden FREE draft</b> on Etsy (not visible to buyers, no fee) and
                then opens <b>the same full edit page</b> used for your active listings — do a final check there,
                enter the SKU, and press <b>⇧ Publish → Active</b> at the bottom ($0.20 fee only then) or keep it as a Draft.
              </p>
              <button className="btn" disabled={draftBusy} onClick={makeDraft}>
                {draftBusy ? '⏳ Creating draft… (uploading photos/video — 1–3 min)' : '📝 Create draft & open edit page'}
              </button>
            </>
          )}
        </div>
      )}

      {/* eslint-disable-next-line */}
      {/* results of this listing (Results screen shows all listings together) */}
      {L.outputs?.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>📦 Outputs <span className="chip ok">{L.outputs.length}</span></h3>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            Fix things before creating the draft: <b>✎ Edit</b> = photo editor (adjust/transform) ·
            <b> 📦 Boxes</b> = change the design's position/size/rotation and ONLY this photo is regenerated.
          </p>
          <div className="grid">
            {L.outputs.map((o) => {
              const mockId = String(o.id).replace(/-out$/, '')
              const hasMock = app.ws.mockups.some((m) => m.id === mockId)
              return (
                <div key={o.id} className="card item-card">
                  <div className="thumb"><img src={o.dataUrl} alt={o.name} /></div>
                  <b className="ellip">{o.name}</b>
                  <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                    <button className="btn sm ghost" title="Photo editor (adjust/transform)" onClick={() => setEditOut(o.id)}>✎ Edit</button>
                    {hasMock && <button className="btn sm ghost" title="Move the design and regenerate" onClick={() => setBoxOut(mockId)}>📦 Boxes</button>}
                    <a className="btn sm ghost" style={{ textAlign: 'center', textDecoration: 'none' }} href={o.dataUrl} download={o.name + '.jpg'}>⬇</a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ✎ — Etsy-style photo editor: light touch-ups on an output photo */}
      {editOut && (
        <PhotoEdit
          src={(L.outputs || []).find((o) => o.id === editOut)?.dataUrl}
          onApply={(url) => { set({ outputs: L.outputs.map((o) => (o.id === editOut ? { ...o, dataUrl: url } : o)) }); setEditOut(null) }}
          onCancel={() => setEditOut(null)}
        />
      )}

      {/* 📦 — set the boxes again; on close, ONLY this mockup's photo is regenerated
          with the new boxes and replaces the output */}
      {boxOut && (
        <BoxEditor mockupId={boxOut} onClose={async () => {
          const mid = boxOut
          setBoxOut(null)
          const m = app.ws.mockups.find((x) => x.id === mid)
          const designs = app.ws.designs.filter((d) => L.designIds.includes(d.id))
          if (!m || !designs.length) return
          try {
            setProg({ label: `🔁 ${m.name} is being regenerated…` })
            const r = await composeMockup(m, designs, {})
            if (r.dataUrl) await set({ outputs: L.outputs.map((o) => (o.id === m.id + '-out' ? { ...o, dataUrl: r.dataUrl } : o)) })
          } finally { setProg(null) }
        }} />
      )}
    </>
  )
}

/** One labeled read-only SEO field with Copy (+ optional ⟳ regenerate) buttons. */
function SeoField({ label, value, multi, onRegen, regenBusy }) {
  const copy = () => navigator.clipboard.writeText(value || '')
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="topbar" style={{ margin: '0 0 4px' }}>
        <span className="muted" style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          {onRegen && (
            <button className="btn sm ghost" disabled={regenBusy} title={`Regenerate only the ${label}`} onClick={onRegen}>
              {regenBusy ? '⏳' : '⟳'}
            </button>
          )}
          <button className="btn sm ghost" onClick={copy}>📋 Copy</button>
        </span>
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
      if (!price) throw new Error('Please enter a price')
      if (!taxoId) throw new Error('Choose a category (search, then click one in the list)')
      if (!profileId) throw new Error('Choose a shipping profile')
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
      setMsg(`✅ Draft created! ${r.uploaded} photos uploaded.` + (r.imgErrors?.length ? ` (⚠ ${r.imgErrors.length} photo fail)` : ''))
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
        <p className="muted">This store's Etsy shop is not connected — connect it from the 🛍️ Etsy section in Settings (click your name).</p>
      ) : (
        <>
          <p className="muted">A draft listing will be created on <b>{st.shop?.shop_name}</b> — you publish it yourself on Etsy (Etsy's $0.20 listing fee applies on publish).</p>
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
          <button className="btn" disabled={busy} onClick={send}>{busy ? '⏳ Sending…' : '📤 Send to Etsy (draft)'}</button>
          {L.etsy?.url && (
            <p className="muted" style={{ marginTop: 8 }}>
              🔗 <a className="lnk" href={L.etsy.url} target="_blank" rel="noreferrer">Open draft on Etsy</a>
            </p>
          )}
        </>
      )}
      {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  )
}
