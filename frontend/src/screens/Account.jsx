import React, { useState } from 'react'
import { useApp } from '../store/AppState.jsx'
import { authLogin, authSignup, getApiBase, setApiBase, health } from '../api.js'

export default function Account() {
  const app = useApp()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [apiUrl, setApiUrl] = useState(getApiBase())

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
          <p className="muted">
            Cloud sync: <b>{app.sync.state === 'ok' ? 'sab save hai ✅' : app.sync.state === 'pending' ? 'save ho raha…' : app.sync.state === 'pulling' ? 'load ho raha…' : app.sync.state === 'error' ? '⚠ error: ' + (app.sync.err || '') : 'idle'}</b>
            {app.sync.at ? ` · last: ${new Date(app.sync.at).toLocaleTimeString()}` : ''}
          </p>
          <p className="muted">Aap ke stores, mockups, designs aur listings ab cloud (Supabase) me save hote hain — kisi bhi device se login karein, sab wahin milega. (Generated photos abhi sirf isi browser me rehti hain.)</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" onClick={() => app.syncNow()}>↻ Sync now</button>
            <button className="btn danger" onClick={() => app.logout()}>Logout</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 460 }}>
          <h3 style={{ marginTop: 0 }}>👤 Login / Create account</h3>
          <p className="muted">Login karne se aap ka data cloud me save hota hai aur har device par milta hai. Baghair login ke bhi app chalta hai (sirf isi browser me).</p>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
          <input placeholder="Password (min 6)" type="password" value={pass} onChange={(e) => setPass(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={busy} onClick={() => doLogin(false)}>Login</button>
            <button className="btn ghost" disabled={busy} onClick={() => doLogin(true)}>Create account</button>
          </div>
        </div>
      )}
      {msg && <div className="card"><p className="muted" style={{ margin: 0 }}>{msg}</p></div>}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>⚙ Backend</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
          <button className="btn ghost" onClick={saveUrl}>Save & test</button>
        </div>
      </div>
    </>
  )
}
