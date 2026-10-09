/**
 * Landing.jsx — public front page (shown when nobody is signed in).
 * Explains what Design2List is (also the page Etsy reviews),
 * with "Log in" at the top right. Log in opens the normal Login form
 * in a panel that slides in from the right.
 */
import React, { useEffect, useState } from 'react'
import Login from './Login.jsx'

const STEPS = [
  ['Add your mockup photos', 'Upload your own blank product or model photos once and mark where a design sits — front, back, pocket or sleeve.'],
  ['Drop in a design', 'Add your artwork as a transparent PNG. Light and dark products each get the right version automatically.'],
  ['Review mockups & listing text', 'Mockups are placed for you and AI drafts the title, 13 tags and description. You check and edit everything.'],
  ['Send to Etsy as a draft', 'Your listing lands in your shop as a draft. It goes live only when you press Publish.'],
]

const FEATURES = [
  ['🖼️', 'Mockups on your photos', 'Your designs on your own model and product photos, with light and dark versions handled for you.'],
  ['📐', 'Placement editor', 'Draw print areas once per mockup — front, back, pocket, sleeve — and reuse them across a whole set.'],
  ['✍️', 'Listing writer', 'Title, 13 tags, description and alt text drafted in seconds — always as a draft you edit.'],
  ['🧩', 'Full listing editor', 'Variations (up to three), inventory, prices, personalization questions, photos and shipping in one place.'],
  ['📝', 'Draft first, you publish', 'Everything arrives on Etsy as a draft. Publishing is always your own click.'],
  ['🏪', 'A workspace per shop', 'Run several shops side by side — each connects through Etsy’s official sign-in and keeps its own mockups and designs.'],
]

const FAQ = [
  ['Does Etsy allow AI-written listing text?', 'Yes. Etsy asks sellers to describe their items honestly, and it’s your job to make sure the final text is accurate. That’s why Design2List only ever gives you a draft: you read it, edit it and decide what gets saved. If AI helped create the design itself, follow Etsy’s Creativity Standards and mark it in your listing settings.'],
  ['Do I need my own mockup photos?', 'Yes — Design2List works with your own photos, so your listings look like your brand. Upload the ones you shoot or have a license for, and they stay in your library for every future listing.'],
  ['Does it publish listings automatically?', 'Never. Design2List creates drafts. Nothing appears in your shop until you open the listing and press Publish yourself.'],
  ['How does it connect to my Etsy shop?', 'Through Etsy’s official sign-in (OAuth). You never give us your Etsy password, and you can disconnect at any time from Settings → Etsy or from your Etsy account under Settings → Apps.'],
  ['What does it set for “Who made it”?', 'For print-on-demand items the default is “Another company or person” (your production partner), as Etsy requires. You can change it per listing.'],
  ['Can I edit listings that are already live?', 'Yes. Open any listing from your shop to change the title, tags, prices, variations, personalization or photos, then save.'],
  ['Where do my files go?', 'Your mockups, designs and drafts are kept in your private cloud workspace so you can sign in from any device. Finished product photos stay in your browser until you send them to Etsy. We never sell or share your files.'],
  ['Can I use it for more than one shop?', 'Yes. Each shop gets its own workspace with its own mockups, designs and settings, and each one is connected separately through Etsy.'],
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
            <a href="#faq" onClick={go('faq')}>FAQ</a>
          </nav>
          <button className="btn lp-login" onClick={() => setOpen(true)}>Log in</button>
        </div>
      </header>

      <section className="lp-hero" id="top">
        <div className="lp-wrap lp-hero-in">
          <div>
            <span className="chip">For Etsy print-on-demand sellers</span>
            <h1>One design in. <em>Mockups and an Etsy listing</em> out.</h1>
            <p className="lp-sub">Upload a design once and get it on your own mockup photos, with the title, tags and description drafted for you. It lands in your Etsy shop as a draft — you review it and press Publish.</p>
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
          <p className="lp-lead">Four steps. Everything in your browser, on your own photos.</p>
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

      <section className="lp-sec" id="faq">
        <div className="lp-wrap">
          <h2>Questions sellers ask</h2>
          <div className="lp-faq">
            {FAQ.map(([q, a]) => (<details key={q}><summary>{q}</summary><p>{a}</p></details>))}
          </div>
        </div>
      </section>

      <section className="lp-sec lp-end">
        <div className="lp-wrap">
          <h2>Your next listing, in minutes.</h2>
          <button className="btn" onClick={() => setOpen(true)}>Log in</button>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="lp-foot-row">
            <span>© 2026 Design2List</span>
            <a href="privacy.html" target="_blank" rel="noreferrer">Terms &amp; Privacy</a>
            <a href="mailto:thenova.agencies@gmail.com">thenova.agencies@gmail.com</a>
          </div>
          <p>The term “Etsy” is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</p>
          <p>DISCLAIMER: THIS APPLICATION IS SOLELY PROVIDED BY DESIGN2LIST (THE “APPLICATION DEVELOPER”). ETSY, INC. AND ITS AFFILIATES ARE NOT THE APPLICATION DEVELOPER, DO NOT PROVIDE THIS APPLICATION OR ITS SERVICE, AND MAKE NO WARRANTIES OF ANY KIND ABOUT THIS APPLICATION OR ANY DATA ACCESSED THROUGH IT.</p>
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
