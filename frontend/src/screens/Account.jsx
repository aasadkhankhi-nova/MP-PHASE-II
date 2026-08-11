/**
 * Account.jsx — the SETTINGS page (opens from the user chip at the
 * bottom of the sidebar). Everything "behind the scenes" lives here:
 *   - user info, cloud-sync status, Sync now, Logout
 *   - STORES: create / rename / delete (switching is the sidebar dropdown)
 *   - Change password
 *   - API key (Gemini, for the SEO part of Create listing)
 *   - Backend URL (hidden developer setting)
 * (Login/signup itself happens on the Login screen — the app gate.)
 */
import React, { useState, useEffect } from 'react'
import { useApp } from '../store/AppState.jsx'
import Stores from './Stores.jsx'
import { authLogin, authSignup, authChangePassword, getApiBase, setApiBase, health, getGeminiKey, setGeminiKey, etsy } from '../api.js'

export default function Account() {
  const app = useApp()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [apiUrl, setApiUrl] = useState(getApiBase())

  // Fallback login form (normally the Login gate handles this).
  const doLogin = async (signup) => {
    setMsg(null); setBusy(true)
    try {
      if (!email.trim() || pass.length < 6) throw new Error('Email aur kam az kam 6-harfi password likhein')
      const sess = signup ? await authSignup(email.trim(), pass) : await authLogin(email.trim(), pass)
      if (!sess) { setMsg('✉️ Email par confirmation link gaya hai — confirm kar ke phir Login dabayein.'); return }
      await app.loginDone(sess)
      setMsg('✅ Login ho gaya — cloud sync ON')
    } catch (e) {
      setMsg('⚠ ' + (e.message || e))
    } finally { setBusy(false) }
  }

  const saveUrl = async () => {
    setApiBase(apiUrl); setMsg('⏳ testing…')
    try { const h = await health(); setMsg(`✅ Backend: db ${h.db} · auth ${h.auth} · storage ${h.storage}`) }
    catch (e) { setMsg('⚠ ' + e.message) }
  }

  return (
    <>
      {app.authed ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>👤 {app.session.user.email}</h3>
          {/* live sync status — mirrors the ☁ chip in the top bar */}
          <p className="muted">
            Cloud sync: <b>{app.sync.state === 'ok' ? 'sab save hai ✅' : app.sync.state === 'pending' ? 'save ho raha…' : app.sync.state === 'pulling' ? 'load ho raha…' : app.sync.state === 'error' ? '⚠ error: ' + (app.sync.err || '') : 'idle'}</b>
            {app.sync.at ? ` · last: ${new Date(app.sync.at).toLocaleTimeString()}` : ''}
          </p>
          <p className="muted">Stores, mockups, designs aur listings cloud (Supabase) me save hote hain — kisi bhi device se login karein, sab wahin milega. (Generated photos sirf isi browser me rehti hain.)</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" onClick={() => app.syncNow()}>↻ Sync now</button>
            <button className="btn danger" onClick={() => app.logout()}>Logout</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 460 }}>
          <h3 style={{ marginTop: 0 }}>👤 Login / Create account</h3>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
          <input placeholder="Password (min 6)" type="password" value={pass} onChange={(e) => setPass(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={busy} onClick={() => doLogin(false)}>Login</button>
            <button className="btn ghost" disabled={busy} onClick={() => doLogin(true)}>Create account</button>
          </div>
        </div>
      )}
      {msg && <div className="card"><p className="muted" style={{ margin: 0 }}>{msg}</p></div>}

      {/* ---- STORES management (create / rename / delete) lives in Settings.
           Day-to-day store SWITCHING is the dropdown at the top of the sidebar. ---- */}
      {app.authed && <Stores />}

      {/* ---- Etsy connection for the CURRENT store ---- */}
      {app.authed && app.curStoreId && <EtsyConnect storeId={app.curStoreId} storeName={app.curStore?.name} />}

      {/* ---- security: change password (only when logged in) ---- */}
      {app.authed && <ChangePassword />}

      {/* ---- user's own AI key for the SEO feature ---- */}
      {app.authed && <ApiKeys />}

      {/* ---- Backend URL: DEVELOPER-ONLY setting, hidden from normal users.
           The correct address is built into the app, so nobody needs this.
           To reveal it (e.g. if the backend ever moves), open the browser
           console and run:  localStorage.setItem('mp_dev','1')  then refresh. ---- */}
      {localStorage.getItem('mp_dev') === '1' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>⚙ Backend (developer)</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
            <button className="btn ghost" onClick={saveUrl}>Save & test</button>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * API-keys card. Each user pastes their OWN Google Gemini key here
 * (free from https://aistudio.google.com/apikey). The key is saved only
 * in this browser's localStorage — our server and database never store it;
 * it just travels along with each SEO request.
 */
function ApiKeys() {
  const [key, setKey] = useState(getGeminiKey())
  const [kMsg, setKMsg] = useState(null)

  const save = () => {
    setGeminiKey(key)
    setKMsg(key.trim() ? '✅ Key save ho gayi (sirf is browser me)' : '🗑 Key hata di gayi')
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3 style={{ marginTop: 0 }}>🔑 API key (SEO ke liye)</h3>
      <p className="muted">
        SEO feature aap ki apni (free) Google Gemini key se chalta hai.
        Key yahan se banayein: <a className="lnk" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>
        {' '}— phir neeche paste karein. Ye key sirf aap ke browser me save hoti hai, hamare server par store nahi hoti.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="Gemini API key (AIza…)" type="password" value={key} onChange={(e) => setKey(e.target.value)} style={{ flex: 1, minWidth: 260 }} />
        <button className="btn" onClick={save}>Save</button>
      </div>
      {kMsg && <p className="muted" style={{ marginTop: 8 }}>{kMsg}</p>}
    </div>
  )
}

/**
 * Change-password card. Asks for the new password twice (to catch typos),
 * then calls the backend which updates it in Supabase Auth.
 * Note for Google users: setting a password here ALSO lets them sign in
 * with email+password later — both methods then work on the same account.
 */
function ChangePassword() {
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [pMsg, setPMsg] = useState(null)
  const [pBusy, setPBusy] = useState(false)

  const change = async () => {
    setPMsg(null); setPBusy(true)
    try {
      if (p1.length < 6) throw new Error('Password kam az kam 6 harf ka ho')
      if (p1 !== p2) throw new Error('Dono passwords match nahi karte')
      await authChangePassword(p1)
      setP1(''); setP2('')
      setPMsg('✅ Password change ho gaya')
    } catch (e) {
      setPMsg('⚠ ' + (e.message || e))
    } finally { setPBusy(false) }
  }

  return (
    <div className="card" style={{ maxWidth: 460 }}>
      <h3 style={{ marginTop: 0 }}>🔒 Change password</h3>
      <input placeholder="Naya password (min 6)" type="password" value={p1} onChange={(e) => setP1(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
      <input placeholder="Naya password dobara" type="password" value={p2} onChange={(e) => setP2(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && change()} style={{ width: '100%', marginBottom: 10 }} />
      <button className="btn" disabled={pBusy} onClick={change}>{pBusy ? '⏳ …' : 'Change password'}</button>
      {pMsg && <p className="muted" style={{ marginTop: 10 }}>{pMsg}</p>}
    </div>
  )
}

/**
 * Etsy-connection card for the currently selected store.
 * "Connect Etsy" sends the browser to Etsy's own permission page;
 * after Allow, the backend saves the tokens and brings the user back.
 * Once connected we show the shop name + a peek at its listings.
 */
function EtsyConnect({ storeId, storeName }) {
  const [st, setSt] = useState(null)        // {connected, shop, keyReady}
  const [lst, setLst] = useState(null)      // peek at shop listings
  const [eMsg, setEMsg] = useState(null)
  const [eBusy, setEBusy] = useState(false)

  // load connection status whenever the selected store changes
  useEffect(() => {
    setSt(null); setLst(null); setEMsg(null)
    etsy.status(storeId).then(setSt).catch((e) => setEMsg('⚠ ' + e.message))
    // show the "connected!" note if we just came back from Etsy
    const h = window.location.hash || ''
    if (h.startsWith('#etsy=')) {
      const v = decodeURIComponent(h.slice(6))
      setEMsg(v.startsWith('connected:') ? '✅ Etsy connect ho gaya: ' + v.slice(10) : '⚠ ' + v.replace(/^error:/, ''))
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [storeId])

  const connect = async () => {
    setEBusy(true); setEMsg(null)
    try {
      const r = await etsy.connectUrl(storeId)
      window.location.href = r.url          // -> Etsy permission page
    } catch (e) { setEMsg('⚠ ' + e.message); setEBusy(false) }
  }

  const disconnect = async () => {
    if (!confirm('Etsy connection hatana hai? (Data delete nahi hota, sirf link tootta hai)')) return
    await etsy.disconnect(storeId)
    setSt({ ...st, connected: false, shop: null }); setLst(null)
  }

  const peek = async () => {
    setEBusy(true); setEMsg(null)
    try { setLst(await etsy.listings(storeId, 'active')) }
    catch (e) { setEMsg('⚠ ' + e.message) }
    finally { setEBusy(false) }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>🛍️ Etsy — {storeName || 'store'}</h3>
      {!st && !eMsg && <p className="muted">⏳ checking…</p>}
      {st && !st.keyReady && (
        <p className="muted">Etsy integration abhi taiyar ho rahi hai (server par Etsy API key set hone ka intezar).</p>
      )}
      {st && st.keyReady && !st.connected && (
        <>
          <p className="muted">Is store ko apni Etsy shop se jorein — phir listings seedha Etsy par draft ban kar jayengi.</p>
          <button className="btn" disabled={eBusy} onClick={connect}>🔗 Connect Etsy</button>
        </>
      )}
      {st && st.connected && (
        <>
          <p className="muted">✅ Connected: <b>{st.shop?.shop_name}</b> <span className="chip ok">shop #{st.shop?.shop_id}</span></p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn ghost" disabled={eBusy} onClick={peek}>👀 Shop listings dekhein</button>
            <button className="btn danger" onClick={disconnect}>Disconnect</button>
          </div>
          {lst && (
            <div style={{ marginTop: 10 }}>
              <p className="muted"><b>{lst.count}</b> active listings{lst.listings.length ? ' — pehli ' + lst.listings.length + ':' : ''}</p>
              {lst.listings.map((l) => (
                <p key={l.id} className="muted" style={{ margin: '3px 0' }}>• {l.title} <span className="chip">{l.state}</span></p>
              ))}
            </div>
          )}
        </>
      )}
      {eMsg && <p className="muted" style={{ marginTop: 8 }}>{eMsg}</p>}
    </div>
  )
}
