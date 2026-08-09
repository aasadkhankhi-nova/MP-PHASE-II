import React from 'react'
import { useApp } from '../store/AppState.jsx'

export default function Dashboard({ go }) {
  const app = useApp()
  const t = [
    ['mockups', '🖼️', 'Mockups', app.ws.mockups.length],
    ['sets', '🗂️', 'Sets', app.ws.sets.length],
    ['designs', '🎨', 'Designs', app.ws.designs.length],
    ['listings', '🧾', 'Listings', app.ws.listings.length],
  ]
  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>🏬 {app.curStore ? app.curStore.name : '—'}</h3>
        <p className="muted">
          React port progress: Stores ✓ · Mockups ✓ · Designs ✓ · Sets ✓ ·
          Box editor, Generate, SEO agle updates me. Purana mukammal app root link par hai.
        </p>
      </div>
      <div className="grid">
        {t.map(([id, icon, label, n]) => (
          <div key={id} className="card" style={{ cursor: 'pointer' }} onClick={() => go(id)}>
            <div style={{ fontSize: 26 }}>{icon}</div>
            <b>{label}</b>
            <div className="chip" style={{ marginTop: 8 }}>{n}</div>
          </div>
        ))}
      </div>
    </>
  )
}
