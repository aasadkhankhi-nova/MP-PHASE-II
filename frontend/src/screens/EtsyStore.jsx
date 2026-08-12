/**
 * EtsyStore.jsx — the "Etsy Store" browser (Vela-style).
 * Shows the CONNECTED Etsy shop's real listings, live from Etsy:
 *   - state tabs with counts: Active / Draft / Expired / Inactive / Sold out
 *   - a list with thumbnail, title, stock, price, views
 *   - pagination (25 per page) + a search box (filters the loaded page)
 *   - click a listing -> full read-only detail (photos, tags, description)
 * Read-only for now — editing from inside ListPilot is a future step.
 */
import React, { useState, useEffect } from 'react'
import { useApp } from '../store/AppState.jsx'
import { etsy } from '../api.js'
import { Empty } from '../components/ui.jsx'

const STATES = [
  { id: 'active', label: 'Active' },
  { id: 'draft', label: 'Draft' },
  { id: 'expired', label: 'Expired' },
  { id: 'inactive', label: 'Inactive' },
  { id: 'sold_out', label: 'Sold out' },
]
const PAGE = 25

export default function EtsyStore() {
  const app = useApp()
  const storeId = app.curStoreId
  const [st, setSt] = useState(null)          // Etsy connection status
  const [counts, setCounts] = useState(null)  // per-state totals
  const [tab, setTab] = useState('active')    // selected state tab
  const [page, setPage] = useState(0)
  const [data, setData] = useState(null)      // current page {count, listings}
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')              // search text (filters loaded page)
  const [openId, setOpenId] = useState(null)  // listing opened in detail view
  const [detail, setDetail] = useState(null)
  const [edit, setEdit] = useState(false)     // detail view: edit mode on/off
  const [err, setErr] = useState(null)

  // 1) is this store connected to Etsy?
  useEffect(() => {
    setSt(null); setCounts(null); setData(null); setErr(null)
    if (!storeId) return
    etsy.status(storeId).then(setSt).catch((e) => setErr(e.message))
  }, [storeId])

  // 2) once connected: load the tab counts (Active 903 / Draft 4 / ...)
  useEffect(() => {
    if (st?.connected) etsy.counts(storeId).then((r) => setCounts(r.counts)).catch(() => {})
  }, [st?.connected, storeId])

  // 3) load a page of listings whenever tab or page changes
  useEffect(() => {
    if (!st?.connected) return
    setBusy(true); setErr(null)
    etsy.listings(storeId, tab, page * PAGE)
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false))
  }, [st?.connected, storeId, tab, page])

  // open one listing's full details
  const open = async (id) => {
    setOpenId(id); setDetail(null); setEdit(false)
    try { const r = await etsy.listing(storeId, id); setDetail(r.listing) }
    catch (e) { setErr(e.message); setOpenId(null) }
  }
  // after a save: re-load the fresh version from Etsy
  const reload = async () => {
    setEdit(false); setDetail(null)
    try { const r = await etsy.listing(storeId, openId); setDetail(r.listing) } catch {}
  }

  if (!storeId) return <Empty>Pehle koi store select karein.</Empty>
  if (!st && !err) return <div className="card"><p className="muted">⏳ checking Etsy connection…</p></div>
  if (st && !st.connected) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>🛍️ Etsy Store</h3>
        <p className="muted">Is store ki Etsy shop abhi connect nahi hai — Settings (apne naam par click) me 🛍️ Etsy section se connect karein, phir yahan aap ki poori shop nazar aayegi.</p>
      </div>
    )
  }

  // ---------- detail view (one listing, read-only) ----------
  if (openId) {
    return (
      <>
        <div className="card">
          <div className="topbar" style={{ margin: 0 }}>
            <b className="ellip">{detail ? detail.title : '⏳ loading…'}</b>
            <span style={{ display: 'flex', gap: 6 }}>
              {detail && !edit && <button className="btn sm" onClick={() => setEdit(true)}>✏️ Edit</button>}
              <button className="btn sm ghost" onClick={() => { setOpenId(null); setDetail(null); setEdit(false) }}>← Back</button>
            </span>
          </div>
        </div>
        {detail && edit && <EtsyEdit storeId={storeId} detail={detail} onDone={reload} onCancel={() => setEdit(false)} />}
        {detail && !edit && (
          <>
            <div className="card">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <span className={'chip ' + (detail.state === 'active' ? 'ok' : '')}>{detail.state}</span>
                <span className="chip">💲 {detail.price} {detail.currency}</span>
                <span className="chip">📦 stock {detail.quantity}</span>
                <span className="chip">👁 {detail.views ?? 0} views</span>
                <span className="chip">❤️ {detail.favorites ?? 0}</span>
                {detail.created && <span className="chip">📅 {detail.created}</span>}
              </div>
              {/* all photos, in Etsy's order */}
              <div className="grid">
                {detail.images.map((u, i) => (
                  <div key={i} className="card item-card"><div className="thumb"><img src={u} alt={'photo ' + (i + 1)} /></div></div>
                ))}
              </div>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>🏷 Tags <span className="chip">{detail.tags.length}</span></h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {detail.tags.map((t) => <span key={t} className="chip">{t}</span>)}
                {!detail.tags.length && <span className="muted">—</span>}
              </div>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>📝 Description</h3>
              <textarea readOnly value={detail.description || ''} rows={10} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: 10, fontSize: 13 }} />
            </div>
            {detail.personalization?.enabled && (
              <div className="card">
                <h3 style={{ marginTop: 0 }}>🎁 Personalization {detail.personalization.required && <span className="chip">required</span>}</h3>
                <p className="muted">{detail.personalization.instructions || '—'}</p>
              </div>
            )}
            <div className="card">
              <a className="btn ghost" style={{ textDecoration: 'none' }} href={detail.url} target="_blank" rel="noreferrer">↗ Etsy par kholein</a>
            </div>
          </>
        )}
      </>
    )
  }

  // ---------- list view ----------
  const total = data?.count || 0
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const rows = (data?.listings || []).filter((l) => !q.trim() || l.title.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      {/* header: shop name + state tabs with live counts */}
      <div className="card">
        <div className="topbar" style={{ margin: '0 0 10px' }}>
          <h3 style={{ margin: 0 }}>🛍️ {st.shop?.shop_name} <span className="chip ok">live</span></h3>
          <input placeholder="🔍 Search (is page par)" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 200 }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATES.map((s) => (
            <button
              key={s.id}
              className={'chip clickable' + (tab === s.id ? ' ok' : '')}
              style={{ cursor: 'pointer' }}
              onClick={() => { setTab(s.id); setPage(0); setQ('') }}
            >
              {s.label}{counts ? ` ${counts[s.id]}` : ''}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="card"><p className="muted">⚠ {err}</p></div>}
      {busy && <div className="card"><p className="muted">⏳ Etsy se load ho raha hai…</p></div>}

      {/* the listing rows */}
      {!busy && rows.map((l) => (
        <div key={l.id} className="card etsy-row" onClick={() => open(l.id)}>
          <div className="etsy-thumb">{l.img ? <img src={l.img} alt="" /> : <span>🖼</span>}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b className="ellip" style={{ display: 'block' }}>{l.title}</b>
            <span className="muted" style={{ fontSize: 12 }}>
              📦 {l.quantity} · 💲{l.price} {l.currency} · 👁 {l.views ?? 0}{l.ending ? ` · ends ${l.ending}` : ''}
            </span>
          </div>
          <span className={'chip ' + (l.state === 'active' ? 'ok' : '')}>{l.state}</span>
        </div>
      ))}
      {!busy && !rows.length && <Empty>{q ? 'Search se kuch nahi mila (is page par).' : 'Is state me koi listing nahi.'}</Empty>}

      {/* pagination */}
      {total > PAGE && (
        <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
          <button className="btn sm ghost" disabled={page === 0 || busy} onClick={() => setPage(page - 1)}>← Prev</button>
          <span className="muted">Page {page + 1} / {pages} · total {total}</span>
          <button className="btn sm ghost" disabled={page >= pages - 1 || busy} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}
    </>
  )
}

/**
 * EtsyEdit — the E2 editor: basic fields of a LIVE Etsy listing.
 * Title (140), Description, Tags (13, each ≤20 chars), Materials (13),
 * Section (the shop's real sections, loaded live), Auto-renew.
 * Save sends only the CHANGED fields to Etsy (updateListing).
 * Price / quantity / variations are read-only here — they live in Etsy's
 * inventory system and get their own editor in a later milestone (E4).
 */
function EtsyEdit({ storeId, detail, onDone, onCancel }) {
  const [title, setTitle] = useState(detail.title || '')
  const [desc, setDesc] = useState(detail.description || '')
  const [tags, setTags] = useState(detail.tags || [])
  const [mats, setMats] = useState(detail.materials || [])
  const [tagIn, setTagIn] = useState('')
  const [matIn, setMatIn] = useState('')
  const [sections, setSections] = useState(null)
  const [sectionId, setSectionId] = useState(detail.section_id || '')
  const [autoRenew, setAutoRenew] = useState(!!detail.autoRenew)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  // load the shop's real sections for the dropdown
  useEffect(() => {
    etsy.sections(storeId).then((r) => setSections(r.sections)).catch(() => setSections([]))
  }, [storeId])

  const addTag = () => {
    const t = tagIn.trim().toLowerCase()
    if (!t) return
    if (t.length > 20) return setMsg('⚠ Tag 20 harf se lamba nahi ho sakta')
    if (tags.length >= 13) return setMsg('⚠ 13 tags ki had puri hai')
    if (tags.includes(t)) return setMsg('⚠ Ye tag pehle se hai')
    setTags([...tags, t]); setTagIn(''); setMsg(null)
  }
  const addMat = () => {
    const t = matIn.trim()
    if (!t) return
    if (mats.length >= 13) return setMsg('⚠ 13 materials ki had puri hai')
    setMats([...mats, t]); setMatIn(''); setMsg(null)
  }

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      // send only what actually changed — smaller request, safer
      const patch = {}
      if (title !== detail.title) patch.title = title
      if (desc !== detail.description) patch.description = desc
      if (JSON.stringify(tags) !== JSON.stringify(detail.tags)) patch.tags = tags
      if (JSON.stringify(mats) !== JSON.stringify(detail.materials)) patch.materials = mats
      if (String(sectionId || '') !== String(detail.section_id || '')) patch.sectionId = sectionId
      if (autoRenew !== !!detail.autoRenew) patch.autoRenew = autoRenew
      if (!Object.keys(patch).length) { setMsg('Kuch badla hi nahi 🙂'); setBusy(false); return }
      await etsy.update(storeId, detail.id, patch)
      setMsg('✅ Etsy par save ho gaya')
      setTimeout(onDone, 700)   // reload the fresh listing
    } catch (e) {
      setMsg('⚠ ' + (e.message || e))
    } finally { setBusy(false) }
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>✏️ Edit listing <span className="chip">{detail.state}</span></h3>

        <label className="muted" style={{ fontSize: 12 }}>Title ({140 - title.length} baqi)</label>
        <input value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />

        <label className="muted" style={{ fontSize: 12 }}>Description</label>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={10} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: 10, fontSize: 13, marginBottom: 10 }} />

        {/* tags: chips with X, input to add (Enter or button) */}
        <label className="muted" style={{ fontSize: 12 }}>Tags ({13 - tags.length} baqi)</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 6px' }}>
          {tags.map((t) => (
            <span key={t} className="chip">{t} <a className="lnk" style={{ cursor: 'pointer' }} onClick={() => setTags(tags.filter((x) => x !== t))}>✕</a></span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input placeholder="naya tag (max 20 harf)" value={tagIn} onChange={(e) => setTagIn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={addTag}>＋ Add</button>
        </div>

        {/* materials: same chips pattern */}
        <label className="muted" style={{ fontSize: 12 }}>Materials ({13 - mats.length} baqi)</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 6px' }}>
          {mats.map((t) => (
            <span key={t} className="chip">{t} <a className="lnk" style={{ cursor: 'pointer' }} onClick={() => setMats(mats.filter((x) => x !== t))}>✕</a></span>
          ))}
          {!mats.length && <span className="muted" style={{ fontSize: 12 }}>—</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input placeholder="naya material" value={matIn} onChange={(e) => setMatIn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMat()} style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={addMat}>＋ Add</button>
        </div>

        {/* section: the shop's REAL sections, straight from Etsy */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>Section</label>
            <select value={sectionId || ''} onChange={(e) => setSectionId(e.target.value)} style={{ minWidth: 180 }}>
              <option value="">— koi section nahi —</option>
              {(sections || []).map((sx) => <option key={sx.id} value={sx.id}>{sx.title}</option>)}
            </select>
            {!sections && <span className="muted" style={{ fontSize: 11 }}> ⏳</span>}
          </span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }} className="muted">
            <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
            Auto-renew (expire par khud renew — Etsy $0.20 fee)
          </label>
        </div>

        {/* read-only for now: inventory lives in E4 */}
        <p className="muted" style={{ fontSize: 12 }}>
          💲 {detail.price} {detail.currency} · 📦 stock {detail.quantity} — price/quantity/variations agle update (E4) me edit honge.
        </p>

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button className="btn" disabled={busy} onClick={save}>{busy ? '⏳ Saving…' : '💾 Save to Etsy'}</button>
          <button className="btn ghost" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
        {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}
      </div>
    </>
  )
}
