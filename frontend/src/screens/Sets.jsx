import React, { useState } from 'react'
import { useApp } from '../store/AppState.jsx'
import { Empty, confirmDel } from '../components/ui.jsx'

export default function Sets() {
  const app = useApp()
  const [name, setName] = useState('')
  const count = (sid) => app.ws.mockups.filter((m) => (m.setIds || []).includes(sid)).length
  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>🗂️ Mockup Sets <span className="chip">{app.ws.sets.length}</span></h3>
        <p className="muted">Set = mockups ka group (e.g. "Framed 24x36"). Mockups screen par har mockup ko set assign karein.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && (app.addSet(name), setName(''))} placeholder="Set ka naam" style={{ flex: 1, minWidth: 200 }} />
          <button className="btn" onClick={() => { if (name.trim()) { app.addSet(name); setName('') } }}>＋ Create set</button>
        </div>
      </div>
      <div className="grid">
        {app.ws.sets.map((s) => (
          <div key={s.id} className="card">
            <div style={{ fontSize: 24 }}>🗂️</div>
            <b>{s.name}</b>
            <div className="chip" style={{ margin: '8px 0' }}>{count(s.id)} mockups</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn sm ghost" onClick={() => { const n = prompt('New name', s.name); if (n) app.renameSet(s.id, n) }}>Rename</button>
              <button className="btn sm danger" onClick={() => confirmDel(`set "${s.name}"`) && app.delSet(s.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {!app.ws.sets.length && <Empty>Abhi koi set nahi.</Empty>}
    </>
  )
}
