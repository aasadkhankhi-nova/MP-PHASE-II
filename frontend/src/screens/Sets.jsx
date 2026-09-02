/**
 * Sets.jsx — Manage sets (named groups of mockups, e.g. "Framed 24x36").
 * Har set card par:
 *   - uske mockups ke thumbnails (✕ = set se nikalo, mockup delete NAHI hota)
 *   - "＋ Add mockups"  -> picker modal: pehle se uploaded mockups par click
 *                         kar ke set me daalo/nikalo
 *   - "⬆ Upload new"    -> nayi photos seedha IS set me upload
 * (Mockups screen ke chip-buttons bhi pehle ki tarah kaam karte hain.)
 */
import React, { useState } from 'react'
import { useApp } from '../store/AppState.jsx'
import { Empty, confirmDel } from '../components/ui.jsx'

export default function Sets() {
  const app = useApp()
  const [name, setName] = useState('')
  const [pickFor, setPickFor] = useState(null)   // set id jiska picker khula hai
  const [busyUp, setBusyUp] = useState(null)     // set id jisme upload chal raha hai

  const inSet = (m, sid) => (m.setIds || []).includes(sid)
  const members = (sid) => app.ws.mockups.filter((m) => inSet(m, sid))

  const uploadInto = async (sid, files) => {
    setBusyUp(sid)
    try { await app.addMockupFiles(files, [sid]) } finally { setBusyUp(null) }
  }

  const pickSet = pickFor ? app.ws.sets.find((s) => s.id === pickFor) : null

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>🗂️ Mockup Sets <span className="chip">{app.ws.sets.length}</span></h3>
        <p className="muted">Set = mockups ka group. Neeche har set me mockups add/upload kar sakte hain (Mockups screen ke chips se bhi hota hai).</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && (app.addSet(name), setName(''))} placeholder="Set ka naam" style={{ flex: 1, minWidth: 200 }} />
          <button className="btn" onClick={() => { if (name.trim()) { app.addSet(name); setName('') } }}>＋ Create set</button>
        </div>
      </div>

      {app.ws.sets.map((s) => {
        const mems = members(s.id)
        return (
          <div key={s.id} className="card">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 15 }}>🗂️ {s.name}</b>
              <span className="chip">{mems.length} mockups</span>
              <span style={{ flex: 1 }} />
              <button className="btn sm ghost" onClick={() => setPickFor(s.id)}>＋ Add mockups</button>
              <label className="btn sm ghost" style={{ cursor: 'pointer' }}>
                {busyUp === s.id ? '⏳ Uploading…' : '⬆ Upload new'}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }}
                  onChange={(e) => { if (e.target.files.length) uploadInto(s.id, Array.from(e.target.files)); e.target.value = '' }} />
              </label>
              <button className="btn sm ghost" onClick={() => { const n = prompt('New name', s.name); if (n) app.renameSet(s.id, n) }}>Rename</button>
              <button className="btn sm danger" onClick={() => confirmDel(`set "${s.name}"`) && app.delSet(s.id)}>Delete</button>
            </div>

            {/* is set ke mockups */}
            <div className="vphotos" style={{ marginTop: 10 }}>
              {mems.map((m) => (
                <span key={m.id} style={{ position: 'relative', display: 'inline-block' }} title={m.name}>
                  <img src={m.dataUrl} alt={m.name} className="vphoto" style={{ cursor: 'default' }} />
                  <button className="ph-tool" title="Set se nikalo (mockup delete nahi hota)"
                    style={{ position: 'absolute', top: 2, right: 2, background: '#fff', borderRadius: 6 }}
                    onClick={() => app.toggleMockupSet(m.id, s.id)}>✕</button>
                </span>
              ))}
              {!mems.length && <span className="muted" style={{ fontSize: 12 }}>Is set me abhi koi mockup nahi — "＋ Add mockups" ya "⬆ Upload new" use karein.</span>}
            </div>
          </div>
        )
      })}
      {!app.ws.sets.length && <Empty>Abhi koi set nahi.</Empty>}

      {/* ---- picker: pehle se uploaded mockups me se chunein ---- */}
      {pickSet && (
        <div className="modal-overlay" onClick={() => setPickFor(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="topbar" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>＋ Mockups → 🗂️ {pickSet.name}</h2>
              <button className="btn sm ghost" onClick={() => setPickFor(null)}>✓ Done</button>
            </div>
            <p className="muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
              Photo par click = set me daalo / nikaalo (neela border = set me hai)
            </p>
            {!app.ws.mockups.length && <p className="muted">Abhi koi mockup uploaded nahi — pehle Mockups screen par upload karein, ya set card ke "⬆ Upload new" se.</p>}
            <div className="vphotos">
              {app.ws.mockups.map((m) => (
                <span key={m.id} style={{ display: 'inline-block', width: 96, textAlign: 'center' }} title={m.name}>
                  <img src={m.dataUrl} alt={m.name}
                    className={'vphoto' + (inSet(m, pickSet.id) ? ' sel' : '')}
                    onClick={() => app.toggleMockupSet(m.id, pickSet.id)} />
                  <span className="ellip muted" style={{ display: 'block', fontSize: 10.5 }}>{m.name}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
