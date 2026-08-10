import React, { useState } from 'react'
import { useApp } from '../store/AppState.jsx'
import { authLogin, authSignup } from '../api.js'

export default function Login() {
  const app = useApp()
  const [mode, setMode] = useState('in') // in | up
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setMsg(null); setBusy(true)
    try {
      if (!email.trim()) throw new Error('Email likhein')
      if (pass.length < 6) throw new Error('Password kam az kam 6 harf ka ho')
      if (mode === 'up') {
        const sess = await authSignup(email.trim(), pass)
        if (!sess) { setMsg('✉️ Email par confirmation link bheja gaya hai — confirm kar ke Sign in karein.'); setMode('in'); return }
        await app.loginDone(sess)
      } else {
        const sess = await authLogin(email.trim(), pass)
        await app.loginDone(sess)
      }
    } catch (e) {
      setMsg('⚠ ' + (e.message || e))
    } finally { setBusy(false) }
  }

  return (
    <div className="login-gate">
      <div className="login-card">
        <div className="login-logo"><span className="login-badge-icon">MP</span> Mockup Platform <span className="login-badge">2.0</span></div>
        <p className="muted" style={{ marginTop: 4 }}>{mode === 'in' ? 'Sign in to your workspace' : 'Create your account'}</p>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        <input placeholder="Password" type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        <button className="btn" disabled={busy} onClick={go} style={{ width: '100%', padding: '11px' }}>
          {busy ? '⏳ …' : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
        {msg && <p className="muted" style={{ marginTop: 10 }}>{msg}</p>}
        <p className="muted" style={{ marginTop: 12, textAlign: 'center' }}>
          {mode === 'in' ? (
            <>Naya user? <a className="lnk" onClick={() => { setMode('up'); setMsg(null) }}>Create account</a></>
          ) : (
            <>Account hai? <a className="lnk" onClick={() => { setMode('in'); setMsg(null) }}>Sign in</a></>
          )}
        </p>
        <p className="muted" style={{ marginTop: 6, textAlign: 'center', fontSize: 12 }}>
          Real accounts — kisi bhi device se sign in karein, aap ka data cloud me hai.
        </p>
      </div>
    </div>
  )
}
