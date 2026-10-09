/**
 * Login.jsx — The first screen everyone sees (full-screen gate).
 * The app cannot be used without signing in; on success App.jsx
 * lets the user into the workspace.
 *
 * Three ways in:
 *  1. Sign in        — email + password (existing account)
 *  2. Create account — full form: first/last name, date of birth,
 *                      email, password + confirm, "I accept the Terms"
 *                      checkbox (with the Terms document in a popup).
 *                      Then a confirmation email arrives; clicking its
 *                      link brings the user back, already logged in.
 *  3. Google button  — one click, Google's own account picker opens,
 *                      no password needed in our app at all
 *
 * Bot protection: Cloudflare Turnstile (Supabase's supported captcha).
 * It only appears when TURNSTILE_SITE_KEY is set in api.js — until then
 * the forms work without it, so nothing breaks before setup.
 *
 * Auth itself happens on the backend (Supabase Auth behind /api/auth/*),
 * except Google which is a browser redirect through Supabase.
 */
import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../store/AppState.jsx'
import { authLogin, authSignup, authResend, googleSignInUrl, takeOAuthError, TURNSTILE_SITE_KEY } from '../api.js'

export default function Login({ embedded = false }) {
  const app = useApp()
  const [mode, setMode] = useState('in')   // 'in' = sign in, 'up' = create account, 'verify' = check email
  const [first, setFirst] = useState('')   // signup: first name
  const [last, setLast] = useState('')     // signup: last name
  const [dob, setDob] = useState('')       // signup: date of birth
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')   // signup: confirm password
  const [accept, setAccept] = useState(false) // signup: "I accept the Terms"
  const [showTerms, setShowTerms] = useState(false)
  const [capToken, setCapToken] = useState('') // Turnstile token (empty if captcha off)
  // If a Google login attempt just failed, show that error once.
  const [msg, setMsg] = useState(() => { const e = takeOAuthError(); return e ? '⚠ ' + e : null })
  const [busy, setBusy] = useState(false)  // disables buttons while a request runs

  // One handler for sign-in / signup; validates, calls the backend, reports errors.
  const go = async () => {
    setMsg(null); setBusy(true)
    try {
      if (!email.trim()) throw new Error('Please enter your email')
      if (pass.length < 6) throw new Error('Password must be at least 6 characters')
      if (mode === 'up') {
        // ---- extra checks only for account creation ----
        if (!first.trim()) throw new Error('Please enter your first name')
        if (!last.trim()) throw new Error('Please enter your last name')
        if (!dob) throw new Error('Please select your date of birth')
        const age = (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000)
        if (!(age >= 18)) throw new Error('You must be at least 18 years old to create an account')
        if (pass !== pass2) throw new Error('Passwords do not match')
        if (!accept) throw new Error('Please accept the Terms (tick the checkbox)')

        const meta = { first_name: first.trim(), last_name: last.trim(), full_name: `${first.trim()} ${last.trim()}`, dob }
        const sess = await authSignup(email.trim(), pass, meta, capToken)
        if (!sess) { setMode('verify'); setMsg(null); return }  // email confirmation step
        await app.loginDone(sess)
      } else {
        const sess = await authLogin(email.trim(), pass, capToken)
        await app.loginDone(sess)
      }
    } catch (e) {
      setMsg('⚠ ' + (e.message || e))
    } finally { setBusy(false) }
  }

  // Send the verification email again (free plan: max ~2 emails/hour).
  const doResend = async () => {
    setMsg(null); setBusy(true)
    try { await authResend(email.trim()); setMsg('✉️ Verification email sent again.') }
    catch (e) { setMsg('⚠ ' + (e.message || e)) }
    finally { setBusy(false) }
  }

  // Google button: leave the page -> Google account picker -> come back logged in.
  const doGoogle = () => { window.location.href = googleSignInUrl() }

  const up = mode === 'up'
  return (
    <div className={embedded ? 'login-embed' : 'login-gate'}>
      <div className="login-card">
        <div className="login-logo"><span className="login-badge-icon">✈</span> Design2List</div>
        <p className="muted" style={{ margin: '2px 0 0', fontSize: 12.5 }}>One design in. An Etsy listing out.</p>

        {mode === 'verify' ? (
          <>
            {/* ---- step 2 of signup: confirm via the link in the email ---- */}
            <p className="muted" style={{ marginTop: 10 }}>Check your email 📬</p>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
              We sent a confirmation email to <b>{email}</b>.
              Click the <b>"Confirm email address"</b> link in it and
              you will be signed in automatically. (Please check your spam folder too.)
            </p>
            {msg && <p className="muted" style={{ marginTop: 10 }}>{msg}</p>}
            <p className="muted" style={{ marginTop: 12, textAlign: 'center' }}>
              Didn't get the email? <a className="lnk" onClick={doResend}>Resend email</a>
              {' · '}<a className="lnk" onClick={() => { setMode('in'); setMsg(null) }}>Back</a>
            </p>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 10 }}>{up ? 'Create your account' : 'Sign in to your workspace'}</p>

            {/* ---- signup-only fields ---- */}
            {up && (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="First name" value={first} onChange={(e) => setFirst(e.target.value)} style={{ flex: 1 }} />
                  <input placeholder="Last name" value={last} onChange={(e) => setLast(e.target.value)} style={{ flex: 1 }} />
                </div>
                <label className="muted" style={{ fontSize: 12, display: 'block', margin: '6px 2px 0' }}>Date of birth</label>
                <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              </>
            )}

            <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !up && go()} />
            <input placeholder="Password" type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !up && go()} />
            {up && (
              <>
                <input placeholder="Confirm password" type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
                {/* Terms acceptance — required before the button works */}
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '8px 2px', fontSize: 12.5, cursor: 'pointer' }} className="muted">
                  <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>I accept the <a className="lnk" onClick={(e) => { e.preventDefault(); setShowTerms(true) }}>Terms of Service & Privacy Policy</a></span>
                </label>
              </>
            )}

            {/* bot check — renders only when a Turnstile site key is configured */}
            <Captcha onToken={setCapToken} />

            <button className="btn" disabled={busy || (up && !accept)} onClick={go} style={{ width: '100%', padding: '11px' }}>
              {busy ? '⏳ …' : up ? 'Create account' : 'Sign in'}
            </button>

            {/* divider between password login and Google login */}
            <div className="login-or"><span>or</span></div>

            {/* Google one-click login (real Google account picker) */}
            <button className="btn-google" disabled={busy} onClick={doGoogle}>
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
              {up ? (
                <>Already have an account? <a className="lnk" onClick={() => { setMode('in'); setMsg(null) }}>Sign in</a></>
              ) : (
                <>New here? <a className="lnk" onClick={() => { setMode('up'); setMsg(null) }}>Create account</a></>
              )}
            </p>
            <p className="muted" style={{ marginTop: 6, textAlign: 'center', fontSize: 12 }}>
              Real accounts — sign in from any device, your data is saved in the cloud.
            </p>
          </>
        )}
        {/* Required by the Etsy API Terms of Use */}
        <p className="etsy-disclaimer">
          The term "Etsy" is a trademark of Etsy, Inc. This application uses the Etsy API
          but is not endorsed or certified by Etsy, Inc.
        </p>
      </div>

      {/* Terms & Privacy popup */}
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
    </div>
  )
}

/**
 * Cloudflare Turnstile widget (Supabase's supported captcha).
 * Renders nothing while TURNSTILE_SITE_KEY is empty — so the app works
 * normally before captcha is set up. When the key is set, the widget
 * checks the visitor silently and gives us a token; the backend passes
 * that token to Supabase which verifies it with Cloudflare.
 */
function Captcha({ onToken }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !ref.current) return
    const render = () => {
      if (window.turnstile && ref.current && !ref.current.dataset.done) {
        ref.current.dataset.done = '1'
        window.turnstile.render(ref.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: onToken,
          'expired-callback': () => onToken(''),
        })
      }
    }
    if (window.turnstile) { render(); return }
    // load Cloudflare's script once
    let s = document.getElementById('cf-turnstile')
    if (!s) {
      s = document.createElement('script')
      s.id = 'cf-turnstile'
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
      s.async = true
      document.head.appendChild(s)
    }
    s.addEventListener('load', render)
    return () => s.removeEventListener('load', render)
  }, [onToken])
  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={ref} style={{ margin: '8px 0' }} />
}

/** The Terms of Service & Privacy Policy document (simple English). */
function TermsModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Design2List — Terms of Service & Privacy Policy</h2>
        <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.7 }}>
          <p><b>1. The service.</b> Design2List helps you create product listings from your own designs: it places them on your mockup photos, drafts listing text with AI for you to review, and sends draft listings to the Etsy shop you connect through Etsy's official sign-in. It never copies other shops' listings or designs, and nothing is published until you press Publish. The service is provided "as is", without warranties.</p>
          <p><b>2. Your account.</b> You must be at least 18 years old. Keep your password safe — you are responsible for activity on your account.</p>
          <p><b>3. Your content.</b> The designs and photos you upload remain yours. You confirm you have the rights to use them, and that they do not break any law or any third party's rights (for example copyrighted or trademarked artwork).</p>
          <p><b>4. Your data.</b> Your account details and workspace data (stores, mockups, designs, listings) are stored securely in our cloud database so you can sign in from any device. We do not sell your data. Third-party services we use to run the app: Supabase (database & login), Render (server), GitHub Pages (website), Google (optional sign-in and AI SEO), Cloudflare (bot protection), and Etsy (only if you connect your shop).</p>
          <p><b>5. API keys & Etsy.</b> If you add your own AI key, it stays in your browser only. If you connect Etsy, we store the connection tokens securely and only use them for the actions you start (like sending a draft listing). Publishing on Etsy is always your final decision, and Etsy's own fees and policies apply there.</p>
          <p><b>6. Fair use.</b> Do not misuse the service (no bots, no attacks, no illegal content). We may suspend accounts that break these rules.</p>
          <p><b>7. Changes & contact.</b> We may update these terms; big changes will be announced in the app. Support, questions or account deletion: thenova.agencies@gmail.com.</p>
          <p><b>8. Etsy.</b> The term "Etsy" is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</p>
          <p style={{ fontSize: 12 }}>DISCLAIMER: THIS APPLICATION IS SOLELY PROVIDED BY DESIGN2LIST (THE "APPLICATION DEVELOPER"). ETSY, INC. AND ITS AFFILIATES ARE NOT THE APPLICATION DEVELOPER, DO NOT PROVIDE THIS APPLICATION OR ITS SERVICE, AND MAKE NO WARRANTIES OF ANY KIND ABOUT THIS APPLICATION OR ANY DATA ACCESSED THROUGH IT.</p>
        </div>
        <button className="btn" onClick={onClose} style={{ marginTop: 10 }}>Close</button>
      </div>
    </div>
  )
}
