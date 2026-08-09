import React, { useEffect, useState } from 'react'
import { health, API_BASE } from './api.js'

const NAV = [
  { sec: 'Workspace' },
  { id: 'dash', icon: '🏠', label: 'Dashboard' },
  { id: 'listings', icon: '🧾', label: 'Listings' },
  { sec: 'Library' },
  { id: 'mockups', icon: '🖼️', label: 'Mockups' },
  { id: 'sets', icon: '🗂️', label: 'Sets' },
  { id: 'designs', icon: '🎨', label: 'Designs' },
  { sec: 'Production' },
  { id: 'generate', icon: '⚙️', label: 'Generate' },
  { id: 'results', icon: '📦', label: 'Results' },
  { id: 'seo', icon: '✨', label: 'SEO' },
]

function Placeholder({ title }) {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p className="muted">
        Ye screen React port (M2) me yahan aayegi. Abhi tak ka mukammal app site ke
        root link par chal raha hai.
      </p>
    </div>
  )
}

export default function App() {
  const [screen, setScreen] = useState('dash')
  const [api, setApi] = useState({ state: 'checking' })

  useEffect(() => {
    health()
      .then((r) => setApi({ state: 'ok', info: r }))
      .catch((e) => setApi({ state: 'down', error: String(e.message || e) }))
  }, [])

  const current = NAV.find((n) => n.id === screen)

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">M<span>P</span> · Phase II</div>
        {NAV.map((n, i) =>
          n.sec ? (
            <div key={i} className="nav-sec">{n.sec}</div>
          ) : (
            <button
              key={n.id}
              className={'nav-item' + (screen === n.id ? ' active' : '')}
              onClick={() => setScreen(n.id)}
            >
              <span>{n.icon}</span> {n.label}
            </button>
          )
        )}
      </aside>
      <main className="main">
        <div className="topbar">
          <h1>{current ? `${current.icon} ${current.label}` : ''}</h1>
          <span className={'chip ' + (api.state === 'ok' ? 'ok' : api.state === 'down' ? 'err' : '')}>
            {api.state === 'ok' ? '● backend connected' : api.state === 'down' ? '○ backend offline' : '… checking backend'}
          </span>
        </div>

        {screen === 'dash' ? (
          <>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>🚧 React migration — M1 scaffold live</h3>
              <p className="muted">
                Ye MP Phase II ka naya React frontend hai. Migration milestones:
                M1 structure ✓ · M2 UI screens · M3 backend APIs · M4 full deploy.
                Purana mukammal app site ke root par mojood hai.
              </p>
              <p className="muted">API base: <code>{API_BASE}</code></p>
            </div>
            <div className="grid">
              {NAV.filter((n) => n.id && n.id !== 'dash').map((n) => (
                <div key={n.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setScreen(n.id)}>
                  <div style={{ fontSize: 26 }}>{n.icon}</div>
                  <b>{n.label}</b>
                  <p className="muted" style={{ margin: '4px 0 0' }}>M2 me port hoga</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Placeholder title={current ? current.label : ''} />
        )}
      </main>
    </div>
  )
}
