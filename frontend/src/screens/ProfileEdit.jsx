/**
 * ProfileEdit.jsx — PROFILE ka apna edit page.
 * Profiles panel me profile ke naam par click karne se khulta hai.
 * Yahan profile ki HAR cheez badal sakte hain:
 *   description ka profile-hissa, materials, Details (type, who/what/when,
 *   partners, category, attributes, renewal, section), price+quantity,
 *   variations (options add/delete, Individual price/qty, visibility),
 *   aur Shipping ka sara data.
 * Sab dropdowns LIVE Etsy se aate hain (wahi jo listing edit page par hain).
 * SKU profile me kabhi nahi hota. Save = sirf profile update (Etsy par kuch nahi jata).
 */
import React, { useState, useEffect, useMemo } from 'react'
import { useApp } from '../store/AppState.jsx'
import { etsy } from '../api.js'
import { getProfiles, upsertProfile, delProfile } from '../store/profiles.js'

// photo ko chhota (max 800px JPEG) kar ke profile me rakhte hain
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
    im.onerror = () => reject(new Error('photo load nahi hui'))
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
    const x = getProfiles().find((y) => y.id === id)
    return x ? JSON.parse(JSON.stringify(x)) : null   // editable copy
  })
  const [msg, setMsg] = useState(null)
  const [matIn, setMatIn] = useState('')
  const [addIn, setAddIn] = useState({})
  // live Etsy data (wahi sab jo listing edit page par hai)
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
    etsy.enums().then(setEnums).catch(() => setEnums({ whoMade: ['i_did'], whenMade: ['made_to_order'] }))
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
  }, [taxoTree])   // sirf pehli bar

  const effTaxo = taxoPath.length ? taxoPath[taxoPath.length - 1] : (det.taxonomyId || null)
  useEffect(() => {
    if (!effTaxo) { setProps([]); return }
    setProps(null)
    etsy.properties(storeId, effTaxo).then((r) => setProps(r.properties)).catch(() => setProps([]))
  }, [storeId, effTaxo])
  // category badle to profile me bhi update
  useEffect(() => { if (effTaxo && String(effTaxo) !== String(det.taxonomyId || '')) uD({ taxonomyId: effTaxo }) }, [effTaxo])

  // ---- variations helpers (profile ke products par) ----
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
    if (P.options.length <= 1) return setMsg('⚠ Property ka aakhri option delete nahi ho sakta')
    const left = prods.filter((r) => !(r.propertyValues || []).some((pv) => pv.property_id === P.id && (pv.values || []).join(', ') === value))
    if (!left.length) return setMsg('⚠ Aakhri combo delete nahi ho sakta')
    setProds(left)
  }
  const addOption = (P) => {
    const name = (addIn[P.id] || '').trim()
    if (!name) return
    if (P.options.some((o) => o.value.toLowerCase() === name.toLowerCase())) return setMsg('⚠ Ye option pehle se hai')
    const otherIds = plist.filter((x) => x.id !== P.id).map((x) => x.id)
    const seen = new Set(); const add = []
    for (const r of prods) {
      const key = (r.propertyValues || []).filter((pv) => otherIds.includes(pv.property_id)).map((pv) => (pv.values || []).join(', ')).join(' / ')
      if (seen.has(key)) continue
      seen.add(key)
      const pvs = (r.propertyValues || []).map((pv) => (pv.property_id === P.id ? { property_id: P.id, property_name: P.name, value_ids: [], values: [name] } : pv))
      add.push({ ...r, propertyValues: pvs, enabled: true })
    }
    if (prods.length + add.length > 400) return setMsg('⚠ 400 combinations se zyada nahi')
    setProds([...prods, ...add]); setAddIn({ ...addIn, [P.id]: '' })
  }
  const comboLabel = (r) => (r.propertyValues || []).map((pv) => (pv.values || []).join(', ')).join(' / ') || '—'

  const save = () => {
    upsertProfile(p)
    setMsg(`✅ Profile "${p.name}" save ho gayi`)
  }

  const nice = (v) => String(v).replace(/_/g, ' ').replace(/(\d{4}) (\d{4})/, '$1 - $2').replace(/^\w/, (c) => c.toUpperCase())

  if (!p) return <div className="card"><p className="muted">Profile nahi mili. <a className="lnk" onClick={onBack}>← wapas</a></p></div>

  return (
    <>
      {/* ---- naam + description ka profile-hissa ---- */}
      <div className="card">
        <div className="topbar" style={{ margin: '0 0 10px' }}>
          <b>🧩 Profile edit</b>
          <button className="btn sm ghost" onClick={onBack}>← Back</button>
        </div>
        <label className="muted" style={{ fontSize: 12 }}>Profile ka naam</label>
        <input value={p.name} onChange={(e) => u({ name: e.target.value })} style={{ width: '100%', maxWidth: 380, marginBottom: 10 }} />
        <label className="muted" style={{ fontSize: 12 }}>Description ka PROFILE-hissa (design ki 300-char description ke neeche, ek khali line chor kar lagta hai)</label>
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
          <input placeholder="naya material" value={matIn} onChange={(e) => setMatIn(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && matIn.trim() && (p.materials || []).length < 13) { u({ materials: [...(p.materials || []), matIn.trim()] }); setMatIn('') } }} style={{ maxWidth: 260 }} />
          <button className="btn sm ghost" onClick={() => { if (matIn.trim() && (p.materials || []).length < 13) { u({ materials: [...(p.materials || []), matIn.trim()] }); setMatIn('') } }}>＋ Add</button>
        </div>
      </div>

      {/* ---- Details (sab live Etsy se) ---- */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Details</h3>
        <label className="muted" style={{ fontSize: 12 }}>Type</label>
        <div className="tcards">
          <button type="button" className={'tcard' + (det.ltype !== 'download' ? ' on' : '')} onClick={() => uD({ ltype: 'physical' })}>
            <b>{det.ltype !== 'download' ? '◉' : '○'} Physical</b><span>Ship hone wali cheez</span>
          </button>
          <button type="button" className={'tcard' + (det.ltype === 'download' ? ' on' : '')} onClick={() => uD({ ltype: 'download' })}>
            <b>{det.ltype === 'download' ? '◉' : '○'} Digital</b><span>Download file</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>Who made it?</label>
            <select value={det.whoMade || 'i_did'} onChange={(e) => uD({ whoMade: e.target.value })} style={{ minWidth: 150 }}>
              {(enums?.whoMade || ['i_did']).map((v) => <option key={v} value={v}>{nice(v)}</option>)}
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
        ) : <p className="muted" style={{ fontSize: 12, margin: '4px 0 14px' }}>{partners === null ? '⏳' : 'Shop me koi production partner nahi.'}</p>}

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

        {/* attributes — isi category ke live fields */}
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
            <b>{det.autoRenew ? '◉' : '○'} Automatic</b><span>$0.20 me khud renew (recommended)</span>
          </button>
          <button type="button" className={'tcard' + (!det.autoRenew ? ' on' : '')} onClick={() => uD({ autoRenew: false })}>
            <b>{!det.autoRenew ? '◉' : '○'} Manual</b><span>Khud renew karunga</span>
          </button>
        </div>

        <p className="muted" style={{ fontSize: 12 }}>Note: shop-SECTION profile ka hissa nahi hota — wo har listing par alag chuna jata hai.</p>
      </div>

      {/* ---- Size-chart photos — Launchpad ki har nayi listing me mockups ke BAAD lagti hain ---- */}
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
          {!(p.photos || []).length && <span className="muted" style={{ fontSize: 12 }}>Abhi koi photo nahi — listing se Save as Profile karte waqt chunein, ya yahan upload karein.</span>}
        </div>
        <label className="btn sm ghost" style={{ cursor: 'pointer', marginTop: 10, display: 'inline-block' }}>
          ＋ Photo add karein
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
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Ye photos har nayi listing me generated mockups ke BAAD khud lag jayengi.</p>
      </div>

      {/* ---- Price & Quantity (jab variations na hon) ---- */}
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
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Variations wali profile banane ke liye: variations wali listing par ⊞ Save as Profile karein.</p>
        </div>
      )}

      {/* ---- Variations (profile ki apni) ---- */}
      {prods.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Variations <span className="chip">{prods.length} combos</span></h3>
          {prods.length > 399 && <p className="err-msg">⚠ Should not exceed 400 options combinations</p>}

          <div className="vpanels" style={{ marginBottom: 14 }}>
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

          {/* Individual price / quantity per property */}
          {['price', 'quantity'].map((field) => {
            const flags = field === 'price' ? pOn : qOn
            const key = field === 'price' ? 'pOn' : 'qOn'
            return (
              <div key={field} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 8 }}>
                  {plist.map((P) => (
                    <label key={P.id} style={{ display: 'flex', gap: 7, alignItems: 'center', cursor: 'pointer', fontWeight: 600, fontSize: 13.5 }}>
                      <input type="checkbox" checked={flags.includes(P.id)}
                        onChange={() => setFlags(key, flags.includes(P.id) ? flags.filter((x) => x !== P.id) : [...flags, P.id])} />
                      Individual {field} — {P.name}
                    </label>
                  ))}
                </div>
                {flags.length > 0 && (
                  <div className="vrows">
                    {groupRows(flags).map(([label, idxs]) => (
                      <div key={label} className="vrow">
                        <span className="ellip" style={{ flex: 1 }}>{label}</span>
                        <input type="number" step={field === 'price' ? '0.01' : '1'} value={prods[idxs[0]][field] ?? ''}
                          onChange={(e) => setGroup(field, idxs, e.target.value)} style={{ width: 110 }} />
                      </div>
                    ))}
                  </div>
                )}
                {!flags.length && field === 'price' && (
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <label className="muted" style={{ fontSize: 12 }}>Sab ki EK price:</label>
                    <input type="number" step="0.01" value={prods[0]?.price || ''} onChange={(e) => setProds(prods.map((r) => ({ ...r, price: e.target.value })))} style={{ width: 110 }} />
                  </span>
                )}
                {!flags.length && field === 'quantity' && (
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <label className="muted" style={{ fontSize: 12 }}>Sab ki EK quantity:</label>
                    <input type="number" value={prods[0]?.quantity || ''} onChange={(e) => setProds(prods.map((r) => ({ ...r, quantity: e.target.value })))} style={{ width: 110 }} />
                  </span>
                )}
              </div>
            )
          })}

          {/* visibility */}
          <label className="muted" style={{ fontSize: 12 }}>Visibility (kaunse combos on hain)</label>
          <div className="vrows" style={{ marginTop: 4 }}>
            {prods.map((r, i) => (
              <div key={i} className="vrow" style={{ opacity: r.enabled !== false ? 1 : 0.55 }}>
                <span className="ellip" style={{ flex: 1 }}>{comboLabel(r)}</span>
                <button className={'vswitch' + (r.enabled !== false ? ' on' : '')} onClick={() => setProds(prods.map((x, xi) => (xi === i ? { ...x, enabled: !(x.enabled !== false) } : x)))} />
              </div>
            ))}
          </div>
          <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => { if (confirm('Variations profile se hata dein? (price/qty wapas single ho jayega)')) u({ variations: null }) }}>🗑 Variations hatao</button>
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
        <button className="btn danger" onClick={() => { if (confirm(`Profile "${p.name}" DELETE karni hai?`)) { delProfile(p.id); onBack() } }}>🗑 Delete</button>
        <span style={{ flex: 1, fontSize: 13 }}>
          {msg ? <span className={String(msg).startsWith('⚠') ? 'err-msg' : 'muted'}>{msg}</span>
            : <span className="muted">Save = sirf profile update — Etsy par kuch nahi jata.</span>}
        </span>
        <button className="btn" onClick={save}>💾 Save profile</button>
      </div>
    </>
  )
}
