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
import Landing from './screens/Landing.jsx'

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
// "＋ Add shop" in progress: id of the new placeholder store — cleanup skips it
let CONNECTING_ID = null

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
        // runs ONLY on app boot, and the store being connected RIGHT NOW
        // (CONNECTING_ID) is never deleted — otherwise during Add shop
        // the new placeholder got deleted and "store not found" appeared.
        const orphans = app.stores.filter((s) => s.name === 'New shop' && !m[s.id] && s.id !== CONNECTING_ID)
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
    // also runs when stores load — the CONNECTING_ID guard protects a mid-flow store
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.authed, app.stores.length])

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
      CONNECTING_ID = st.id                 // cleanup must not touch it
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
          {curShop || (cur ? cur.name : 'Select a store')}
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
      <p className="muted">This screen is coming in the next update.</p>
    </div>
  )
}

/**
 * ProfilesPanel — 🧩 rail panel: list of all profiles (rename / delete).
 * How to CREATE a profile: set everything on a listing's edit page and
 * press ⊞ "Save as Profile" at the bottom. Launchpad and the edit page both
 * take profiles from this list.
 */
function ProfilesPanel({ onEdit, storeId }) {
  const list = getProfiles(storeId)
  return (
    <div className="side-scroll">
      <div className="nav-sec">Profiles ({list.length})</div>
      {!list.length && (
        <p className="muted" style={{ padding: '4px 10px' }}>
          🧩 No profiles yet. Set everything up on a listing's edit page and
          press <b>⊞ Save as Profile</b> at the bottom — details, price, variations,
          shipping, materials and the profile part of the description are saved in it.
          Then apply it with one click in Launchpad or on the edit page.
        </p>
      )}
      {list.map((p) => (
        <button key={p.id} className="nav-item" title="Open profile (edit)" onClick={() => onEdit(p.id)}>
          🧩 <span className="ellip">{p.name}</span>
        </button>
      ))}
      {list.length > 0 && (
        <p className="muted" style={{ padding: '8px 10px', fontSize: 12 }}>
          Click a name to open the profile's full edit page.
        </p>
      )}
    </div>
  )
}

function Shell() {
  // when the edit page is open the left FILTER SIDEBAR hides (full-width edit, Vela-style)
  const [editFull, setEditFull] = useState(false)
  const [profEditId, setProfEditId] = useState(null)   // which profile is being edited
  const [pendingListing, setPendingListing] = useState(null)  // Launchpad → open the edit page of this Etsy listing
  const app = useApp()
  const [screen, setScreen] = useState('etsystore')     // Etsy Store is home now
  const [rail, setRail] = useState('listings')          // icon rail: which PANEL shows (listings | profiles)
  const [api, setApi] = useState({ state: 'checking' }) // backend health chip

  // ---- Etsy data lives HERE (shared by the sidebar menu + the screen) ----
  const [esState, setEsState] = useState('active')      // selected Status
  const [esFilt, setEsFilt] = useState({ sections: [], ships: [], rets: [], video: false })  // CHECKBOX filters — multi-select, kept even when the status changes
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

  // 🚀 Launchpad count = only PENDING listings (ones already sent to Etsy drop off)
  const lpCount = (app.ws.listings || []).filter((L) => !L.etsy?.listingId).length

  // sidebar row helpers
  // Status click: only the status changes — checked boxes stay as they are
  const pickState = (id) => { setEsState(id); setScreen('etsystore') }
  // checkbox toggle: add / remove the value in the list (multi-select, OR within a category)
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

  // "＋ Add shop" (at the bottom of the panel, Vela-style) — straight to Etsy grant-access
  const addShopBottom = async () => {
    try {
      const st = await app.addStore('New shop')
      CONNECTING_ID = st.id                 // cleanup must not touch it
      await app.selectStore(st.id)
      const r = await etsy.connectUrl(st.id)
      window.location.href = r.url
    } catch (e) { alert('⚠ ' + (e.message || e)) }
  }

  // GATE 1: must be logged in.
  if (app.ready && !app.authed) return <Landing />

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
    eff === 'listings' ? <Listings onOpenEtsyListing={(id) => { setPendingListing(String(id)); setRail('listings'); setScreen('etsystore') }} /> :
    eff === 'etsystore' ? <EtsyStore es={es} state={esState} filt={esFilt} onDeleted={onDeleted} onRefresh={() => loadIndex(true)} onCreate={() => setScreen('listings')} onEditing={setEditFull} openListing={pendingListing} onOpenedListing={() => setPendingListing(null)} /> :
    eff === 'profileedit' ? <ProfileEdit key={profEditId} id={profEditId} onBack={() => setScreen('etsystore')} /> :
    eff === 'account' ? <Account /> :
    <Placeholder title={current ? current.label : ''} />

  return (
    <div className="layout">
      {/* ==================== ICON RAIL (far left, Vela-style) ====================
          Icons only; the name appears on hover (native tooltip). */}
      <nav className="rail">
        {/* logo = HOME: selected shop's Active listings */}
        <button className="rail-logo" title="Nova Listing Manager — Active listings"
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

      {/* ==================== PANEL (second sidebar) — hidden on the edit page ==================== */}
      {!editFull && <aside className="sidebar">
        <ShopSwitcher app={app} screen={screen} go={setScreen} />

        {rail === 'profiles' ? (
          <ProfilesPanel storeId={app.curStoreId} onEdit={(pid) => { setProfEditId(pid); setScreen('profileedit') }} />
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

          {/* Nova Listing Manager — the workshop screens + Launchpad */}
          <div className="nav-sec">Nova Listing Manager</div>
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
            <span className="chip err">⚠ Server is waking up… please refresh in a moment</span>
          )}
          <button className="add-shop-btn" onClick={addShopBottom}>＋ Add shop</button>
        </div>
      </aside>}

      <main className="main">
        <div className="topbar">
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {current ? (eff === 'etsystore' ? current.label : `${current.icon} ${current.label}`) : ''}
            {/* refresh = round icon only, Vela-style (hover shows the time) */}
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
