/**
 * Landing.jsx — public front page (shown when nobody is signed in).
 * Explains what Design2List is (also the page Etsy reviews),
 * with "Log in" at the top right. Log in opens the normal Login form
 * in a panel that slides in from the right.
 */
import React, { useEffect, useState } from 'react'
import Login from './Login.jsx'

const STEPS = [
  ['Add mockup photos', 'Upload our own blank product photos once and mark where a design sits — front, back, pocket or sleeve.'],
  ['Drop in a design', 'Our designers’ artwork goes in as transparent PNGs, tagged for light or dark products.'],
  ['Review mockups & text', 'Mockups are placed automatically and AI drafts the title, 13 tags and description. A team member checks and edits everything.'],
  ['Send as a draft, then publish', 'The listing goes to Etsy as a draft. Nothing goes live until a person presses Publish.'],
]

const FEATURES = [
  ['🖼️', 'Mockups on our photos', 'Designs are placed on our own model and product photos, with light and dark versions handled automatically.'],
  ['📐', 'Placement editor', 'Draw print areas once per mockup — front, back, pocket, sleeve — and reuse them across a whole set.'],
  ['✍️', 'SEO drafts for review', 'Title, tags, description and alt text are drafted for a person to review and edit before anything is saved.'],
  ['🧩', 'Full listing editor', 'Variations (up to three), inventory, prices, personalization questions, photos and shipping — in one place.'],
  ['📝', 'Draft-first publishing', 'Listings are created as drafts on Etsy. Publishing is always a manual, one-listing-at-a-time decision.'],
  ['🏪', 'One workspace per shop', 'Each shop we own or manage has its own workspace, connected through Etsy’s official sign-in.'],
]

const RULES = [
  'Shops connect only through Etsy’s official OAuth sign-in; tokens stay on our server.',
  'Only designs made by our own designers — we never copy, scrape or reuse other shops’ listings, photos or designs.',
  'Every listing starts as a draft and is reviewed by a person before it is published.',
  'Listing creation is rate-limited per shop, and we request only the permissions the tool needs.',
  'A shop can be disconnected at any time, which deletes its tokens.',
]

const FAQ = [
  ['Who uses Design2List?', 'It is the internal tool of Nova Agencies. Accounts are for our team and for clients whose shops we manage with their permission.'],
  ['Does it publish listings automatically?', 'No. It only creates drafts. A team member reviews each listing and presses Publish.'],
  ['Does it copy other sellers’ listings?', 'No. It works only with our own designs and our own mockup photos, and it can only copy listings inside the same connected shop.'],
  ['What happens to shop data?', 'Etsy data is used only for the actions a user starts (loading, editing, drafting, publishing). See our Terms & Privacy page for details.'],
  ['How do I disconnect a shop?', 'In Settings → Etsy, press Disconnect — or remove the app in your Etsy account under Settings → Apps.'],
]

export default function Landing() {
  // open the login panel straight away when coming back from Google / an email link
  const [open, setOpen] = useState(() => {
    try {
      return !!localStorage.getItem('mp_oauth_err') || /access_token|error|type=signup|type=recovery|login/.test(window.location.hash + window.location.search)
    } catch { return false }
  })
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  const go = (id) => (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }

  return (
    <div className="lp">
      <header className="lp-head">
        <div className="lp-wrap lp-head-in">
          <a className="lp-brand" href="#top" onClick={go('top')}><span className="login-badge-icon">✈</span> Design2List</a>
          <nav className="lp-nav">
            <a href="#how" onClick={go('how')}>How it works</a>
            <a href="#features" onClick={go('features')}>Features</a>
            <a href="#rules" onClick={go('rules')}>Etsy rules</a>
            <a href="#faq" onClick={go('faq')}>FAQ</a>
          </nav>
          <button className="btn lp-login" onClick={() => setOpen(true)}>Log in</button>
        </div>
      </header>

      <section className="lp-hero" id="top">
        <div className="lp-wrap lp-hero-in">
          <div>
            <span className="chip">Internal tool of Nova Agencies</span>
            <h1>One design in. <em>Mockups and a reviewed Etsy draft</em> out.</h1>
            <p className="lp-sub">Our designers’ artwork goes onto our own mockup photos, the listing text is drafted for a person to review, and the listing is sent to our Etsy shops as a draft. A team member always presses Publish.</p>
            <div className="lp-cta">
              <button className="btn" onClick={() => setOpen(true)}>Log in</button>
              <a className="btn ghost" href="#how" onClick={go('how')}>See how it works</a>
            </div>
          </div>
          <div className="lp-shot" aria-hidden="true">
            <div className="lp-shot-row">
              <div className="lp-tile t1"><span>Design</span></div>
              <div className="lp-arrow">→</div>
              <div className="lp-tile t2"><i></i><span>Mockup</span></div>
              <div className="lp-tile t3"><i></i><span>Mockup</span></div>
            </div>
            <div className="lp-listing">
              <div className="lp-l-img"></div>
              <div className="lp-l-txt">
                <b>Cozy Cat Mom Shirt, Gift for Cat Lover</b>
                <div className="lp-tags"><span>cat mom</span><span>cat lover gift</span><span>+11 tags</span></div>
                <div className="lp-l-foot"><span className="chip">Draft</span><span className="lp-pub">Publish</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="how">
        <div className="lp-wrap">
          <h2>How it works</h2>
          <p className="lp-lead">Four steps, everything in the browser, on our own photos.</p>
          <div className="lp-steps">
            {STEPS.map(([t, d], i) => (
              <div className="lp-step" key={t}><div className="lp-num">{i + 1}</div><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec alt" id="features">
        <div className="lp-wrap">
          <h2>What’s inside</h2>
          <div className="lp-feats">
            {FEATURES.map(([ic, t, d]) => (
              <div className="lp-feat" key={t}><div className="lp-ic">{ic}</div><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec" id="rules">
        <div className="lp-wrap lp-rules">
          <div>
            <h2>Built to follow Etsy’s rules</h2>
            <p className="lp-lead">Design2List uses the official Etsy Open API v3 and is designed around Etsy’s API Terms of Use.</p>
          </div>
          <ul>{RULES.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      </section>

      <section className="lp-sec alt" id="faq">
        <div className="lp-wrap">
          <h2>Questions</h2>
          <div className="lp-faq">
            {FAQ.map(([q, a]) => (<details key={q}><summary>{q}</summary><p>{a}</p></details>))}
          </div>
        </div>
      </section>

      <section className="lp-sec lp-end">
        <div className="lp-wrap">
          <h2>Ready to work on today’s listings?</h2>
          <button className="btn" onClick={() => setOpen(true)}>Log in</button>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="lp-foot-row">
            <span>© 2026 Nova Agencies</span>
            <a href="privacy.html" target="_blank" rel="noreferrer">Terms &amp; Privacy</a>
            <a href="mailto:thenova.agencies@gmail.com">thenova.agencies@gmail.com</a>
          </div>
          <p>The term “Etsy” is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</p>
          <p>DISCLAIMER: THIS APPLICATION IS SOLELY PROVIDED BY NOVA AGENCIES (THE “APPLICATION DEVELOPER”). ETSY, INC. AND ITS AFFILIATES ARE NOT THE APPLICATION DEVELOPER, DO NOT PROVIDE THIS APPLICATION OR ITS SERVICE, AND MAKE NO WARRANTIES OF ANY KIND ABOUT THIS APPLICATION OR ANY DATA ACCESSED THROUGH IT.</p>
        </div>
      </footer>

      {open && <div className="lp-scrim" onClick={() => setOpen(false)} />}
      <aside className={'lp-drawer' + (open ? ' open' : '')} aria-hidden={!open}>
        <button className="lp-x" onClick={() => setOpen(false)} aria-label="Close">×</button>
        {open && <Login embedded />}
      </aside>
    </div>
  )
}
