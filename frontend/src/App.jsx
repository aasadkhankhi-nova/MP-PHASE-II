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
import { health, etsy } from './api.js'
import { AppStateProvider, useApp } from './store/AppState.jsx'
import Dashboard from './screens/Dashboard.jsx'
import Mockups from './screens/Mockups.jsx'
import Designs from './screens/Designs.jsx'
import Sets from './screens/Sets.jsx'
import Listings from './screens/Listings.jsx'
import Results from './screens/Results.jsx'
import EtsyStore from './screens/EtsyStore.jsx'
import Account from './screens/Account.jsx'
import Login from './screens/Login.jsx'

// Sidebar structure: {sec} rows are section headings, others are nav items.
// NOTE: "Stores" and "SEO" are NOT here on purpose —
//   - store add/rename/delete lives in Settings (user chip at the bottom),
//     and quick store switching is the dropdown at the top of the sidebar
//   - SEO happens automatically inside "Create listing" (Listings screen)
const NAV = [
  { sec: 'Workspace' },
  { id: 'dash', icon: '🏠', label: 'Dashboard' },
  { id: 'listings', icon: '🧾', label: 'Listings' },
  { id: 'etsystore', icon: '🛍️', label: 'Etsy Store' },
  { sec: 'Library' },
  { id: 'mockups', icon: '🖼️', label: 'Mockups' },
  { id: 'sets', icon: '🗂️', label: 'Sets' },
  { id: 'designs', icon: '🎨', label: 'Designs' },
  { sec: 'Production' },
  { id: 'generate', icon: '⚙️', label: 'Generate' },
  { id: 'results', icon: '📦', label: 'Results' },
]

/**
 * ShopSwitcher — the Vela-style dropdown at the top of the sidebar.
 * Shows the CURRENT shop (Etsy logo + shop name when connected, otherwise
 * the store name). Opening it lists every store/shop; clicking one switches
 * the WHOLE app to that shop's workspace. "＋ Add shop" makes a new store
 * and jumps to Settings so its Etsy shop can be connected.
 */
function ShopSwitcher({ app, screen, go }) {
  const [open, setOpen] = useState(false)
  const [conns, setConns] = useState({})   // storeId -> Etsy shop name

  // which stores are linked to which Etsy shops (one call for all)
  useEffect(() => {
    if (!app.authed) return
    etsy.connections()
      .then((r) => { const m = {}; for (const c of r.connections) m[c.storeId] = c.shopName; setConns(m) })
      .catch(() => {})
  }, [app.authed, app.stores.length, app.curStoreId])

  if (!app.stores.length) return null
  const cur = app.curStore
  const curShop = cur ? conns[cur.id] : null

  const pick = async (id) => {
    setOpen(false)
    await app.selectStore(id)
    if (screen === 'account') go('dash')
  }
  const addShop = async () => {
    setOpen(false)
    const name = prompt('Naye shop/store ka naam:')
    if (!name || !name.trim()) return
    const st = await app.addStore(name.trim())
    await app.selectStore(st.id)
    go('account')   // Settings — wahan se Connect Etsy
  }

  return (
    <div className="shop-switch-wrap">
      <button className="shop-switch-btn" onClick={() => setOpen(!open)}>
        <span className={'etsy-badge' + (curShop ? '' : ' off')}>{curShop ? 'E' : '🏬'}</span>
        <span className="shop-switch-name">
          <small>{curShop ? 'Etsy' : 'store'}</small>
          {curShop || (cur ? cur.name : 'store chunein')}
        </span>
        <span style={{ opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <div className="shop-switch-panel">
          {app.stores.map((s) => {
            const shop = conns[s.id]
            return (
              <button key={s.id} className="shop-switch-row" onClick={() => pick(s.id)}>
                <span className={'etsy-badge' + (shop ? '' : ' off')}>{shop ? 'E' : '🏬'}</span>
                <span className="shop-switch-name">
                  <small>{shop ? 'Etsy' : 'store'}</small>
                  {shop || s.name}
                </span>
                {s.id === app.curStoreId && <span className="dot-on" />}
              </button>
            )
          })}
          <button className="shop-switch-row add" onClick={addShop}>＋ Add shop</button>
        </div>
      )}
    </div>
  )
}

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

  // Ping the backend on load. The free server sleeps when idle and takes
  // ~30-50s to wake, so if it's down we keep re-checking every 15s and the
  // warning disappears by itself once the server is up.
  useEffect(() => {
    let timer
    const check = () => {
      health()
        .then((r) => setApi({ state: 'ok', info: r }))
        .catch(() => { setApi({ state: 'down' }); timer = setTimeout(check, 15000) })
    }
    check()
    return () => clearTimeout(timer)
  }, [])

  // GATE 1: must be logged in.
  if (app.ready && !app.authed) return <Login />

  // GATE 2: must have a store open — otherwise force Settings,
  // where the store list (create/rename/delete) now lives.
  const needStore = app.ready && !app.curStore
  const eff = needStore ? 'account' : screen
  // Settings is not in the NAV list (it opens from the user chip at the
  // bottom of the sidebar), so give it its own title here.
  const current = NAV.find((n) => n.id === eff) || (eff === 'account' ? { icon: '⚙️', label: 'Settings' } : null)

  // Simple router: screen id -> component.
  const body =
    eff === 'dash' ? <Dashboard go={setScreen} /> :
    eff === 'mockups' ? <Mockups /> :
    eff === 'designs' ? <Designs /> :
    eff === 'sets' ? <Sets /> :
    eff === 'listings' ? <Listings /> :
    eff === 'etsystore' ? <EtsyStore go={setScreen} /> :
    eff === 'results' ? <Results /> :
    eff === 'account' ? <Account /> :
    <Placeholder title={current ? current.label : ''} />

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">✈ List<span>Pilot</span></div>
        {/* shop switcher (Vela-style): Etsy logo + shop name; the whole app
            switches to the selected shop's workspace */}
        <ShopSwitcher app={app} screen={screen} go={setScreen} />
        {NAV.map((n, i) =>
          n.sec ? (
            <div key={i} className="nav-sec">{n.sec}</div>
          ) : (
            <button key={n.id} className={'nav-item' + (eff === n.id ? ' active' : '')} onClick={() => setScreen(n.id)}>
              <span>{n.icon}</span> {n.label}
            </button>
          )
        )}
        {/* ---- pinned to the BOTTOM of the sidebar (margin-top: auto) ---- */}
        <div className="side-bottom">
          {/* Server status is internal — users only see a warning when
              something is actually wrong (e.g. free server waking up). */}
          {api.state === 'down' && (
            <span className="chip err">⚠ server jag raha hai… thori dair me refresh karein</span>
          )}
          {/* User chip — like Gemini/Vela: avatar + name at bottom-left.
              Click -> Account screen (details, password, sync, logout). */}
          {app.authed && (
            <button
              className={'side-user' + (eff === 'account' ? ' active' : '')}
              onClick={() => setScreen('account')}
              title="Account settings"
            >
              {/* avatar shows initials — from the user's name if we have it, else the email */}
              <span className="avatar">{(app.session.user.name || app.session.user.email || '?').slice(0, 2).toUpperCase()}</span>
              <span className="side-user-name">{app.session.user.name || (app.session.user.email || '').split('@')[0]}</span>
              <span className="side-user-gear">⚙</span>
            </button>
          )}
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
