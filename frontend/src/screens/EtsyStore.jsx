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
  if (m < 1) return 'abhi refresh hua'
  if (m < 60) return `${m} min ago`
  return `${Math.round(m / 60)}h ago`
}

export default function EtsyStore({ es, state, filt, onDeleted, onRefresh, onCreate }) {
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

  // ListPilot-made listings (for the 🚀 Launchpad filter)
  const lpIds = useMemo(() => new Set(
    (app.ws.listings || []).map((L) => L.etsy?.listingId).filter(Boolean).map(String)
  ), [app.ws.listings])

  // CHECKBOX filters: within a category = OR (Halloween + St Patrick = dono),
  // across categories = AND (section bhi match ho AUR shipping bhi)
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
  const doDelete = async () => {
    if (!confirm('Ye listing Etsy se HAMESHA ke liye delete ho jayegi. Pakka?')) return
    try {
      await etsy.deleteListing(storeId, openId)
      onDeleted && onDeleted(openId)
      setOpenId(null); setDetail(null)
    } catch (e) { setErr(e.message) }
  }

  if (!storeId) return <Empty>Pehle koi store select karein.</Empty>
  if (!es.checked) return <div className="card"><p className="muted">⏳ checking Etsy connection…</p></div>
  if (!es.connected) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>🛍️ Etsy Store</h3>
        <p className="muted">Is store ki Etsy shop abhi connect nahi hai — Settings (apne naam par click) me 🛍️ Etsy section se connect karein, phir yahan aap ki poori shop nazar aayegi.</p>
      </div>
    )
  }

  // ---------- detail view ----------
  if (openId) {
    return (
      <>
        <div className="card">
          <div className="topbar" style={{ margin: 0 }}>
            <b className="ellip">{detail ? detail.title : '⏳ loading…'}</b>
            <span style={{ display: 'flex', gap: 6 }}>
              {detail && <button className="btn sm danger" title="Delete listing" onClick={doDelete}>🗑</button>}
              <button className="btn sm ghost" onClick={() => { setOpenId(null); setDetail(null); setEdit(false) }}>← Back</button>
            </span>
          </div>
        </div>
        {!detail && <div className="card"><p className="muted">⏳ listing load ho rahi hai…</p></div>}
        {detail && edit && <EtsyEdit storeId={storeId} detail={detail} onDone={reload} onCancel={() => { setOpenId(null); setDetail(null); setEdit(false) }} />}
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
              <a className="btn ghost" style={{ textDecoration: 'none' }} href={detail.url} target="_blank" rel="noreferrer">↗ Etsy par kholein</a>
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
      {es.busy && <div className="card"><p className="muted">⏳ Poori shop ka index ban raha hai (pehli bar 10–20 sec)…</p></div>}

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
                    {/* None sirf tab dabta hai jab kuch selected ho — warna grey */}
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
          {!pageRows.length && <div style={{ padding: 20 }}><Empty>Is filter me koi listing nahi.</Empty></div>}
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
  // ---- E3: details ----
  const [enums, setEnums] = useState(null)              // who_made / when_made options (live)
  const [whoMade, setWhoMade] = useState(detail.whoMade || 'i_did')
  const [whenMade, setWhenMade] = useState(detail.whenMade || 'made_to_order')
  const [shipProfiles, setShipProfiles] = useState(null)
  const [shipId, setShipId] = useState(detail.shippingProfileId || '')
  const [retPolicies, setRetPolicies] = useState(null)
  const [retId, setRetId] = useState(detail.returnPolicyId || '')
  const [props, setProps] = useState(null)              // category ke attribute dropdowns
  const [propSel, setPropSel] = useState(() => {
    // current attribute values from the listing -> {propertyId: valueId}
    const m = {}
    for (const p of detail.properties || []) if (p.valueIds?.length) m[p.propertyId] = String(p.valueIds[0])
    return m
  })
  // ---- personalization (Vela's Personalization tab) ----
  const [persOn, setPersOn] = useState(!!detail.personalization?.enabled)
  const [persReq, setPersReq] = useState(!!detail.personalization?.required)
  const [persIns, setPersIns] = useState(detail.personalization?.instructions || '')
  const [persMax, setPersMax] = useState(detail.personalization?.charMax || '')
  // ---- Vela-style tab bar ----
  const [tab, setTab] = useState('photos')
  const [varCount, setVarCount] = useState(null)   // combos count (InventoryEditor batata hai)
  // profiles: Profiles section me jo profiles banengi wo yahan aayengi
  const profiles = useMemo(() => { try { return JSON.parse(localStorage.getItem('mp_profiles') || '[]') } catch { return [] } }, [])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  // load everything the editor's dropdowns need — all LIVE from Etsy
  useEffect(() => {
    etsy.sections(storeId).then((r) => setSections(r.sections)).catch(() => setSections([]))
    etsy.enums().then(setEnums).catch(() => setEnums({ whoMade: ['i_did'], whenMade: ['made_to_order'] }))
    etsy.shippingProfiles(storeId).then((r) => setShipProfiles(r.profiles)).catch(() => setShipProfiles([]))
    etsy.returnPolicies(storeId).then((r) => setRetPolicies(r.policies)).catch(() => setRetPolicies([]))
    if (detail.taxonomyId) etsy.properties(storeId, detail.taxonomyId).then((r) => setProps(r.properties)).catch(() => setProps([]))
    else setProps([])
  }, [storeId, detail.taxonomyId])

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
      if (String(shipId || '') !== String(detail.shippingProfileId || '')) patch.shippingProfileId = shipId
      if (String(retId || '') !== String(detail.returnPolicyId || '')) patch.returnPolicyId = retId
      // personalization
      const P = detail.personalization || {}
      if (persOn !== !!P.enabled) patch.personalizable = persOn
      if (persOn) {
        if (persReq !== !!P.required) patch.persRequired = persReq
        if (persIns !== (P.instructions || '')) patch.persInstructions = persIns
        if (String(persMax || '') !== String(P.charMax || '')) patch.persCharMax = persMax
      }
      if (Object.keys(patch).length) await etsy.update(storeId, detail.id, patch)

      // 2) attributes (Sleeve length etc.) — one call per CHANGED property
      let propChanges = 0
      const orig = {}
      for (const p of detail.properties || []) if (p.valueIds?.length) orig[p.propertyId] = String(p.valueIds[0])
      for (const p of props || []) {
        const now = propSel[p.propertyId] || ''
        const was = orig[p.propertyId] || ''
        if (now === was) continue
        const opt = p.options.find((o) => String(o.id) === now)
        await etsy.setProperty(storeId, detail.id, p.propertyId, now ? [Number(now)] : [], opt ? [opt.name] : [])
        propChanges++
      }

      if (!Object.keys(patch).length && !propChanges) { setMsg('Kuch badla hi nahi 🙂'); setBusy(false); return }
      setMsg('✅ Etsy par save ho gaya')
      setTimeout(onDone, 700)   // reload the fresh listing
    } catch (e) {
      setMsg('⚠ ' + (e.message || e))
    } finally { setBusy(false) }
  }

  // "made_to_order" -> "Made to order", "2020_2026" -> "2020 - 2026"
  const nice = (v) => String(v).replace(/_/g, ' ').replace(/(\d{4}) (\d{4})/, '$1 - $2').replace(/^\w/, (c) => c.toUpperCase())

  // Vela-style tabs — sab ke naam upar, neeche selected wala panel
  const TABS = [
    ['photos', 'Photos'], ['video', 'Video'], ['title', 'Title'],
    ['description', 'Description'], ['tags', 'Tags'], ['details', 'Details'],
    ['price', 'Price'], ['inventory', 'Inventory'], ['variations', 'Variations'],
    ['personalization', 'Personalization'], ['shipping', 'Shipping'],
  ]
  // Red dot = Etsy ke rule ke KHILAF kuch hai (warning), warna koi dot nahi:
  //  - Variations: Etsy max 399 combos accept karta hai (400+ reject)
  //  - Personalization: instructions max 120 characters
  const dots = {
    variations: (varCount || 0) > 399,
    personalization: persOn && persIns.length > 120,
  }

  return (
    <>
      {/* ---- tab bar (Vela style) ---- */}
      <div className="card" style={{ padding: '0 8px' }}>
        <div className="etabs">
          {TABS.map(([id, label]) => (
            <button key={id} className={'etab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>
              {dots[id] && <span className="etab-dot" />}{label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Choose Profile (green bar) — Profiles section me bani profiles yahan aayengi ---- */}
      <div className="profile-bar">
        <select defaultValue="">
          <option value="">⊞ Choose Profile</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          {!profiles.length && <option disabled>— abhi koi profile nahi bani —</option>}
        </select>
        <span className="muted" style={{ fontSize: 12 }}>Profiles section jab banega, wahan ki profiles is dropdown me aayengi.</span>
      </div>

      {/* ---- Photos / Video (mounted rehte hain — tab badalne par kaam na ude) ---- */}
      <div style={{ display: tab === 'photos' ? '' : 'none' }}>
        <PhotosEditor storeId={storeId} listingId={detail.id} initial={detail.images || []} />
      </div>
      <div style={{ display: tab === 'video' ? '' : 'none' }}>
        <VideoEditor storeId={storeId} listingId={detail.id} initial={detail.video} />
      </div>

      {/* ---- Title ---- */}
      {tab === 'title' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Title <span className="chip">{detail.state}</span></h3>
          <label className="muted" style={{ fontSize: 12 }}>Title ({140 - title.length} baqi)</label>
          <input value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
          <p className="muted" style={{ fontSize: 12 }}>Ye neeche 💾 Save to Etsy se save hota hai.</p>
        </div>
      )}

      {/* ---- Description ---- */}
      {tab === 'description' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Description</h3>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={14} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: 10, fontSize: 13, marginBottom: 10 }} />
        </div>
      )}

      {/* ---- Tags & Materials ---- */}
      {tab === 'tags' && (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tags</h3>
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

      </div>
      )}

      {/* ---- Price / Inventory / Variations — teeno ek hi LIVE inventory editor
           par chalte hain (mounted rehta hai), bas columns badalte hain ---- */}
      <div style={{ display: ['price', 'inventory', 'variations'].includes(tab) ? '' : 'none' }}>
        <InventoryEditor storeId={storeId} listingId={detail.id} currency={detail.currency}
          mode={tab === 'price' ? 'price' : tab === 'inventory' ? 'qty' : 'full'} onCount={setVarCount} />
      </div>

      {/* ---- Personalization ---- */}
      {tab === 'personalization' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>🎁 Personalization</h3>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', marginBottom: 10 }}>
            <input type="checkbox" checked={persOn} onChange={(e) => setPersOn(e.target.checked)} />
            Buyers is listing ko personalize kar sakte hain
          </label>
          {persOn && (
            <>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', marginBottom: 10 }} className="muted">
                <input type="checkbox" checked={persReq} onChange={(e) => setPersReq(e.target.checked)} />
                Personalization REQUIRED ho (buyer ko likhna hi padega)
              </label>
              <label className="muted" style={{ fontSize: 12 }}>
                Instructions for buyers ({persIns.length}/120)
                {persIns.length > 120 && <b style={{ color: 'var(--err)' }}> — Etsy sirf 120 characters accept karta hai!</b>}
              </label>
              <textarea value={persIns} onChange={(e) => setPersIns(e.target.value)} rows={4}
                placeholder="e.g. Enter the name you want printed…"
                style={{ width: '100%', border: '1px solid ' + (persIns.length > 120 ? 'var(--err)' : 'var(--line)'), borderRadius: 9, padding: 10, fontSize: 13, marginBottom: 10 }} />
              <label className="muted" style={{ fontSize: 12, display: 'block' }}>Max characters (khali = Etsy default)</label>
              <input type="number" min="1" max="1024" value={persMax} onChange={(e) => setPersMax(e.target.value)} style={{ width: 120 }} />
            </>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Ye neeche 💾 Save to Etsy se save hota hai.</p>
        </div>
      )}

      {/* ---- Shipping ---- */}
      {tab === 'shipping' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>🚚 Shipping</h3>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>
              <label className="muted" style={{ fontSize: 12, display: 'block' }}>Shipping profile</label>
              <select value={shipId || ''} onChange={(e) => setShipId(e.target.value)} style={{ minWidth: 200 }}>
                {!shipProfiles && <option value="">⏳</option>}
                {(shipProfiles || []).map((p) => <option key={p.id} value={p.id}>🚚 {p.title}</option>)}
              </select>
            </span>
            <span>
              <label className="muted" style={{ fontSize: 12, display: 'block' }}>Return policy</label>
              <select value={retId || ''} onChange={(e) => setRetId(e.target.value)} style={{ minWidth: 220 }}>
                <option value="">— default —</option>
                {(retPolicies || []).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </span>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Ye neeche 💾 Save to Etsy se save hota hai.</p>
        </div>
      )}

      {/* ---- Details — section, auto-renew, who/when made + attributes (sab LIVE Etsy se) ---- */}
      {tab === 'details' && (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>📋 Details</h3>
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
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>Who made it?</label>
            <select value={whoMade} onChange={(e) => setWhoMade(e.target.value)} style={{ minWidth: 150 }}>
              {(enums?.whoMade || [whoMade]).map((v) => <option key={v} value={v}>{nice(v)}</option>)}
            </select>
          </span>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>When did you make it?</label>
            <select value={whenMade} onChange={(e) => setWhenMade(e.target.value)} style={{ minWidth: 150 }}>
              {(enums?.whenMade || [whenMade]).map((v) => <option key={v} value={v}>{nice(v)}</option>)}
            </select>
          </span>
        </div>

        {/* category attributes: the SAME dropdowns + options Etsy shows,
            loaded live for this listing's category (Sleeve length, Neckline...) */}
        <h3 style={{ margin: '4px 0 8px' }}>🎛 Attributes <span className="chip">{props ? props.length : '⏳'}</span></h3>
        {props === null && <p className="muted">⏳ Etsy se attributes load ho rahe hain…</p>}
        {props && !props.length && <p className="muted">Is category ke liye koi dropdown-attribute nahi.</p>}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {(props || []).map((p) => (
            <span key={p.propertyId}>
              <label className="muted" style={{ fontSize: 12, display: 'block' }}>{p.name}{p.required ? ' *' : ''}</label>
              <select
                value={propSel[p.propertyId] || ''}
                onChange={(e) => setPropSel({ ...propSel, [p.propertyId]: e.target.value })}
                style={{ minWidth: 160 }}
              >
                <option value="">— choose —</option>
                {p.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </span>
          ))}
        </div>
      </div>
      )}

      {/* ---- hamesha neeche: Save + Publish ---- */}
      <div className="card">
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={busy} onClick={save}>{busy ? '⏳ Saving…' : '💾 Save to Etsy'}</button>
          <button className="btn ghost" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
        {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}
      </div>
      <PublishCard storeId={storeId} listingId={detail.id} state={detail.state} onDone={onDone} />
    </>
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
// mode: 'price' (sirf price), 'qty' (quantity+SKU), 'full' (sab kuch — Variations tab)
// onCount(n) — parent ko combos ki tadaad batata hai (399 se zyada = red dot warning)
function InventoryEditor({ storeId, listingId, currency, mode = 'full', onCount }) {
  const showPrice = mode === 'price' || mode === 'full'
  const showQty = mode === 'qty' || mode === 'full'
  const TITLE = mode === 'price' ? '💲 Price' : mode === 'qty' ? '📦 Inventory' : '🧩 Variations'
  const [inv, setInv] = useState(null)     // {priceOnProperty, products: [...]}
  const [rows, setRows] = useState([])     // editable copy of products
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkQty, setBulkQty] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    setInv(null); setMsg(null)
    etsy.inventory(storeId, listingId)
      .then((r) => { setInv(r); setRows(r.products.map((p) => ({ ...p }))); onCount && onCount(r.products.length) })
      .catch((e) => setMsg('⚠ ' + e.message))
  }, [storeId, listingId])

  const upd = (i, patch) => setRows(rows.map((r, x) => (x === i ? { ...r, ...patch } : r)))
  const priceVaries = (inv?.priceOnProperty || []).length > 0
  const qtyVaries = (inv?.quantityOnProperty || []).length > 0

  // bulk helpers: set every row's price/qty in one go
  const applyBulk = () => {
    setRows(rows.map((r) => ({
      ...r,
      ...(bulkPrice !== '' ? { price: bulkPrice } : {}),
      ...(bulkQty !== '' ? { quantity: bulkQty } : {}),
    })))
    setMsg('✎ Sab rows par laga diya — ab Save variations dabayein')
  }

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      for (const r of rows) if (!r.price || Number(r.price) <= 0) throw new Error('Har combo ki price 0 se zyada ho')
      // Etsy rule: if price does NOT vary by a property, every combo must share
      // one price — copy row 1's price everywhere to be safe (same for qty).
      let out = rows
      if (!priceVaries) out = out.map((r) => ({ ...r, price: rows[0].price }))
      if (!qtyVaries) out = out.map((r) => ({ ...r, quantity: rows[0].quantity }))
      await etsy.saveInventory(storeId, listingId, {
        priceOnProperty: inv.priceOnProperty,
        quantityOnProperty: inv.quantityOnProperty,
        skuOnProperty: inv.skuOnProperty,
        products: out,
      })
      setMsg('✅ Variations Etsy par save ho gayin')
    } catch (e) {
      setMsg('⚠ ' + (e.message || e))
    } finally { setBusy(false) }
  }

  if (!inv) return <div className="card"><p className="muted">{msg || '⏳ Variations load ho rahi hain…'}</p></div>

  // simple listing (no variations): one price + one quantity
  if (rows.length === 1 && !rows[0].propertyValues.length) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{TITLE}</h3>
        {mode === 'full' && <p className="muted" style={{ fontSize: 12 }}>Is listing me variations nahi hain — ek hi price/quantity hai.</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {showPrice && (
            <span>
              <label className="muted" style={{ fontSize: 12, display: 'block' }}>Price ({currency})</label>
              <input type="number" min="0.2" step="0.01" value={rows[0].price || ''} onChange={(e) => upd(0, { price: e.target.value })} style={{ width: 120 }} />
            </span>
          )}
          {showQty && (
            <>
              <span>
                <label className="muted" style={{ fontSize: 12, display: 'block' }}>Quantity</label>
                <input type="number" min="0" value={rows[0].quantity} onChange={(e) => upd(0, { quantity: e.target.value })} style={{ width: 100 }} />
              </span>
              <span>
                <label className="muted" style={{ fontSize: 12, display: 'block' }}>SKU</label>
                <input value={rows[0].sku} onChange={(e) => upd(0, { sku: e.target.value })} style={{ width: 140 }} />
              </span>
            </>
          )}
          <button className="btn" disabled={busy} onClick={save}>{busy ? '⏳' : '💾 Save'}</button>
        </div>
        {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}
      </div>
    )
  }

  // variations table
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{TITLE} <span className="chip">{rows.length} combos</span></h3>
      {rows.length > 399 && (
        <p style={{ color: 'var(--err)', fontSize: 12, fontWeight: 600 }}>
          ⚠ Etsy sirf 399 variations tak accept karta hai — abhi {rows.length} hain, kuch combos off/kam karein.
        </p>
      )}
      <p className="muted" style={{ fontSize: 12 }}>
        {showPrice && (priceVaries ? 'Price har combo ki alag hai.' : 'Price sab combos ki EK hai (Etsy ka rule — pehli row ki price sab par lagegi).')}
        {showQty && <> Quantity {qtyVaries ? 'har combo ki alag.' : 'sab ki ek.'}</>}
      </p>

      {/* bulk row — set everything at once */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <span className="muted" style={{ fontSize: 12 }}>Sab par lagao:</span>
        {showPrice && <input type="number" placeholder="price" step="0.01" value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} style={{ width: 100 }} />}
        {showQty && <input type="number" placeholder="qty" value={bulkQty} onChange={(e) => setBulkQty(e.target.value)} style={{ width: 90 }} />}
        <button className="btn sm ghost" onClick={applyBulk}>Apply to all</button>
      </div>

      {/* one row per combo */}
      <div style={{ maxHeight: 420, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px', borderBottom: '1px solid var(--line)', opacity: r.enabled ? 1 : 0.5 }}>
            <b className="ellip" style={{ flex: 1, minWidth: 120, fontSize: 13 }}>{r.label}</b>
            {showPrice && <input type="number" step="0.01" title="price" value={r.price || ''} disabled={!priceVaries && i > 0}
              onChange={(e) => upd(i, { price: e.target.value })} style={{ width: 90 }} />}
            {showQty && <input type="number" title="quantity" value={r.quantity} disabled={!qtyVaries && i > 0}
              onChange={(e) => upd(i, { quantity: e.target.value })} style={{ width: 80 }} />}
            {showQty && <input title="SKU" placeholder="SKU" value={r.sku} onChange={(e) => upd(i, { sku: e.target.value })} style={{ width: 110 }} />}
            {/* on/off = is this combo buyable (visible) on Etsy */}
            {mode === 'full' && (
              <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }} className="muted">
                <input type="checkbox" checked={r.enabled} onChange={(e) => upd(i, { enabled: e.target.checked })} /> on
              </label>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn" disabled={busy} onClick={save}>{busy ? '⏳ Saving…' : '💾 Save'}</button>
      </div>
      {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  )
}

/**
 * PhotosEditor (E5) — manage the listing's photos on Etsy:
 * upload new (max 10 total), delete, and reorder with ← → arrows
 * (order is saved with one button so you can arrange first, save once).
 */
function PhotosEditor({ storeId, listingId, initial }) {
  const [imgs, setImgs] = useState(initial)   // [{id, url}]
  const [dirty, setDirty] = useState(false)   // order changed but not saved yet
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const move = (i, d) => {
    const j = i + d
    if (j < 0 || j >= imgs.length) return
    const a = [...imgs]; const t = a[i]; a[i] = a[j]; a[j] = t
    setImgs(a); setDirty(true)
  }

  const saveOrder = async () => {
    setBusy(true); setMsg(null)
    try {
      await etsy.orderImages(storeId, listingId, imgs.map((x) => x.id))
      setDirty(false); setMsg('✅ Order save ho gaya')
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  const del = async (im) => {
    if (!confirm('Ye photo Etsy listing se delete karni hai?')) return
    setBusy(true); setMsg(null)
    try {
      await etsy.delImage(storeId, listingId, im.id)
      setImgs(imgs.filter((x) => x.id !== im.id))
      setMsg('🗑 Photo delete ho gayi')
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  const upload = async (files) => {
    setBusy(true); setMsg(null)
    try {
      for (const f of Array.from(files).slice(0, 10 - imgs.length)) {
        const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f) })
        const res = await etsy.addImage(storeId, listingId, dataUrl, imgs.length + 1)
        setImgs((cur) => [...cur, { id: res.imageId, url: dataUrl }])
      }
      setMsg('✅ Upload ho gaya')
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>🖼 Photos <span className="chip">{imgs.length}/10</span></h3>
      <div className="grid">
        {imgs.map((im, i) => (
          <div key={im.id} className="card item-card">
            <div className="thumb"><img src={im.url} alt="" /></div>
            <div style={{ display: 'flex', gap: 4, marginTop: 6, justifyContent: 'center' }}>
              <button className="btn sm ghost" disabled={busy || i === 0} onClick={() => move(i, -1)}>←</button>
              <span className="chip">{i + 1}</span>
              <button className="btn sm ghost" disabled={busy || i === imgs.length - 1} onClick={() => move(i, 1)}>→</button>
              <button className="btn sm danger" disabled={busy} onClick={() => del(im)}>🗑</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {imgs.length < 10 && (
          <label className="btn ghost" style={{ cursor: 'pointer' }}>
            ＋ Upload photos
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
          </label>
        )}
        {dirty && <button className="btn" disabled={busy} onClick={saveOrder}>💾 Save order</button>}
        {busy && <span className="muted">⏳…</span>}
      </div>
      {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  )
}

/** VideoEditor (E5) — the listing's one video: view, replace (MP4), delete. */
function VideoEditor({ storeId, listingId, initial }) {
  const [video, setVideo] = useState(initial)  // {id, url, thumb} | null
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const upload = async (f) => {
    if (!f) return
    if (f.size > 15 * 1024 * 1024) return setMsg('⚠ Video 15MB se choti rakhein (app ki transport limit)')
    setBusy(true); setMsg(null)
    try {
      const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f) })
      const res = await etsy.addVideo(storeId, listingId, dataUrl, f.name)
      setVideo({ id: res.videoId, url: null, thumb: null })
      setMsg('✅ Video upload ho gayi (Etsy usay process karega — kuch minute)')
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  const del = async () => {
    if (!confirm('Video Etsy listing se delete karni hai?')) return
    setBusy(true); setMsg(null)
    try { await etsy.delVideo(storeId, listingId, video.id); setVideo(null); setMsg('🗑 Video delete ho gayi') }
    catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>🎬 Video {video ? <span className="chip ok">hai</span> : <span className="chip">nahi</span>}</h3>
      {video?.thumb && <img src={video.thumb} alt="video" style={{ maxWidth: 200, borderRadius: 8, marginBottom: 8 }} />}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="btn ghost" style={{ cursor: 'pointer' }}>
          {video ? '↻ Replace video' : '＋ Upload video'} (MP4)
          <input type="file" accept="video/mp4,video/quicktime" style={{ display: 'none' }} onChange={(e) => { upload(e.target.files[0]); e.target.value = '' }} />
        </label>
        {video && <button className="btn danger" disabled={busy} onClick={del}>🗑 Delete</button>}
        {busy && <span className="muted">⏳ upload ho rahi hai…</span>}
      </div>
      {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}
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
      ? 'Listing LIVE ho jayegi — Etsy apni $0.20 listing fee lega (nayi listing par). Publish karein?'
      : 'Listing chhup jayegi (inactive) — buyers ko nazar nahi aayegi. Jari rakhein?'
    if (!confirm(warn)) return
    setBusy(true); setMsg(null)
    try {
      await etsy.setState(storeId, listingId, target)
      setMsg(target === 'active' ? '🚀 Listing LIVE ho gayi!' : '⏸ Listing inactive ho gayi')
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
      {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  )
}
