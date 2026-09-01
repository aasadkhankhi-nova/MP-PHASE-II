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
import { getProfiles } from './store/profiles.js'
import ProfileEdit from './screens/ProfileEdit.jsx'
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
  help: { icon: 'ℹ️', label: 'Help center' },
  support: { icon: '💬', label: 'Support' },
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
      .then(async (r) => {
        const m = {}
        for (const c of r.connections) m[c.storeId] = c.shopName
        setConns(m)
        // CLEANUP: "Add shop" makes a placeholder workspace before sending
        // the user to Etsy. If they backed out without granting access,
        // that empty "New shop" would linger — remove it automatically.
        const orphans = app.stores.filter((s) => s.name === 'New shop' && !m[s.id])
        if (orphans.length) {
          const wasCurrent = orphans.some((o) => o.id === app.curStoreId)
          for (const o of orphans) { try { await app.deleteStore(o.id) } catch {} }
          if (wasCurrent) {
            const left = app.stores.filter((s) => !orphans.find((o) => o.id === s.id))
            if (left[0]) { try { await app.selectStore(left[0].id) } catch {} }
          }
        }
      })
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
  // "Add shop" = go STRAIGHT to Etsy's grant-access page.
  // We quietly make a workspace behind the scenes; after "Allow" the
  // backend saves the connection AND renames the workspace to the real
  // Etsy shop name — so the new shop just appears in this list.
  const addShop = async () => {
    setOpen(false)
    try {
      const st = await app.addStore('New shop')
      await app.selectStore(st.id)
      const r = await etsy.connectUrl(st.id)
      window.location.href = r.url          // -> Etsy permission page
    } catch (e) { alert('⚠ ' + (e.message || e)) }
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

/**
 * ProfilesPanel — 🧩 rail ka panel: sari profiles ki list (rename / delete).
 * Profile BANANE ka tariqa: kisi listing ke edit page par sab set kar ke
 * neeche ⊞ "Save as Profile" dabayein. Launchpad aur edit page dono
 * isi list se profiles uthate hain.
 */
function ProfilesPanel({ onEdit }) {
  const list = getProfiles()
  return (
    <div className="side-scroll">
      <div className="nav-sec">Profiles ({list.length})</div>
      {!list.length && (
        <p className="muted" style={{ padding: '4px 10px' }}>
          🧩 Abhi koi profile nahi. Kisi listing ke edit page par sab kuch set kar ke
          neeche <b>⊞ Save as Profile</b> dabayein — details, price, variations,
          shipping, materials aur description ka profile-hissa us me save ho jayega.
          Phir Launchpad aur edit page par ek click me lagta hai.
        </p>
      )}
      {list.map((p) => (
        <button key={p.id} className="nav-item" title="Profile kholein (edit)" onClick={() => onEdit(p.id)}>
          🧩 <span className="ellip">{p.name}</span>
        </button>
      ))}
      {list.length > 0 && (
        <p className="muted" style={{ padding: '8px 10px', fontSize: 12 }}>
          Naam par click karein — profile ka pura edit page khulta hai.
        </p>
      )}
    </div>
  )
}

function Shell() {
  // edit page khula ho to left FILTER SIDEBAR chhup jata hai (Vela jaisa full-width edit)
  const [editFull, setEditFull] = useState(false)
  const [profEditId, setProfEditId] = useState(null)   // kaunsi profile edit ho rahi hai
  const app = useApp()
  const [screen, setScreen] = useState('etsystore')     // Etsy Store is home now
  const [rail, setRail] = useState('listings')          // icon rail: which PANEL shows (listings | profiles)
  const [api, setApi] = useState({ state: 'checking' }) // backend health chip

  // ---- Etsy data lives HERE (shared by the sidebar menu + the screen) ----
  const [esState, setEsState] = useState('active')      // selected Status
  const [esFilt, setEsFilt] = useState({ sections: [], ships: [], rets: [], video: false })  // CHECKBOX filters — multi-select, status badalne par bhi qaim
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
    setEsFilt({ sections: [], ships: [], rets: [], video: false }); setEsState('active')
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
  // fresh=true skips the server cache — the "Refresh shop" button uses it.
  const loadIndex = (fresh) => {
    if (!es.connected || !app.curStoreId) return
    setEs((e) => ({ ...e, busy: true, idx: null, err: null }))
    etsy.index(app.curStoreId, esState, fresh)
      .then((r) => setEs((e) => ({ ...e, idx: r.listings, at: Date.now(), busy: false })))
      .catch((err) => setEs((e) => ({ ...e, err: String(err.message || err), busy: false })))
  }
  useEffect(() => { loadIndex(false) }, [es.connected, app.curStoreId, esState])

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
  // Status click: sirf status badalta hai — checked boxes waise hi lage rehte hain
  const pickState = (id) => { setEsState(id); setScreen('etsystore') }
  // checkbox toggle: value ko list me dalo / nikalo (multi-select, OR within a category)
  const pickFilt = (key, val) => {
    setScreen('etsystore')
    if (key === 'video') { setEsFilt((f) => ({ ...f, video: !f.video })); return }
    setEsFilt((f) => {
      const arr = f[key] || []
      const has = arr.some((x) => String(x) === String(val))
      return { ...f, [key]: has ? arr.filter((x) => String(x) !== String(val)) : [...arr, val] }
    })
  }
  const onDeleted = (id) => setEs((e) => ({ ...e, idx: (e.idx || []).filter((l) => String(l.id) !== String(id)) }))

  // "＋ Add shop" (panel ke bottom par, Vela-style) — seedha Etsy grant-access
  const addShopBottom = async () => {
    try {
      const st = await app.addStore('New shop')
      await app.selectStore(st.id)
      const r = await etsy.connectUrl(st.id)
      window.location.href = r.url
    } catch (e) { alert('⚠ ' + (e.message || e)) }
  }

  // GATE 1: must be logged in.
  if (app.ready && !app.authed) return <Login />

  // GATE 2: must have a store open — otherwise force Settings.
  const needStore = app.ready && !app.curStore
  const eff = needStore ? 'account' : screen
  const current = eff === 'etsystore'
    ? { icon: '', label: (ES_STATES.find((x) => x.id === esState) || {}).label || 'Listings' }
    : (TITLES[eff] || null)

  const body =
    eff === 'mockups' ? <Mockups /> :
    eff === 'designs' ? <Designs /> :
    eff === 'sets' ? <Sets /> :
    eff === 'listings' ? <Listings /> :
    eff === 'etsystore' ? <EtsyStore es={es} state={esState} filt={esFilt} onDeleted={onDeleted} onRefresh={() => loadIndex(true)} onCreate={() => setScreen('listings')} onEditing={setEditFull} /> :
    eff === 'profileedit' ? <ProfileEdit key={profEditId} id={profEditId} onBack={() => setScreen('etsystore')} /> :
    eff === 'account' ? <Account /> :
    <Placeholder title={current ? current.label : ''} />

  return (
    <div className="layout">
      {/* ==================== ICON RAIL (far left, Vela-style) ====================
          Icons only; the name appears on hover (native tooltip). */}
      <nav className="rail">
        {/* logo = HOME: selected shop's Active listings */}
        <button className="rail-logo" title="ListPilot — Active listings"
          onClick={() => { setRail('listings'); pickState('active') }}>✈</button>

        <button className={'rail-btn' + (rail === 'listings' ? ' active' : '')} title="Listings"
          onClick={() => { setRail('listings'); setScreen('etsystore') }}>☰</button>
        <button className={'rail-btn' + (rail === 'profiles' ? ' active' : '')} title="Profiles"
          onClick={() => setRail('profiles')}>🧩</button>

        <div className="rail-spacer" />

        <button className={'rail-btn' + (eff === 'help' ? ' active' : '')} title="Help center"
          onClick={() => setScreen('help')}>ℹ️</button>
        <button className={'rail-btn' + (eff === 'support' ? ' active' : '')} title="Support"
          onClick={() => setScreen('support')}>💬</button>
        {app.authed && (
          <button className={'rail-avatar' + (eff === 'account' ? ' active' : '')}
            title={(app.session.user.name || app.session.user.email || 'Account') + ' — Settings'}
            onClick={() => setScreen('account')}>
            {(app.session.user.name || app.session.user.email || '?').slice(0, 2).toUpperCase()}
          </button>
        )}
      </nav>

      {/* ==================== PANEL (second sidebar) — edit page par hidden ==================== */}
      {!editFull && <aside className="sidebar">
        <ShopSwitcher app={app} screen={screen} go={setScreen} />

        {rail === 'profiles' ? (
          <ProfilesPanel onEdit={(pid) => { setProfEditId(pid); setScreen('profileedit') }} />
        ) : (
        <div className="side-scroll">
          {/* Status — Etsy listings by state */}
          <div className="nav-sec">Status</div>
          {ES_STATES.map((sx) => (
            <button key={sx.id}
              className={'frow' + (eff === 'etsystore' && esState === sx.id ? ' active' : '')}
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
            {es.names.sections.map((sx) => {
              const on = (esFilt.sections || []).some((x) => String(x) === String(sx.id))
              return (
                <button key={sx.id} className={'frow' + (on ? ' checked' : '')} onClick={() => pickFilt('sections', sx.id)}>
                  <span className="fchk">{on ? '☑' : '☐'}</span>
                  <span className="ellip" style={{ flex: 1, textAlign: 'left' }}>{sx.title}</span>
                  <span className="frow-count">{facets.section[sx.id] || 0}</span>
                </button>
              )
            })}
          </>}

          {/* Shipping profiles */}
          {es.names.ship.length > 0 && <>
            <div className="nav-sec">Shipping profiles</div>
            {es.names.ship.map((p) => {
              const on = (esFilt.ships || []).some((x) => String(x) === String(p.id))
              return (
                <button key={p.id} className={'frow' + (on ? ' checked' : '')} onClick={() => pickFilt('ships', p.id)}>
                  <span className="fchk">{on ? '☑' : '☐'}</span>
                  <span className="ellip" style={{ flex: 1, textAlign: 'left' }}>{p.title}</span>
                  <span className="frow-count">{facets.ship[p.id] || 0}</span>
                </button>
              )
            })}
          </>}

          {/* Return & exchange policies */}
          {es.names.ret.length > 0 && <>
            <div className="nav-sec">Returns & exchanges</div>
            {es.names.ret.map((p) => {
              const on = (esFilt.rets || []).some((x) => String(x) === String(p.id))
              return (
                <button key={p.id} className={'frow' + (on ? ' checked' : '')} onClick={() => pickFilt('rets', p.id)}>
                  <span className="fchk">{on ? '☑' : '☐'}</span>
                  <span className="ellip" style={{ flex: 1, textAlign: 'left' }}>{p.label}</span>
                  <span className="frow-count">{facets.ret[p.id] || 0}</span>
                </button>
              )
            })}
          </>}

          {/* Media */}
          {es.connected && <>
            <div className="nav-sec">Media</div>
            <button className={'frow' + (esFilt.video ? ' checked' : '')} onClick={() => pickFilt('video', true)}>
              <span className="fchk">{esFilt.video ? '☑' : '☐'}</span>
              <span className="ellip" style={{ flex: 1, textAlign: 'left' }}>🎬 With video</span>
              <span className="frow-count">{facets.video}</span>
            </button>
          </>}
        </div>
        )}

        {/* ---- pinned bottom: Add shop (Vela-style) + server warning ---- */}
        <div className="side-bottom">
          {api.state === 'down' && (
            <span className="chip err">⚠ server jag raha hai… thori dair me refresh karein</span>
          )}
          <button className="add-shop-btn" onClick={addShopBottom}>＋ Add shop</button>
        </div>
      </aside>}

      <main className="main">
        <div className="topbar">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {current ? (eff === 'etsystore' ? current.label : `${current.icon} ${current.label}`) : ''}
            {/* refresh = sirf gol icon, Vela jaisa (hover par waqt dikhta hai) */}
            {eff === 'etsystore' && es.connected && (
              <button className={'refresh-ic' + (es.busy ? ' spin' : '')} disabled={es.busy}
                title={'Refresh shop' + (es.at ? ' · ' + Math.max(1, Math.round((Date.now() - es.at) / 60000)) + ' min ago' : '')}
                onClick={() => loadIndex(true)}>⟳</button>
            )}
          </h1>
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
