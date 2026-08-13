/**
 * NewListing.jsx — LAUNCHPAD ka aakhri page: final check + Publish.
 * Yahan tak Etsy par KUCH NAHI gaya hota. Is page par:
 *   - Launchpad se: photos (alt ke saath), video, title, 300-char design
 *     description, tags
 *   - Profile se: description ka doosra hissa, materials, details, price,
 *     variations, shipping (summary dikhta hai)
 *   - User se: SKU (sirf yahan manually) + aakhri tabdeeli
 * ⇧ Publish ▾ (Active ya Draft) dabane par hi sab kuch EK bar me Etsy par
 * jata hai (backend create-full). Draft = Etsy par bani but hidden.
 */
import React, { useState, useMemo } from 'react'
import { useApp } from '../store/AppState.jsx'
import { etsy } from '../api.js'
import { getProfiles } from '../store/profiles.js'

export default function NewListing({ L, onBack, onSaved }) {
  const app = useApp()
  const profile = useMemo(() => getProfiles().find((p) => p.id === L.profileId) || null, [L.profileId])

  // Launchpad ka data (editable copies)
  const [title, setTitle] = useState(L.seo?.title || L.name || '')
  const [desc300, setDesc300] = useState(L.seo?.description || '')
  const [tags, setTags] = useState(L.seo?.tags || [])
  const [tagIn, setTagIn] = useState('')
  const [alt, setAlt] = useState(L.seo?.alt || '')
  const [photos, setPhotos] = useState((L.outputs || []).map((o) => ({ id: o.id, dataUrl: o.dataUrl, name: o.name })))
  const [video, setVideo] = useState(L.video || null)
  // user ka apna hissa — SKU sirf YAHAN manually
  const [sku, setSku] = useState(L.sku || '')
  const [price, setPrice] = useState(profile?.priceQty?.price || '')
  const [qty, setQty] = useState(profile?.priceQty?.quantity || 999)
  const [drag, setDrag] = useState(null)
  const [over, setOver] = useState(null)
  const [pubMenu, setPubMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const hasVars = !!(profile?.variations?.products?.length)
  // final description = design wala 300-char hissa + khali line + profile ka hissa
  const fullDesc = (desc300.trim() + (profile?.desc2 ? '\n\n' + profile.desc2 : '')).trim()

  // ---- Etsy ke rules — RED errors ----
  const errs = {
    title: !title.trim() ? 'Title khali hai' : title.length > 140 ? `Title ${title.length - 140} zyada (max 140)` : null,
    tags: tags.length > 13 ? 'Tags 13 se zyada' : tags.some((t) => t.length > 20) ? 'Koi tag 20 chars se lamba' : null,
    photos: !photos.length ? 'Kam az kam 1 photo chahiye' : null,
    sku: !sku.trim() ? 'SKU likhein — ye har listing par user khud dalta hai' : null,
    profile: !profile ? 'Profile select nahi hui (Launchpad me profile chunein)' : !profile.details?.taxonomyId ? 'Profile me Category set nahi' : !profile.shipping?.shippingProfileId ? 'Profile me Shipping profile set nahi' : null,
    price: !hasVars && (!price || Number(price) <= 0) ? 'Price 0 se zyada ho' : null,
  }
  const blocking = Object.values(errs).filter(Boolean)

  const addTag = () => {
    const t = tagIn.trim().toLowerCase()
    if (!t || t.length > 20 || tags.length >= 13 || tags.includes(t)) return
    setTags([...tags, t]); setTagIn('')
  }

  // photos: drag & drop reorder (sirf yahan, Etsy par Publish se jayega)
  const drop = (to) => {
    const from = drag
    setDrag(null); setOver(null)
    if (from === null || to === null || from === to) return
    const a = [...photos]; const [m] = a.splice(from, 1); a.splice(to, 0, m)
    setPhotos(a)
  }

  // ---- ⇧ Publish: AB Etsy par sab kuch jata hai (draft ya active) ----
  const publish = async (state) => {
    setPubMenu(false)
    if (blocking.length) return setMsg('⚠ Pehle RED cheezen theek karein: ' + blocking.join(' · '))
    const warn = state === 'active'
      ? 'Listing Etsy par ban kar LIVE (Active) ho jayegi — Etsy $0.20 listing fee lega. Continue?'
      : 'Listing Etsy par DRAFT ban jayegi (buyers ko nazar nahi aayegi, koi fee nahi). Continue?'
    if (!confirm(warn)) return
    setBusy(true); setMsg('⏳ Etsy par ja raha hai — photos/video upload me 1–3 minute lagte hain…')
    try {
      const r = await etsy.createFull(app.curStoreId, {
        title, description: fullDesc, tags, materials: profile.materials || [],
        sku: sku.trim(), state,
        images: photos.slice(0, 20).map((ph) => ({ dataUrl: ph.dataUrl, alt })),
        video: video || null,
        details: profile.details || {},
        shipping: profile.shipping || {},
        priceQty: { price: Number(price) || profile.priceQty?.price || 1, quantity: Number(qty) || 999 },
        variations: profile.variations || null,
      })
      await onSaved({ etsy: { listingId: r.id, url: r.url, at: Date.now() }, sku: sku.trim() })
      setMsg(`✅ ${state === 'active' ? 'LIVE ho gayi!' : 'Draft ban gayi!'} ${r.uploaded} photos chadhin.` +
        (r.imgErrors?.length ? ` (⚠ ${r.imgErrors.length} item fail)` : '') +
        (r.stateErr ? ` (⚠ active nahi ho saki: ${r.stateErr})` : ''))
    } catch (e) { setMsg('⚠ ' + (e.message || e)) } finally { setBusy(false) }
  }

  return (
    <>
      <div className="card">
        <div className="topbar" style={{ margin: 0 }}>
          <b>📝 Nayi listing — final check</b>
          <button className="btn sm ghost" onClick={onBack}>← Launchpad</button>
        </div>
      </div>

      {/* ---- Photos (Launchpad se) — pakar kar order badlein ---- */}
      <div className={'card' + (errs.photos ? ' err-card' : '')}>
        <h3 style={{ marginTop: 0 }}>🖼 Photos <span className="chip">{photos.length}/20</span> {errs.photos && <span className="err-badge">ERROR</span>}</h3>
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
        <label className="muted" style={{ fontSize: 12, display: 'block', marginTop: 10 }}>ALT text (AI se — sab photos par lagega, {alt.length}/500)</label>
        <textarea value={alt} maxLength={500} onChange={(e) => setAlt(e.target.value)} rows={2}
          style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: 8, fontSize: 13 }} />
      </div>

      {/* ---- Video (Launchpad se — MP4 slideshow) ---- */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>🎬 Video {video ? <span className="chip ok">tayar</span> : <span className="chip">nahi</span>}</h3>
        {video
          ? <>
              <video className="vd-player" src={video} controls preload="metadata" />
              <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => setVideo(null)}>🗑 Video hatao</button>
            </>
          : <p className="muted">Video Launchpad ke Generate se banti hai (ya browser MP4 support nahi karta) — video ke baghair bhi publish ho sakti hai.</p>}
      </div>

      {/* ---- Title / Description / Tags (AI + profile) ---- */}
      <div className={'card' + (errs.title || errs.tags ? ' err-card' : '')}>
        <h3 style={{ marginTop: 0 }}>✨ SEO {(errs.title || errs.tags) && <span className="err-badge">ERROR</span>}</h3>
        <label className={errs.title ? 'err-msg' : 'muted'} style={{ fontSize: 12 }}>Title ({140 - title.length} baqi)</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={errs.title ? 'in-err' : ''} style={{ width: '100%', marginBottom: 10 }} />

        <label className="muted" style={{ fontSize: 12 }}>Description — design wala hissa (AI, ~300 chars)</label>
        <textarea value={desc300} onChange={(e) => setDesc300(e.target.value)} rows={4}
          style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: 8, fontSize: 13, marginBottom: 6 }} />
        {profile?.desc2 && (
          <>
            <label className="muted" style={{ fontSize: 12 }}>+ Profile ka hissa (ek khali line chor kar neeche lagega — profile "{profile.name}" se)</label>
            <textarea readOnly value={profile.desc2} rows={4}
              style={{ width: '100%', border: '1px dashed var(--line)', borderRadius: 9, padding: 8, fontSize: 13, marginBottom: 10, background: '#fafbfe' }} />
          </>
        )}

        <label className={errs.tags ? 'err-msg' : 'muted'} style={{ fontSize: 12 }}>Tags ({13 - tags.length} baqi)</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 6px' }}>
          {tags.map((t) => <span key={t} className={'chip' + (t.length > 20 ? ' err' : '')}>{t} <a className="lnk" style={{ cursor: 'pointer' }} onClick={() => setTags(tags.filter((x) => x !== t))}>✕</a></span>)}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input placeholder="naya tag" value={tagIn} onChange={(e) => setTagIn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={addTag}>＋ Add</button>
        </div>
      </div>

      {/* ---- Profile se aane wali cheezen (summary) ---- */}
      <div className={'card' + (errs.profile ? ' err-card' : '')}>
        <h3 style={{ marginTop: 0 }}>🧩 Profile: {profile ? profile.name : '—'} {errs.profile && <span className="err-badge">ERROR</span>}</h3>
        {errs.profile && <p className="err-msg">{errs.profile}</p>}
        {profile && (
          <p className="muted" style={{ fontSize: 13 }}>
            Ye sab profile se lagega: {profile.materials?.length ? `${profile.materials.length} materials · ` : ''}
            Details (category, attributes, who/when made{profile.details?.sectionId ? ', section' : ''})
            {hasVars ? ` · ${profile.variations.products.length} variations (prices/qty profile ke)` : ''}
            {' '}· Shipping (profile, return policy{profile.shipping?.readinessStateId ? ', processing' : ''}).
          </p>
        )}
      </div>

      {/* ---- User ka hissa: SKU (manually) + price/qty agar variations nahi ---- */}
      <div className={'card' + (errs.sku || errs.price ? ' err-card' : '')}>
        <h3 style={{ marginTop: 0 }}>🔖 SKU & Price {(errs.sku || errs.price) && <span className="err-badge">ERROR</span>}</h3>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <span>
            <label className={errs.sku ? 'err-msg' : 'muted'} style={{ fontSize: 12, display: 'block' }}>SKU (user khud dalta hai — profile/AI se nahi aata)</label>
            <input value={sku} onChange={(e) => setSku(e.target.value)} className={errs.sku ? 'in-err' : ''} style={{ width: 220 }} placeholder="e.g. NCT-307" />
          </span>
          {!hasVars && (
            <>
              <span>
                <label className={errs.price ? 'err-msg' : 'muted'} style={{ fontSize: 12, display: 'block' }}>Price (USD)</label>
                <input type="number" min="0.2" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={errs.price ? 'in-err' : ''} style={{ width: 110 }} />
              </span>
              <span>
                <label className="muted" style={{ fontSize: 12, display: 'block' }}>Quantity</label>
                <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 100 }} />
              </span>
            </>
          )}
          {hasVars && <span className="chip">Prices/qty: {profile.variations.products.length} variations (profile se) — SKU sab par yehi lagega</span>}
        </div>
      </div>

      {/* ---- bottom bar: Publish hi Etsy par bhejta hai ---- */}
      <div className="ebar">
        <button className="btn ghost" disabled={busy} onClick={onBack}>Cancel</button>
        <span style={{ flex: 1, minWidth: 100, fontSize: 13 }}>
          {msg && <span className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'}>{msg}</span>}
          {!msg && <span className="muted">Publish dabane tak Etsy par kuch NAHI jata.</span>}
        </span>
        {L.etsy?.url && <a className="btn ghost" style={{ textDecoration: 'none' }} href={L.etsy.url} target="_blank" rel="noreferrer"><span style={{ color: '#f1641e', fontWeight: 800 }}>E</span> Etsy par dekhein</a>}
        <div className="pub-wrap">
          <button className="btn" disabled={busy} onClick={() => setPubMenu(!pubMenu)}>{busy ? '⏳…' : '⇧ Publish  ⌄'}</button>
          {pubMenu && (
            <>
              <div className="menu-veil" onClick={() => setPubMenu(false)} />
              <div className="pub-menu">
                <div className="pub-head"><span className="etsy-badge pub-badge">E</span> Nayi listing</div>
                <button className="pub-row" onClick={() => publish('active')}>
                  <span className="pub-ic">🟢</span>
                  <span className="pub-txt"><b>Active</b><small>Etsy par ban kar turant LIVE ($0.20 fee)</small></span>
                </button>
                <button className="pub-row" onClick={() => publish('draft')}>
                  <span className="pub-ic">📝</span>
                  <span className="pub-txt"><b>Draft</b><small>Etsy par bane, buyers se hidden (no fee)</small></span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
