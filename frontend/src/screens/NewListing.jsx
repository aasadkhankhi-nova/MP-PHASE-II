/**
 * NewListing.jsx — the LAUNCHPAD's last page: a FULL edit-page-style final check.
 * Same shape as the listing edit page: sticky tabs (scroll-spy) + sections
 * on one page + a Vela-style bottom bar with ⇧ Publish ▾.
 *   - From Launchpad: photos (with alt), video, title, 300-char design
 *     description, tags
 *   - From the profile: second part of the description, materials, Details (full),
 *     variations (price/qty editable here), Shipping (with names)
 *   - From the user: SKU (entered manually, only here) + final changes
 * Only pressing ⇧ Publish ▾ (Active or Draft) sends everything to Etsy IN ONE GO
 * (backend create-full). NOTHING is sent to Etsy before that.
 */
import React, { useState, useMemo, useEffect } from 'react'
import { useApp } from '../store/AppState.jsx'
import { etsy } from '../api.js'
import { getProfiles } from '../store/profiles.js'

const NTABS = [
  ['photos', 'Photos'], ['video', 'Video'], ['title', 'Title'], ['description', 'Description'],
  ['tags', 'Tags'], ['details', 'Details'], ['variations', 'Price & Variations'], ['shipping', 'Shipping'], ['sku', 'SKU'],
]

// full name path of an id in the taxonomy tree (e.g. Clothing › Unisex › T-shirts)
function taxoNames(tree, taxonomyId) {
  const out = []
  const find = (nodes, trail) => {
    for (const n of nodes || []) {
      const t = [...trail, n.name]
      if (String(n.id) === String(taxonomyId)) { out.push(...t); return true }
      if (n.children?.length && find(n.children, t)) return true
    }
    return false
  }
  find(tree, [])
  return out
}

export default function NewListing({ L, onBack, onSaved }) {
  const app = useApp()
  const profile = useMemo(() => getProfiles().find((p) => p.id === L.profileId) || null, [L.profileId])
  const det = profile?.details || {}
  const sh = profile?.shipping || {}

  // Launchpad data (editable copies)
  const [title, setTitle] = useState(L.seo?.title || L.name || '')
  const [desc300, setDesc300] = useState(L.seo?.description || '')
  const [tags, setTags] = useState(L.seo?.tags || [])
  const [tagIn, setTagIn] = useState('')
  const [alt, setAlt] = useState(L.seo?.alt || '')
  const [photos, setPhotos] = useState(() => [
    ...(L.outputs || []).map((o) => ({ id: o.id, dataUrl: o.dataUrl, name: o.name })),
    // the profile's size-chart photos — added automatically AFTER the mockups
    ...((getProfiles().find((pp) => pp.id === L.profileId)?.photos) || []).map((x, i) => ({ id: 'prof' + i, dataUrl: x.dataUrl, name: x.name || 'size-chart' })),
  ])
  const [video, setVideo] = useState(L.video || null)
  // EDITABLE copy of the profile's variations — price/qty can be changed here
  const [vars, setVars] = useState(() => (profile?.variations ? JSON.parse(JSON.stringify(profile.variations)) : null))
  // the user's own part — SKU entered manually, ONLY here
  const [sku, setSku] = useState(L.sku || '')
  const [price, setPrice] = useState(profile?.priceQty?.price || '')
  const [qty, setQty] = useState(profile?.priceQty?.quantity || 999)
  const [drag, setDrag] = useState(null)
  const [over, setOver] = useState(null)
  const [pubMenu, setPubMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [tab, setTab] = useState('photos')
  // live Etsy names (display only — so names show instead of IDs)
  const [taxoTree, setTaxoTree] = useState(null)
  const [readiness, setReadiness] = useState(null)
  const [ships, setShips] = useState(null)
  const [rets, setRets] = useState(null)

  const hasVars = !!(vars?.products?.length)
  const prods = vars?.products || []
  // final description = the design's 300-char part + blank line + the profile part
  const fullDesc = (desc300.trim() + (profile?.desc2 ? '\n\n' + profile.desc2 : '')).trim()

  useEffect(() => {
    etsy.taxonomyTree().then((r) => setTaxoTree(r.tree)).catch(() => setTaxoTree([]))
    if (app.curStoreId) {
      etsy.readiness(app.curStoreId).then((r) => setReadiness(r.states)).catch(() => setReadiness([]))
      etsy.shippingProfiles(app.curStoreId).then((r) => setShips(r.profiles)).catch(() => setShips([]))
      etsy.returnPolicies(app.curStoreId).then((r) => setRets(r.policies)).catch(() => setRets([]))
    }
  }, [app.curStoreId])

  // ---- scroll-spy (exactly like the edit page) ----
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        let cur = NTABS[0][0]
        for (const [id] of NTABS) {
          const el = document.getElementById('esec-' + id)
          if (el && el.getBoundingClientRect().top <= 175) cur = id
        }
        setTab(cur)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])
  const goTab = (id) => {
    setTab(id)
    const el = document.getElementById('esec-' + id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ---- Etsy rules — RED errors ----
  const errs = {
    title: !title.trim() ? 'Title is empty' : title.length > 140 ? `Title is ${title.length - 140} too long (max 140)` : null,
    tags: tags.length > 13 ? 'More than 13 tags' : tags.some((t) => t.length > 20) ? 'A tag is longer than 20 characters' : null,
    photos: !photos.length ? 'At least 1 photo is required' : null,
    sku: !sku.trim() ? 'Enter the SKU — you add it yourself on every listing' : null,
    profile: !profile ? 'No profile selected (choose a profile in Launchpad)' : !det.taxonomyId ? 'No Category set in the profile' : !sh.shippingProfileId ? 'No Shipping profile set in the profile' : null,
    price: !hasVars && (!price || Number(price) <= 0) ? 'Price must be greater than 0' : null,
    vars: hasVars && prods.some((r) => r.enabled !== false && (!r.price || Number(r.price) <= 0)) ? 'Every enabled variation needs a price greater than 0' : null,
  }
  const blocking = Object.values(errs).filter(Boolean)
  const dots = {
    photos: !!errs.photos, title: !!errs.title, tags: !!errs.tags,
    details: !!errs.profile, variations: !!(errs.price || errs.vars), shipping: !!errs.profile, sku: !!errs.sku,
  }

  const addTag = () => {
    const t = tagIn.trim().toLowerCase()
    if (!t || t.length > 20 || tags.length >= 13 || tags.includes(t)) return
    setTags([...tags, t]); setTagIn('')
  }

  // photos: drag & drop reorder (only here; sent to Etsy on Publish)
  const drop = (to) => {
    const from = drag
    setDrag(null); setOver(null)
    if (from === null || to === null || from === to) return
    const a = [...photos]; const [m] = a.splice(from, 1); a.splice(to, 0, m)
    setPhotos(a)
  }

  const comboLabel = (r) => (r.propertyValues || []).map((pv) => (pv.values || []).join(', ')).join(' / ') || '—'
  const setRow = (i, patch) => setVars({ ...vars, products: prods.map((r, x) => (x === i ? { ...r, ...patch } : r)) })
  const nice = (v) => String(v || '').replace(/_/g, ' ').replace(/(\d{4}) (\d{4})/, '$1 - $2').replace(/^\w/, (c) => c.toUpperCase())
  const taxoPathNames = useMemo(() => (taxoTree && det.taxonomyId ? taxoNames(taxoTree, det.taxonomyId) : []), [taxoTree, det.taxonomyId])

  // MediaRecorder videos have no duration metadata (they show 0:00) —
  // this small hack fixes the duration so the player shows it correctly.
  const fixDur = (e) => {
    const v = e.target
    if (v.duration === Infinity || isNaN(v.duration)) {
      v.currentTime = 1e7
      v.ontimeupdate = () => { v.ontimeupdate = null; v.currentTime = 0 }
    }
  }

  // ---- ⇧ Publish: NOW everything goes to Etsy (draft or active) ----
  const publish = async (state) => {
    setPubMenu(false)
    if (blocking.length) return setMsg('⚠ Fix the RED items first: ' + blocking.join(' · '))
    const warn = state === 'active'
      ? 'The listing will be created on Etsy and go LIVE (Active) — Etsy charges a $0.20 listing fee. Continue?'
      : 'The listing will be created on Etsy as a DRAFT (hidden from buyers, no fee). Continue?'
    if (!confirm(warn)) return
    setBusy(true); setMsg('⏳ Sending to Etsy — uploading photos/video takes 1–3 minutes…')
    try {
      const r = await etsy.createFull(app.curStoreId, {
        title, description: fullDesc, tags, materials: profile.materials || [],
        sku: sku.trim(), state,
        images: photos.slice(0, 20).map((ph) => ({ dataUrl: ph.dataUrl, alt })),
        video: video || null,
        details: det,
        shipping: sh,
        priceQty: { price: Number(price) || profile.priceQty?.price || 1, quantity: Number(qty) || 999 },
        variations: vars || null,
      })
      await onSaved({ etsy: { listingId: r.id, url: r.url, at: Date.now() }, sku: sku.trim() })
      setMsg(`✅ ${state === 'active' ? 'It is LIVE!' : 'Draft created!'} ${r.uploaded} photos uploaded.` +
        (r.imgErrors?.length ? ` (⚠ ${r.imgErrors.length} item(s) failed)` : '') +
        (r.stateErr ? ` (⚠ could not be activated: ${r.stateErr})` : ''))
    } catch (e) { setMsg('⚠ ' + (e.message || e)) } finally { setBusy(false) }
  }

  return (
    <>
      {/* ---- STICKY tabs (exactly like the edit page) ---- */}
      <div className="etabs-sticky">
        <div className="card" style={{ padding: '0 8px', marginBottom: 10 }}>
          <div className="etabs">
            {NTABS.map(([id, label]) => (
              <button key={id} className={'etab' + (tab === id ? ' on' : '')} onClick={() => goTab(id)}>
                {dots[id] && <span className="etab-dot" />}{label}
              </button>
            ))}
          </div>
        </div>
        <div className="profile-bar" style={{ marginBottom: 0 }}>
          <b>📝 Nayi listing</b>
          <span className="chip">🧩 {profile ? profile.name : 'no profile'}</span>
          <span style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={onBack}>← Launchpad</button>
        </div>
      </div>

      {/* ---- Photos ---- */}
      <div id="esec-photos" className={'card esec' + (errs.photos ? ' err-card' : '')}>
        <h3 style={{ marginTop: 0 }}>🖼 Photos <span className="chip">{photos.length}/20</span> {errs.photos && <span className="err-badge">ERROR</span>}</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Generated photos from Launchpad + the profile's size charts. Drag to reorder — the first photo is the thumbnail.</p>
        <div className="ph-grid">
          {photos.map((ph, i) => (
            <div key={ph.id || i}
              className={'ph-item' + (over === i && drag !== null && drag !== i ? ' dropat' : '')}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => { e.preventDefault(); setOver(i) }}
              onDrop={(e) => { e.preventDefault(); drop(i) }}
              onDragEnd={() => { setDrag(null); setOver(null) }}>
              <img src={ph.dataUrl} alt="" draggable={false} />
              <div className="ph-tools"><button className="ph-tool" title="Remove" onClick={() => setPhotos(photos.filter((_, x) => x !== i))}>🗑</button></div>
            </div>
          ))}
        </div>
        <label className="muted" style={{ fontSize: 12, display: 'block', marginTop: 10 }}>ALT text (from AI — applied to all photos, {alt.length}/500)</label>
        <textarea value={alt} maxLength={500} onChange={(e) => setAlt(e.target.value)} rows={2}
          style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: 8, fontSize: 13 }} />
      </div>

      {/* ---- Video ---- */}
      <div id="esec-video" className="card esec">
        <h3 style={{ marginTop: 0 }}>🎬 Video {video ? <span className="chip ok">ready</span> : <span className="chip">none</span>}</h3>
        {video
          ? <>
              <video className="vd-player" src={video} controls preload="auto" onLoadedMetadata={fixDur} />
              <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setVideo(null)}>🗑 Remove video</button>
            </>
          : <p className="muted">The video is made by Generate in Launchpad (or this browser does not support MP4) — you can publish without a video too.</p>}
      </div>

      {/* ---- Title ---- */}
      <div id="esec-title" className={'card esec' + (errs.title ? ' err-card' : '')}>
        <h3 style={{ marginTop: 0 }}>Title {errs.title && <span className="err-badge">ERROR</span>}</h3>
        <label className={errs.title ? 'err-msg' : 'muted'} style={{ fontSize: 12 }}>{errs.title || `${140 - title.length} characters baqi`}</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={errs.title ? 'in-err' : ''} style={{ width: '100%' }} />
      </div>

      {/* ---- Description ---- */}
      <div id="esec-description" className="card esec">
        <h3 style={{ marginTop: 0 }}>Description</h3>
        <label className="muted" style={{ fontSize: 12 }}>Design part (AI, ~300 chars) — {desc300.length} chars</label>
        <textarea value={desc300} onChange={(e) => setDesc300(e.target.value)} rows={4}
          style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: 8, fontSize: 13, marginBottom: 6 }} />
        {profile?.desc2 && (
          <>
            <label className="muted" style={{ fontSize: 12 }}>+ Profile "{profile.name}" part (added below, after one blank line)</label>
            <textarea readOnly value={profile.desc2} rows={5}
              style={{ width: '100%', border: '1px dashed var(--line)', borderRadius: 9, padding: 8, fontSize: 13, background: '#fafbfe' }} />
          </>
        )}
      </div>

      {/* ---- Tags + Materials ---- */}
      <div id="esec-tags" className={'card esec' + (errs.tags ? ' err-card' : '')}>
        <h3 style={{ marginTop: 0 }}>Tags <span className="chip">{tags.length}/13</span> {errs.tags && <span className="err-badge">ERROR</span>}</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 6px' }}>
          {tags.map((t) => <span key={t} className={'chip' + (t.length > 20 ? ' err' : '')}>{t} <a className="lnk" style={{ cursor: 'pointer' }} onClick={() => setTags(tags.filter((x) => x !== t))}>✕</a></span>)}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input placeholder="new tag" value={tagIn} onChange={(e) => setTagIn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} style={{ flex: 1, maxWidth: 280 }} />
          <button className="btn sm ghost" onClick={addTag}>＋ Add</button>
        </div>
        <label className="muted" style={{ fontSize: 12 }}>Materials (from profile "{profile?.name || '—'}")</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {(profile?.materials || []).map((m) => <span key={m} className="chip">{m}</span>)}
          {!(profile?.materials || []).length && <span className="muted" style={{ fontSize: 12 }}>—</span>}
        </div>
      </div>

      {/* ---- Details (from the profile — full, with names) ---- */}
      <div id="esec-details" className={'card esec' + (errs.profile ? ' err-card' : '')}>
        <h3 style={{ marginTop: 0 }}>Details <span className="chip">🧩 from profile</span> {errs.profile && <span className="err-badge">ERROR</span>}</h3>
        {errs.profile && <p className="err-msg">{errs.profile}</p>}
        {profile && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: '10px 18px', fontSize: 13.5 }}>
            <span><span className="muted">Type:</span> <b>{det.ltype === 'download' ? 'Digital' : 'Physical'}</b></span>
            <span><span className="muted">Who made:</span> <b>{nice(det.whoMade || 'someone_else')}</b></span>
            <span><span className="muted">What is it:</span> <b>{det.isSupply ? 'A supply or tool' : 'A finished product'}</b></span>
            <span><span className="muted">When made:</span> <b>{nice(det.whenMade || 'made_to_order')}</b></span>
            <span style={{ gridColumn: '1 / -1' }}><span className="muted">Category:</span> <b>{taxoTree === null ? '⏳' : (taxoPathNames.length ? taxoPathNames.join(' › ') : det.taxonomyId ? `#${det.taxonomyId}` : '—')}</b></span>
            {Object.entries(det.attrs || {}).map(([pid, a]) => (
              a?.names?.length ? <span key={pid}><span className="muted">Attr:</span> <b>{a.names.join(', ')}</b></span> : null
            ))}
            {(det.partnerIds || []).length > 0 && <span><span className="muted">Production partners:</span> <b>{det.partnerIds.length}</b></span>}
            <span><span className="muted">Renewal:</span> <b>{det.autoRenew ? 'Automatic' : 'Manual'}</b></span>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>To change this, click the profile name in 🧩 Profiles and edit it — this page reads from the profile.</p>
      </div>

      {/* ---- Price & Variations ---- */}
      <div id="esec-variations" className={'card esec' + (errs.price || errs.vars ? ' err-card' : '')}>
        <h3 style={{ marginTop: 0 }}>Price & Variations {hasVars && <span className="chip">{prods.length} combos</span>} {(errs.price || errs.vars) && <span className="err-badge">ERROR</span>}</h3>
        {!hasVars && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>
              <label className={errs.price ? 'err-msg' : 'muted'} style={{ fontSize: 12, display: 'block' }}>Price (USD)</label>
              <input type="number" min="0.2" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={errs.price ? 'in-err' : ''} style={{ width: 110 }} />
            </span>
            <span>
              <label className="muted" style={{ fontSize: 12, display: 'block' }}>Quantity</label>
              <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 100 }} />
            </span>
          </div>
        )}
        {hasVars && (
          <>
            {errs.vars && <p className="err-msg">{errs.vars}</p>}
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Variations of profile "{profile.name}" — make final price/qty changes here (for THIS listing only; the profile does not change).</p>
            <div className="vrows">
              {prods.map((r, i) => (
                <div key={i} className="vrow" style={{ opacity: r.enabled !== false ? 1 : 0.55 }}>
                  <span className="ellip" style={{ flex: 1 }}>{comboLabel(r)}</span>
                  <input type="number" step="0.01" title="Price" value={r.price ?? ''} onChange={(e) => setRow(i, { price: e.target.value })} style={{ width: 90 }} />
                  <input type="number" step="1" title="Quantity" value={r.quantity ?? ''} onChange={(e) => setRow(i, { quantity: e.target.value })} style={{ width: 70 }} />
                  <button className={'vswitch' + (r.enabled !== false ? ' on' : '')} title={r.enabled !== false ? 'On' : 'Off'}
                    onClick={() => setRow(i, { enabled: !(r.enabled !== false) })} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ---- Shipping (from the profile — with names) ---- */}
      <div id="esec-shipping" className={'card esec' + (errs.profile ? ' err-card' : '')}>
        <h3 style={{ marginTop: 0 }}>Shipping <span className="chip">🧩 from profile</span></h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: '10px 18px', fontSize: 13.5 }}>
          <span><span className="muted">Shipping profile:</span> <b>{ships === null ? '⏳' : (ships.find((x) => String(x.id) === String(sh.shippingProfileId))?.title || (sh.shippingProfileId ? `#${sh.shippingProfileId}` : '— none'))}</b></span>
          <span><span className="muted">Return policy:</span> <b>{rets === null ? '⏳' : (rets.find((x) => String(x.id) === String(sh.returnPolicyId))?.label || (sh.returnPolicyId ? `#${sh.returnPolicyId}` : '— none'))}</b></span>
          <span><span className="muted">Processing:</span> <b>{readiness === null ? '⏳' : (readiness.find((x) => String(x.id) === String(sh.readinessStateId))?.label || (sh.readinessStateId ? `#${sh.readinessStateId}` : '—'))}</b></span>
          {sh.wt && <span><span className="muted">Weight:</span> <b>{sh.wt} {sh.wtU || 'oz'}</b></span>}
          {(sh.dimL || sh.dimW || sh.dimH) && <span><span className="muted">Size:</span> <b>{[sh.dimL, sh.dimW, sh.dimH].filter(Boolean).join(' × ')} {sh.dimU || 'in'}</b></span>}
        </div>
      </div>

      {/* ---- SKU (entered by the user) ---- */}
      <div id="esec-sku" className={'card esec' + (errs.sku ? ' err-card' : '')}>
        <h3 style={{ marginTop: 0 }}>🔖 SKU {errs.sku && <span className="err-badge">ERROR</span>}</h3>
        <label className={errs.sku ? 'err-msg' : 'muted'} style={{ fontSize: 12, display: 'block' }}>You enter the SKU yourself — it never comes from the profile or AI{hasVars ? ' (applied to all variations)' : ''}</label>
        <input value={sku} onChange={(e) => setSku(e.target.value)} className={errs.sku ? 'in-err' : ''} style={{ width: 240 }} placeholder="e.g. NCT-307" />
      </div>

      {/* ---- bottom bar: only Publish sends to Etsy ---- */}
      <div className="ebar">
        <button className="btn ghost" disabled={busy} onClick={onBack}>Cancel</button>
        <span style={{ flex: 1, minWidth: 100, fontSize: 13 }}>
          {msg && <span className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'}>{msg}</span>}
          {!msg && <span className="muted">NOTHING is sent to Etsy until you press Publish.</span>}
        </span>
        {L.etsy?.url && <a className="btn ghost" style={{ textDecoration: 'none' }} href={L.etsy.url} target="_blank" rel="noreferrer"><span style={{ color: '#f1641e', fontWeight: 800 }}>E</span> View on Etsy</a>}
        <div className="pub-wrap">
          <button className="btn" disabled={busy} onClick={() => setPubMenu(!pubMenu)}>{busy ? '⏳…' : '⇧ Publish  ⌄'}</button>
          {pubMenu && (
            <>
              <div className="menu-veil" onClick={() => setPubMenu(false)} />
              <div className="pub-menu">
                <div className="pub-head"><span className="etsy-badge pub-badge">E</span> Nayi listing</div>
                <button className="pub-row" onClick={() => publish('active')}>
                  <span className="pub-ic">🟢</span>
                  <span className="pub-txt"><b>Active</b><small>Created on Etsy and LIVE right away ($0.20 fee)</small></span>
                </button>
                <button className="pub-row" onClick={() => publish('draft')}>
                  <span className="pub-ic">📝</span>
                  <span className="pub-txt"><b>Draft</b><small>Created on Etsy, hidden from buyers (no fee)</small></span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
