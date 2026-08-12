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
    setOpenId(id); setDetail(null)
    try { const r = await etsy.listing(storeId, id); setDetail(r.listing) }
    catch (e) { setErr(e.message); setOpenId(null) }
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
            <b>{detail ? detail.title : '⏳ loading…'}</b>
            <button className="btn sm ghost" onClick={() => { setOpenId(null); setDetail(null) }}>← Back</button>
          </div>
        </div>
        {detail && (
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
