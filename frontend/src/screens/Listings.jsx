import React, { useState } from 'react'
import { useApp } from '../store/AppState.jsx'
import { Empty, confirmDel } from '../components/ui.jsx'
import { dnumLabel } from '../store/helpers.js'
import { desDnum, runGeneration } from '../store/compose.js'
import { uid } from '../store/helpers.js'

export default function Listings() {
  const app = useApp()
  const [openId, setOpenId] = useState(null)

  const create = async () => {
    const L = { id: uid(), name: 'Listing ' + (app.ws.listings.length + 1), designIds: [], mockupIds: [], category: '', keywords: '', outputs: [], report: null, created: Date.now() }
    await app.updListing(L.id, L, true)
    setOpenId(L.id)
  }

  if (openId) {
    const L = app.ws.listings.find((x) => x.id === openId)
    if (L) return <ListingWizard L={L} onBack={() => setOpenId(null)} />
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>🧾 Listings <span className="chip">{app.ws.listings.length}</span></h3>
        <p className="muted">Ek listing = designs + mockups ka combo → generated photos + (aage) SEO.</p>
        <button className="btn" onClick={create}>＋ New listing</button>
      </div>
      <div className="grid">
        {app.ws.listings.map((L) => (
          <div key={L.id} className="card">
            <b className="ellip">{L.name}</b>
            <div style={{ display: 'flex', gap: 5, margin: '8px 0', flexWrap: 'wrap' }}>
              <span className="chip">{L.designIds.length} designs</span>
              <span className="chip">{L.mockupIds.length} mockups</span>
              <span className={'chip' + (L.outputs?.length ? ' ok' : '')}>{L.outputs?.length || 0} outputs</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn sm" onClick={() => setOpenId(L.id)}>Open</button>
              <button className="btn sm danger" onClick={() => confirmDel(`listing "${L.name}"`) && app.delListing(L.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>
      {!app.ws.listings.length && <Empty>Abhi koi listing nahi.</Empty>}
    </>
  )
}

function ListingWizard({ L, onBack }) {
  const app = useApp()
  const [prog, setProg] = useState(null)
  const set = (patch) => app.updListing(L.id, patch)

  const togDesign = (id) =>
    set({ designIds: L.designIds.includes(id) ? L.designIds.filter((x) => x !== id) : [...L.designIds, id] })
  const togMockup = (id) =>
    set({ mockupIds: L.mockupIds.includes(id) ? L.mockupIds.filter((x) => x !== id) : [...L.mockupIds, id] })
  const togSet = (sid) => {
    const ids = app.ws.mockups.filter((m) => (m.setIds || []).includes(sid)).map((m) => m.id)
    const all = ids.every((id) => L.mockupIds.includes(id))
    set({ mockupIds: all ? L.mockupIds.filter((id) => !ids.includes(id)) : [...new Set([...L.mockupIds, ...ids])] })
  }

  const generate = async () => {
    const designs = app.ws.designs.filter((d) => L.designIds.includes(d.id))
    const mockups = app.ws.mockups.filter((m) => L.mockupIds.includes(m.id))
    if (!designs.length) return alert('Kam az kam 1 design select karein')
    if (!mockups.length) return alert('Kam az kam 1 mockup select karein')
    const noBox = mockups.filter((m) => !(m.boxes || []).length)
    if (noBox.length && !window.confirm(`${noBox.length} mockup(s) me boxes nahi hain — un par design center me lagega. Jari rakhein?`)) return
    const r = await runGeneration({ mockups, designs, onProgress: (i, n, name) => setProg({ i, n, name }) })
    setProg(null)
    await set({ outputs: r.outputs, report: { missed: r.missed, at: Date.now() } })
  }

  return (
    <>
      <div className="card">
        <div className="topbar" style={{ marginBottom: 6 }}>
          <input value={L.name} onChange={(e) => set({ name: e.target.value })} style={{ fontWeight: 700, fontSize: 16, minWidth: 240 }} />
          <button className="btn sm ghost" onClick={onBack}>← Back</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="Category (e.g. Canvas Wall Art)" value={L.category} onChange={(e) => set({ category: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
          <input placeholder="Keywords (optional)" value={L.keywords} onChange={(e) => set({ keywords: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>1 · Designs <span className="chip">{L.designIds.length} selected</span></h3>
        <div className="grid">
          {app.ws.designs.map((d) => (
            <div key={d.id} className={'card item-card pick' + (L.designIds.includes(d.id) ? ' sel' : '')} onClick={() => togDesign(d.id)}>
              <div className="thumb" style={{ background: d.variant === 'light-design' ? '#1e293b' : '#f1f3f9' }}>
                <img src={d.dataUrl} alt={d.name} style={{ objectFit: 'contain' }} />
              </div>
              <span className="chip">{dnumLabel(desDnum(d))}</span>
              <b className="ellip">{d.name}</b>
            </div>
          ))}
        </div>
        {!app.ws.designs.length && <Empty>Pehle Designs screen par designs upload karein.</Empty>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>2 · Mockups <span className="chip">{L.mockupIds.length} selected</span></h3>
        {app.ws.sets.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {app.ws.sets.map((s) => (
              <button key={s.id} className="chip clickable" onClick={() => togSet(s.id)}>🗂️ {s.name} (toggle all)</button>
            ))}
          </div>
        )}
        <div className="grid">
          {app.ws.mockups.map((m) => (
            <div key={m.id} className={'card item-card pick' + (L.mockupIds.includes(m.id) ? ' sel' : '')} onClick={() => togMockup(m.id)}>
              <div className="thumb"><img src={m.dataUrl} alt={m.name} /></div>
              <b className="ellip">{m.name}</b>
              <span className="chip">{(m.boxes || []).length} boxes</span>
            </div>
          ))}
        </div>
        {!app.ws.mockups.length && <Empty>Pehle Mockups screen par photos upload karein.</Empty>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>3 · Generate</h3>
        {prog ? (
          <p className="muted">⏳ {prog.i + 1} / {prog.n} — {prog.name}</p>
        ) : (
          <button className="btn" onClick={generate}>⚙️ Generate {L.mockupIds.length} photos</button>
        )}
        {L.report && L.report.missed.length > 0 && (
          <p className="muted" style={{ color: 'var(--warn)', marginTop: 10 }}>
            ⚠ {L.report.missed.length} box(es) ko design nahi mila: {L.report.missed.slice(0, 6).join(' · ')}{L.report.missed.length > 6 ? '…' : ''}
          </p>
        )}
      </div>

      {L.outputs?.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>📦 Outputs <span className="chip ok">{L.outputs.length}</span></h3>
          <div className="grid">
            {L.outputs.map((o) => (
              <div key={o.id} className="card item-card">
                <div className="thumb"><img src={o.dataUrl} alt={o.name} /></div>
                <b className="ellip">{o.name}</b>
                <a className="btn sm ghost" style={{ marginTop: 6, textAlign: 'center', textDecoration: 'none' }} href={o.dataUrl} download={o.name + '.jpg'}>⬇ PNG</a>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
