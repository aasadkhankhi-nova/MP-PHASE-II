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
  // ---- Shipping tab (Vela jaisa): processing profile + weight/dimensions ----
  const [readiness, setReadiness] = useState(null)     // shop ke processing profiles (live)
  const [readyId, setReadyId] = useState(detail.readinessStateId || '')
  const [wt, setWt] = useState(detail.itemWeight || '')
  const [wtU, setWtU] = useState(detail.weightUnit || 'oz')
  const [dimL, setDimL] = useState(detail.itemLength || '')
  const [dimW, setDimW] = useState(detail.itemWidth || '')
  const [dimH, setDimH] = useState(detail.itemHeight || '')
  const [dimU, setDimU] = useState(detail.dimUnit || 'in')
  const [props, setProps] = useState(null)              // category ke attribute dropdowns
  const [propSel, setPropSel] = useState(() => {
    // current attribute values from the listing -> {propertyId: [valueId, ...]}
    // (array is liye ke kuch attributes MULTI hote hain — Sustainability waghera)
    const m = {}
    for (const p of detail.properties || []) if (p.valueIds?.length) m[p.propertyId] = p.valueIds.map(String)
    return m
  })
  // ---- Details tab (Etsy ke listing form jaisa) ----
  const [isSupply, setIsSupply] = useState(!!detail.isSupply)       // What is it?
  const [ltype, setLtype] = useState(detail.type || 'physical')     // Physical / Digital
  const [partners, setPartners] = useState(null)                    // production partners (live)
  const [partnerIds, setPartnerIds] = useState((detail.partnerIds || []).map(String))
  const [taxoTree, setTaxoTree] = useState(null)                    // pura category tree (live)
  const [taxoPath, setTaxoPath] = useState([])                      // Category cascade: root -> leaf ids
  // ---- personalization (naya Etsy multi-question system — apna editor) ----
  const [persErr, setPersErr] = useState(false)
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
    etsy.taxonomyTree().then((r) => setTaxoTree(r.tree)).catch(() => setTaxoTree([]))
    etsy.partners(storeId).then((r) => setPartners(r.partners)).catch(() => setPartners([]))
    etsy.readiness(storeId).then((r) => setReadiness(r.states)).catch(() => setReadiness([]))
  }, [storeId])

  // tree aane par: listing ki category ka pura rasta (root -> leaf) nikal lo
  useEffect(() => {
    if (!taxoTree || !detail.taxonomyId) return
    const path = []
    const find = (nodes, trail) => {
      for (const n of nodes || []) {
        const t = [...trail, n.id]
        if (String(n.id) === String(detail.taxonomyId)) { path.push(...t); return true }
        if (n.children?.length && find(n.children, t)) return true
      }
      return false
    }
    find(taxoTree, [])
    if (path.length) setTaxoPath(path)
  }, [taxoTree, detail.taxonomyId])

  // jo category CHUNI hui hai (cascade me) — usi ke attributes live load hote hain
  const effTaxo = taxoPath.length ? taxoPath[taxoPath.length - 1] : (detail.taxonomyId || null)
  useEffect(() => {
    if (!effTaxo) { setProps([]); return }
    setProps(null)
    etsy.properties(storeId, effTaxo).then((r) => setProps(r.properties)).catch(() => setProps([]))
  }, [storeId, effTaxo])

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
    // RED errors ke saath save NAHI hota — Etsy waise bhi reject kar dega
    const blocking = Object.values(errs).filter(Boolean)
    if (blocking.length) { setMsg('⚠ Pehle RED errors theek karein: ' + blocking.join(' · ')); return }
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
      //    (Sustainability waghera) poori list ke saath jate hain
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
  // ---- Etsy ki limits LIVE check hoti hain — jahan cross ho wahan RED ----
  const errs = {
    title: !title.trim() ? 'Title khali hai' : title.length > 140 ? `Title ${title.length - 140} characters ZYADA hai (max 140)` : null,
    tags: tags.length > 13 ? `Tags ${tags.length - 13} zyada hain (max 13)` : tags.some((t) => t.length > 20) ? 'Koi tag 20 characters se lamba hai' : null,
    materials: mats.length > 13 ? 'Materials 13 se zyada hain (max 13)' : mats.some((m) => m.length > 45) ? 'Koi material 45 characters se lamba hai' : null,
    variations: (varCount || 0) > 399 ? `Variations ${varCount} hain (max 399)` : null,
    shipping: detail.type !== 'download' && !retId ? 'Return policy zaruri hai — Etsy physical listings par isay REQUIRED rakhta hai' : null,
  }
  // tab par RED dot = us tab me Etsy-rule error hai
  const dots = {
    title: !!errs.title,
    tags: !!(errs.tags || errs.materials),
    variations: !!errs.variations,
    shipping: !!errs.shipping,
    personalization: persErr,
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
        <div className={'card' + (errs.title ? ' err-card' : '')}>
          <h3 style={{ marginTop: 0 }}>Title <span className="chip">{detail.state}</span> {errs.title && <span className="err-badge">ERROR</span>}</h3>
          <label className={errs.title ? 'err-msg' : 'muted'} style={{ fontSize: 12 }}>Title ({140 - title.length} baqi)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={errs.title ? 'in-err' : ''} style={{ width: '100%', marginBottom: 6 }} />
          {errs.title && <p className="err-msg" style={{ margin: '0 0 8px' }}>{errs.title}</p>}
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
          <input placeholder="naya tag (max 20 harf)" value={tagIn} onChange={(e) => setTagIn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} style={{ flex: 1 }} />
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
          <input placeholder="naya material" value={matIn} onChange={(e) => setMatIn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMat()} style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={addMat}>＋ Add</button>
        </div>

      </div>
      )}

      {/* ---- Price / Inventory / Variations — teeno ek hi LIVE inventory editor
           par chalte hain (mounted rehta hai), bas columns badalte hain ---- */}
      <div style={{ display: ['price', 'inventory', 'variations'].includes(tab) ? '' : 'none' }}>
        <InventoryEditor storeId={storeId} listingId={detail.id} currency={detail.currency}
          mode={tab === 'price' ? 'price' : tab === 'inventory' ? 'qty' : 'full'} onCount={setVarCount} images={detail.images || []} />
      </div>

      {/* ---- Personalization — Etsy ka NAYA system: 5 questions tak,
           Text box / Dropdown / PHOTO-UPLOAD / Labeled upload + Add-on price ---- */}
      {tab === 'personalization' && (
        <PersonalizationEditor storeId={storeId} listingId={detail.id} onErr={setPersErr} />
      )}

      {/* ---- Shipping — Vela/Etsy jaisa: Processing profile, Shipping profile,
           Item weight + dimensions, Return policy (Etsy par REQUIRED) ---- */}
      {tab === 'shipping' && (
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
            {readiness && !readiness.length && <span className="muted" style={{ fontSize: 12 }}>Processing profiles Etsy par bante hain (Shop Manager → Settings) — yahan sirf select hote hain.</span>}
          </span>

          <span style={{ display: 'block', marginBottom: 12 }}>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>Shipping profile</label>
            <select value={shipId || ''} onChange={(e) => setShipId(e.target.value)} style={{ minWidth: 230 }}>
              {!shipProfiles && <option value="">⏳</option>}
              {(shipProfiles || []).map((p) => <option key={p.id} value={p.id}>🚚 {p.title}</option>)}
            </select>
          </span>

          {/* Item weight + dimensions (Optional — package estimate ke liye) */}
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

          {/* Return policy — Etsy par physical listing ke liye REQUIRED */}
          <span style={{ display: 'block' }}>
            <label className={errs.shipping ? 'err-msg' : 'muted'} style={{ fontSize: 12, display: 'block' }}>Return policy <b>*</b></label>
            <select value={retId || ''} onChange={(e) => setRetId(e.target.value)} className={errs.shipping ? 'in-err' : ''} style={{ minWidth: 240 }}>
              <option value="">— choose (zaruri) —</option>
              {(retPolicies || []).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            {errs.shipping && <p className="err-msg" style={{ margin: '6px 0 0' }}>{errs.shipping}</p>}
          </span>

          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Ye sab neeche 💾 Save to Etsy se save hota hai.</p>
        </div>
      )}

      {/* ---- Details — Etsy ke apne listing form jaisa: Type, Who/What/When,
           Production partner, Category cascade, sab attributes, Renewal, Section.
           HAR dropdown ke options LIVE Etsy se aate hain. ---- */}
      {tab === 'details' && (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Details</h3>

        {/* Type — Physical / Digital (Etsy jaise radio cards) */}
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

        {/* Who / What / When — enums live Etsy se */}
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

        {/* Production partner (Optional) — shop ke ASLI partners, live Etsy se */}
        <label className="muted" style={{ fontSize: 12 }}>Production partner <span className="opt">Optional</span></label>
        {partners === null && <p className="muted" style={{ fontSize: 12 }}>⏳ partners load ho rahe hain…</p>}
        {partners && !partners.length && (
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 14px' }}>Aap ke Etsy shop me koi production partner nahi bana (Etsy → Settings → Production partners).</p>
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

        {/* Category — Etsy ka pura category tree, cascade dropdowns
            (Clothing > Women's Clothing > Tops & Tees > T-shirts) */}
        <label className="muted" style={{ fontSize: 12 }}>Category</label>
        {!taxoTree && <p className="muted" style={{ fontSize: 12 }}>⏳ category tree load ho raha hai…</p>}
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

        {/* Attributes — ISI category ke Etsy wale sab fields (Primary color,
            Secondary color, Holiday, Occasion, Size, Pattern, Sleeve length,
            Neckline, Sustainability...) — single = dropdown, multi = checkboxes.
            Category badloge to fields bhi Etsy se naye aa jate hain. */}
        {props === null && <p className="muted">⏳ Etsy se is category ke fields load ho rahe hain…</p>}
        {props && !props.length && <p className="muted">Is category ke liye koi attribute nahi.</p>}
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

        {/* Renewal options — Etsy jaise radio cards */}
        <label className="muted" style={{ fontSize: 12 }}>Renewal options</label>
        <div className="tcards">
          <button type="button" className={'tcard' + (autoRenew ? ' on' : '')} onClick={() => setAutoRenew(true)}>
            <b>{autoRenew ? '◉' : '○'} Automatic</b>
            <span>Expire hone par $0.20 USD me khud renew hogi (recommended).</span>
          </button>
          <button type="button" className={'tcard' + (!autoRenew ? ' on' : '')} onClick={() => setAutoRenew(false)}>
            <b>{!autoRenew ? '◉' : '○'} Manual</b>
            <span>Expired listings me khud renew karunga.</span>
          </button>
        </div>

        {/* Section — shop ke asli sections */}
        <span>
          <label className="muted" style={{ fontSize: 12, display: 'block' }}>Section <span className="opt">Optional</span></label>
          <select value={sectionId || ''} onChange={(e) => setSectionId(e.target.value)} style={{ minWidth: 200 }}>
            <option value="">— koi section nahi —</option>
            {(sections || []).map((sx) => <option key={sx.id} value={sx.id}>{sx.title}</option>)}
          </select>
          {!sections && <span className="muted" style={{ fontSize: 11 }}> ⏳</span>}
        </span>

        <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>Sab kuch neeche 💾 Save to Etsy se save hota hai.</p>
      </div>
      )}

      {/* ---- hamesha neeche: Save + Publish ---- */}
      <div className="card">
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={busy} onClick={save}>{busy ? '⏳ Saving…' : '💾 Save to Etsy'}</button>
          <button className="btn ghost" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
        {msg && <p className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'} style={{ marginTop: 8 }}>{msg}</p>}
      </div>
      <PublishCard storeId={storeId} listingId={detail.id} state={detail.state} onDone={onDone} />
    </>
  )
}

/**
 * PersonalizationEditor — Etsy ka NAYA personalization system, bilkul Etsy ke
 * apne edit page jaisa (screenshot wala layout): 5 questions tak, types:
 * Text box / Dropdown / Photo-file upload (naya!) / Labeled upload.
 * Optional text question par Add-on price ($0.20–$500).
 * Etsy ki HAR limit live check hoti hai — cross hote hi RED:
 * field title ≤45, instructions ≤120, character limit 1–1024,
 * files 1–10, dropdown options ≤30 (har label ≤20 chars).
 */
const QTYPES = [
  ['text_input', 'Text box'],
  ['dropdown', 'Dropdown'],
  ['unlabeled_upload', 'Photo / file upload'],
  ['labeled_upload', 'Labeled upload (har file ka apna naam)'],
]
function PersonalizationEditor({ storeId, listingId, onErr }) {
  const [qs, setQs] = useState(null)      // null = loading
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    etsy.personalization(storeId, listingId)
      .then((r) => setQs(r.questions.map((q) => ({ ...q, labels: q.type === 'labeled_upload' ? q.options : [], options: q.type === 'dropdown' ? q.options : [] }))))
      .catch((e) => { setQs([]); setMsg('⚠ ' + e.message) })
  }, [storeId, listingId])

  const upd = (i, patch) => setQs(qs.map((q, x) => (x === i ? { ...q, ...patch } : q)))
  const del = (i) => setQs(qs.filter((_, x) => x !== i))
  const add = (type) => {
    if (!type || qs.length >= 5) return
    setQs([...qs, { id: null, type, text: 'Personalization', instructions: '', required: false, maxChars: type === 'text_input' ? 256 : null, maxFiles: type.includes('upload') ? 1 : null, addOnPrice: null, options: [], labels: type === 'labeled_upload' ? [''] : [] }])
  }

  // Etsy ke rules — har question ke errors ki list
  const qErrs = (q) => {
    const e = []
    if (!String(q.text || '').trim()) e.push('Field title khali hai')
    if (String(q.text || '').length > 45) e.push('Field title 45 characters se zyada hai')
    if (q.type !== 'dropdown' && String(q.instructions || '').length > 120) e.push('Instructions should not exceed 120 characters')
    if (q.type === 'text_input') {
      const c = Number(q.maxChars)
      if (!c || c < 1 || c > 1024) e.push('Character limit 1 se 1024 tak ho')
      if (q.addOnPrice) {
        const pz = Number(q.addOnPrice)
        if (q.required) e.push('Add-on price sirf OPTIONAL (not required) text par lag sakti hai')
        else if (pz < 0.2 || pz > 500) e.push('Add-on price $0.20 se $500 tak ho')
      }
    }
    if (q.type.includes('upload')) {
      const fz = Number(q.maxFiles)
      if (!fz || fz < 1 || fz > 10) e.push('Files 1 se 10 tak ho sakti hain')
    }
    if (q.type === 'labeled_upload') {
      const labels = q.labels || []
      if (labels.length !== Number(q.maxFiles)) e.push('Har file ka ek label ho (labels = files ki tadaad)')
      if (labels.some((l) => !String(l).trim() || String(l).length > 45)) e.push('Har label 1–45 characters ka ho')
    }
    if (q.type === 'dropdown') {
      const ops = q.options || []
      if (!ops.length || ops.length > 30) e.push('Dropdown me 1 se 30 options hon')
      if (ops.some((o) => !String(o).trim() || String(o).length > 20)) e.push('Har option 1–20 characters ka ho')
    }
    return e
  }
  const allErrs = (qs || []).flatMap(qErrs)
  useEffect(() => { onErr && onErr(allErrs.length > 0) }, [allErrs.length])

  const save = async () => {
    if (allErrs.length) return setMsg('⚠ Pehle RED errors theek karein')
    setBusy(true); setMsg(null)
    try {
      if (!qs.length) await etsy.update(storeId, listingId, { personalizable: false })
      else await etsy.savePersonalization(storeId, listingId, qs)
      setMsg('✅ Personalization Etsy par save ho gayi')
    } catch (e) { setMsg('⚠ ' + (e.message || e)) } finally { setBusy(false) }
  }

  if (qs === null) return <div className="card"><p className="muted">⏳ personalization load ho rahi hai…</p></div>

  return (
    <div className={'card' + (allErrs.length ? ' err-card' : '')}>
      <h3 style={{ marginTop: 0 }}>Personalization {allErrs.length > 0 && <span className="err-badge">ERROR</span>}</h3>
      <div className="pq-grid">
        {qs.map((q, i) => {
          const e = qErrs(q)
          return (
            <div key={i} className={'pq-card' + (e.length ? ' err-card' : '')}>
              {/* top row: field type + Required + 🗑 (Etsy jaisa) */}
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
                      <span className="muted" style={{ fontSize: 11, display: 'block' }}>{q.required ? 'sirf optional field par' : '$0.20 to $500'}</span>
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

              {/* labeled upload: har file ka apna label */}
              {q.type === 'labeled_upload' && (
                <div style={{ marginTop: 8 }}>
                  <label className="muted" style={{ fontSize: 12 }}>File labels (har file ke liye ek, ≤45 chars)</label>
                  {(q.labels || []).map((l, k) => (
                    <input key={k} value={l} placeholder={`File ${k + 1} ka label`}
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
                  <input placeholder="Add option (Enter dabayein)" onKeyDown={(ev) => {
                    if (ev.key !== 'Enter') return
                    const v = ev.target.value.trim()
                    if (v) { upd(i, { options: [...(q.options || []), v] }); ev.target.value = '' }
                  }} style={{ width: 230 }} />
                </div>
              )}

              {/* Instructions — dropdown par Etsy allow NAHI karta */}
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

        {/* naya question slot (Etsy: max 5) — screenshot ke right panel jaisa */}
        {qs.length < 5 && (
          <div className="pq-card pq-empty">
            <select defaultValue="" onChange={(ev) => { add(ev.target.value); ev.target.value = '' }} style={{ minWidth: 200 }}>
              <option value="" disabled>Choose field type</option>
              {QTYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>{qs.length === 0 ? 'No personalization — field type chun kar add karein' : `${5 - qs.length} aur add ho sakte hain (photo-upload bhi!)`}</p>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn" disabled={busy} onClick={save}>{busy ? '⏳ Saving…' : '💾 Save personalization'}</button>
        {qs.length === 0 && <span className="muted" style={{ fontSize: 12 }}>Koi question nahi = Save par personalization OFF ho jayegi</span>}
      </div>
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
// mode: 'price' (sirf price), 'qty' (quantity+SKU), 'full' (sab kuch — Variations tab)
// onCount(n) — parent ko combos ki tadaad batata hai (399 se zyada = red dot warning)
function InventoryEditor({ storeId, listingId, currency, mode = 'full', onCount, images = [] }) {
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
  const [pOn, setPOn] = useState([])         // kin properties par price INDIVIDUAL hai
  const [qOn, setQOn] = useState([])         // ... quantity
  const [sOn, setSOn] = useState([])         // ... SKU
  const [vDirty, setVDirty] = useState(false)
  const [addIn, setAddIn] = useState({})     // "Add option" inputs (per property)
  const [varImgs, setVarImgs] = useState(null)  // Etsy par maujuda variation-photo links
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

  // properties + unke options (rows se nikalte hain)
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

  const upd = (i, patch) => setRows(rows.map((r, x) => (x === i ? { ...r, ...patch } : r)))
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
      if (!skuVaries) out = out.map((r) => ({ ...r, sku: rows[0].sku }))
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

  // ---- PRICE tab — Etsy/Vela jaisa: ek field; variation-wise ho to
  //      "Defined by Variation" (grey, disabled) ----
  if (mode === 'price') {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Price</h3>
        <label className="muted" style={{ fontSize: 12, display: 'block' }}>Price{priceVaries ? '' : ` (${currency})`}</label>
        {priceVaries ? (
          <>
            <input disabled placeholder="Defined by Variation" style={{ minWidth: 230, background: '#f4f6fa' }} />
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Har variation ki apni price hai — <b>Variations</b> tab me edit hoti hai.</p>
          </>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
            <input type="number" min="0.2" step="0.01" value={rows[0]?.price || ''} onChange={(e) => upd(0, { price: e.target.value })} style={{ width: 140 }} />
            <button className="btn" disabled={busy} onClick={save}>{busy ? '⏳' : '💾 Save'}</button>
          </div>
        )}
        {msg && <p className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'} style={{ marginTop: 8 }}>{msg}</p>}
      </div>
    )
  }

  // ---- INVENTORY tab — Etsy/Vela jaisa: Quantity + SKU (Optional);
  //      jo cheez variation-wise ho wo "Defined by Variation" ----
  if (mode === 'qty') {
    return (
      <div className="card">
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
          {(!qtyVaries || !skuVaries) && <button className="btn" disabled={busy} onClick={save}>{busy ? '⏳' : '💾 Save'}</button>}
        </div>
        {(qtyVaries || skuVaries) && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Variation-wise values <b>Variations</b> tab me edit hoti hain.</p>
        )}
        {msg && <p className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'} style={{ marginTop: 8 }}>{msg}</p>}
      </div>
    )
  }

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
        {msg && <p className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'} style={{ marginTop: 8 }}>{msg}</p>}
      </div>
    )
  }

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

  // option DELETE: us option ke sab combos hat jate hain (Save par Etsy par jata hai)
  const delOption = (P, value) => {
    if (P.options.length <= 1) return setMsg('⚠ Property ka aakhri option delete nahi ho sakta')
    const left = rows.filter((r) => !(r.propertyValues || []).some((pv) => pv.property_id === P.id && (pv.values || []).join(', ') === value))
    if (!left.length) return setMsg('⚠ Aakhri combo delete nahi ho sakta')
    setRows(left); setVDirty(true)
    setMsg('🗑 Option hata — 💾 Save variations dabane par Etsy par jayega')
  }

  // option ADD: baqi properties ke har combo ke saath naya product ban jata hai
  const addOption = (P) => {
    const name = (addIn[P.id] || '').trim()
    if (!name) return
    if (P.options.some((o) => o.value.toLowerCase() === name.toLowerCase())) return setMsg('⚠ Ye option pehle se hai')
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
    setMsg(`＋ "${name}" add hua (${add.length} naye combos) — 💾 Save variations dabayein`)
  }

  // EK Save: structure + price + quantity + SKU + visibility (replace-all on Etsy)
  const saveAll = async () => {
    setBusy(true); setMsg(null)
    try {
      // normalize: jo cheez Individual NAHI hai wo apne group ki EK value share kare
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
      for (const r of out) if (!r.price || Number(r.price) <= 0) throw new Error('Har combo ki price 0 se zyada ho')
      await etsy.saveInventory(storeId, listingId, { priceOnProperty: pOn, quantityOnProperty: qOn, skuOnProperty: sOn, products: out })
      setVDirty(false)
      setMsg('✅ Variations Etsy par save ho gayin')
    } catch (e) { setMsg('⚠ ' + (e.message || e)) } finally { setBusy(false) }
  }

  // variation-photo link set/clear (sirf screen par — Save photos se Etsy par jata hai)
  const setLink = (valueId, imageId) => {
    setLinks((cur) => {
      const rest = cur.filter((l) => !(l.propertyId === photoProp && String(l.valueId) === String(valueId)))
      return imageId ? [...rest, { propertyId: photoProp, valueId, imageId }] : rest
    })
  }
  const savePhotos = async () => {
    setBusy(true); setMsg(null)
    try { await etsy.saveVarImages(storeId, listingId, links); setVarImgs(links); setMsg('✅ Variation photos Etsy par save ho gayin') }
    catch (e) { setMsg('⚠ ' + (e.message || e)) } finally { setBusy(false) }
  }

  // ---------- VARIATIONS tab (Vela-style sub-tabs) ----------
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Variations <span className="chip">{rows.length} combos</span></h3>
      {rows.length > 399 && (
        <p style={{ color: 'var(--err)', fontSize: 12, fontWeight: 600 }}>⚠ Should not exceed 400 options combinations — abhi {rows.length} hain.</p>
      )}

      {/* sub-tabs (Vela jaisa) */}
      <div className="vtabs">
        {[['vars', 'Variations'], ['price', 'Price'], ['qty', 'Quantity'], ['sku', 'SKU'], ['vis', 'Visibility'], ['photos', 'Photos'], ['proc', 'Processing']].map(([id, label]) => (
          <button key={id} className={'vtab' + (vtab === id ? ' on' : '')} onClick={() => setVtab(id)}>{label}</button>
        ))}
      </div>

      {/* --- Variations: har property ka panel — options + Add/Delete --- */}
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
            OFF = general section (upar wale Price/Inventory tab) wali value
            sab par lagti hai; ON = yahan alag-alag set hoti hai --- */}
      {(vtab === 'price' || vtab === 'qty' || vtab === 'sku') && (() => {
        const conf = {
          price: { on: pOn, set: setPOn, field: 'price', label: 'price', general: 'Individual OFF hai — upar wale Price tab ki EK price sab combos par lagti hai.' },
          qty: { on: qOn, set: setQOn, field: 'quantity', label: 'quantity', general: 'Individual OFF hai — Inventory tab ki EK quantity sab par lagti hai.' },
          sku: { on: sOn, set: setSOn, field: 'sku', label: 'SKU', general: 'Individual OFF hai — Inventory tab (general) wala SKU sab par lagta hai, yahan kuch karna zaruri nahi.' },
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

      {/* --- Visibility: har combo ka on/off toggle (Vela jaisa) --- */}
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

      {/* --- Photos: option par listing ki photo LINK karo — buyer jab Etsy par
            wo option chunega (e.g. Sweatshirt) to WAHI photo saamne aa jayegi --- */}
      {vtab === 'photos' && (
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <select value={photoProp || ''} onChange={(e) => setPhotoProp(Number(e.target.value))}>
              {plist.map((P) => <option key={P.id} value={P.id}>{P.name}</option>)}
            </select>
            <span className="muted" style={{ fontSize: 12 }}>Har option par uski photo click kar ke lagayein (dobara click = hatao)</span>
          </div>
          {varImgs === null && <p className="muted">⏳ maujuda photo-links load ho rahe hain…</p>}
          {varImgs !== null && (plist.find((P) => P.id === photoProp)?.options || []).map((o) => {
            const cur = links.find((l) => l.propertyId === photoProp && String(l.valueId) === String(o.valueId))
            return (
              <div key={o.value} className="vrow" style={{ alignItems: 'center' }}>
                <span className="ellip" style={{ width: 150, fontWeight: 600 }}>{o.value}</span>
                {!o.valueId && <span className="muted" style={{ fontSize: 12 }}>naya option — pehle 💾 Save variations karein, phir photo lag sakegi</span>}
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

      {/* --- Processing: Etsy API me per-variation processing nahi hota --- */}
      {vtab === 'proc' && (
        <p className="muted" style={{ fontSize: 13 }}>
          Processing time Etsy me shipping/readiness profile ke saath aata hai — Etsy ki API per-variation
          processing set karne ki ijazat nahi deti. General profile <b>Shipping</b> tab me set hota hai;
          jab Etsy API me support aayega, "Individual PP" yahan khul jayega.
        </p>
      )}

      {/* footer: EK Save — structure + price + quantity + SKU + visibility */}
      {vtab !== 'photos' && vtab !== 'proc' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy} onClick={saveAll}>{busy ? '⏳ Saving…' : '💾 Save variations'}</button>
          {vDirty && <span className="muted" style={{ fontSize: 12 }}>⚠ Changes abhi sirf yahan hain — Save dabane par Etsy par jayenge.</span>}
        </div>
      )}
      {msg && <p className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'} style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  )
}

/**
 * PhotosEditor (Vela-style) — Etsy allows 20 photos per listing (Aug 2025 se).
 * - pehli photo BARA thumbnail (left), baqi chhoti tiles
 * - photo PAKAR kar (drag) kisi bhi jagah chhorein — INSERT hota hai:
 *   pic 5 ko pic 2 par rakha -> purani 2 -> 3, 3 -> 4, ... aur naya
 *   order Etsy par KHUD save ho jata hai
 * - mouse hover par corner tools: ✎ edit (page baad me), 🗑 delete,
 *   ⋯ menu (Replace / Download); bottom-right A≡ = alt text
 * - bottom-left ⚠ = alt text khali hai
 * - aakhir me EK hi Upload box — jab tak 20 puri na hon
 */
const MAX_PHOTOS = 20
function PhotosEditor({ storeId, listingId, initial }) {
  const [imgs, setImgs] = useState(initial)   // [{id, url, full, alt}]
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [drag, setDrag] = useState(null)      // kaunsi photo pakri hui hai (index)
  const [over, setOver] = useState(null)      // kis par chhorne wale hain (index)
  const [dirty, setDirty] = useState(false)   // order badla hai par abhi Etsy par save NAHI hua
  const [menu, setMenu] = useState(null)      // kis photo ka ⋯ menu khula hai (id)
  const [altFor, setAltFor] = useState(null)  // kis photo ka alt editor khula hai (id)
  const [altTxt, setAltTxt] = useState('')
  const [editIdx, setEditIdx] = useState(null)  // kaunsi photo editor me khuli hai (index)
  const [editSrc, setEditSrc] = useState(null)  // uski dataURL (editor ke liye)
  const repRef = React.useRef(null)           // Replace ke liye chhupa file input
  const repIdx = React.useRef(-1)

  const read = (f) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f) })

  // ---- drag & drop: nikaal kar nayi jagah INSERT — sirf SCREEN par.
  // Etsy par kuch NAHI jata jab tak user khud 💾 Save order na dabaye.
  const drop = (to) => {
    const from = drag
    setDrag(null); setOver(null)
    if (from === null || to === null || from === to) return
    const a = [...imgs]
    const [m] = a.splice(from, 1)
    a.splice(to, 0, m)
    setImgs(a); setDirty(true)
    setMsg('✎ Order badla hai — neeche 💾 Save order dabayenge tab Etsy par jayega')
  }

  const saveOrder = async () => {
    setBusy(true); setMsg('⏳ order Etsy par save ho raha hai…')
    try { await etsy.orderImages(storeId, listingId, imgs.map((x) => x.id)); setDirty(false); setMsg('✅ Order Etsy par save ho gaya') }
    catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  const del = async (im) => {
    setMenu(null)
    if (!confirm('Ye photo Etsy listing se delete karni hai?')) return
    setBusy(true); setMsg(null)
    try { await etsy.delImage(storeId, listingId, im.id); setImgs(imgs.filter((x) => x.id !== im.id)); setMsg('🗑 Photo delete ho gayi') }
    catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  const upload = async (files) => {
    setBusy(true); setMsg(null)
    try {
      let cur = imgs
      for (const f of Array.from(files).slice(0, MAX_PHOTOS - imgs.length)) {
        // Etsy ke rules: sirf JPG / PNG / GIF, max 20MB — warna RED error
        if (!['image/jpeg', 'image/png', 'image/gif'].includes(f.type)) { setMsg(`⚠ ${f.name}: Etsy sirf JPG / PNG / GIF photos leta hai — ye ${f.type || 'unknown'} hai`); continue }
        if (f.size > 20 * 1024 * 1024) { setMsg(`⚠ ${f.name}: ${(f.size / 1048576).toFixed(1)}MB — Etsy ki had 20MB per photo hai`); continue }
        const dataUrl = await read(f)
        const res = await etsy.addImage(storeId, listingId, dataUrl, cur.length + 1)
        cur = [...cur, { id: res.imageId, url: dataUrl, full: null, alt: '' }]
        setImgs(cur)
      }
      setMsg('✅ Upload ho gaya')
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  // Replace = purani delete + nayi USI position par + order dobara save
  const replace = async (f) => {
    const i = repIdx.current
    if (!f || i < 0) return
    if (!['image/jpeg', 'image/png', 'image/gif'].includes(f.type)) return setMsg(`⚠ Etsy sirf JPG / PNG / GIF leta hai — ye ${f.type || 'unknown'} hai`)
    if (f.size > 20 * 1024 * 1024) return setMsg(`⚠ ${(f.size / 1048576).toFixed(1)}MB — Etsy ki had 20MB per photo hai`)
    setBusy(true); setMsg('⏳ photo replace ho rahi hai…')
    try {
      const old = imgs[i]
      const dataUrl = await read(f)
      await etsy.delImage(storeId, listingId, old.id)
      const res = await etsy.addImage(storeId, listingId, dataUrl, i + 1)
      const a = imgs.map((x, xi) => (xi === i ? { id: res.imageId, url: dataUrl, full: null, alt: '' } : x))
      setImgs(a)
      await etsy.orderImages(storeId, listingId, a.map((x) => x.id))
      setMsg('✅ Photo replace ho gayi')
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false); repIdx.current = -1 }
  }

  // ✎ Edit: photo editor kholo (CDN image backend proxy se dataURL ban kar aati hai)
  const openEdit = async (i) => {
    setBusy(true); setMsg(null)
    try {
      const im = imgs[i]
      const src = im.url.startsWith('data:') ? im.url : await etsy.imageData(im.full || im.url)
      setEditIdx(i); setEditSrc(src)
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  // Editor ke Apply par: edited image purani ki JAGAH Etsy par chadh jati hai
  const applyEdit = async (dataUrl) => {
    const i = editIdx
    setEditIdx(null); setEditSrc(null)
    setBusy(true); setMsg('⏳ edited photo Etsy par chadh rahi hai…')
    try {
      const old = imgs[i]
      await etsy.delImage(storeId, listingId, old.id)
      const res = await etsy.addImage(storeId, listingId, dataUrl, i + 1)
      const a = imgs.map((x, xi) => (xi === i ? { id: res.imageId, url: dataUrl, full: null, alt: old.alt } : x))
      setImgs(a)
      await etsy.orderImages(storeId, listingId, a.map((x) => x.id))
      if (old.alt) await etsy.setAlt(storeId, listingId, res.imageId, old.alt, i + 1)  // alt wapas laga do
      setMsg('✅ Edited photo Etsy par save ho gayi')
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  const saveAlt = async () => {
    const i = imgs.findIndex((x) => x.id === altFor)
    if (i < 0) return
    setBusy(true)
    try {
      await etsy.setAlt(storeId, listingId, altFor, altTxt, i + 1)
      setImgs(imgs.map((x) => (x.id === altFor ? { ...x, alt: altTxt } : x)))
      setAltFor(null); setMsg('✅ Alt text Etsy par save ho gaya')
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>🖼 Photos <span className="chip">{imgs.length}/{MAX_PHOTOS}</span> {busy && <span className="muted" style={{ fontSize: 12 }}>⏳</span>}</h3>
      <p className="muted" style={{ fontSize: 12 }}>Photo pakar kar kisi bhi jagah chhorein — phir neeche 💾 Save order dabayein, tabhi Etsy par jayega. ⚠ = alt text nahi hai.</p>
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
            {/* bottom-left: ⚠ jab alt text nahi */}
            {!im.alt && <span className="ph-warn" title="Alt text nahi hai — A≡ se dalein">⚠</span>}
            {/* bottom-right: alt text editor kholo */}
            <button className="ph-alt" title="Alt text" onClick={(e) => { e.stopPropagation(); setAltFor(im.id); setAltTxt(im.alt || '') }}>A≡</button>
          </div>
        ))}
        {/* EK hi Upload tile — 20 hone par ghayab */}
        {imgs.length < MAX_PHOTOS && (
          <label className="ph-upload">
            <span style={{ fontSize: 26 }}>🖼</span> Upload
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { upload(e.target.files); e.target.value = '' }} />
          </label>
        )}
      </div>
      {/* Replace ke liye chhupa input */}
      <input ref={repRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { replace(e.target.files[0]); e.target.value = '' }} />

      {/* order badla ho to user KHUD save kare — tabhi Etsy par jata hai */}
      {dirty && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <button className="btn" disabled={busy} onClick={saveOrder}>{busy ? '⏳ Saving…' : '💾 Save order'}</button>
          <span className="muted" style={{ fontSize: 12 }}>⚠ Naya order abhi sirf yahan hai — Etsy par save nahi hua.</span>
        </div>
      )}

      {/* alt text editor */}
      {altFor && (
        <div style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
          <label className="muted" style={{ fontSize: 12 }}>Alt text ({altTxt.length}/500) — photo me kya nazar aa raha hai (SEO + accessibility)</label>
          <textarea value={altTxt} maxLength={500} onChange={(e) => setAltTxt(e.target.value)} rows={3}
            style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: 10, fontSize: 13, margin: '6px 0' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" disabled={busy} onClick={saveAlt}>💾 Save alt text</button>
            <button className="btn sm ghost" onClick={() => setAltFor(null)}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'} style={{ marginTop: 8 }}>{msg}</p>}

      {/* full-screen photo editor (Etsy jaisa) */}
      {editIdx !== null && editSrc && (
        <PhotoEdit src={editSrc} onApply={applyEdit} onCancel={() => { setEditIdx(null); setEditSrc(null) }} />
      )}
    </div>
  )
}

/**
 * VideoEditor (Vela-style) — video na ho to Upload tile (Vela jaisi),
 * ho to PLAYABLE video player (check karne ke liye) + Replace / Delete.
 * Abhi-abhi upload ki hui video foran local copy se chal jati hai;
 * Etsy apni taraf se process hone ke baad CDN wali dikhata hai.
 */
function VideoEditor({ storeId, listingId, initial }) {
  const [video, setVideo] = useState(initial)  // {id, url, thumb} | null
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const MAX_MB = 40  // Etsy ki apni had 100MB hai; free server ~40MB tak utha sakta hai

  const upload = async (f) => {
    if (!f) return
    // Etsy ke rules: sirf MP4 / MOV — webm ya koi aur format reject
    if (!['video/mp4', 'video/quicktime'].includes(f.type)) return setMsg(`⚠ Etsy sirf MP4 / MOV video leta hai — ye ${f.type || 'unknown'} hai (webm NAHI chalti)`)
    if (f.size > MAX_MB * 1024 * 1024) return setMsg(`⚠ Video ${MAX_MB}MB se choti rakhein (Etsy ki had 100MB hai, magar free server itna hi utha sakta hai)`)
    setBusy(true); setMsg(null)
    try {
      const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f) })
      const res = await etsy.addVideo(storeId, listingId, dataUrl, f.name)
      setVideo({ id: res.videoId, url: dataUrl, thumb: null })  // dataURL = neeche foran playable
      setMsg('✅ Video Etsy par upload ho gayi (Etsy process karega — tab tak neeche local copy chal rahi hai)')
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

      {/* video NAHI: Vela jaisi upload tile */}
      {!video && (
        <label className="vd-upload">
          <span style={{ fontSize: 30 }}>🎬</span>
          <b style={{ color: 'var(--accent)' }}>Upload</b>
          <span className="muted" style={{ fontSize: 12 }}>Max file size: {MAX_MB} MB · MP4</span>
          <input type="file" accept="video/mp4,video/quicktime" style={{ display: 'none' }} onChange={(e) => { upload(e.target.files[0]); e.target.value = '' }} />
        </label>
      )}

      {/* video HAI: player (check karne ke liye) + Replace / Delete */}
      {video && (
        <>
          {video.url
            ? <video className="vd-player" src={video.url} poster={video.thumb || undefined} controls preload="metadata" />
            : <p className="muted">⏳ Etsy video process kar raha hai — kuch minute baad listing dobara kholein to yahan play hogi.</p>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            <label className="btn ghost" style={{ cursor: 'pointer' }}>
              ↻ Replace video (MP4)
              <input type="file" accept="video/mp4,video/quicktime" style={{ display: 'none' }} onChange={(e) => { upload(e.target.files[0]); e.target.value = '' }} />
            </label>
            <button className="btn danger" disabled={busy} onClick={del}>🗑 Delete</button>
          </div>
        </>
      )}

      {busy && <p className="muted" style={{ marginTop: 8 }}>⏳ upload ho rahi hai… (bari video me waqt lagta hai)</p>}
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
      {msg && <p className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'} style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  )
}
