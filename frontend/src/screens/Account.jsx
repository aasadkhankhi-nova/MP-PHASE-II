/**
 * Account.jsx — Logged-in user's page (opens from the user chip at the
 * bottom of the sidebar): email, cloud-sync status, manual "Sync now",
 * Logout, CHANGE PASSWORD, and the backend URL setting.
 * (Login/signup itself happens on the Login screen — the app gate.)
 */
import React, { useState } from 'react'
import { useApp } from '../store/AppState.jsx'
import { authLogin, authSignup, authChangePassword, getApiBase, setApiBase, health, getGeminiKey, setGeminiKey } from '../api.js'

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
