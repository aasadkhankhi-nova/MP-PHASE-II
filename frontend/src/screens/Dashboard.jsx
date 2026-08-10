/**
 * Dashboard.jsx — Landing screen of an open store.
 * Shows counts for each section; clicking a card jumps to that screen
 * (the `go` prop is App.jsx's setScreen function).
 */
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
          Mockups upload karein → boxes banayein → designs dalein → Listings me generate → SEO.
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
