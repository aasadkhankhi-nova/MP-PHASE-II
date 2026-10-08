/**
 * ProfileEdit.jsx — the PROFILE's own edit page.
 * Opens when you click a profile name in the Profiles panel.
 * EVERYTHING in a profile can be changed here:
 *   the profile part of the description, materials, Details (type, who/what/when,
 *   partners, category, attributes, renewal, section), price+quantity,
 *   variations (options add/delete, Individual price/qty, visibility),
 *   and all Shipping data.
 * All dropdowns come LIVE from Etsy (the same ones as on the listing edit page).
 * SKU is never in a profile. Save = profile update only (nothing is sent to Etsy).
 */
import React, { useState, useEffect, useMemo } from 'react'
import { useApp } from '../store/AppState.jsx'
import { etsy } from '../api.js'
import { getProfiles, upsertProfile, delProfile } from '../store/profiles.js'

// shrink the photo (max 800px JPEG) and keep it in the profile
function shrinkImg(src) {
  return new Promise((resolve, reject) => {
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
}

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

export default function ProfileEdit({ id, onBack }) {
  const app = useApp()
  const storeId = app.curStoreId
  const [p, setP] = useState(() => {
    const x = getProfiles(storeId).find((y) => y.id === id)
    return x ? JSON.parse(JSON.stringify(x)) : null   // editable copy
  })
  const [msg, setMsg] = useState(null)
  const [matIn, setMatIn] = useState('')
  const [addIn, setAddIn] = useState({})
  const [vtab, setVtab] = useState('vars')   // vars|price|qty|sku|vis|photos|proc — exactly like listing edit
  // live Etsy data (the same as on the listing edit page)
  const [sections, setSections] = useState(null)
  const [enums, setEnums] = useState(null)
  const [partners, setPartners] = useState(null)
  const [taxoTree, setTaxoTree] = useState(null)
  const [readiness, setReadiness] = useState(null)
  const [ships, setShips] = useState(null)
  const [rets, setRets] = useState(null)
  const [props, setProps] = useState(null)
  const [taxoPath, setTaxoPath] = useState([])

  const u = (patch) => setP((c) => ({ ...c, ...patch }))
  const uD = (patch) => setP((c) => ({ ...c, details: { ...(c.details || {}), ...patch } }))
  const uS = (patch) => setP((c) => ({ ...c, shipping: { ...(c.shipping || {}), ...patch } }))
  const det = p?.details || {}
  const sh = p?.shipping || {}

  useEffect(() => {
    if (!storeId) return
    etsy.sections(storeId).then((r) => setSections(r.sections)).catch(() => setSections([]))
    etsy.enums().then(setEnums).catch(() => setEnums({ whoMade: ['someone_else', 'i_did', 'collective'], whenMade: ['made_to_order'] }))
    etsy.partners(storeId).then((r) => setPartners(r.partners)).catch(() => setPartners([]))
    etsy.taxonomyTree().then((r) => setTaxoTree(r.tree)).catch(() => setTaxoTree([]))
    etsy.readiness(storeId).then((r) => setReadiness(r.states)).catch(() => setReadiness([]))
    etsy.shippingProfiles(storeId).then((r) => setShips(r.profiles)).catch(() => setShips([]))
    etsy.returnPolicies(storeId).then((r) => setRets(r.policies)).catch(() => setRets([]))
  }, [storeId])

  useEffect(() => {
    if (!taxoTree || !det.taxonomyId) return
    const path = findTaxoPath(taxoTree, det.taxonomyId)
    if (path.length) setTaxoPath(path)
  }, [taxoTree])   // first time only

  const effTaxo = taxoPath.length ? taxoPath[taxoPath.length - 1] : (det.taxonomyId || null)
  useEffect(() => {
    if (!effTaxo) { setProps([]); return }
    setProps(null)
    etsy.properties(storeId, effTaxo).then((r) => setProps(r.properties)).catch(() => setProps([]))
  }, [storeId, effTaxo])
  // when the category changes, update the profile too
  useEffect(() => { if (effTaxo && String(effTaxo) !== String(det.taxonomyId || '')) uD({ taxonomyId: effTaxo }) }, [effTaxo])

  // ---- variations helpers (on the profile's products) ----
  const prods = p?.variations?.products || []
  const plist = useMemo(() => {
    const list = []
    for (const r of prods) for (const pv of r.propertyValues || []) {
      let P = list.find((x) => x.id === pv.property_id)
      if (!P) { P = { id: pv.property_id, name: pv.property_name, options: [] }; list.push(P) }
      const val = (pv.values || []).join(', ')
      if (!P.options.some((o) => o.value === val)) P.options.push({ value: val })
    }
    return list
  }, [prods])
  const setProds = (products) => u({ variations: { ...(p.variations || { pOn: [], qOn: [], sOn: [] }), products } })
  const pOn = p?.variations?.pOn || []
  const qOn = p?.variations?.qOn || []
  const setFlags = (key, val) => u({ variations: { ...(p.variations || {}), [key]: val } })

  const groupRows = (varyIds) => {
    const m = new Map()
    prods.forEach((r, i) => {
      const key = (r.propertyValues || []).filter((pv) => varyIds.includes(pv.property_id)).map((pv) => (pv.values || []).join(', ')).join(' / ') || '—'
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(i)
    })
    return [...m.entries()]
  }
  const setGroup = (field, idxs, v) => setProds(prods.map((r, i) => (idxs.includes(i) ? { ...r, [field]: v } : r)))

  const delOption = (P, value) => {
    if (P.options.length <= 1) return setMsg('⚠ The last option of a property cannot be deleted')
    const left = prods.filter((r) => !(r.propertyValues || []).some((pv) => pv.property_id === P.id && (pv.values || []).join(', ') === value))
    if (!left.length) return setMsg('⚠ The last combination cannot be deleted')
    setProds(left)
  }
  const addOption = (P) => {
    const name = (addIn[P.id] || '').trim()
    if (!name) return
    if (P.options.some((o) => o.value.toLowerCase() === name.toLowerCase())) return setMsg('⚠ This option already exists')
    const otherIds = plist.filter((x) => x.id !== P.id).map((x) => x.id)
    const seen = new Set(); const add = []
    for (const r of prods) {
      const key = (r.propertyValues || []).filter((pv) => otherIds.includes(pv.property_id)).map((pv) => (pv.values || []).join(', ')).join(' / ')
      if (seen.has(key)) continue
      seen.add(key)
      const pvs = (r.propertyValues || []).map((pv) => (pv.property_id === P.id ? { property_id: P.id, property_name: P.name, value_ids: [], values: [name] } : pv))
      add.push({ ...r, propertyValues: pvs, enabled: true })
    }
    if (prods.length + add.length > 400) return setMsg('⚠ No more than 400 combinations')
    setProds([...prods, ...add]); setAddIn({ ...addIn, [P.id]: '' })
  }
  const comboLabel = (r) => (r.propertyValues || []).map((pv) => (pv.values || []).join(', ')).join(' / ') || '—'

  const save = () => {
    upsertProfile(storeId, p)
    setMsg(`✅ Profile "${p.name}" saved`)
  }

  const nice = (v) => String(v).replace(/_/g, ' ').replace(/(\d{4}) (\d{4})/, '$1 - $2').replace(/^\w/, (c) => c.toUpperCase())

  if (!p) return <div className="card"><p className="muted">Profile not found. <a className="lnk" onClick={onBack}>← Back</a></p></div>

  return (
    <>
      {/* ---- name + profile part of the description ---- */}
      <div className="card">
        <div className="topbar" style={{ margin: '0 0 10px' }}>
          <b>🧩 Profile edit</b>
          <button className="btn sm ghost" onClick={onBack}>← Back</button>
        </div>
        <label className="muted" style={{ fontSize: 12 }}>Profile name</label>
        <input value={p.name} onChange={(e) => u({ name: e.target.value })} style={{ width: '100%', maxWidth: 380, marginBottom: 10 }} />
        <label className="muted" style={{ fontSize: 12 }}>PROFILE part of the description (added below the design's 300-char description, after one blank line)</label>
        <textarea value={p.desc2 || ''} onChange={(e) => u({ desc2: e.target.value })} rows={7}
          style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: 10, fontSize: 13 }} />
      </div>

      {/* ---- materials ---- */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Materials <span className="chip">{(p.materials || []).length}/13</span></h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          {(p.materials || []).map((m) => (
            <span key={m} className="chip">{m} <a className="lnk" style={{ cursor: 'pointer' }} onClick={() => u({ materials: p.materials.filter((x) => x !== m) })}>✕</a></span>
          ))}
          {!(p.materials || []).length && <span className="muted" style={{ fontSize: 12 }}>—</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input placeholder="new material" value={matIn} onChange={(e) => setMatIn(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && matIn.trim() && (p.materials || []).length < 13) { u({ materials: [...(p.materials || []), matIn.trim()] }); setMatIn('') } }} style={{ maxWidth: 260 }} />
          <button className="btn sm ghost" onClick={() => { if (matIn.trim() && (p.materials || []).length < 13) { u({ materials: [...(p.materials || []), matIn.trim()] }); setMatIn('') } }}>＋ Add</button>
        </div>
      </div>

      {/* ---- Details (all live from Etsy) ---- */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Details</h3>
        <label className="muted" style={{ fontSize: 12 }}>Type</label>
        <div className="tcards">
          <button type="button" className={'tcard' + (det.ltype !== 'download' ? ' on' : '')} onClick={() => uD({ ltype: 'physical' })}>
            <b>{det.ltype !== 'download' ? '◉' : '○'} Physical</b><span>A physical item to ship</span>
          </button>
          <button type="button" className={'tcard' + (det.ltype === 'download' ? ' on' : '')} onClick={() => uD({ ltype: 'download' })}>
            <b>{det.ltype === 'download' ? '◉' : '○'} Digital</b><span>Download file</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>Who made it?</label>
            <select value={det.whoMade || 'someone_else'} onChange={(e) => uD({ whoMade: e.target.value })} style={{ minWidth: 150 }}>
              {(enums?.whoMade || ['someone_else', 'i_did', 'collective']).map((v) => <option key={v} value={v}>{nice(v)}</option>)}
            </select>
          </span>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>What is it?</label>
            <select value={det.isSupply ? 'supply' : 'finished'} onChange={(e) => uD({ isSupply: e.target.value === 'supply' })} style={{ minWidth: 170 }}>
              <option value="finished">A finished product</option>
              <option value="supply">A supply or tool</option>
            </select>
          </span>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>When did you make it?</label>
            <select value={det.whenMade || 'made_to_order'} onChange={(e) => uD({ whenMade: e.target.value })} style={{ minWidth: 150 }}>
              {(enums?.whenMade || ['made_to_order']).map((v) => <option key={v} value={v}>{nice(v)}</option>)}
            </select>
          </span>
        </div>

        <label className="muted" style={{ fontSize: 12 }}>Production partner <span className="opt">Optional</span></label>
        {partners && partners.length > 0 ? (
          <div className="attr-multi" style={{ maxWidth: 340, marginBottom: 14 }}>
            {partners.map((pp) => {
              const cur = (det.partnerIds || []).map(String)
              const on = cur.includes(String(pp.id))
              return (
                <label key={pp.id}>
                  <input type="checkbox" checked={on}
                    onChange={() => uD({ partnerIds: on ? cur.filter((x) => x !== String(pp.id)) : [...cur, String(pp.id)] })} />
                  {pp.name}
                </label>
              )
            })}
          </div>
        ) : <p className="muted" style={{ fontSize: 12, margin: '4px 0 14px' }}>{partners === null ? '⏳' : 'No production partners in this shop.'}</p>}

        <label className="muted" style={{ fontSize: 12 }}>Category</label>
        {!taxoTree && <p className="muted" style={{ fontSize: 12 }}>⏳ category tree…</p>}
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
                    onChange={(e) => { const v = e.target.value; setTaxoPath(v ? [...taxoPath.slice(0, d), Number(v)] : taxoPath.slice(0, d)) }}>
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

        {/* attributes — live fields for this category */}
        {props === null && <p className="muted">⏳ attributes…</p>}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          {(props || []).map((pr) => {
            const cur = (det.attrs || {})[pr.propertyId]?.ids || []
            const setAttr = (ids) => {
              const names = ids.map((vid) => pr.options.find((o) => String(o.id) === String(vid))?.name).filter(Boolean)
              uD({ attrs: { ...(det.attrs || {}), [pr.propertyId]: { ids, names } } })
            }
            return (
              <span key={pr.propertyId} style={{ minWidth: 200 }}>
                <label className="muted" style={{ fontSize: 12, display: 'block' }}>{pr.name} {pr.required ? <b>*</b> : <span className="opt">Optional</span>}</label>
                {!pr.multi && (
                  <select value={cur[0] || ''} onChange={(e) => setAttr(e.target.value ? [e.target.value] : [])} style={{ minWidth: 185 }}>
                    <option value="">Choose {pr.name}</option>
                    {pr.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                )}
                {pr.multi && (
                  <div className="attr-multi">
                    {pr.options.map((o) => {
                      const on = cur.includes(String(o.id))
                      return (
                        <label key={o.id}>
                          <input type="checkbox" checked={on} onChange={() => setAttr(on ? cur.filter((x) => x !== String(o.id)) : [...cur, String(o.id)])} />
                          {o.name}
                        </label>
                      )
                    })}
                  </div>
                )}
              </span>
            )
          })}
        </div>

        <label className="muted" style={{ fontSize: 12 }}>Renewal options</label>
        <div className="tcards">
          <button type="button" className={'tcard' + (det.autoRenew ? ' on' : '')} onClick={() => uD({ autoRenew: true })}>
            <b>{det.autoRenew ? '◉' : '○'} Automatic</b><span>Renews automatically for $0.20 (recommended)</span>
          </button>
          <button type="button" className={'tcard' + (!det.autoRenew ? ' on' : '')} onClick={() => uD({ autoRenew: false })}>
            <b>{!det.autoRenew ? '◉' : '○'} Manual</b><span>Khud renew karunga</span>
          </button>
        </div>

        <p className="muted" style={{ fontSize: 12 }}>Note: the shop SECTION is not part of a profile — it is chosen separately on each listing.</p>
      </div>

      {/* ---- Size-chart photos — added AFTER the mockups on every new Launchpad listing ---- */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>📐 Size charts / photos <span className="chip">{(p.photos || []).length}</span></h3>
        <div className="vphotos">
          {(p.photos || []).map((ph, i) => (
            <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
              <img src={ph.dataUrl} alt="" className="vphoto" style={{ width: 92, height: 92, cursor: 'default' }} />
              <button className="ph-tool" title="Remove" style={{ position: 'absolute', top: 2, right: 2, background: '#fff', borderRadius: 6 }}
                onClick={() => u({ photos: p.photos.filter((_, x) => x !== i) })}>🗑</button>
            </span>
          ))}
          {!(p.photos || []).length && <span className="muted" style={{ fontSize: 12 }}>No photos yet — choose them when using Save as Profile on a listing, or upload them here.</span>}
        </div>
        <label className="btn sm ghost" style={{ cursor: 'pointer', marginTop: 10, display: 'inline-block' }}>
          ＋ Add photo
          <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={async (e) => {
            const list = [...(p.photos || [])]
            for (const f of Array.from(e.target.files)) {
              try {
                const src = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f) })
                list.push({ dataUrl: await shrinkImg(src), name: f.name })
              } catch {}
            }
            u({ photos: list }); e.target.value = ''
          }} />
        </label>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>These photos are added automatically AFTER the generated mockups on every new listing.</p>
      </div>

      {/* ---- Price & Quantity (when there are no variations) ---- */}
      {!prods.length && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Price & Quantity</h3>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>
              <label className="muted" style={{ fontSize: 12, display: 'block' }}>Price (USD)</label>
              <input type="number" min="0.2" step="0.01" value={p.priceQty?.price || ''} onChange={(e) => u({ priceQty: { ...(p.priceQty || {}), price: e.target.value } })} style={{ width: 120 }} />
            </span>
            <span>
              <label className="muted" style={{ fontSize: 12, display: 'block' }}>Quantity</label>
              <input type="number" min="1" value={p.priceQty?.quantity || ''} onChange={(e) => u({ priceQty: { ...(p.priceQty || {}), quantity: e.target.value } })} style={{ width: 110 }} />
            </span>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>To create a profile with variations: use ⊞ Save as Profile on a listing that has variations.</p>
        </div>
      )}

      {/* ---- Variations — EXACTLY like the listing edit page (same sub-tabs, same layout) ---- */}
      {prods.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Variations <span className="chip">{prods.length} combos</span></h3>
          {prods.length > 399 && (
            <p style={{ color: 'var(--err)', fontSize: 12, fontWeight: 600 }}>⚠ Should not exceed 400 options combinations — currently {prods.length}.</p>
          )}

          {/* sub-tabs (Vela-style — the same as in listing edit) */}
          <div className="vtabs">
            {[['vars', 'Variations'], ['price', 'Price'], ['qty', 'Quantity'], ['sku', 'SKU'], ['vis', 'Visibility'], ['photos', 'Photos'], ['proc', 'Processing']].map(([tid, label]) => (
              <button key={tid} className={'vtab' + (vtab === tid ? ' on' : '')} onClick={() => setVtab(tid)}>{label}</button>
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

          {/* --- Price / Quantity: "Individual ..." checkbox per property (like listing edit) --- */}
          {(vtab === 'price' || vtab === 'qty') && (() => {
            const conf = vtab === 'price'
              ? { on: pOn, key: 'pOn', field: 'price', label: 'price' }
              : { on: qOn, key: 'qOn', field: 'quantity', label: 'quantity' }
            return (
              <div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
                  {plist.map((P) => (
                    <label key={P.id} style={{ display: 'flex', gap: 7, alignItems: 'center', cursor: 'pointer', fontWeight: 600, fontSize: 13.5 }}>
                      <input type="checkbox" checked={conf.on.includes(P.id)}
                        onChange={() => setFlags(conf.key, conf.on.includes(P.id) ? conf.on.filter((x) => x !== P.id) : [...conf.on, P.id])} />
                      Individual {conf.label} — {P.name}
                    </label>
                  ))}
                </div>
                {!conf.on.length && (
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <label className="muted" style={{ fontSize: 12 }}>Individual is OFF — ONE {conf.label} for all combinations:</label>
                    <input type="number" step={vtab === 'price' ? '0.01' : '1'} value={prods[0]?.[conf.field] || ''}
                      onChange={(e) => setProds(prods.map((r) => ({ ...r, [conf.field]: e.target.value })))} style={{ width: 110 }} />
                  </span>
                )}
                {conf.on.length > 0 && (
                  <div className="vrows">
                    {groupRows(conf.on).map(([label, idxs]) => (
                      <div key={label} className="vrow">
                        <span className="ellip" style={{ flex: 1 }}>{label}</span>
                        <input type="number" step={vtab === 'price' ? '0.01' : '1'} value={prods[idxs[0]][conf.field] ?? ''}
                          onChange={(e) => setGroup(conf.field, idxs, e.target.value)} style={{ width: 110 }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {/* --- SKU: never stored in a profile (your rule) --- */}
          {vtab === 'sku' && (
            <p className="muted" style={{ fontSize: 13 }}>
              SKU is <b>not</b> part of a profile — you enter the SKU yourself on every new listing, at the end, on the final-check page.
            </p>
          )}

          {/* --- Visibility: on/off toggle for each combination --- */}
          {vtab === 'vis' && (
            <div className="vrows">
              {prods.map((r, i) => (
                <div key={i} className="vrow" style={{ opacity: r.enabled !== false ? 1 : 0.55 }}>
                  <span className="ellip" style={{ flex: 1 }}>{comboLabel(r)}</span>
                  <button className={'vswitch' + (r.enabled !== false ? ' on' : '')} title={r.enabled !== false ? 'On' : 'Off'}
                    onClick={() => setProds(prods.map((x, xi) => (xi === i ? { ...x, enabled: !(x.enabled !== false) } : x)))} />
                </div>
              ))}
            </div>
          )}

          {/* --- Photos: variation photos belong to the listing, not the profile --- */}
          {vtab === 'photos' && (
            <p className="muted" style={{ fontSize: 13 }}>
              Variation photos are linked to each listing's OWN photos, so they are not stored in the profile —
              set them in the tab with the same name on the listing's edit page.
            </p>
          )}

          {/* --- Processing: the Etsy API has no per-variation processing --- */}
          {vtab === 'proc' && (
            <p className="muted" style={{ fontSize: 13 }}>
              On Etsy, processing time comes with the shipping/readiness profile — Etsy's API does not allow
              setting processing per variation. The general profile is set in the <b>Shipping</b> card below.
            </p>
          )}

          <button className="btn sm ghost" style={{ marginTop: 12 }} onClick={() => { if (confirm('Remove variations from the profile? (price/qty go back to a single value)')) u({ variations: null }) }}>🗑 Remove variations</button>
        </div>
      )}

      {/* ---- Shipping ---- */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Shipping</h3>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>Processing profile</label>
            <select value={sh.readinessStateId || ''} onChange={(e) => uS({ readinessStateId: e.target.value })} style={{ minWidth: 200 }}>
              <option value="">— choose —</option>
              {(readiness || []).map((rz) => <option key={rz.id} value={rz.id}>{rz.label}</option>)}
            </select>
          </span>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>Shipping profile</label>
            <select value={sh.shippingProfileId || ''} onChange={(e) => uS({ shippingProfileId: e.target.value })} style={{ minWidth: 200 }}>
              <option value="">— choose —</option>
              {(ships || []).map((x) => <option key={x.id} value={x.id}>🚚 {x.title}</option>)}
            </select>
          </span>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>Return policy <b>*</b></label>
            <select value={sh.returnPolicyId || ''} onChange={(e) => uS({ returnPolicyId: e.target.value })} style={{ minWidth: 220 }}>
              <option value="">— choose —</option>
              {(rets || []).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>Item weight <span className="opt">Optional</span></label>
            <span style={{ display: 'flex', gap: 6 }}>
              <input type="number" min="0" step="0.01" value={sh.wt || ''} onChange={(e) => uS({ wt: e.target.value })} style={{ width: 90 }} />
              <select value={sh.wtU || 'oz'} onChange={(e) => uS({ wtU: e.target.value })}>
                <option value="oz">oz</option><option value="lb">lb</option><option value="g">g</option><option value="kg">kg</option>
              </select>
            </span>
          </span>
          <span><label className="muted" style={{ fontSize: 12, display: 'block' }}>Length</label><input type="number" value={sh.dimL || ''} onChange={(e) => uS({ dimL: e.target.value })} style={{ width: 80 }} /></span>
          <span><label className="muted" style={{ fontSize: 12, display: 'block' }}>Width</label><input type="number" value={sh.dimW || ''} onChange={(e) => uS({ dimW: e.target.value })} style={{ width: 80 }} /></span>
          <span><label className="muted" style={{ fontSize: 12, display: 'block' }}>Height</label><input type="number" value={sh.dimH || ''} onChange={(e) => uS({ dimH: e.target.value })} style={{ width: 80 }} /></span>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>Unit</label>
            <select value={sh.dimU || 'in'} onChange={(e) => uS({ dimU: e.target.value })}>
              <option value="in">in</option><option value="ft">ft</option><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option>
            </select>
          </span>
        </div>
      </div>

      {/* ---- bottom bar ---- */}
      <div className="ebar">
        <button className="btn ghost" onClick={onBack}>Cancel</button>
        <button className="btn danger" onClick={() => { if (confirm(`DELETE profile "${p.name}"?`)) { delProfile(storeId, p.id); onBack() } }}>🗑 Delete</button>
        <span style={{ flex: 1, fontSize: 13 }}>
          {msg ? <span className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'}>{msg}</span>
            : <span className="muted">Save = profile update only — nothing is sent to Etsy.</span>}
        </span>
        <button className="btn" onClick={save}>💾 Save profile</button>
      </div>
    </>
  )
}
