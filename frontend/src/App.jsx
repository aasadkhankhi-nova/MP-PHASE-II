/**
 * App.jsx — The application SHELL.
 * Responsibilities:
 *   1. Login gate: no session -> show the Login screen, nothing else.
 *   2. Sidebar: logo, store-switcher dropdown, navigation, backend status.
 *   3. Route: decide which screen component to render.
 *   4. Top bar: current screen title + cloud-sync chip + store chip.
 * If no store is selected yet, the user is forced onto the Stores screen.
 */
import React, { useEffect, useState } from 'react'
import { health } from './api.js'
import { AppStateProvider, useApp } from './store/AppState.jsx'
import Stores from './screens/Stores.jsx'
import Dashboard from './screens/Dashboard.jsx'
import Mockups from './screens/Mockups.jsx'
import Designs from './screens/Designs.jsx'
import Sets from './screens/Sets.jsx'
import Listings from './screens/Listings.jsx'
import Results from './screens/Results.jsx'
import Seo from './screens/Seo.jsx'
import Account from './screens/Account.jsx'
import Login from './screens/Login.jsx'

// Sidebar structure: {sec} rows are section headings, others are nav items.
const NAV = [
  { sec: 'Workspace' },
  { id: 'account', icon: '👤', label: 'Account' },
  { id: 'stores', icon: '🏬', label: 'Stores' },
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

// Shown for screens that are not built yet.
function Placeholder({ title }) {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p className="muted">Ye screen agle update me aa rahi hai.</p>
    </div>
  )
}

function Shell() {
  const app = useApp()
  const [screen, setScreen] = useState('dash')          // current nav selection
  const [api, setApi] = useState({ state: 'checking' }) // backend health for the sidebar chip

  // Ping the backend once on load (shows ● backend / ○ backend offline).
  useEffect(() => {
    health()
      .then((r) => setApi({ state: 'ok', info: r }))
      .catch(() => setApi({ state: 'down' }))
  }, [])

  // GATE 1: must be logged in.
  if (app.ready && !app.authed) return <Login />

  // GATE 2: must have a store open — otherwise force the Stores screen.
  const needStore = app.ready && !app.curStore
  const eff = needStore ? 'stores' : screen
  const current = NAV.find((n) => n.id === eff)

  // Simple router: screen id -> component.
  const body =
    eff === 'stores' ? <Stores /> :
    eff === 'dash' ? <Dashboard go={setScreen} /> :
    eff === 'mockups' ? <Mockups /> :
    eff === 'designs' ? <Designs /> :
    eff === 'sets' ? <Sets /> :
    eff === 'listings' ? <Listings /> :
    eff === 'results' ? <Results /> :
    eff === 'seo' ? <Seo /> :
    eff === 'account' ? <Account /> :
    <Placeholder title={current ? current.label : ''} />

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">M<span>P</span> · 2.0</div>
        {/* store switcher — one click to jump between isolated stores */}
        {app.stores.length > 0 && (
          <select
            className="store-switch"
            value={app.curStoreId || ''}
            onChange={(e) => {
              if (e.target.value === '__new') { setScreen('stores') }
              else if (e.target.value) { app.selectStore(e.target.value); if (screen === 'stores') setScreen('dash') }
            }}
          >
            {!app.curStoreId && <option value="">— store chunein —</option>}
            {app.stores.map((s) => (
              <option key={s.id} value={s.id}>🏬 {s.name}</option>
            ))}
            <option value="__new">＋ New store…</option>
          </select>
        )}
        {NAV.map((n, i) =>
          n.sec ? (
            <div key={i} className="nav-sec">{n.sec}</div>
          ) : (
            <button key={n.id} className={'nav-item' + (eff === n.id ? ' active' : '')} onClick={() => setScreen(n.id)}>
              <span>{n.icon}</span> {n.label}
            </button>
          )
        )}
        <div className="nav-sec">Status</div>
        <div style={{ padding: '4px 10px' }}>
          <span className={'chip ' + (api.state === 'ok' ? 'ok' : 'err')}>
            {api.state === 'ok' ? '● backend' : '○ backend offline'}
          </span>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <h1>{current ? `${current.icon} ${current.label}` : ''}</h1>
          <span style={{ display: 'flex', gap: 6 }}>
            {/* live cloud-sync indicator (state comes from AppState) */}
            {app.authed && <span className={'chip ' + (app.sync.state === 'error' ? 'err' : 'ok')}>{app.sync.state === 'ok' ? '☁ synced' : app.sync.state === 'pending' ? '☁ saving…' : app.sync.state === 'pulling' ? '☁ loading…' : app.sync.state === 'error' ? '☁ error' : '☁'}</span>}
            {app.curStore && <span className="chip">🏬 {app.curStore.name}</span>}
          </span>
        </div>
        {app.ready ? body : <p className="muted">Loading…</p>}
      </main>
    </div>
  )
}

// Root component: provides the shared AppState to everything inside.
export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  )
}
