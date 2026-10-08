/**
 * EtsyStore.jsx — the Etsy listings screen.
 * The FILTER MENU (Status / Sections / Shipping / Returns / Media) now
 * lives in the app's LEFT SIDEBAR (App.jsx) — this screen receives the
 * already-loaded index + the chosen filters as props and just renders:
 *   - the filtered, sorted, paginated listing rows (search + sort on top)
 *   - the detail view (photos, tags, description) with Edit / Delete
 * es = { checked, connected, idx, busy, err } — loaded once in App.jsx.
 */
import React, { useState, useEffect, useMemo } from 'react'
import { useApp } from '../store/AppState.jsx'
import { etsy } from '../api.js'
import { Empty } from '../components/ui.jsx'
import PhotoEdit from './PhotoEdit.jsx'
import { getProfiles, upsertProfile, newProfileId } from '../store/profiles.js'

const SORTS = [
  { id: 'title_az', label: 'Title: A to Z' },
  { id: 'title_za', label: 'Title: Z to A' },
  { id: 'stock_lo', label: 'Stock: low to high' },
  { id: 'stock_hi', label: 'Stock: high to low' },
  { id: 'price_lo', label: 'Price: low to high' },
  { id: 'price_hi', label: 'Price: high to low' },
  { id: 'exp_soon', label: 'Expiration: soonest first' },
  { id: 'exp_late', label: 'Expiration: latest first' },
]
const PAGE = 40

// "Refreshed 5 min ago" style label for the Refresh button
function ago(t) {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just refreshed'
  if (m < 60) return `${m} min ago`
  return `${Math.round(m / 60)}h ago`
}

export default function EtsyStore({ es, state, filt, onDeleted, onRefresh, onCreate, onEditing, openListing, onOpenedListing }) {
  const app = useApp()
  const storeId = app.curStoreId
  const [sort, setSort] = useState('exp_late')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [edit, setEdit] = useState(false)
  const [err, setErr] = useState(null)
  const [sel, setSel] = useState(() => new Set())   // selected listing ids (checkboxes)
  const [selMenu, setSelMenu] = useState(false)      // header checkbox dropdown open?

  // jump back to page 1 + clear selection whenever the filters/status change
  useEffect(() => { setPage(0); setSel(new Set()) }, [state, filt])

  // tell App when the edit page is open — the left sidebar hides (Vela-style)
  useEffect(() => {
    onEditing && onEditing(!!openId)
    return () => { onEditing && onEditing(false) }
  }, [openId])

  // ListPilot-made listings (for the 🚀 Launchpad filter)
  const lpIds = useMemo(() => new Set(
    (app.ws.listings || []).map((L) => L.etsy?.listingId).filter(Boolean).map(String)
  ), [app.ws.listings])

  // CHECKBOX filters: within a category = OR (Halloween + St Patrick = both),
  // across categories = AND (section must match AND shipping too)
  const rows = useMemo(() => {
    let r = es.idx || []
    if ((filt.sections || []).length) { const set = new Set(filt.sections.map(String)); r = r.filter((l) => set.has(String(l.sectionId))) }
    if ((filt.ships || []).length) { const set = new Set(filt.ships.map(String)); r = r.filter((l) => set.has(String(l.shipId))) }
    if ((filt.rets || []).length) { const set = new Set(filt.rets.map(String)); r = r.filter((l) => set.has(String(l.retId))) }
    if (filt.video) r = r.filter((l) => l.video)
    if (q.trim()) r = r.filter((l) => l.title.toLowerCase().includes(q.toLowerCase()))
    const by = {
      title_az: (a, b) => a.title.localeCompare(b.title),
      title_za: (a, b) => b.title.localeCompare(a.title),
      stock_lo: (a, b) => (a.quantity || 0) - (b.quantity || 0),
      stock_hi: (a, b) => (b.quantity || 0) - (a.quantity || 0),
      price_lo: (a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0),
      price_hi: (a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0),
      exp_soon: (a, b) => String(a.ending || '9999').localeCompare(String(b.ending || '9999')),
      exp_late: (a, b) => String(b.ending || '').localeCompare(String(a.ending || '')),
    }[sort]
    return [...r].sort(by)
  }, [es.idx, filt, q, sort, lpIds])

  // Clicking a listing goes STRAIGHT to the edit page (Vela-style) —
  // no read-only detail page in between.
  const open = async (id) => {
    setOpenId(id); setDetail(null); setEdit(true)
    try { const r = await etsy.listing(storeId, id); setDetail(r.listing) }
    catch (e) { setErr(e.message); setOpenId(null) }
  }
  const reload = async () => {
    setDetail(null)                                   // stay in edit mode after save
    try { const r = await etsy.listing(storeId, openId); setDetail(r.listing) } catch {}
  }
  // request from Launchpad: "open the edit page of this (just created) listing"
  useEffect(() => {
    if (openListing) { open(String(openListing)); onOpenedListing && onOpenedListing() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openListing])
  const doDelete = async () => {
    if (!confirm('This listing will be PERMANENTLY deleted from Etsy. Are you sure?')) return
    try {
      await etsy.deleteListing(storeId, openId)
      onDeleted && onDeleted(openId)
      setOpenId(null); setDetail(null)
    } catch (e) { setErr(e.message) }
  }

  if (!storeId) return <Empty>Please select a store first.</Empty>
  if (!es.checked) return <div className="card"><p className="muted">⏳ checking Etsy connection…</p></div>
  if (!es.connected) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>🛍️ Etsy Store</h3>
        <p className="muted">This store's Etsy shop is not connected yet — connect it from the 🛍️ Etsy section in Settings (click your name), and your whole shop will show up here.</p>
      </div>
    )
  }

  // ---------- detail view ----------
  if (openId) {
    return (
      <>
        {!detail && <div className="card"><p className="muted">⏳ Loading listing…</p></div>}
        {detail && edit && <EtsyEdit storeId={storeId} detail={detail} shopName={es.shopName} onDone={reload} onCancel={() => { setOpenId(null); setDetail(null); setEdit(false) }} />}
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
              <div className="grid">
                {detail.images.map((im, i) => (
                  <div key={im.id || i} className="card item-card"><div className="thumb"><img src={im.url} alt={'photo ' + (i + 1)} /></div></div>
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
              <a className="btn ghost" style={{ textDecoration: 'none' }} href={detail.url} target="_blank" rel="noreferrer">↗ Open on Etsy</a>
            </div>
          </>
        )}
      </>
    )
  }

  // ---------- list view (Vela-style TABLE) ----------
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE)
  const secName = (id) => (es.names?.sections || []).find((x) => String(x.id) === String(id))?.title || ''

  // selection helpers (header checkbox dropdown: All / Current page / None)
  const selAll = () => { setSel(new Set(rows.map((l) => String(l.id)))); setSelMenu(false) }
  const selPage = () => { setSel(new Set(pageRows.map((l) => String(l.id)))); setSelMenu(false) }
  const selNone = () => { setSel(new Set()); setSelMenu(false) }
  const selTog = (id) => setSel((old) => {
    const n = new Set(old); const k = String(id)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const pageAllSel = pageRows.length > 0 && pageRows.every((l) => sel.has(String(l.id)))

  // page-number buttons: 1 … around current … last (Vela/Etsy style)
  const pageNums = []
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 1) pageNums.push(i)
    else if (pageNums[pageNums.length - 1] !== '…') pageNums.push('…')
  }

  return (
    <>
      <div className="card">
        <div className="topbar" style={{ margin: 0, gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {sel.size > 0 ? <span className="chip">{sel.size} selected</span> : <span className="chip">{rows.length} listings</span>}
          </span>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input placeholder="🔍 Search title" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} style={{ minWidth: 160 }} />
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((sx) => <option key={sx.id} value={sx.id}>{sx.label}</option>)}
            </select>
            {/* brand blue — same as every other primary button in ListPilot */}
            <button className="btn sm" onClick={onCreate}>＋ Create listing</button>
          </span>
        </div>
      </div>

      {(err || es.err) && <div className="card"><p className="muted">⚠ {err || es.err}</p></div>}
      {es.busy && <div className="card"><p className="muted">⏳ Indexing the whole shop (10–20 sec the first time)…</p></div>}

      {!es.busy && (
        <div className="card" style={{ padding: 0, overflow: 'visible' }}>
          {/* ---- table header ---- */}
          <div className="etbl-head">
            <span className="etbl-selwrap" onClick={(e) => e.stopPropagation()}>
              {/* header checkbox = current page; the ▾ opens All / Current page / None */}
              <input type="checkbox" checked={pageAllSel} onChange={() => (pageAllSel ? selNone() : selPage())} />
              <button className="etbl-caret" title="Select…" onClick={() => setSelMenu(!selMenu)}>▾</button>
              {selMenu && (
                <>
                  {/* invisible veil: click anywhere outside -> menu closes */}
                  <div className="menu-veil" onClick={() => setSelMenu(false)} />
                  <div className="etbl-selmenu">
                    <button onClick={selAll}>☑ All listings ({rows.length})</button>
                    <button onClick={selPage}>☑ Current page ({pageRows.length})</button>
                    {/* None is clickable only when something is selected — otherwise grey */}
                    <button disabled={sel.size === 0} onClick={selNone}>☐ None{sel.size ? ` (${sel.size} hatengi)` : ''}</button>
                  </div>
                </>
              )}
            </span>
            <span></span>
            <span>Title</span>
            <span>Stock</span>
            <span>Price</span>
            <span>Expires on</span>
            <span>Section</span>
          </div>

          {/* ---- rows ---- */}
          {pageRows.map((l) => (
            <div key={l.id} className={'etbl-row' + (sel.has(String(l.id)) ? ' sel' : '')} onClick={() => open(l.id)}>
              <span onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={sel.has(String(l.id))} onChange={() => selTog(l.id)} />
              </span>
              <span className="etsy-thumb">{l.img ? <img src={l.img} alt="" /> : '🖼'}</span>
              <span className="ellip" style={{ fontWeight: 600 }}>{l.title}{l.video ? ' 🎬' : ''}</span>
              <span>{l.quantity}</span>
              <span>${l.price}</span>
              <span>{l.ending ? l.ending.slice(5).replace('-', '/') + '/' + l.ending.slice(2, 4) : '—'}</span>
              <span className="ellip">{secName(l.sectionId) || '—'}</span>
            </div>
          ))}
          {!pageRows.length && <div style={{ padding: 20 }}><Empty>No listings match this filter.</Empty></div>}
        </div>
      )}

      {/* ---- bottom bar: page numbers (left) + counter (right) ---- */}
      {!es.busy && rows.length > 0 && (
        <div className="card etbl-foot">
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span className="muted" style={{ marginRight: 6 }}>Page</span>
            <button className="pgbtn" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
            {pageNums.map((n, i) => n === '…'
              ? <span key={'e' + i} className="muted">…</span>
              : <button key={n} className={'pgbtn' + (n === page ? ' on' : '')} onClick={() => setPage(n)}>{n + 1}</button>
            )}
            <button className="pgbtn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</button>
          </span>
          <span className="muted">Viewing {page * PAGE + 1} – {Math.min(rows.length, (page + 1) * PAGE)} of {rows.length} products</span>
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
/**
 * ＋ Create-new helpers — created DIRECTLY in your shop via the Etsy API
 * (sections, return policies, shipping profiles — all three are supported by the API).
 */
function NewSection({ storeId, onDone }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const go = async () => {
    if (!title.trim() || title.length > 24) return
    setBusy(true); setErr(null)
    try { const r = await etsy.createSection(storeId, title.trim()); setOpen(false); setTitle(''); onDone(r.id) }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  if (!open) return <button className="btn sm ghost" onClick={() => setOpen(true)}>＋ New</button>
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <input placeholder="Section name" value={title} onChange={(e) => setTitle(e.target.value)}
        className={title.length > 24 ? 'in-err' : ''} style={{ width: 170 }} onKeyDown={(e) => e.key === 'Enter' && go()} autoFocus />
      <span className={title.length > 24 ? 'err-msg' : 'muted'} style={{ fontSize: 11 }}>{24 - title.length}</span>
      <button className="btn sm" disabled={busy || !title.trim() || title.length > 24} onClick={go}>{busy ? '⏳' : 'Save'}</button>
      <button className="btn sm ghost" onClick={() => { setOpen(false); setErr(null) }}>✕</button>
      {err && <span className="err-msg">{err}</span>}
    </span>
  )
}

function NewReturnPolicy({ storeId, onDone }) {
  const [open, setOpen] = useState(false)
  const [rets, setRets] = useState(true)
  const [exch, setExch] = useState(true)
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const go = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await etsy.createReturnPolicy(storeId, { acceptsReturns: rets, acceptsExchanges: exch, deadline: days })
      setOpen(false); onDone(r.id)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  if (!open) return <button className="btn sm ghost" onClick={() => setOpen(true)}>＋ New</button>
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginTop: 8, maxWidth: 420 }}>
      <b style={{ fontSize: 13.5 }}>Nayi return policy</b>
      <div style={{ display: 'flex', gap: 16, margin: '8px 0', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={rets} onChange={(e) => setRets(e.target.checked)} /> Returns accept
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={exch} onChange={(e) => setExch(e.target.checked)} /> Exchanges accept
        </label>
      </div>
      {(rets || exch) && (
        <span style={{ display: 'block', marginBottom: 8 }}>
          <label className="muted" style={{ fontSize: 12, display: 'block' }}>How many days the buyer has to return it</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 14, 21, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </span>
      )}
      {!rets && !exch && <p className="muted" style={{ fontSize: 12 }}>Both OFF = a "No returns or exchanges" policy is created.</p>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn sm" disabled={busy} onClick={go}>{busy ? '⏳' : 'Save policy'}</button>
        <button className="btn sm ghost" onClick={() => { setOpen(false); setErr(null) }}>✕ Cancel</button>
      </div>
      {err && <p className="err-msg" style={{ marginTop: 6 }}>{err}</p>}
    </div>
  )
}

const SHIP_COUNTRIES = [['US', 'United States'], ['GB', 'United Kingdom'], ['CA', 'Canada'], ['AU', 'Australia'], ['DE', 'Germany'], ['FR', 'France'], ['TR', 'Turkiye'], ['PK', 'Pakistan'], ['IN', 'India'], ['AE', 'UAE'], ['NL', 'Netherlands'], ['ES', 'Spain'], ['IT', 'Italy']]
function NewShipProfile({ storeId, onDone }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ title: '', originCountry: 'US', originZip: '', minProcessing: 1, maxProcessing: 3, primaryCost: 0, secondaryCost: 0, minDelivery: '', maxDelivery: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const u = (patch) => setF({ ...f, ...patch })
  const go = async () => {
    if (!f.title.trim()) return setErr('Enter a profile name')
    if (f.originCountry === 'US' && !f.originZip.trim()) return setErr('Origin ZIP code is required for the US')
    setBusy(true); setErr(null)
    try { const r = await etsy.createShipProfile(storeId, f); setOpen(false); onDone(r.id) }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  if (!open) return <button className="btn sm ghost" onClick={() => setOpen(true)}>＋ New</button>
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginTop: 8, maxWidth: 560 }}>
      <b style={{ fontSize: 13.5 }}>New shipping profile</b> <span className="muted" style={{ fontSize: 11 }}>(created with one "Everywhere" rate — add more destinations on Etsy)</span>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0' }}>
        <span>
          <label className="muted" style={{ fontSize: 12, display: 'block' }}>Naam</label>
          <input value={f.title} onChange={(e) => u({ title: e.target.value })} style={{ width: 150 }} />
        </span>
        <span>
          <label className="muted" style={{ fontSize: 12, display: 'block' }}>Ships from</label>
          <select value={f.originCountry} onChange={(e) => u({ originCountry: e.target.value })}>
            {SHIP_COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </span>
        <span>
          <label className="muted" style={{ fontSize: 12, display: 'block' }}>Origin ZIP {f.originCountry === 'US' ? <b>*</b> : <span className="opt">Optional</span>}</label>
          <input value={f.originZip} onChange={(e) => u({ originZip: e.target.value })} style={{ width: 90 }} />
        </span>
        <span>
          <label className="muted" style={{ fontSize: 12, display: 'block' }}>Processing (days)</label>
          <span style={{ display: 'flex', gap: 4 }}>
            <input type="number" min="1" value={f.minProcessing} onChange={(e) => u({ minProcessing: e.target.value })} style={{ width: 58 }} />
            <input type="number" min="1" value={f.maxProcessing} onChange={(e) => u({ maxProcessing: e.target.value })} style={{ width: 58 }} />
          </span>
        </span>
        <span>
          <label className="muted" style={{ fontSize: 12, display: 'block' }}>Shipping price ($) — pehla item</label>
          <input type="number" min="0" step="0.01" value={f.primaryCost} onChange={(e) => u({ primaryCost: e.target.value })} style={{ width: 84 }} />
        </span>
        <span>
          <label className="muted" style={{ fontSize: 12, display: 'block' }}>Each additional item ($)</label>
          <input type="number" min="0" step="0.01" value={f.secondaryCost} onChange={(e) => u({ secondaryCost: e.target.value })} style={{ width: 84 }} />
        </span>
        <span>
          <label className="muted" style={{ fontSize: 12, display: 'block' }}>Delivery days <span className="opt">Optional</span></label>
          <span style={{ display: 'flex', gap: 4 }}>
            <input type="number" min="1" placeholder="min" value={f.minDelivery} onChange={(e) => u({ minDelivery: e.target.value })} style={{ width: 58 }} />
            <input type="number" min="1" placeholder="max" value={f.maxDelivery} onChange={(e) => u({ maxDelivery: e.target.value })} style={{ width: 58 }} />
          </span>
        </span>
      </div>
      <p className="muted" style={{ fontSize: 11.5, margin: '0 0 8px' }}>Leave 0 / 0 to create a FREE shipping profile.</p>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn sm" disabled={busy} onClick={go}>{busy ? '⏳' : 'Save profile'}</button>
        <button className="btn sm ghost" onClick={() => { setOpen(false); setErr(null) }}>✕ Cancel</button>
      </div>
      {err && <p className="err-msg" style={{ marginTop: 6 }}>{err}</p>}
    </div>
  )
}

// find the full path (root -> leaf) of a taxonomy id in the category tree
function findTaxoPath(tree, taxonomyId) {
  const path = []
  const find = (nodes, trail) => {
    for (const n of nodes || []) {
      const t = [...trail, n.id]
      if (String(n.id) === String(taxonomyId)) { path.push(...t); return true }
      if (n.children?.length && find(n.children, t)) return true
    }
    return false
  }
  find(tree, [])
  return path
}

// Edit page sections — on ONE page, tab click = scroll (Vela-style)
const ETABS = [
  ['photos', 'Photos'], ['video', 'Video'], ['title', 'Title'],
  ['description', 'Description'], ['tags', 'Tags'], ['details', 'Details'],
  ['price', 'Price'], ['inventory', 'Inventory'], ['variations', 'Variations'],
  ['personalization', 'Personalization'], ['shipping', 'Shipping'],
]

function EtsyEdit({ storeId, detail, onDone, onCancel, shopName }) {
  const [title, setTitle] = useState(detail.title || '')
  const [desc, setDesc] = useState(detail.description || '')
  const [tags, setTags] = useState(detail.tags || [])
  const [mats, setMats] = useState(detail.materials || [])
  const [tagIn, setTagIn] = useState('')
  const [matIn, setMatIn] = useState('')
  const [sections, setSections] = useState(null)
  const [sectionId, setSectionId] = useState(detail.section_id || '')
  const [autoRenew, setAutoRenew] = useState(!!detail.autoRenew)
  // ---- E3: details ----
  const [enums, setEnums] = useState(null)              // who_made / when_made options (live)
  const [whoMade, setWhoMade] = useState(detail.whoMade || 'someone_else')
  const [whenMade, setWhenMade] = useState(detail.whenMade || 'made_to_order')
  const [shipProfiles, setShipProfiles] = useState(null)
  const [shipId, setShipId] = useState(detail.shippingProfileId || '')
  const [retPolicies, setRetPolicies] = useState(null)
  const [retId, setRetId] = useState(detail.returnPolicyId || '')
  // ---- Shipping tab (Vela-style): processing profile + weight/dimensions ----
  const [readiness, setReadiness] = useState(null)     // the shop's processing profiles (live)
  const [readyId, setReadyId] = useState(detail.readinessStateId || '')
  const [wt, setWt] = useState(detail.itemWeight || '')
  const [wtU, setWtU] = useState(detail.weightUnit || 'oz')
  const [dimL, setDimL] = useState(detail.itemLength || '')
  const [dimW, setDimW] = useState(detail.itemWidth || '')
  const [dimH, setDimH] = useState(detail.itemHeight || '')
  const [dimU, setDimU] = useState(detail.dimUnit || 'in')
  const [props, setProps] = useState(null)              // attribute dropdowns for the category
  const [propSel, setPropSel] = useState(() => {
    // current attribute values from the listing -> {propertyId: [valueId, ...]}
    // (an array because some attributes are MULTI — Sustainability etc.)
    const m = {}
    for (const p of detail.properties || []) if (p.valueIds?.length) m[p.propertyId] = p.valueIds.map(String)
    return m
  })
  // ---- Details tab (like Etsy's listing form) ----
  const [isSupply, setIsSupply] = useState(!!detail.isSupply)       // What is it?
  const [ltype, setLtype] = useState(detail.type || 'physical')     // Physical / Digital
  const [partners, setPartners] = useState(null)                    // production partners (live)
  const [partnerIds, setPartnerIds] = useState((detail.partnerIds || []).map(String))
  const [taxoTree, setTaxoTree] = useState(null)                    // full category tree (live)
  const [taxoPath, setTaxoPath] = useState([])                      // Category cascade: root -> leaf ids
  // ---- personalization (new Etsy multi-question system — our own editor) ----
  const [persErr, setPersErr] = useState(false)
  // ---- Vela-style tab bar ----
  const [tab, setTab] = useState('photos')
  const [varCount, setVarCount] = useState(null)   // combination count (reported by InventoryEditor)
  const [pubMenu, setPubMenu] = useState(false)    // Publish ▾ menu (bottom bar)

  // ONE page — while scrolling, the top tab's BLUE underline follows along
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        let cur = ETABS[0][0]
        for (const [id] of ETABS) {
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

  // Children (photos/inventory/personalization) register their save functions
  // here — Publish sends EVERYTHING to Etsy IN ONE GO.
  const reg = React.useRef({})

  // Publish ▾ — Vela-style: save all changes + Active/Draft state
  const publishTo = async (target) => {
    setPubMenu(false)
    const blocking = Object.values(errs).filter(Boolean)
    if (blocking.length) { setMsg('⚠ Fix the RED errors first: ' + blocking.join(' · ')); return }
    const changing = (target === 'active') !== (detail.state === 'active')
    if (changing && target === 'active' && !confirm('All changes will be saved and the listing will go LIVE (Active). Continue?')) return
    if (changing && target === 'inactive' && !confirm('All changes will be saved and the listing will be hidden from buyers (Draft). Continue?')) return
    setBusy(true); setMsg('⏳ Sending everything to Etsy…')
    try {
      await saveMainPatch()                                       // title/desc/tags/details/shipping/attributes
      // reg also contains HELPER functions (getInventory/applyProfileInv) —
      // they don't save, and calling them caused a crash ("reading 'variations'")
      const helpers = new Set(['getInventory', 'applyProfileInv'])
      for (const k of Object.keys(reg.current)) {
        if (helpers.has(k)) continue
        await reg.current[k]()   // photos order / variations / personalization
      }
      if (changing) await etsy.setState(storeId, detail.id, target)
      setMsg(changing && target === 'active'
        ? '🚀 LISTING PUBLISHED — it is LIVE on Etsy now (see it with "View on Etsy"). It may take a few hours to appear in search results. Press ⟳ Refresh at the top to bring it into the app\'s Active list.'
        : changing ? '📝 Saved + the listing is now a DRAFT (hidden from buyers).' : '✅ Everything saved to Etsy')
      setTimeout(onDone, changing ? 3500 : 900)   // give time to read the publish message
    } catch (e) { setMsg('⚠ ' + (e.message || e)) } finally { setBusy(false) }
  }

  // ⊞ Save as Profile — first the photo picker opens (choose size charts),
  // then it saves: photos + materials + Details (WITHOUT the SECTION) +
  // price/qty + variations (WITHOUT SKU) + all shipping.
  // The user writes the profile part of the description THEMSELVES on the Profile edit page.
  const [profPick, setProfPick] = useState(null)   // {name, sel:Set(imageIds)}
  const saveAsProfile = () => { setMsg(null); setProfPick({ name: '', sel: new Set(), err: null }) }

  // shrink the photo (max 800px JPEG) before storing it in the profile — saves storage
  const shrinkImg = (src) => new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => {
      const k = Math.min(1, 800 / Math.max(im.width, im.height))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k))
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    im.onerror = () => reject(new Error('Photo failed to load'))
    im.src = src
  })

  const confirmSaveProfile = async () => {
    const name = (profPick.name || '').trim()
    if (!name) { setProfPick({ ...profPick, err: 'Enter a profile name' }); return }
    setBusy(true)
    try {
      // the chosen size-chart photos — fetched from the CDN, shrunk to JPEG, stored in the profile
      const photos = []
      for (const imId of profPick.sel) {
        const im = (detail.images || []).find((x) => String(x.id) === String(imId))
        if (!im) continue
        try {
          const src = im.url.startsWith('data:') ? im.url : await etsy.imageData(im.full || im.url)
          photos.push({ dataUrl: await shrinkImg(src), name: 'size-chart' })
        } catch {}
      }
      const inv = reg.current.getInventory ? reg.current.getInventory() : null
      const hasVars = inv && inv.rows.length && (inv.rows.length > 1 || (inv.rows[0].propertyValues || []).length)
      const attrs = {}
      for (const [pid, ids] of Object.entries(propSel)) {
        if (!ids?.length) continue
        const P = (props || []).find((x) => String(x.propertyId) === String(pid))
        attrs[pid] = { ids, names: ids.map((id) => P?.options.find((o) => String(o.id) === String(id))?.name).filter(Boolean) }
      }
      upsertProfile(storeId, {
        id: newProfileId(), name, at: Date.now(),
        desc2: '',                                    // the user writes the description (Profile edit page)
        photos,                                       // size charts — after the mockups on a new listing
        materials: mats,
        details: {
          ltype, isSupply, whoMade, whenMade,
          partnerIds, taxonomyId: effTaxo || detail.taxonomyId || null,
          attrs, autoRenew,                           // SECTION is NOT part of the profile
        },
        priceQty: inv && inv.rows[0] ? { price: inv.rows[0].price, quantity: inv.rows[0].quantity } : null,
        variations: hasVars ? {
          pOn: inv.pOn, qOn: inv.qOn, sOn: [],
          products: inv.rows.map((r) => ({ propertyValues: r.propertyValues, price: r.price, quantity: r.quantity, enabled: r.enabled })),
        } : null,
        shipping: { readinessStateId: readyId || '', shippingProfileId: shipId || '', returnPolicyId: retId || '', wt, wtU, dimL, dimW, dimH, dimU },
      })
      setProfPick(null)
      setProfTick((t) => t + 1)
      setMsg(`⊞ Profile "${name}" saved${photos.length ? ` (with ${photos.length} size-chart photos)` : ''} — don\'t forget to write the description in the 🧩 panel`)
    } catch (e) { setMsg('⚠ ' + (e.message || e)) } finally { setBusy(false) }
  }

  // Choose Profile — everything in the profile is APPLIED to this listing
  // (on screen only; sent to Etsy on Publish). The SKU is not touched.
  const applyProfile = (pid) => {
    setProfSel(pid)
    const p = getProfiles(storeId).find((x) => x.id === pid)
    if (!p) return
    if (p.materials?.length) setMats(p.materials)
    const dd = p.details || {}
    if (dd.ltype) setLtype(dd.ltype)
    setIsSupply(!!dd.isSupply)
    if (dd.whoMade) setWhoMade(dd.whoMade)
    if (dd.whenMade) setWhenMade(dd.whenMade)
    if (dd.partnerIds) setPartnerIds(dd.partnerIds.map(String))
    setAutoRenew(!!dd.autoRenew)
    if (dd.attrs) setPropSel(Object.fromEntries(Object.entries(dd.attrs).map(([k, v]) => [k, v.ids || []])))
    if (dd.taxonomyId && taxoTree) { const path = findTaxoPath(taxoTree, dd.taxonomyId); if (path.length) setTaxoPath(path) }
    const sp = p.shipping || {}
    if (sp.readinessStateId) setReadyId(String(sp.readinessStateId))
    if (sp.shippingProfileId) setShipId(String(sp.shippingProfileId))
    if (sp.returnPolicyId) setRetId(String(sp.returnPolicyId))
    if (sp.wt !== undefined) { setWt(sp.wt); setWtU(sp.wtU || 'oz') }
    if (sp.dimL !== undefined) { setDimL(sp.dimL); setDimW(sp.dimW || ''); setDimH(sp.dimH || ''); setDimU(sp.dimU || 'in') }
    // description: the design part stays on top, the profile part goes below
    if (p.desc2) setDesc((cur) => (cur.includes(p.desc2) ? cur : (cur.trim() + '\n\n' + p.desc2)))
    if (reg.current.applyProfileInv) reg.current.applyProfileInv(p)
    setMsg(`⊞ Profile "${p.name}" applied — check it, then Publish (the SKU was left as is)`)
  }

  // ⧉ Copy — a full copy of the listing as a new DRAFT (photos + variations, everything)
  const doCopy = async () => {
    if (!confirm('A COPY of this listing (new draft) will be created on Etsy — photos, variations, everything. Continue?')) return
    setBusy(true); setMsg('⏳ Creating copy (photos are re-uploaded — 1-2 minutes)…')
    try {
      const r = await etsy.copyListing(storeId, detail.id)
      setMsg(`✅ Copy created (draft, ${r.photos} photos) — after ⟳ Refresh you will find it under the Draft filter`)
    } catch (e) { setMsg('⚠ ' + (e.message || e)) } finally { setBusy(false) }
  }
  // profiles are made with ⊞ Save as Profile; listed and applied here
  const [profTick, setProfTick] = useState(0)
  const profiles = useMemo(() => getProfiles(storeId), [profTick, storeId])
  const [profSel, setProfSel] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  // load everything the editor's dropdowns need — all LIVE from Etsy
  useEffect(() => {
    etsy.sections(storeId).then((r) => setSections(r.sections)).catch(() => setSections([]))
    etsy.enums().then(setEnums).catch(() => setEnums({ whoMade: ['someone_else', 'i_did', 'collective'], whenMade: ['made_to_order'] }))
    etsy.shippingProfiles(storeId).then((r) => setShipProfiles(r.profiles)).catch(() => setShipProfiles([]))
    etsy.returnPolicies(storeId).then((r) => setRetPolicies(r.policies)).catch(() => setRetPolicies([]))
    etsy.taxonomyTree().then((r) => setTaxoTree(r.tree)).catch(() => setTaxoTree([]))
    etsy.partners(storeId).then((r) => setPartners(r.partners)).catch(() => setPartners([]))
    etsy.readiness(storeId).then((r) => setReadiness(r.states)).catch(() => setReadiness([]))
  }, [storeId])

  // when the tree arrives: get the full path (root -> leaf) of the listing's category
  useEffect(() => {
    if (!taxoTree || !detail.taxonomyId) return
    const path = findTaxoPath(taxoTree, detail.taxonomyId)
    if (path.length) setTaxoPath(path)
  }, [taxoTree, detail.taxonomyId])

  // the category SELECTED in the cascade — its attributes are loaded live
  const effTaxo = taxoPath.length ? taxoPath[taxoPath.length - 1] : (detail.taxonomyId || null)
  useEffect(() => {
    if (!effTaxo) { setProps([]); return }
    setProps(null)
    etsy.properties(storeId, effTaxo).then((r) => setProps(r.properties)).catch(() => setProps([]))
  }, [storeId, effTaxo])

  const addTag = () => {
    const t = tagIn.trim().toLowerCase()
    if (!t) return
    if (t.length > 20) return setMsg('⚠ A tag cannot be longer than 20 characters')
    if (tags.length >= 13) return setMsg('⚠ The 13-tag limit is reached')
    if (tags.includes(t)) return setMsg('⚠ This tag already exists')
    setTags([...tags, t]); setTagIn(''); setMsg(null)
  }
  const addMat = () => {
    const t = matIn.trim()
    if (!t) return
    if (mats.length >= 13) return setMsg('⚠ The 13-material limit is reached')
    setMats([...mats, t]); setMatIn(''); setMsg(null)
  }

  const saveMainPatch = async () => {
      // 1) main fields — send only what actually changed
      const patch = {}
      if (title !== detail.title) patch.title = title
      if (desc !== detail.description) patch.description = desc
      if (JSON.stringify(tags) !== JSON.stringify(detail.tags)) patch.tags = tags
      if (JSON.stringify(mats) !== JSON.stringify(detail.materials)) patch.materials = mats
      if (String(sectionId || '') !== String(detail.section_id || '')) patch.sectionId = sectionId
      if (autoRenew !== !!detail.autoRenew) patch.autoRenew = autoRenew
      if (whoMade !== detail.whoMade) patch.whoMade = whoMade
      if (whenMade !== detail.whenMade) patch.whenMade = whenMade
      if (isSupply !== !!detail.isSupply) patch.isSupply = isSupply
      if (ltype !== (detail.type || 'physical')) patch.type = ltype
      if (String(effTaxo || '') !== String(detail.taxonomyId || '')) patch.taxonomyId = effTaxo
      if (JSON.stringify([...partnerIds].sort()) !== JSON.stringify([...(detail.partnerIds || []).map(String)].sort())) patch.partnerIds = partnerIds.map(Number)
      if (String(shipId || '') !== String(detail.shippingProfileId || '')) patch.shippingProfileId = shipId
      if (String(readyId || '') !== String(detail.readinessStateId || '')) patch.readinessStateId = readyId
      if (String(wt) !== String(detail.itemWeight || '')) { patch.itemWeight = wt; patch.weightUnit = wtU }
      else if (wtU !== (detail.weightUnit || 'oz')) { patch.itemWeight = wt; patch.weightUnit = wtU }
      if (String(dimL) !== String(detail.itemLength || '') || String(dimW) !== String(detail.itemWidth || '') || String(dimH) !== String(detail.itemHeight || '') || dimU !== (detail.dimUnit || 'in')) {
        patch.itemLength = dimL; patch.itemWidth = dimW; patch.itemHeight = dimH; patch.dimUnit = dimU
      }
      if (String(retId || '') !== String(detail.returnPolicyId || '')) patch.returnPolicyId = retId
      if (Object.keys(patch).length) await etsy.update(storeId, detail.id, patch)

      // 2) attributes — one call per CHANGED property; multi-value attributes
      //    (Sustainability etc.) are sent with the full list
      let propChanges = 0
      const orig = {}
      for (const p of detail.properties || []) if (p.valueIds?.length) orig[p.propertyId] = p.valueIds.map(String).sort().join(',')
      for (const p of props || []) {
        const nowArr = (propSel[p.propertyId] || []).filter(Boolean)
        const now = [...nowArr].sort().join(',')
        const was = orig[p.propertyId] || ''
        if (now === was) continue
        const names = nowArr.map((id) => p.options.find((o) => String(o.id) === id)?.name).filter(Boolean)
        await etsy.setProperty(storeId, detail.id, p.propertyId, nowArr.map(Number), names)
        propChanges++
      }

  }

  // "made_to_order" -> "Made to order", "2020_2026" -> "2020 - 2026"
  const nice = (v) => String(v).replace(/_/g, ' ').replace(/(\d{4}) (\d{4})/, '$1 - $2').replace(/^\w/, (c) => c.toUpperCase())

  // ---- Etsy limits are checked LIVE — RED wherever one is exceeded ----
  const errs = {
    title: !title.trim() ? 'Title is empty' : title.length > 140 ? `Title is ${title.length - 140} characters TOO LONG (max 140)` : null,
    tags: tags.length > 13 ? `${tags.length - 13} too many tags (max 13)` : tags.some((t) => t.length > 20) ? 'A tag is longer than 20 characters' : null,
    materials: mats.length > 13 ? 'More than 13 materials (max 13)' : mats.some((m) => m.length > 45) ? 'A material is longer than 45 characters' : null,
    variations: (varCount || 0) > 399 ? `${varCount} variations (max 399)` : null,
    shipping: detail.type !== 'download' && !retId ? 'A return policy is required — Etsy REQUIRES it for physical listings' : null,
  }
  // RED dot on a tab = that tab has an Etsy-rule error
  const dots = {
    title: !!errs.title,
    tags: !!(errs.tags || errs.materials),
    variations: !!errs.variations,
    shipping: !!errs.shipping,
    personalization: persErr,
  }

  return (
    <>
      {/* ---- STICKY top: tab bar + Choose Profile (sticks to the top while scrolling) ---- */}
      <div className="etabs-sticky">
      <div className="card" style={{ padding: '0 8px', marginBottom: 10 }}>
        <div className="etabs">
          {ETABS.map(([id, label]) => (
            <button key={id} className={'etab' + (tab === id ? ' on' : '')} onClick={() => goTab(id)}>
              {dots[id] && <span className="etab-dot" />}{label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Choose Profile (profiles created in the Profiles section appear here) ---- */}
      <div className="profile-bar" style={{ marginBottom: 0 }}>
        <select value={profSel} onChange={(e) => applyProfile(e.target.value)}>
          <option value="">⊞ Choose Profile</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          {!profiles.length && <option disabled>— no profiles yet (create one with ⊞ Save as Profile) —</option>}
        </select>
        <span className="muted" style={{ fontSize: 12 }}>Choosing a profile applies materials, details, price, variations and shipping — sent to Etsy on Publish.</span>
      </div>
      </div>

      {/* ---- ALL sections on ONE page (scroll) — tab click = jump to that section ---- */}
      <div id="esec-photos" className="esec">
        <PhotosEditor storeId={storeId} listingId={detail.id} initial={detail.images || []} reg={reg} />
      </div>
      <div id="esec-video" className="esec">
        <VideoEditor storeId={storeId} listingId={detail.id} initial={detail.video} />
      </div>

      {/* ---- Title ---- */}
      <div id="esec-title" className="esec">
        <div className={'card' + (errs.title ? ' err-card' : '')}>
          <h3 style={{ marginTop: 0 }}>Title <span className="chip">{detail.state}</span> {errs.title && <span className="err-badge">ERROR</span>}</h3>
          <label className={errs.title ? 'err-msg' : 'muted'} style={{ fontSize: 12 }}>Title ({140 - title.length} baqi)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={errs.title ? 'in-err' : ''} style={{ width: '100%', marginBottom: 6 }} />
          {errs.title && <p className="err-msg" style={{ margin: '0 0 8px' }}>{errs.title}</p>}
        </div>
      </div>

      {/* ---- Description ---- */}
      <div id="esec-description" className="esec">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Description</h3>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={14} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: 10, fontSize: 13, marginBottom: 10 }} />
        </div>
      </div>

      {/* ---- Tags & Materials ---- */}
      <div id="esec-tags" className="esec">
      <div className={'card' + (errs.tags || errs.materials ? ' err-card' : '')}>
        <h3 style={{ marginTop: 0 }}>Tags {(errs.tags || errs.materials) && <span className="err-badge">ERROR</span>}</h3>
        {errs.tags && <p className="err-msg">{errs.tags}</p>}
        {errs.materials && <p className="err-msg">{errs.materials}</p>}
        {/* tags: chips with X, input to add (Enter or button) */}
        <label className={errs.tags ? 'err-msg' : 'muted'} style={{ fontSize: 12 }}>Tags ({13 - tags.length} baqi)</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 6px' }}>
          {tags.map((t) => (
            <span key={t} className="chip">{t} <a className="lnk" style={{ cursor: 'pointer' }} onClick={() => setTags(tags.filter((x) => x !== t))}>✕</a></span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input placeholder="new tag (max 20 characters)" value={tagIn} onChange={(e) => setTagIn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={addTag}>＋ Add</button>
        </div>

        {/* materials: same chips pattern */}
        <label className={errs.materials ? 'err-msg' : 'muted'} style={{ fontSize: 12 }}>Materials ({13 - mats.length} baqi)</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 6px' }}>
          {mats.map((t) => (
            <span key={t} className="chip">{t} <a className="lnk" style={{ cursor: 'pointer' }} onClick={() => setMats(mats.filter((x) => x !== t))}>✕</a></span>
          ))}
          {!mats.length && <span className="muted" style={{ fontSize: 12 }}>—</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input placeholder="new material" value={matIn} onChange={(e) => setMatIn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMat()} style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={addMat}>＋ Add</button>
        </div>

      </div>
      </div>

      {/* ---- Details — like Etsy's own listing form: Type, Who/What/When,
           Production partner, Category cascade, all attributes, Renewal, Section.
           EVERY dropdown's options come LIVE from Etsy. ---- */}
      <div id="esec-details" className="esec">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Details</h3>

        {/* Type — Physical / Digital (radio cards, like Etsy) */}
        <label className="muted" style={{ fontSize: 12 }}>Type</label>
        <div className="tcards">
          <button type="button" className={'tcard' + (ltype !== 'download' ? ' on' : '')} onClick={() => setLtype('physical')}>
            <b>{ltype !== 'download' ? '◉' : '○'} Physical</b>
            <span>A tangible item that you will ship to buyers.</span>
          </button>
          <button type="button" className={'tcard' + (ltype === 'download' ? ' on' : '')} onClick={() => setLtype('download')}>
            <b>{ltype === 'download' ? '◉' : '○'} Digital</b>
            <span>A digital file that buyers will download.</span>
          </button>
        </div>

        {/* Who / What / When — enums live from Etsy */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>Who made it?</label>
            <select value={whoMade} onChange={(e) => setWhoMade(e.target.value)} style={{ minWidth: 150 }}>
              {(enums?.whoMade || [whoMade]).map((v) => <option key={v} value={v}>{nice(v)}</option>)}
            </select>
          </span>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>What is it?</label>
            <select value={isSupply ? 'supply' : 'finished'} onChange={(e) => setIsSupply(e.target.value === 'supply')} style={{ minWidth: 180 }}>
              <option value="finished">A finished product</option>
              <option value="supply">A supply or tool to make things</option>
            </select>
          </span>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>When did you make it?</label>
            <select value={whenMade} onChange={(e) => setWhenMade(e.target.value)} style={{ minWidth: 150 }}>
              {(enums?.whenMade || [whenMade]).map((v) => <option key={v} value={v}>{nice(v)}</option>)}
            </select>
          </span>
        </div>

        {/* Production partner (Optional) — the shop's REAL partners, live from Etsy */}
        <label className="muted" style={{ fontSize: 12 }}>Production partner <span className="opt">Optional</span></label>
        {partners === null && <p className="muted" style={{ fontSize: 12 }}>⏳ Loading partners…</p>}
        {partners && !partners.length && (
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 14px' }}>Your Etsy shop has no production partners yet (Etsy → Settings → Production partners).</p>
        )}
        {partners && partners.length > 0 && (
          <div className="attr-multi" style={{ maxWidth: 340, marginBottom: 14 }}>
            {partners.map((pp) => (
              <label key={pp.id}>
                <input type="checkbox" checked={partnerIds.includes(String(pp.id))}
                  onChange={() => setPartnerIds(partnerIds.includes(String(pp.id)) ? partnerIds.filter((x) => x !== String(pp.id)) : [...partnerIds, String(pp.id)])} />
                {pp.name}{pp.location ? ` · ${pp.location}` : ''}
              </label>
            ))}
          </div>
        )}

        {/* Category — Etsy's full category tree, cascade dropdowns
            (Clothing > Women's Clothing > Tops & Tees > T-shirts) */}
        <label className="muted" style={{ fontSize: 12 }}>Category</label>
        {!taxoTree && <p className="muted" style={{ fontSize: 12 }}>⏳ Loading category tree…</p>}
        {taxoTree && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '4px 0 14px' }}>
            {(() => {
              const rows = []
              let level = taxoTree
              for (let d = 0; level && level.length; d++) {
                const sel = taxoPath[d] || ''
                const lv = level
                rows.push(
                  <select key={d} value={sel} style={{ minWidth: 170 }}
                    onChange={(e) => {
                      const v = e.target.value
                      setTaxoPath(v ? [...taxoPath.slice(0, d), Number(v)] : taxoPath.slice(0, d))
                    }}>
                    <option value="">— choose —</option>
                    {lv.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                  </select>
                )
                const node = lv.find((n) => String(n.id) === String(sel))
                level = node && node.children && node.children.length ? node.children : null
              }
              return rows
            })()}
          </div>
        )}

        {/* Attributes — all of Etsy's fields for THIS category (Primary color,
            Secondary color, Holiday, Occasion, Size, Pattern, Sleeve length,
            Neckline, Sustainability...) — single = dropdown, multi = checkboxes.
            Change the category and new fields load from Etsy. */}
        {props === null && <p className="muted">⏳ Loading this category's fields from Etsy…</p>}
        {props && !props.length && <p className="muted">No attributes for this category.</p>}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          {(props || []).map((p) => (
            <span key={p.propertyId} style={{ minWidth: 200 }}>
              <label className="muted" style={{ fontSize: 12, display: 'block' }}>
                {p.name} {p.required ? <b>*</b> : <span className="opt">Optional</span>}
              </label>
              {!p.multi && (
                <select
                  value={(propSel[p.propertyId] || [])[0] || ''}
                  onChange={(e) => setPropSel({ ...propSel, [p.propertyId]: e.target.value ? [e.target.value] : [] })}
                  style={{ minWidth: 185 }}
                >
                  <option value="">Choose {p.name}</option>
                  {p.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
              {p.multi && (
                <div className="attr-multi">
                  {p.options.map((o) => {
                    const cur = propSel[p.propertyId] || []
                    const onq = cur.includes(String(o.id))
                    return (
                      <label key={o.id}>
                        <input type="checkbox" checked={onq}
                          onChange={() => setPropSel({ ...propSel, [p.propertyId]: onq ? cur.filter((x) => x !== String(o.id)) : [...cur, String(o.id)] })} />
                        {o.name}
                      </label>
                    )
                  })}
                </div>
              )}
            </span>
          ))}
        </div>

        {/* Renewal options — radio cards, like Etsy */}
        <label className="muted" style={{ fontSize: 12 }}>Renewal options</label>
        <div className="tcards">
          <button type="button" className={'tcard' + (autoRenew ? ' on' : '')} onClick={() => setAutoRenew(true)}>
            <b>{autoRenew ? '◉' : '○'} Automatic</b>
            <span>Renews automatically for $0.20 USD when it expires (recommended).</span>
          </button>
          <button type="button" className={'tcard' + (!autoRenew ? ' on' : '')} onClick={() => setAutoRenew(false)}>
            <b>{!autoRenew ? '◉' : '○'} Manual</b>
            <span>I'll renew expired listings myself.</span>
          </button>
        </div>

        {/* Section — the shop's real sections */}
        <span>
          <label className="muted" style={{ fontSize: 12, display: 'block' }}>Section <span className="opt">Optional</span></label>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={sectionId || ''} onChange={(e) => setSectionId(e.target.value)} style={{ minWidth: 200 }}>
              <option value="">— no section —</option>
              {(sections || []).map((sx) => <option key={sx.id} value={sx.id}>{sx.title}</option>)}
            </select>
            {!sections && <span className="muted" style={{ fontSize: 11 }}>⏳</span>}
            <NewSection storeId={storeId} onDone={(id) => { etsy.sections(storeId).then((r) => setSections(r.sections)).catch(() => {}); setSectionId(String(id)) }} />
          </span>
        </span>

      </div>
      </div>

      {/* ---- Price / Inventory / Variations — all three sections (from one LIVE inventory) ---- */}
      <InventoryEditor storeId={storeId} listingId={detail.id} currency={detail.currency}
        mode="all" onCount={setVarCount} images={detail.images || []} reg={reg} />

      {/* ---- Personalization — Etsy's NEW system: up to 5 questions,
           Text box / Dropdown / PHOTO-UPLOAD / Labeled upload + Add-on price ---- */}
      <div id="esec-personalization" className="esec">
        <PersonalizationEditor storeId={storeId} listingId={detail.id} onErr={setPersErr} reg={reg} />
      </div>

      {/* ---- Shipping — Vela/Etsy-style: Processing profile, Shipping profile,
           Item weight + dimensions, Return policy (REQUIRED on Etsy) ---- */}
      <div id="esec-shipping" className="esec">
        <div className={'card' + (errs.shipping ? ' err-card' : '')}>
          <h3 style={{ marginTop: 0 }}>Shipping {errs.shipping && <span className="err-badge">ERROR</span>}</h3>

          <span style={{ display: 'block', marginBottom: 12 }}>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>Processing profile</label>
            {readiness === null && <span className="muted" style={{ fontSize: 12 }}>⏳</span>}
            {readiness && readiness.length > 0 && (
              <select value={readyId || ''} onChange={(e) => setReadyId(e.target.value)} style={{ minWidth: 230 }}>
                <option value="">— choose —</option>
                {readiness.map((rz) => <option key={rz.id} value={rz.id}>{rz.label}</option>)}
              </select>
            )}
            {readiness && !readiness.length && <span className="muted" style={{ fontSize: 12 }}>Processing profiles are created on Etsy (Shop Manager → Settings) — you can only select them here.</span>}
          </span>

          <span style={{ display: 'block', marginBottom: 12 }}>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>Shipping profile</label>
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <select value={shipId || ''} onChange={(e) => setShipId(e.target.value)} style={{ minWidth: 230 }}>
                {!shipProfiles && <option value="">⏳</option>}
                {(shipProfiles || []).map((p) => <option key={p.id} value={p.id}>🚚 {p.title}</option>)}
              </select>
              <NewShipProfile storeId={storeId} onDone={(id) => { etsy.shippingProfiles(storeId).then((r) => setShipProfiles(r.profiles)).catch(() => {}); setShipId(String(id)) }} />
            </span>
          </span>

          {/* Item weight + dimensions (Optional — for the package estimate) */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <span>
              <label className="muted" style={{ fontSize: 12, display: 'block' }}>Item weight <span className="opt">Optional</span></label>
              <span style={{ display: 'flex', gap: 6 }}>
                <input type="number" min="0" step="0.01" value={wt} onChange={(e) => setWt(e.target.value)} style={{ width: 90 }} />
                <select value={wtU} onChange={(e) => setWtU(e.target.value)}>
                  <option value="oz">oz</option><option value="lb">lb</option><option value="g">g</option><option value="kg">kg</option>
                </select>
              </span>
            </span>
            <span>
              <label className="muted" style={{ fontSize: 12, display: 'block' }}>Length <span className="opt">Optional</span></label>
              <input type="number" min="0" step="0.01" value={dimL} onChange={(e) => setDimL(e.target.value)} style={{ width: 84 }} />
            </span>
            <span>
              <label className="muted" style={{ fontSize: 12, display: 'block' }}>Width <span className="opt">Optional</span></label>
              <input type="number" min="0" step="0.01" value={dimW} onChange={(e) => setDimW(e.target.value)} style={{ width: 84 }} />
            </span>
            <span>
              <label className="muted" style={{ fontSize: 12, display: 'block' }}>Height <span className="opt">Optional</span></label>
              <input type="number" min="0" step="0.01" value={dimH} onChange={(e) => setDimH(e.target.value)} style={{ width: 84 }} />
            </span>
            <span>
              <label className="muted" style={{ fontSize: 12, display: 'block' }}>Unit</label>
              <select value={dimU} onChange={(e) => setDimU(e.target.value)}>
                <option value="in">in</option><option value="ft">ft</option><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option>
              </select>
            </span>
          </div>

          {/* Return policy — REQUIRED on Etsy for physical listings */}
          <span style={{ display: 'block' }}>
            <label className={errs.shipping ? 'err-msg' : 'muted'} style={{ fontSize: 12, display: 'block' }}>Return policy <b>*</b></label>
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <select value={retId || ''} onChange={(e) => setRetId(e.target.value)} className={errs.shipping ? 'in-err' : ''} style={{ minWidth: 240 }}>
                <option value="">— choose (required) —</option>
                {(retPolicies || []).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <NewReturnPolicy storeId={storeId} onDone={(id) => { etsy.returnPolicies(storeId).then((r) => setRetPolicies(r.policies)).catch(() => {}); setRetId(String(id)) }} />
            </span>
            {errs.shipping && <p className="err-msg" style={{ margin: '6px 0 0' }}>{errs.shipping}</p>}
          </span>

        </div>
      </div>

      {/* ---- ⊞ Save as Profile — photo picker (size charts) ---- */}
      {profPick && (
        <div className="modal-overlay" onClick={() => setProfPick(null)}>
          <div className="modal-card" style={{ maxWidth: 660 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>⊞ Save as Profile</h3>
            <label className="muted" style={{ fontSize: 12 }}>Profile name</label>
            <input autoFocus value={profPick.name} onChange={(e) => setProfPick({ ...profPick, name: e.target.value })} style={{ width: '100%', marginBottom: 12 }} />
            <label className="muted" style={{ fontSize: 12 }}>Choose SIZE-CHART photos (optional) — they are added automatically AFTER the mockups on every new listing</label>
            <div className="vphotos" style={{ marginTop: 6, maxHeight: 280, overflow: 'auto' }}>
              {(detail.images || []).map((im) => {
                const on = profPick.sel.has(String(im.id))
                return (
                  <img key={im.id} src={im.url} alt="" className={'vphoto' + (on ? ' sel' : '')} style={{ width: 88, height: 88 }}
                    onClick={() => { const s2 = new Set(profPick.sel); if (on) s2.delete(String(im.id)); else s2.add(String(im.id)); setProfPick({ ...profPick, sel: s2 }) }} />
                )
              })}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Also saved: materials, Details (<b>without</b> section), price/quantity, variations (no SKU), and all shipping.
              You write the profile part of the description yourself on the 🧩 Profile edit page.
            </p>
            {profPick.err && <p className="err-msg" style={{ marginTop: 8 }}>⚠ {profPick.err}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn" disabled={busy} onClick={confirmSaveProfile}>{busy ? '⏳…' : `💾 Save profile${profPick.sel.size ? ` (${profPick.sel.size} photos)` : ''}`}</button>
              <button className="btn ghost" onClick={() => setProfPick(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Vela-style STICKY bottom bar: Cancel · View on Etsy ·
           Save as Profile · Copy · Save · Publish ▾ (Active / Draft) ---- */}
      <div className="ebar">
        <button className="btn ghost" disabled={busy} onClick={onCancel}>Cancel</button>
        <span style={{ flex: 1, minWidth: 100, fontSize: 13 }}>
          {msg && <span className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'}>{msg}</span>}
        </span>
        <a className="btn ghost" style={{ textDecoration: 'none' }} href={detail.url} target="_blank" rel="noreferrer">
          <span style={{ color: '#f1641e', fontWeight: 800 }}>E</span> View on Etsy
        </a>
        <button className="btn ghost" disabled={busy} onClick={saveAsProfile}>⊞ Save as Profile</button>
        <button className="btn ghost" disabled={busy} onClick={doCopy}>⧉ Copy</button>
        <div className="pub-wrap">
          <button className="btn" disabled={busy} onClick={() => setPubMenu(!pubMenu)}>{busy ? '⏳…' : '⇧ Publish  ⌄'}</button>
          {pubMenu && (
            <>
              <div className="menu-veil" onClick={() => setPubMenu(false)} />
              <div className="pub-menu">
                <div className="pub-head"><span className="etsy-badge pub-badge">E</span> {shopName || 'Etsy shop'}</div>
                <button className="pub-row" onClick={() => publishTo('active')}>
                  <span className="pub-ic">🟢</span>
                  <span className="pub-txt"><b>Active</b><small>Sab changes save + listing LIVE</small></span>
                  {detail.state === 'active' && <span className="pub-check">✓</span>}
                </button>
                <button className="pub-row" onClick={() => publishTo('inactive')}>
                  <span className="pub-ic">📝</span>
                  <span className="pub-txt"><b>Draft</b><small>Save all changes + hidden from buyers</small></span>
                  {detail.state !== 'active' && <span className="pub-check">✓</span>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * PersonalizationEditor — Etsy's NEW personalization system, exactly like Etsy's
 * own edit page (the screenshot layout): up to 5 questions, types:
 * Text box / Dropdown / Photo/file upload (new!) / Labeled upload.
 * Add-on price on optional text questions ($0.20–$500).
 * EVERY Etsy limit is checked live — RED as soon as one is exceeded:
 * field title ≤45, instructions ≤120, character limit 1–1024,
 * files 1–10, dropdown options ≤30 (each label ≤20 chars).
 */
const QTYPES = [
  ['text_input', 'Text box'],
  ['dropdown', 'Dropdown'],
  ['unlabeled_upload', 'Photo / file upload'],
  ['labeled_upload', 'Labeled upload (each file has its own label)'],
]
function PersonalizationEditor({ storeId, listingId, onErr, reg }) {
  const [qs, setQs] = useState(null)      // null = loading
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    etsy.personalization(storeId, listingId)
      .then((r) => setQs(r.questions.map((q) => ({ ...q, labels: q.type === 'labeled_upload' ? q.options : [], options: q.type === 'dropdown' ? q.options : [] }))))
      .catch((e) => { setQs([]); setMsg('⚠ ' + e.message) })
  }, [storeId, listingId])

  const [dirty, setDirty] = useState(false)
  const upd = (i, patch) => { setQs(qs.map((q, x) => (x === i ? { ...q, ...patch } : q))); setDirty(true) }
  const del = (i) => { setQs(qs.filter((_, x) => x !== i)); setDirty(true) }
  const add = (type) => {
    if (!type || qs.length >= 5) return
    setQs([...qs, { id: null, type, text: 'Personalization', instructions: '', required: false, maxChars: type === 'text_input' ? 256 : null, maxFiles: type.includes('upload') ? 1 : null, addOnPrice: null, options: [], labels: type === 'labeled_upload' ? [''] : [] }])
    setDirty(true)
  }

  // Etsy rules — list of errors for each question
  const qErrs = (q) => {
    const e = []
    if (!String(q.text || '').trim()) e.push('Field title is empty')
    if (String(q.text || '').length > 45) e.push('Field title is longer than 45 characters')
    if (q.type !== 'dropdown' && String(q.instructions || '').length > 120) e.push('Instructions should not exceed 120 characters')
    if (q.type === 'text_input') {
      const c = Number(q.maxChars)
      if (!c || c < 1 || c > 1024) e.push('Character limit must be between 1 and 1024')
      if (q.addOnPrice) {
        const pz = Number(q.addOnPrice)
        if (q.required) e.push('Add-on price can only be set on OPTIONAL (not required) text fields')
        else if (pz < 0.2 || pz > 500) e.push('Add-on price must be between $0.20 and $500')
      }
    }
    if (q.type.includes('upload')) {
      const fz = Number(q.maxFiles)
      if (!fz || fz < 1 || fz > 10) e.push('Files must be between 1 and 10')
    }
    if (q.type === 'labeled_upload') {
      const labels = q.labels || []
      if (labels.length !== Number(q.maxFiles)) e.push('Every file needs a label (labels = number of files)')
      if (labels.some((l) => !String(l).trim() || String(l).length > 45)) e.push('Each label must be 1–45 characters')
    }
    if (q.type === 'dropdown') {
      const ops = q.options || []
      if (!ops.length || ops.length > 30) e.push('The dropdown needs 1 to 30 options')
      if (ops.some((o) => !String(o).trim() || String(o).length > 20)) e.push('Each option must be 1–20 characters')
    }
    return e
  }
  const allErrs = (qs || []).flatMap(qErrs)
  useEffect(() => { onErr && onErr(allErrs.length > 0) }, [allErrs.length])

  // saved on Publish (if anything changed) — the parent registers it
  useEffect(() => {
    if (!reg) return
    reg.current.personalization = async () => {
      if (!dirty) return
      if (allErrs.length) throw new Error('Personalization has RED errors')
      if (!qs.length) await etsy.update(storeId, listingId, { personalizable: false })
      else await etsy.savePersonalization(storeId, listingId, qs)
      setDirty(false)
    }
    return () => { if (reg) delete reg.current.personalization }
  })

  if (qs === null) return <div className="card"><p className="muted">⏳ Loading personalization…</p></div>

  return (
    <div className={'card' + (allErrs.length ? ' err-card' : '')}>
      <h3 style={{ marginTop: 0 }}>Personalization {allErrs.length > 0 && <span className="err-badge">ERROR</span>}</h3>
      <div className="pq-grid">
        {qs.map((q, i) => {
          const e = qErrs(q)
          return (
            <div key={i} className={'pq-card' + (e.length ? ' err-card' : '')}>
              {/* top row: field type + Required + 🗑 (like Etsy) */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <select value={q.type}
                  onChange={(ev) => upd(i, { type: ev.target.value, maxChars: ev.target.value === 'text_input' ? (q.maxChars || 256) : null, maxFiles: ev.target.value.includes('upload') ? (q.maxFiles || 1) : null, labels: ev.target.value === 'labeled_upload' ? (q.labels?.length ? q.labels : ['']) : [] })}
                  style={{ flex: 1 }}>
                  {QTYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <label style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={q.required} onChange={(ev) => upd(i, { required: ev.target.checked })} /> Required
                </label>
                <button className="ph-tool" title="Delete" onClick={() => del(i)}>🗑</button>
              </div>

              {/* Field title + Character limit + Add-on price (Etsy jaisi row) */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ flex: 2, minWidth: 170 }}>
                  <label className="muted" style={{ fontSize: 12, display: 'block' }}>Field title</label>
                  <input value={q.text} onChange={(ev) => upd(i, { text: ev.target.value })}
                    className={String(q.text || '').length > 45 || !String(q.text || '').trim() ? 'in-err' : ''} style={{ width: '100%' }} />
                  <span className={String(q.text || '').length > 45 ? 'err-msg' : 'muted'} style={{ fontSize: 11 }}>{45 - String(q.text || '').length} characters remaining</span>
                </span>
                {q.type === 'text_input' && (
                  <>
                    <span>
                      <label className="muted" style={{ fontSize: 12, display: 'block' }}>Character limit</label>
                      <input type="number" value={q.maxChars || ''} onChange={(ev) => upd(i, { maxChars: ev.target.value })}
                        className={!q.maxChars || q.maxChars < 1 || q.maxChars > 1024 ? 'in-err' : ''} style={{ width: 90 }} />
                      <span className="muted" style={{ fontSize: 11, display: 'block' }}>1 to 1024</span>
                    </span>
                    <span>
                      <label className="muted" style={{ fontSize: 12, display: 'block' }}>Add-on price <span className="opt">Optional</span></label>
                      <input type="number" step="0.01" placeholder="Price" disabled={q.required} value={q.addOnPrice || ''} onChange={(ev) => upd(i, { addOnPrice: ev.target.value })}
                        className={q.addOnPrice && !q.required && (q.addOnPrice < 0.2 || q.addOnPrice > 500) ? 'in-err' : ''} style={{ width: 90 }} />
                      <span className="muted" style={{ fontSize: 11, display: 'block' }}>{q.required ? 'optional fields only' : '$0.20 to $500'}</span>
                    </span>
                  </>
                )}
                {q.type.includes('upload') && (
                  <span>
                    <label className="muted" style={{ fontSize: 12, display: 'block' }}>Max files</label>
                    <input type="number" min="1" max="10" value={q.maxFiles || ''} onChange={(ev) => {
                      const n = Number(ev.target.value) || 0
                      const labels = q.type === 'labeled_upload' ? Array.from({ length: Math.min(10, Math.max(0, n)) }, (_, k) => (q.labels || [])[k] || '') : q.labels
                      upd(i, { maxFiles: ev.target.value, labels })
                    }} className={!q.maxFiles || q.maxFiles < 1 || q.maxFiles > 10 ? 'in-err' : ''} style={{ width: 80 }} />
                    <span className="muted" style={{ fontSize: 11, display: 'block' }}>1 to 10</span>
                  </span>
                )}
              </div>

              {/* labeled upload: each file has its own label */}
              {q.type === 'labeled_upload' && (
                <div style={{ marginTop: 8 }}>
                  <label className="muted" style={{ fontSize: 12 }}>File labels (one per file, ≤45 chars)</label>
                  {(q.labels || []).map((l, k) => (
                    <input key={k} value={l} placeholder={`Label for file ${k + 1}`}
                      onChange={(ev) => upd(i, { labels: q.labels.map((x, kk) => (kk === k ? ev.target.value : x)) })}
                      className={!String(l).trim() || String(l).length > 45 ? 'in-err' : ''} style={{ width: '100%', marginTop: 5 }} />
                  ))}
                </div>
              )}

              {/* dropdown: options (1–30, har ek ≤20 chars) */}
              {q.type === 'dropdown' && (
                <div style={{ marginTop: 8 }}>
                  <label className={(q.options || []).length > 30 ? 'err-msg' : 'muted'} style={{ fontSize: 12 }}>Options ({(q.options || []).length}/30 — har ek ≤20 chars)</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '5px 0' }}>
                    {(q.options || []).map((o, k) => (
                      <span key={k} className={'chip' + (String(o).length > 20 ? ' err' : '')}>{o} <a className="lnk" style={{ cursor: 'pointer' }} onClick={() => upd(i, { options: q.options.filter((_, kk) => kk !== k) })}>✕</a></span>
                    ))}
                  </div>
                  <input placeholder="Add option (press Enter)" onKeyDown={(ev) => {
                    if (ev.key !== 'Enter') return
                    const v = ev.target.value.trim()
                    if (v) { upd(i, { options: [...(q.options || []), v] }); ev.target.value = '' }
                  }} style={{ width: 230 }} />
                </div>
              )}

              {/* Instructions — Etsy does NOT allow them on dropdowns */}
              {q.type !== 'dropdown' && (
                <div style={{ marginTop: 8 }}>
                  <label className="muted" style={{ fontSize: 12 }}>Instructions <span className="opt">Optional</span></label>
                  <textarea value={q.instructions || ''} rows={3} onChange={(ev) => upd(i, { instructions: ev.target.value })}
                    className={String(q.instructions || '').length > 120 ? 'in-err' : ''}
                    style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: 8, fontSize: 13, marginTop: 4 }} />
                  {String(q.instructions || '').length > 120 && <span className="err-msg">Instructions should not exceed 120 characters ({String(q.instructions || '').length}/120)</span>}
                </div>
              )}

              {e.length > 0 && <p className="err-msg" style={{ marginTop: 8 }}>{e.join(' · ')}</p>}
            </div>
          )
        })}

        {/* new question slot (Etsy: max 5) — like the right panel in the screenshot */}
        {qs.length < 5 && (
          <div className="pq-card pq-empty">
            <select defaultValue="" onChange={(ev) => { add(ev.target.value); ev.target.value = '' }} style={{ minWidth: 200 }}>
              <option value="" disabled>Choose field type</option>
              {QTYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>{qs.length === 0 ? 'No personalization — choose a field type to add one' : `${5 - qs.length} more can be added (photo upload too!)`}</p>
          </div>
        )}
      </div>

      {dirty && <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>✎ You have changes — they go to Etsy when you press <b>Publish</b> below.{qs.length === 0 ? ' (No questions = personalization OFF)' : ''}</p>}
      {msg && <p className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'} style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  )
}

/**
 * InventoryEditor (E4) — per-variation price / quantity / on-off / SKU,
 * like Vela's Variations tab. Loads the listing's inventory live from Etsy.
 * Etsy's rule: saving REPLACES the whole inventory, so we always send every
 * combo back (with its original identity) plus the edited numbers.
 * Note: which price varies by which dimension (price_on_property) is kept
 * EXACTLY as it is on Etsy — we edit values, not the structure.
 */
// mode: 'price' (price only), 'qty' (quantity+SKU), 'full' (everything — Variations tab)
// onCount(n) — tells the parent the number of combinations (over 399 = red dot warning)
function InventoryEditor({ storeId, listingId, currency, mode = 'full', onCount, images = [], reg }) {
  const showPrice = mode === 'price' || mode === 'full'
  const showQty = mode === 'qty' || mode === 'full'
  const TITLE = mode === 'price' ? '💲 Price' : mode === 'qty' ? '📦 Inventory' : '🧩 Variations'
  const [inv, setInv] = useState(null)     // {priceOnProperty, products: [...]}
  const [rows, setRows] = useState([])     // editable copy of products
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkQty, setBulkQty] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  // ---- Vela-style Variations sub-tabs ----
  const [vtab, setVtab] = useState('vars')   // vars|price|qty|sku|vis|photos|proc
  const [pOn, setPOn] = useState([])         // which properties have INDIVIDUAL prices
  const [qOn, setQOn] = useState([])         // ... quantity
  const [sOn, setSOn] = useState([])         // ... SKU
  const [vDirty, setVDirty] = useState(false)
  const [addIn, setAddIn] = useState({})     // "Add option" inputs (per property)
  const [varImgs, setVarImgs] = useState(null)  // existing variation-photo links on Etsy
  const [links, setLinks] = useState([])        // editable copy
  const [photoProp, setPhotoProp] = useState(null)

  useEffect(() => {
    setInv(null); setMsg(null)
    etsy.inventory(storeId, listingId)
      .then((r) => {
        setInv(r); setRows(r.products.map((p) => ({ ...p })))
        setPOn(r.priceOnProperty || []); setQOn(r.quantityOnProperty || []); setSOn(r.skuOnProperty || [])
        onCount && onCount(r.products.length)
      })
      .catch((e) => setMsg('⚠ ' + e.message))
  }, [storeId, listingId])

  // variation-photo links (Photos sub-tab)
  useEffect(() => {
    if (mode !== 'full') return
    etsy.varImages(storeId, listingId)
      .then((r) => { setVarImgs(r.links); setLinks(r.links) })
      .catch(() => { setVarImgs([]); setLinks([]) })
  }, [storeId, listingId, mode])

  // properties + their options (derived from the rows)
  const plist = useMemo(() => {
    const list = []
    for (const r of rows) for (const pv of r.propertyValues || []) {
      let P = list.find((x) => x.id === pv.property_id)
      if (!P) { P = { id: pv.property_id, name: pv.property_name, options: [] }; list.push(P) }
      const val = (pv.values || []).join(', ')
      if (!P.options.some((o) => o.value === val)) P.options.push({ value: val, valueId: (pv.value_ids || [])[0] || null })
    }
    return list
  }, [rows])
  useEffect(() => { if (photoProp === null && plist.length) setPhotoProp(plist[0].id) }, [plist, photoProp])

  const upd = (i, patch) => { setRows(rows.map((r, x) => (x === i ? { ...r, ...patch } : r))); setVDirty(true) }
  const priceVaries = (inv?.priceOnProperty || []).length > 0
  const qtyVaries = (inv?.quantityOnProperty || []).length > 0
  const skuVaries = (inv?.skuOnProperty || []).length > 0

  // bulk helpers: set every row's price/qty in one go
  const applyBulk = () => {
    setRows(rows.map((r) => ({
      ...r,
      ...(bulkPrice !== '' ? { price: bulkPrice } : {}),
      ...(bulkQty !== '' ? { quantity: bulkQty } : {}),
    })))
    setMsg('✎ Applied to all rows — now press Save variations')
  }

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      for (const r of rows) if (!r.price || Number(r.price) <= 0) throw new Error('Every combination needs a price greater than 0')
      // Etsy rule: if price does NOT vary by a property, every combo must share
      // one price — copy row 1's price everywhere to be safe (same for qty).
      let out = rows
      if (!priceVaries) out = out.map((r) => ({ ...r, price: rows[0].price }))
      if (!qtyVaries) out = out.map((r) => ({ ...r, quantity: rows[0].quantity }))
      if (!skuVaries) out = out.map((r) => ({ ...r, sku: rows[0].sku }))
      await etsy.saveInventory(storeId, listingId, {
        priceOnProperty: inv.priceOnProperty,
        quantityOnProperty: inv.quantityOnProperty,
        skuOnProperty: inv.skuOnProperty,
        products: out,
      })
      setMsg('✅ Variations saved to Etsy')
    } catch (e) {
      setMsg('⚠ ' + (e.message || e))
    } finally { setBusy(false) }
  }

  // the inventory is pushed on Publish (if anything changed) — replace-all on Etsy
  const pushInventory = async () => {
    // normalize: anything NOT Individual shares ONE value across its group
    const out = rows.map((r) => ({ ...r }))
    const norm = (field, onIds) => {
      const m = new Map()
      out.forEach((r) => {
        const key = (r.propertyValues || []).filter((pv) => onIds.includes(pv.property_id)).map((pv) => (pv.values || []).join(', ')).join(' / ')
        if (!m.has(key)) m.set(key, r[field])
        r[field] = m.get(key)
      })
    }
    norm('price', pOn); norm('quantity', qOn); norm('sku', sOn)
    for (const r of out) if (!r.price || Number(r.price) <= 0) throw new Error('Every combination needs a price greater than 0 (Price/Variations section)')
    await etsy.saveInventory(storeId, listingId, { priceOnProperty: pOn, quantityOnProperty: qOn, skuOnProperty: sOn, products: out })
    setVDirty(false)
  }
  useEffect(() => {
    if (!reg) return
    reg.current.inventory = async () => { if (vDirty) await pushInventory() }
    // profile system: provide the current inventory + apply the profile's variations
    reg.current.getInventory = () => ({ pOn, qOn, sOn, rows })
    reg.current.applyProfileInv = (p) => {
      if (p.variations && p.variations.products?.length) {
        setPOn(p.variations.pOn || []); setQOn(p.variations.qOn || []); setSOn([])
        setRows(p.variations.products.map((x) => ({
          ...x, sku: '',   // SKU is NOT in the profile — the user's own value stays
          label: (x.propertyValues || []).map((pv) => (pv.values || []).join(', ')).join(' / ') || '—',
        })))
      } else if (p.priceQty) {
        setRows((cur) => cur.map((r) => ({ ...r, price: p.priceQty.price ?? r.price, quantity: p.priceQty.quantity ?? r.quantity })))
      }
      setVDirty(true)
    }
    return () => { if (reg) { delete reg.current.inventory; delete reg.current.getInventory; delete reg.current.applyProfileInv } }
  })

  if (!inv) return <div className="card"><p className="muted">{msg || '⏳ Loading variations…'}</p></div>

  // ---- PRICE section — Etsy/Vela-style: one field; if it varies by variation,
  //      "Defined by Variation" (grey, disabled) ----
  const priceCard = (
      <div className="card esec" id="esec-price">
        <h3 style={{ marginTop: 0 }}>Price</h3>
        <label className="muted" style={{ fontSize: 12, display: 'block' }}>Price{priceVaries ? '' : ` (${currency})`}</label>
        {priceVaries ? (
          <>
            <input disabled placeholder="Defined by Variation" style={{ minWidth: 230, background: '#f4f6fa' }} />
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Each variation has its own price — edit it in the <b>Variations</b> tab.</p>
          </>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
            <input type="number" min="0.2" step="0.01" value={rows[0]?.price || ''} onChange={(e) => upd(0, { price: e.target.value })} style={{ width: 140 }} />
          </div>
        )}
        {msg && <p className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'} style={{ marginTop: 8 }}>{msg}</p>}
      </div>
  )

  // ---- INVENTORY section — Quantity + SKU (Optional);
  //      anything that varies by variation shows "Defined by Variation" ----
  const qtyCard = (
      <div className="card esec" id="esec-inventory">
        <h3 style={{ marginTop: 0 }}>Inventory</h3>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>Quantity</label>
            {qtyVaries
              ? <input disabled placeholder="Defined by Variation" style={{ minWidth: 200, background: '#f4f6fa' }} />
              : <input type="number" min="0" value={rows[0]?.quantity ?? ''} onChange={(e) => upd(0, { quantity: e.target.value })} style={{ width: 140 }} />}
          </span>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>SKU <span className="opt">Optional</span></label>
            {skuVaries
              ? <input disabled placeholder="Defined by Variation" style={{ minWidth: 200, background: '#f4f6fa' }} />
              : <input value={rows[0]?.sku || ''} onChange={(e) => upd(0, { sku: e.target.value })} style={{ width: 220 }} />}
          </span>
        </div>
        {(qtyVaries || skuVaries) && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Per-variation values are edited in the <b>Variations</b> tab.</p>
        )}
        {msg && <p className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'} style={{ marginTop: 8 }}>{msg}</p>}
      </div>
  )

  // ---------- helpers: Vela-style Variations sub-tabs ----------
  const relabel = (pvs) => pvs.map((pv) => (pv.values || []).join(', ')).join(' / ') || '—'

  const groupRows = (varyIds) => {
    const m = new Map()
    rows.forEach((r, i) => {
      const key = (r.propertyValues || []).filter((pv) => varyIds.includes(pv.property_id)).map((pv) => (pv.values || []).join(', ')).join(' / ') || '—'
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(i)
    })
    return [...m.entries()]
  }
  const setGroup = (field, idxs, v) => { setRows(rows.map((r, i) => (idxs.includes(i) ? { ...r, [field]: v } : r))); setVDirty(true) }

  // option DELETE: all combinations with that option are removed (sent to Etsy on Save)
  const delOption = (P, value) => {
    if (P.options.length <= 1) return setMsg('⚠ The last option of a property cannot be deleted')
    const left = rows.filter((r) => !(r.propertyValues || []).some((pv) => pv.property_id === P.id && (pv.values || []).join(', ') === value))
    if (!left.length) return setMsg('⚠ The last combination cannot be deleted')
    setRows(left); setVDirty(true)
    setMsg('🗑 Option removed — it goes to Etsy when you press Publish below')
  }

  // option ADD: a new product is created for every combination of the other properties
  const addOption = (P) => {
    const name = (addIn[P.id] || '').trim()
    if (!name) return
    if (P.options.some((o) => o.value.toLowerCase() === name.toLowerCase())) return setMsg('⚠ This option already exists')
    const otherIds = plist.filter((x) => x.id !== P.id).map((x) => x.id)
    const seen = new Set(); const add = []
    for (const r of rows) {
      const key = (r.propertyValues || []).filter((pv) => otherIds.includes(pv.property_id)).map((pv) => (pv.values || []).join(', ')).join(' / ')
      if (seen.has(key)) continue
      seen.add(key)
      const pvs = (r.propertyValues || []).map((pv) => (pv.property_id === P.id ? { property_id: P.id, property_name: P.name, value_ids: [], values: [name] } : pv))
      add.push({ ...r, propertyValues: pvs, label: relabel(pvs), enabled: true })
    }
    if (rows.length + add.length > 400) return setMsg('⚠ Should not exceed 400 options combinations')
    setRows([...rows, ...add]); setAddIn({ ...addIn, [P.id]: '' }); setVDirty(true)
    setMsg(`＋ "${name}" added (${add.length} new combinations) — press Publish below`)
  }


  // variation-photo link set/clear (on screen only — sent to Etsy with Save photos)
  const setLink = (valueId, imageId) => {
    setLinks((cur) => {
      const rest = cur.filter((l) => !(l.propertyId === photoProp && String(l.valueId) === String(valueId)))
      return imageId ? [...rest, { propertyId: photoProp, valueId, imageId }] : rest
    })
  }
  const savePhotos = async () => {
    setBusy(true); setMsg(null)
    try { await etsy.saveVarImages(storeId, listingId, links); setVarImgs(links); setMsg('✅ Variation photos saved to Etsy') }
    catch (e) { setMsg('⚠ ' + (e.message || e)) } finally { setBusy(false) }
  }

  // ---------- VARIATIONS section (Vela-style sub-tabs) ----------
  const simple = rows.length === 1 && !(rows[0].propertyValues || []).length
  const varsCard = simple ? (
    <div className="card esec" id="esec-variations">
      <h3 style={{ marginTop: 0 }}>Variations</h3>
      <p className="muted">This listing has no variations — price/quantity are set in the sections above.</p>
    </div>
  ) : (
    <div className="card esec" id="esec-variations">
      <h3 style={{ marginTop: 0 }}>Variations <span className="chip">{rows.length} combos</span></h3>
      {rows.length > 399 && (
        <p style={{ color: 'var(--err)', fontSize: 12, fontWeight: 600 }}>⚠ Should not exceed 400 options combinations — currently {rows.length}.</p>
      )}

      {/* sub-tabs (Vela-style) */}
      <div className="vtabs">
        {[['vars', 'Variations'], ['price', 'Price'], ['qty', 'Quantity'], ['sku', 'SKU'], ['vis', 'Visibility'], ['photos', 'Photos'], ['proc', 'Processing']].map(([id, label]) => (
          <button key={id} className={'vtab' + (vtab === id ? ' on' : '')} onClick={() => setVtab(id)}>{label}</button>
        ))}
      </div>

      {/* --- Variations: a panel for each property — options + Add/Delete --- */}
      {vtab === 'vars' && (
        <div className="vpanels">
          {plist.map((P) => (
            <div key={P.id} className="vpanel">
              <div className="vpanel-head"><b>{P.name}</b><span className="chip">{P.options.length}</span></div>
              <div className="vopt-list">
                {P.options.map((o) => (
                  <div key={o.value} className="vopt">
                    <span className="ellip">{o.value}</span>
                    <button className="ph-tool" title="Delete option" onClick={() => delOption(P, o.value)}>🗑</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input placeholder="Add option" value={addIn[P.id] || ''} onChange={(e) => setAddIn({ ...addIn, [P.id]: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && addOption(P)} style={{ flex: 1 }} />
                <button className="btn sm ghost" onClick={() => addOption(P)}>Add</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- Price / Quantity / SKU: "Individual ..." checkbox per property.
            OFF = the value from the general section (Price/Inventory tab above)
            applies to all; ON = set individually here --- */}
      {(vtab === 'price' || vtab === 'qty' || vtab === 'sku') && (() => {
        const conf = {
          price: { on: pOn, set: setPOn, field: 'price', label: 'price', general: 'Individual is OFF — the ONE price from the Price tab above applies to all combinations.' },
          qty: { on: qOn, set: setQOn, field: 'quantity', label: 'quantity', general: 'Individual is OFF — the ONE quantity from the Inventory tab applies to all.' },
          sku: { on: sOn, set: setSOn, field: 'sku', label: 'SKU', general: 'Individual is OFF — the SKU from the Inventory tab (general) applies to all; nothing to do here.' },
        }[vtab]
        return (
          <div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
              {plist.map((P) => (
                <label key={P.id} style={{ display: 'flex', gap: 7, alignItems: 'center', cursor: 'pointer', fontWeight: 600, fontSize: 13.5 }}>
                  <input type="checkbox" checked={conf.on.includes(P.id)}
                    onChange={() => { conf.set(conf.on.includes(P.id) ? conf.on.filter((x) => x !== P.id) : [...conf.on, P.id]); setVDirty(true) }} />
                  Individual {conf.label} — {P.name}
                </label>
              ))}
            </div>
            {!conf.on.length && <p className="muted" style={{ fontSize: 12 }}>{conf.general}</p>}
            {conf.on.length > 0 && (
              <div className="vrows">
                {groupRows(conf.on).map(([label, idxs]) => (
                  <div key={label} className="vrow">
                    <span className="ellip" style={{ flex: 1 }}>{label}</span>
                    {vtab === 'sku'
                      ? <input value={rows[idxs[0]].sku} onChange={(e) => setGroup('sku', idxs, e.target.value)} style={{ width: 190 }} />
                      : <input type="number" step={vtab === 'price' ? '0.01' : '1'} value={rows[idxs[0]][conf.field] ?? ''} onChange={(e) => setGroup(conf.field, idxs, e.target.value)} style={{ width: 110 }} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* --- Visibility: on/off toggle for each combination (Vela-style) --- */}
      {vtab === 'vis' && (
        <div className="vrows">
          {rows.map((r, i) => (
            <div key={i} className="vrow" style={{ opacity: r.enabled ? 1 : 0.55 }}>
              <span className="ellip" style={{ flex: 1 }}>{r.label}</span>
              <button className={'vswitch' + (r.enabled ? ' on' : '')} onClick={() => { upd(i, { enabled: !r.enabled }); setVDirty(true) }} title={r.enabled ? 'On' : 'Off'} />
            </div>
          ))}
        </div>
      )}

      {/* --- Photos: LINK a listing photo to an option — when a buyer on Etsy
            picks that option (e.g. Sweatshirt), THAT photo is shown --- */}
      {vtab === 'photos' && (
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <select value={photoProp || ''} onChange={(e) => setPhotoProp(Number(e.target.value))}>
              {plist.map((P) => <option key={P.id} value={P.id}>{P.name}</option>)}
            </select>
            <span className="muted" style={{ fontSize: 12 }}>Click a photo to attach it to each option (click again = remove)</span>
          </div>
          {varImgs === null && <p className="muted">⏳ Loading existing photo links…</p>}
          {varImgs !== null && (plist.find((P) => P.id === photoProp)?.options || []).map((o) => {
            const cur = links.find((l) => l.propertyId === photoProp && String(l.valueId) === String(o.valueId))
            return (
              <div key={o.value} className="vrow" style={{ alignItems: 'center' }}>
                <span className="ellip" style={{ width: 150, fontWeight: 600 }}>{o.value}</span>
                {!o.valueId && <span className="muted" style={{ fontSize: 12 }}>new option — Publish first, then a photo can be attached</span>}
                {o.valueId && (
                  <span className="vphotos">
                    {(images || []).map((im) => (
                      <img key={im.id} src={im.url} alt="" className={'vphoto' + (cur && String(cur.imageId) === String(im.id) ? ' sel' : '')}
                        onClick={() => setLink(o.valueId, cur && String(cur.imageId) === String(im.id) ? null : im.id)} />
                    ))}
                  </span>
                )}
              </div>
            )
          })}
          <div style={{ marginTop: 10 }}>
            <button className="btn" disabled={busy || varImgs === null} onClick={savePhotos}>{busy ? '⏳' : '💾 Save variation photos'}</button>
          </div>
        </div>
      )}

      {/* --- Processing: the Etsy API has no per-variation processing --- */}
      {vtab === 'proc' && (
        <p className="muted" style={{ fontSize: 13 }}>
          On Etsy, processing time comes with the shipping/readiness profile — Etsy's API does not allow
          setting processing per variation. The general profile is set in the <b>Shipping</b> tab;
          once the Etsy API supports it, "Individual PP" will open up here.
        </p>
      )}

      {vDirty && <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>✎ You have changes — they go to Etsy when you press <b>Publish</b> below.</p>}
      {msg && <p className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'} style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  )

  if (mode === 'price') return priceCard
  if (mode === 'qty') return qtyCard
  if (mode === 'full') return varsCard
  // mode 'all': all three sections on one page (Price → Inventory → Variations)
  return <>{priceCard}{qtyCard}{varsCard}</>
}

/**
 * PhotosEditor (Vela-style) — Etsy allows 20 photos per listing (since Aug 2025).
 * - first photo = LARGE thumbnail (left), the rest are small tiles
 * - DRAG a photo and drop it anywhere — it is INSERTED:
 *   drop pic 5 on pic 2 -> old 2 -> 3, 3 -> 4, ... and the new
 *   order is saved to Etsy AUTOMATICALLY
 * - corner tools on hover: ✎ edit (page later), 🗑 delete,
 *   ⋯ menu (Replace / Download); bottom-right A≡ = alt text
 * - bottom-left ⚠ = alt text is empty
 * - ONE Upload box at the end — until there are 20
 */
const MAX_PHOTOS = 20
/**
 * ThumbAdjust — Etsy-style "Adjust thumbnail": a 4:3 crop frame on photo #1,
 * set it with zoom + drag. On Apply THAT crop replaces photo #1 on Etsy
 * (Etsy builds the thumbnail from photo #1, so Etsy
 * shows exactly this thumbnail).
 */
function ThumbAdjust({ src, onApply, onCancel }) {
  const [img, setImg] = useState(null)
  const [z, setZ] = useState(1)                       // zoom 1..3
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 })  // crop center (image fraction)
  const cvRef = React.useRef(null)
  const dragRef = React.useRef(null)
  const AR = 4 / 3   // Etsy listing thumbnail ratio

  useEffect(() => { const im = new Image(); im.onload = () => setImg(im); im.src = src }, [src])

  // compute the crop's source rect (in image pixels)
  const rect = React.useCallback(() => {
    if (!img) return null
    let sw = Math.min(img.naturalWidth, img.naturalHeight * AR) / z
    let sh = sw / AR
    let sx = pos.x * img.naturalWidth - sw / 2
    let sy = pos.y * img.naturalHeight - sh / 2
    sx = Math.max(0, Math.min(img.naturalWidth - sw, sx))
    sy = Math.max(0, Math.min(img.naturalHeight - sh, sy))
    return { sx, sy, sw, sh }
  }, [img, z, pos])

  useEffect(() => {
    const cv = cvRef.current, r = rect()
    if (!cv || !img || !r) return
    cv.width = 480; cv.height = 360
    const ctx = cv.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = '#eee'; ctx.fillRect(0, 0, 480, 360)
    ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, 480, 360)
  }, [img, z, pos, rect])

  const onDown = (e) => { dragRef.current = { x: e.clientX, y: e.clientY, pos: { ...pos } } }
  const onMove = (e) => {
    const d = dragRef.current, r = rect()
    if (!d || !r || !img) return
    const cv = cvRef.current
    setPos({
      x: Math.max(0, Math.min(1, d.pos.x - ((e.clientX - d.x) / cv.getBoundingClientRect().width) * (r.sw / img.naturalWidth))),
      y: Math.max(0, Math.min(1, d.pos.y - ((e.clientY - d.y) / cv.getBoundingClientRect().height) * (r.sh / img.naturalHeight))),
    })
  }
  const onUp = () => { dragRef.current = null }

  const apply = () => {
    const r = rect()
    if (!img || !r) return
    const out = document.createElement('canvas')
    out.width = 2000; out.height = 1500   // 4:3, close to Etsy's recommended size
    const ctx = out.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, out.width, out.height)
    onApply(out.toDataURL('image/jpeg', 0.92))
  }

  return (
    <div className="modal-overlay" onMouseUp={onUp} onMouseMove={onMove}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="topbar" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>⭐ Adjust thumbnail</h2>
          <button className="btn sm ghost" onClick={onCancel}>✕</button>
        </div>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
          Etsy builds the thumbnail from <b>photo #1</b> (4:3). Drag the photo to move it, zoom below —
          on Apply, photo #1 is replaced with this crop, so Etsy will use exactly this thumbnail.
        </p>
        {!img && <p className="muted">⏳ Loading photo…</p>}
        <canvas ref={cvRef} onMouseDown={onDown}
          style={{ width: '100%', maxWidth: 480, borderRadius: 10, border: '1px solid var(--line)', cursor: 'grab', display: 'block' }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, maxWidth: 480 }}>
          <span className="muted" style={{ fontSize: 12 }}>Zoom</span>
          <input type="range" min="1" max="3" step="0.01" value={z} onChange={(e) => setZ(+e.target.value)} style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 12 }}>{z.toFixed(2)}×</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn" onClick={apply}>✓ Apply (photo #1 replace)</button>
        </div>
      </div>
    </div>
  )
}

function PhotosEditor({ storeId, listingId, initial, reg }) {
  const [imgs, setImgs] = useState(initial)   // [{id, url, full, alt}]
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [drag, setDrag] = useState(null)      // which photo is being dragged (index)
  const [over, setOver] = useState(null)      // which one it will be dropped on (index)
  const [dirty, setDirty] = useState(false)   // order changed but NOT yet saved to Etsy
  const [menu, setMenu] = useState(null)      // which photo's ⋯ menu is open (id)
  const [altFor, setAltFor] = useState(null)  // which photo's alt editor is open (id)
  const [altTxt, setAltTxt] = useState('')
  const [editIdx, setEditIdx] = useState(null)  // which photo is open in the editor (index)
  const [editSrc, setEditSrc] = useState(null)  // its dataURL (for the editor)
  const [thumbSrc, setThumbSrc] = useState(null)  // ⭐ source image for the Adjust-thumbnail modal
  const repRef = React.useRef(null)           // hidden file input for Replace
  const repIdx = React.useRef(-1)

  const read = (f) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f) })

  // ---- drag & drop: take out and INSERT at the new spot — on SCREEN only.
  // NOTHING goes to Etsy until the user presses 💾 Save order.
  const drop = (to) => {
    const from = drag
    setDrag(null); setOver(null)
    if (from === null || to === null || from === to) return
    const a = [...imgs]
    const [m] = a.splice(from, 1)
    a.splice(to, 0, m)
    setImgs(a); setDirty(true)
    setMsg('✎ Order changed — it goes to Etsy when you press Publish below')
  }

  // save the order on Publish (if it changed) — the parent registers it
  useEffect(() => {
    if (!reg) return
    reg.current.photos = async () => {
      if (!dirty) return
      await etsy.orderImages(storeId, listingId, imgs.map((x) => x.id))
      setDirty(false)
    }
    return () => { if (reg) delete reg.current.photos }
  })

  const del = async (im) => {
    setMenu(null)
    if (!confirm('Delete this photo from the Etsy listing?')) return
    setBusy(true); setMsg(null)
    try { await etsy.delImage(storeId, listingId, im.id); setImgs(imgs.filter((x) => x.id !== im.id)); setMsg('🗑 Photo deleted') }
    catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  const upload = async (files) => {
    setBusy(true); setMsg(null)
    try {
      let cur = imgs
      for (const f of Array.from(files).slice(0, MAX_PHOTOS - imgs.length)) {
        // Etsy rules: JPG / PNG / GIF only, max 20MB — otherwise a RED error
        if (!['image/jpeg', 'image/png', 'image/gif'].includes(f.type)) { setMsg(`⚠ ${f.name}: Etsy only accepts JPG / PNG / GIF photos — this is ${f.type || 'unknown'}`); continue }
        if (f.size > 20 * 1024 * 1024) { setMsg(`⚠ ${f.name}: ${(f.size / 1048576).toFixed(1)}MB — Etsy's limit is 20MB per photo`); continue }
        const dataUrl = await read(f)
        const res = await etsy.addImage(storeId, listingId, dataUrl, cur.length + 1)
        cur = [...cur, { id: res.imageId, url: dataUrl, full: null, alt: '' }]
        setImgs(cur)
      }
      setMsg('✅ Uploaded')
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  // Replace = delete the old one + new one at THE SAME position + save the order again
  const replace = async (f) => {
    const i = repIdx.current
    if (!f || i < 0) return
    if (!['image/jpeg', 'image/png', 'image/gif'].includes(f.type)) return setMsg(`⚠ Etsy only accepts JPG / PNG / GIF — this is ${f.type || 'unknown'}`)
    if (f.size > 20 * 1024 * 1024) return setMsg(`⚠ ${(f.size / 1048576).toFixed(1)}MB — Etsy's limit is 20MB per photo`)
    setBusy(true); setMsg('⏳ Replacing photo…')
    try {
      const old = imgs[i]
      const dataUrl = await read(f)
      await etsy.delImage(storeId, listingId, old.id)
      const res = await etsy.addImage(storeId, listingId, dataUrl, i + 1)
      const a = imgs.map((x, xi) => (xi === i ? { id: res.imageId, url: dataUrl, full: null, alt: '' } : x))
      setImgs(a)
      await etsy.orderImages(storeId, listingId, a.map((x) => x.id))
      setMsg('✅ Photo replaced')
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false); repIdx.current = -1 }
  }

  // ✎ Edit: open the photo editor (the CDN image arrives as a dataURL via the backend proxy)
  const openEdit = async (i) => {
    setBusy(true); setMsg(null)
    try {
      const im = imgs[i]
      const src = im.url.startsWith('data:') ? im.url : await etsy.imageData(im.full || im.url)
      setEditIdx(i); setEditSrc(src)
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  // On the editor's Apply: the edited image REPLACES the old one on Etsy
  const applyEdit = async (dataUrl) => {
    const i = editIdx
    setEditIdx(null); setEditSrc(null)
    setBusy(true); setMsg('⏳ Uploading edited photo to Etsy…')
    try {
      const old = imgs[i]
      await etsy.delImage(storeId, listingId, old.id)
      const res = await etsy.addImage(storeId, listingId, dataUrl, i + 1)
      const a = imgs.map((x, xi) => (xi === i ? { id: res.imageId, url: dataUrl, full: null, alt: old.alt } : x))
      setImgs(a)
      await etsy.orderImages(storeId, listingId, a.map((x) => x.id))
      if (old.alt) await etsy.setAlt(storeId, listingId, res.imageId, old.alt, i + 1)  // restore the alt text
      setMsg('✅ Edited photo saved to Etsy')
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  // ⭐ Adjust thumbnail: open photo #1; once the 4:3 crop is applied, replace it in place
  const openThumb = async () => {
    if (!imgs.length) return
    setBusy(true); setMsg(null)
    try {
      const im = imgs[0]
      setThumbSrc(im.url.startsWith('data:') ? im.url : await etsy.imageData(im.full || im.url))
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }
  const applyThumb = async (dataUrl) => {
    setThumbSrc(null)
    setBusy(true); setMsg('⏳ Uploading new thumbnail (photo #1) to Etsy…')
    try {
      const old = imgs[0]
      await etsy.delImage(storeId, listingId, old.id)
      const res = await etsy.addImage(storeId, listingId, dataUrl, 1)
      const a = imgs.map((x, xi) => (xi === 0 ? { id: res.imageId, url: dataUrl, full: null, alt: old.alt } : x))
      setImgs(a)
      await etsy.orderImages(storeId, listingId, a.map((x) => x.id))
      if (old.alt) await etsy.setAlt(storeId, listingId, res.imageId, old.alt, 1)
      setMsg('✅ Thumbnail set — Etsy will show this crop')
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  const saveAlt = async () => {
    const i = imgs.findIndex((x) => x.id === altFor)
    if (i < 0) return
    setBusy(true)
    try {
      await etsy.setAlt(storeId, listingId, altFor, altTxt, i + 1)
      setImgs(imgs.map((x) => (x.id === altFor ? { ...x, alt: altTxt } : x)))
      setAltFor(null); setMsg('✅ Alt text saved to Etsy')
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <div className="topbar" style={{ margin: 0 }}>
        <h3 style={{ marginTop: 0 }}>🖼 Photos <span className="chip">{imgs.length}/{MAX_PHOTOS}</span> {busy && <span className="muted" style={{ fontSize: 12 }}>⏳</span>}</h3>
        {imgs.length > 0 && <button className="btn sm ghost" disabled={busy} onClick={openThumb}>⭐ Adjust thumbnail</button>}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Drag a photo and drop it anywhere — then press 💾 Save order below to send it to Etsy. ⚠ = no alt text.</p>
      <div className="ph-grid">
        {imgs.map((im, i) => (
          <div key={im.id}
            className={'ph-item' + (over === i && drag !== null && drag !== i ? ' dropat' : '')}
            draggable={!busy}
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => { e.preventDefault(); setOver(i) }}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={(e) => { e.preventDefault(); drop(i) }}
            onDragEnd={() => { setDrag(null); setOver(null) }}>
            <img src={im.url} alt={im.alt || ''} draggable={false} />
            {/* hover tools — top-right corner */}
            <div className="ph-tools" onClick={(e) => e.stopPropagation()}>
              <button className="ph-tool" title="Edit photo" onClick={() => openEdit(i)}>✎</button>
              <button className="ph-tool" title="Delete" onClick={() => del(im)}>🗑</button>
              <button className="ph-tool" title="More" onClick={() => setMenu(menu === im.id ? null : im.id)}>⋯</button>
              {menu === im.id && (
                <>
                  <div className="menu-veil" onClick={() => setMenu(null)} />
                  <div className="ph-menu">
                    <button onClick={() => { setMenu(null); repIdx.current = i; repRef.current && repRef.current.click() }}>Replace</button>
                    <button onClick={() => { setMenu(null); window.open(im.full || im.url, '_blank') }}>Download</button>
                  </div>
                </>
              )}
            </div>
            {/* bottom-left: ⚠ when there is no alt text */}
            {!im.alt && <span className="ph-warn" title="No alt text — add it with A≡">⚠</span>}
            {/* bottom-right: open the alt text editor */}
            <button className="ph-alt" title="Alt text" onClick={(e) => { e.stopPropagation(); setAltFor(im.id); setAltTxt(im.alt || '') }}>A≡</button>
          </div>
        ))}
        {/* ONE Upload tile — hidden at 20 */}
        {imgs.length < MAX_PHOTOS && (
          <label className="ph-upload">
            <span style={{ fontSize: 26 }}>🖼</span> Upload
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
          </label>
        )}
      </div>
      {/* hidden input for Replace */}
      <input ref={repRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { replace(e.target.files[0]); e.target.value = '' }} />

      {dirty && <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>✎ New order — it goes to Etsy when you press <b>Publish</b> below.</p>}

      {/* alt text editor */}
      {altFor && (
        <div style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
          <label className="muted" style={{ fontSize: 12 }}>Alt text ({altTxt.length}/500) — what is shown in the photo (SEO + accessibility)</label>
          <textarea value={altTxt} maxLength={500} onChange={(e) => setAltTxt(e.target.value)} rows={3}
            style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: 10, fontSize: 13, margin: '6px 0' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" disabled={busy} onClick={saveAlt}>💾 Save alt text</button>
            <button className="btn sm ghost" onClick={() => setAltFor(null)}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'} style={{ marginTop: 8 }}>{msg}</p>}

      {/* full-screen photo editor (like Etsy) */}
      {editIdx !== null && editSrc && (
        <PhotoEdit src={editSrc} onApply={applyEdit} onCancel={() => { setEditIdx(null); setEditSrc(null) }} />
      )}

      {/* ⭐ thumbnail adjust modal (photo #1, 4:3 crop) */}
      {thumbSrc && <ThumbAdjust src={thumbSrc} onApply={applyThumb} onCancel={() => setThumbSrc(null)} />}
    </div>
  )
}

/**
 * VideoEditor (Vela-style) — no video = an Upload tile (Vela-style),
 * with a video = a PLAYABLE player (to check it) + Replace / Delete.
 * A just-uploaded video plays right away from the local copy;
 * after Etsy processes it, the CDN version is shown.
 */
function VideoEditor({ storeId, listingId, initial }) {
  const [video, setVideo] = useState(initial)  // {id, url, thumb} | null
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const MAX_MB = 40  // Etsy's own limit is 100MB; the free server can handle ~40MB

  const upload = async (f) => {
    if (!f) return
    // Etsy rules: MP4 / MOV only — webm or any other format is rejected
    if (!['video/mp4', 'video/quicktime'].includes(f.type)) return setMsg(`⚠ Etsy only accepts MP4 / MOV videos — this is ${f.type || 'unknown'} (webm does NOT work)`)
    if (f.size > MAX_MB * 1024 * 1024) return setMsg(`⚠ Keep the video under ${MAX_MB}MB (Etsy allows 100MB, but the free server can only handle this much)`)
    setBusy(true); setMsg(null)
    try {
      const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f) })
      const res = await etsy.addVideo(storeId, listingId, dataUrl, f.name)
      setVideo({ id: res.videoId, url: dataUrl, thumb: null })  // dataURL = playable below right away
      setMsg('✅ Video uploaded to Etsy (Etsy will process it — the local copy plays below until then)')
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  const del = async () => {
    if (!confirm('Delete the video from the Etsy listing?')) return
    setBusy(true); setMsg(null)
    try { await etsy.delVideo(storeId, listingId, video.id); setVideo(null); setMsg('🗑 Video deleted') }
    catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>🎬 Video {video ? <span className="chip ok">yes</span> : <span className="chip">none</span>}</h3>

      {/* NO video: Vela-style upload tile */}
      {!video && (
        <label className="vd-upload">
          <span style={{ fontSize: 30 }}>🎬</span>
          <b style={{ color: 'var(--accent)' }}>Upload</b>
          <span className="muted" style={{ fontSize: 12 }}>Max file size: {MAX_MB} MB · MP4</span>
          <input type="file" accept="video/mp4,video/quicktime" style={{ display: 'none' }} onChange={(e) => { upload(e.target.files[0]); e.target.value = '' }} />
        </label>
      )}

      {/* video EXISTS: player (to check it) + Replace / Delete */}
      {video && (
        <>
          {video.url
            ? <video className="vd-player" src={video.url} poster={video.thumb || undefined} controls preload="metadata" />
            : <p className="muted">⏳ Etsy is processing the video — reopen the listing in a few minutes and it will play here.</p>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            <label className="btn ghost" style={{ cursor: 'pointer' }}>
              ↻ Replace video (MP4)
              <input type="file" accept="video/mp4,video/quicktime" style={{ display: 'none' }} onChange={(e) => { upload(e.target.files[0]); e.target.value = '' }} />
            </label>
            <button className="btn danger" disabled={busy} onClick={del}>🗑 Delete</button>
          </div>
        </>
      )}

      {busy && <p className="muted" style={{ marginTop: 8 }}>⏳ Uploading… (large videos take a while)</p>}
      {msg && <p className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'} style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  )
}

/**
 * PublishCard (E5) — the big moment: draft/inactive -> ACTIVE (live on Etsy),
 * or active -> inactive (hide it). Publishing a new listing is when Etsy
 * charges its own $0.20 listing fee, so we always confirm first.
 */
function PublishCard({ storeId, listingId, state, onDone }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const go = async (target) => {
    const warn = target === 'active'
      ? 'The listing will go LIVE — Etsy charges its $0.20 listing fee (for a new listing). Publish?'
      : 'The listing will be hidden (inactive) — buyers won\'t see it. Continue?'
    if (!confirm(warn)) return
    setBusy(true); setMsg(null)
    try {
      await etsy.setState(storeId, listingId, target)
      setMsg(target === 'active' ? '🚀 The listing is LIVE!' : '⏸ The listing is now inactive')
      setTimeout(onDone, 900)
    } catch (e) { setMsg('⚠ ' + (e.message || e)) } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>🚀 Publish <span className="chip">{state}</span></h3>
      <div style={{ display: 'flex', gap: 8 }}>
        {state !== 'active' && <button className="btn" disabled={busy} onClick={() => go('active')}>🚀 Publish on Etsy (live)</button>}
        {state === 'active' && <button className="btn ghost" disabled={busy} onClick={() => go('inactive')}>⏸ Deactivate</button>}
      </div>
      {msg && <p className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'} style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  )
}
