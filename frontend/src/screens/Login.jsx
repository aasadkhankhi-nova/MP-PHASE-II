/**
 * Login.jsx — The first screen everyone sees (full-screen gate).
 * The app cannot be used without signing in; on success App.jsx
 * lets the user into the workspace.
 *
 * Three ways in:
 *  1. Sign in        — email + password (existing account)
 *  2. Create account — signup, then a 6-digit code arrives by email
 *                      and must be typed in the "verify" step below
 *  3. Google button  — one click, Google's own account picker opens,
 *                      no password needed in our app at all
 *
 * Auth itself happens on the backend (Supabase Auth behind /api/auth/*),
 * except Google which is a browser redirect through Supabase.
 */
import React, { useState } from 'react'
import { useApp } from '../store/AppState.jsx'
import { authLogin, authSignup, authVerify, authResend, googleSignInUrl, takeOAuthError } from '../api.js'

export default function Login() {
  const app = useApp()
  const [mode, setMode] = useState('in')   // 'in' = sign in, 'up' = create account, 'verify' = enter email code
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [code, setCode] = useState('')     // the 6-digit code from the email
  // If a Google login attempt just failed, show that error once.
  const [msg, setMsg] = useState(() => { const e = takeOAuthError(); return e ? '⚠ ' + e : null })
  const [busy, setBusy] = useState(false)  // disables buttons while a request runs

  // One handler for sign-in / signup; validates, calls the backend, reports errors.
  const go = async () => {
    setMsg(null); setBusy(true)
    try {
      if (!email.trim()) throw new Error('Email likhein')
      if (pass.length < 6) throw new Error('Password kam az kam 6 harf ka ho')
      if (mode === 'up') {
        const sess = await authSignup(email.trim(), pass)
        if (!sess) {
          // Supabase wants the email confirmed first -> show the code step
          setMode('verify')
          setMsg('✉️ 6-digit code aap ki email par bheja gaya hai (spam folder bhi check karein).')
          return
        }
        await app.loginDone(sess)
      } else {
        const sess = await authLogin(email.trim(), pass)
        await app.loginDone(sess)
      }
    } catch (e) {
      setMsg('⚠ ' + (e.message || e))
    } finally { setBusy(false) }
  }

  // "verify" step: check the typed code with the backend.
  const doVerify = async () => {
    setMsg(null); setBusy(true)
    try {
      if (code.trim().length < 6) throw new Error('Email wala 6-digit code likhein')
      const sess = await authVerify(email.trim(), code.trim())
      await app.loginDone(sess)   // correct code -> logged in straight away
    } catch (e) {
      setMsg('⚠ ' + (e.message || e))
    } finally { setBusy(false) }
  }

  // Send the verification email again (free plan: max ~2 emails/hour).
  const doResend = async () => {
    setMsg(null); setBusy(true)
    try {
      await authResend(email.trim())
      setMsg('✉️ Code dobara bhej diya gaya hai.')
    } catch (e) {
      setMsg('⚠ ' + (e.message || e))
    } finally { setBusy(false) }
  }

  // Google button: leave the page -> Google account picker -> come back logged in.
  // (main.jsx captures the returned token before the app renders.)
  const doGoogle = () => { window.location.href = googleSignInUrl() }

  return (
    <div className="login-gate">
      <div className="login-card">
        <div className="login-logo"><span className="login-badge-icon">MP</span> Mockup Platform <span className="login-badge">2.0</span></div>

        {mode === 'verify' ? (
          <>
            {/* ---- step 2 of signup: enter the code from the email ---- */}
            <p className="muted" style={{ marginTop: 4 }}>Email verify karein</p>
            <p className="muted" style={{ fontSize: 12.5 }}>{email} par code bheja gaya hai</p>
            <input placeholder="6-digit code" value={code} inputMode="numeric" maxLength={8}
              onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doVerify()} />
            <button className="btn" disabled={busy} onClick={doVerify} style={{ width: '100%', padding: '11px' }}>
              {busy ? '⏳ …' : 'Verify & Login'}
            </button>
            {msg && <p className="muted" style={{ marginTop: 10 }}>{msg}</p>}
            <p className="muted" style={{ marginTop: 12, textAlign: 'center' }}>
              Code nahi mila? <a className="lnk" onClick={doResend}>Resend code</a>
              {' · '}<a className="lnk" onClick={() => { setMode('in'); setMsg(null) }}>Back</a>
            </p>
          </>
        ) : (
          <>
            {/* ---- normal sign-in / create-account form ---- */}
            <p className="muted" style={{ marginTop: 4 }}>{mode === 'in' ? 'Sign in to your workspace' : 'Create your account'}</p>
            <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
            <input placeholder="Password" type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
            <button className="btn" disabled={busy} onClick={go} style={{ width: '100%', padding: '11px' }}>
              {busy ? '⏳ …' : mode === 'in' ? 'Sign in' : 'Create account'}
            </button>

            {/* divider between password login and Google login */}
            <div className="login-or"><span>ya</span></div>

            {/* Google one-click login (real Google account picker) */}
            <button className="btn-google" disabled={busy} onClick={doGoogle}>
              {/* Google's "G" logo drawn inline (no image download needed) */}
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continue with Google
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
          </>
        )}
      </div>
    </div>
  )
}
