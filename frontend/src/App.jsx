/**
 * App.jsx — The application SHELL.
 * Responsibilities:
 *   1. Login gate: no session -> show the Login screen, nothing else.
 *   2. Sidebar: logo, store-switcher dropdown, navigation, backend status.
 *   3. Route: decide which screen component to render.
 *   4. Top bar: current screen title + cloud-sync chip + store chip.
 * If no store is selected yet, the user is forced onto the Stores screen.
 */
import React, { useEffect, useState, useMemo } from 'react'
import { health, etsy } from './api.js'
import { AppStateProvider, useApp } from './store/AppState.jsx'
import Mockups from './screens/Mockups.jsx'
import Designs from './screens/Designs.jsx'
import Sets from './screens/Sets.jsx'
import Listings from './screens/Listings.jsx'
import EtsyStore from './screens/EtsyStore.jsx'
import Account from './screens/Account.jsx'
import Login from './screens/Login.jsx'

// Screen titles for the top bar (the old NAV list is gone — the sidebar
// is now the Vela-style filter menu itself).
const TITLES = {
  etsystore: { icon: '🛍️', label: 'Etsy Store' },
  mockups: { icon: '🖼️', label: 'Mockups' },
  sets: { icon: '🗂️', label: 'Sets' },
  designs: { icon: '🎨', label: 'Designs' },
  listings: { icon: '🚀', label: 'Launchpad' },
  account: { icon: '⚙️', label: 'Settings' },
}
const ES_STATES = [
  { id: 'active', label: 'Active' },
  { id: 'draft', label: 'Draft' },
  { id: 'expired', label: 'Expired' },
  { id: 'inactive', label: 'Inactive' },
  { id: 'sold_out', label: 'Sold out' },
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
    if (screen === 'account') go('etsystore')
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
  const [screen, setScreen] = useState('etsystore')     // Etsy Store is home now
  const [api, setApi] = useState({ state: 'checking' }) // backend health chip

  // ---- Etsy data lives HERE (shared by the sidebar menu + the screen) ----
  const [esState, setEsState] = useState('active')      // selected Status
  const [esFilt, setEsFilt] = useState({})               // {sectionId, shipId, retId, video, lp}
  const [es, setEs] = useState({ checked: false, connected: false, shopName: '', counts: null, names: { sections: [], ship: [], ret: [] }, idx: null, busy: false, err: null })

  // Ping the backend on load; keep re-checking while the free server wakes up.
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

  // When the store changes: is it connected? then load counts + the NAMES
  // (sections / shipping profiles / return policies) for the sidebar menu.
  useEffect(() => {
    setEs({ checked: false, connected: false, shopName: '', counts: null, names: { sections: [], ship: [], ret: [] }, idx: null, busy: false, err: null })
    setEsFilt({}); setEsState('active')
    if (!app.authed || !app.curStoreId) return
    const sid = app.curStoreId
    etsy.status(sid).then((r) => {
      setEs((e) => ({ ...e, checked: true, connected: !!r.connected, shopName: r.shop?.shop_name || '' }))
      if (r.connected) {
        etsy.counts(sid).then((c) => setEs((e) => ({ ...e, counts: c.counts }))).catch(() => {})
        etsy.sections(sid).then((c) => setEs((e) => ({ ...e, names: { ...e.names, sections: c.sections } }))).catch(() => {})
        etsy.shippingProfiles(sid).then((c) => setEs((e) => ({ ...e, names: { ...e.names, ship: c.profiles } }))).catch(() => {})
        etsy.returnPolicies(sid).then((c) => setEs((e) => ({ ...e, names: { ...e.names, ret: c.policies } }))).catch(() => {})
      }
    }).catch((err) => setEs((e) => ({ ...e, checked: true, err: String(err.message || err) })))
  }, [app.authed, app.curStoreId])

  // Load the INDEX (every listing of the selected Status, with filter facts).
  useEffect(() => {
    if (!es.connected || !app.curStoreId) return
    setEs((e) => ({ ...e, busy: true, idx: null, err: null }))
    etsy.index(app.curStoreId, esState)
      .then((r) => setEs((e) => ({ ...e, idx: r.listings, busy: false })))
      .catch((err) => setEs((e) => ({ ...e, err: String(err.message || err), busy: false })))
  }, [es.connected, app.curStoreId, esState])

  // facet counts for the sidebar (listings per section / profile / policy)
  const facets = useMemo(() => {
    const f = { section: {}, ship: {}, ret: {}, video: 0 }
    for (const l of es.idx || []) {
      if (l.sectionId) f.section[l.sectionId] = (f.section[l.sectionId] || 0) + 1
      if (l.shipId) f.ship[l.shipId] = (f.ship[l.shipId] || 0) + 1
      if (l.retId) f.ret[l.retId] = (f.ret[l.retId] || 0) + 1
      if (l.video) f.video++
    }
    return f
  }, [es.idx])

  // ListPilot-made drafts that are on Etsy (shown under 🚀 Launchpad too)
  const lpCount = (app.ws.listings || []).length

  // sidebar row helpers
  const pickState = (id) => { setEsState(id); setEsFilt({}); setScreen('etsystore') }
  const pickFilt = (key, val) => {
    setScreen('etsystore')
    setEsFilt((f) => ({ ...f, [key]: String(f[key]) === String(val) ? null : val }))
  }
  const onDeleted = (id) => setEs((e) => ({ ...e, idx: (e.idx || []).filter((l) => String(l.id) !== String(id)) }))

  // GATE 1: must be logged in.
  if (app.ready && !app.authed) return <Login />

  // GATE 2: must have a store open — otherwise force Settings.
  const needStore = app.ready && !app.curStore
  const eff = needStore ? 'account' : screen
  const current = TITLES[eff] || null

  const body =
    eff === 'mockups' ? <Mockups /> :
    eff === 'designs' ? <Designs /> :
    eff === 'sets' ? <Sets /> :
    eff === 'listings' ? <Listings /> :
    eff === 'etsystore' ? <EtsyStore es={es} state={esState} filt={esFilt} onDeleted={onDeleted} /> :
    eff === 'account' ? <Account /> :
    <Placeholder title={current ? current.label : ''} />

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">✈ List<span>Pilot</span></div>
        {/* shop switcher: Etsy logo + shop name; switches the whole app */}
        <ShopSwitcher app={app} screen={screen} go={setScreen} />

        {/* ==================== THE MENU (Vela-style) ==================== */}
        <div className="side-scroll">
          {/* Status — Etsy listings by state */}
          <div className="nav-sec">Status</div>
          {ES_STATES.map((sx) => (
            <button key={sx.id}
              className={'frow' + (eff === 'etsystore' && esState === sx.id && !esFilt.lp ? ' active' : '')}
              onClick={() => pickState(sx.id)}>
              <span className="ellip" style={{ flex: 1, textAlign: 'left' }}>{sx.label}</span>
              <span className="frow-count">{es.counts ? es.counts[sx.id] : ''}</span>
            </button>
          ))}

          {/* ListPilot — the workshop screens + Launchpad */}
          <div className="nav-sec">ListPilot</div>
          {[
            { id: 'mockups', label: '🖼️ Mockups', count: app.ws.mockups.length },
            { id: 'sets', label: '🗂️ Sets', count: app.ws.sets.length },
            { id: 'designs', label: '🎨 Designs', count: app.ws.designs.length },
            { id: 'listings', label: '🚀 Launchpad', count: lpCount },
          ].map((n) => (
            <button key={n.id} className={'frow' + (eff === n.id ? ' active' : '')} onClick={() => setScreen(n.id)}>
              <span className="ellip" style={{ flex: 1, textAlign: 'left' }}>{n.label}</span>
              <span className="frow-count">{n.count}</span>
            </button>
          ))}

          {/* Sections — click = only that section's listings */}
          {es.names.sections.length > 0 && <>
            <div className="nav-sec">Sections</div>
            {es.names.sections.map((sx) => (
              <button key={sx.id}
                className={'frow' + (eff === 'etsystore' && String(esFilt.sectionId) === String(sx.id) ? ' active' : '')}
                onClick={() => pickFilt('sectionId', sx.id)}>
                <span className="ellip" style={{ flex: 1, textAlign: 'left' }}>{sx.title}</span>
                <span className="frow-count">{facets.section[sx.id] || 0}</span>
              </button>
            ))}
          </>}

          {/* Shipping profiles */}
          {es.names.ship.length > 0 && <>
            <div className="nav-sec">Shipping profiles</div>
            {es.names.ship.map((p) => (
              <button key={p.id}
                className={'frow' + (eff === 'etsystore' && String(esFilt.shipId) === String(p.id) ? ' active' : '')}
                onClick={() => pickFilt('shipId', p.id)}>
                <span className="ellip" style={{ flex: 1, textAlign: 'left' }}>🚚 {p.title}</span>
                <span className="frow-count">{facets.ship[p.id] || 0}</span>
              </button>
            ))}
          </>}

          {/* Return & exchange policies */}
          {es.names.ret.length > 0 && <>
            <div className="nav-sec">Returns & exchanges</div>
            {es.names.ret.map((p) => (
              <button key={p.id}
                className={'frow' + (eff === 'etsystore' && String(esFilt.retId) === String(p.id) ? ' active' : '')}
                onClick={() => pickFilt('retId', p.id)}>
                <span className="ellip" style={{ flex: 1, textAlign: 'left' }}>{p.label}</span>
                <span className="frow-count">{facets.ret[p.id] || 0}</span>
              </button>
            ))}
          </>}

          {/* Media */}
          {es.connected && <>
            <div className="nav-sec">Media</div>
            <button className={'frow' + (eff === 'etsystore' && esFilt.video ? ' active' : '')}
              onClick={() => pickFilt('video', true)}>
              <span className="ellip" style={{ flex: 1, textAlign: 'left' }}>🎬 With video</span>
              <span className="frow-count">{facets.video}</span>
            </button>
          </>}
        </div>

        {/* ---- pinned to the BOTTOM ---- */}
        <div className="side-bottom">
          {api.state === 'down' && (
            <span className="chip err">⚠ server jag raha hai… thori dair me refresh karein</span>
          )}
          {app.authed && (
            <button
              className={'side-user' + (eff === 'account' ? ' active' : '')}
              onClick={() => setScreen('account')}
              title="Account settings"
            >
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
            {app.authed && <span className={'chip ' + (app.sync.state === 'error' ? 'err' : 'ok')}>{app.sync.state === 'ok' ? '☁ synced' : app.sync.state === 'pending' ? '☁ saving…' : app.sync.state === 'pulling' ? '☁ loading…' : app.sync.state === 'error' ? '☁ error' : '☁'}</span>}
            {app.curStore && <span className="chip">{es.shopName ? '🛍️ ' + es.shopName : '🏬 ' + app.curStore.name}</span>}
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
