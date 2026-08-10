/**
 * Seo.jsx — AI SEO for each listing (title, tags, description, ALT).
 * The design images are sent to OUR BACKEND, which calls Google Gemini.
 * The Gemini API key lives ONLY on the server — never in the browser.
 * Results are saved on the listing (and cloud-synced with it).
 */
import React, { useState } from 'react'
import { useApp } from '../store/AppState.jsx'
import { getApiBase, setApiBase, health, genSeo } from '../api.js'
import { Empty } from '../components/ui.jsx'

export default function Seo() {
  const app = useApp()
  const [apiUrl, setApiUrl] = useState(getApiBase())  // backend URL (rarely changed)
  const [test, setTest] = useState(null)
  const [busyId, setBusyId] = useState(null)          // which listing is generating
  const [err, setErr] = useState(null)

  // Save + ping the backend so the user can verify the connection.
  const saveUrl = async () => {
    setApiBase(apiUrl)
    setTest('⏳')
    try {
      const h = await health()
      setTest(`✅ Connected — db: ${h.db}`)
    } catch (e) {
      setTest('❌ ' + (e.message || e))
    }
  }

  // Send up to 3 design images (base64) + category/keywords to the backend.
  const run = async (L) => {
    setErr(null)
    setBusyId(L.id)
    try {
      const designs = app.ws.designs.filter((d) => L.designIds.includes(d.id))
      if (!designs.length) throw new Error('Listing me koi design select nahi hai')
      const images = designs.slice(0, 3).map((d) => d.dataUrl.split(',')[1])
      const r = await genSeo({ images, category: L.category || 'Canvas Wall Art', keywords: L.keywords || '' })
      await app.updListing(L.id, { seo: r.seo })
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusyId(null)
    }
  }

  const copy = (t) => navigator.clipboard.writeText(t)

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>⚙ Backend connection</h3>
        <p className="muted">Default set hai; sirf tab badlein jab backend ka address badle.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} style={{ flex: 1, minWidth: 260 }} placeholder="https://mp-backend.onrender.com" />
          <button className="btn" onClick={saveUrl}>Save & test</button>
        </div>
        {test && <p className="muted" style={{ marginTop: 8 }}>{test}</p>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>✨ Etsy SEO (Gemini — server-side)</h3>
        <p className="muted">Har listing ke designs dekh kar AI title, tags, description aur ALT banata hai.</p>
        {err && <p className="muted" style={{ color: 'var(--err)' }}>⚠ {err}</p>}
      </div>

      {/* one card per listing with a Generate/Regenerate button */}
      {app.ws.listings.map((L) => (
        <div key={L.id} className="card">
          <div className="topbar" style={{ margin: 0 }}>
            <b>{L.name} <span className="chip">{L.designIds.length} designs</span></b>
            <button className="btn sm" disabled={busyId === L.id} onClick={() => run(L)}>
              {busyId === L.id ? '⏳ Generating…' : L.seo ? '↻ Regenerate' : '✨ Generate SEO'}
            </button>
          </div>
          {L.seo && (
            <div style={{ marginTop: 12 }}>
              <SeoField label="Title" value={L.seo.title} onCopy={copy} />
              <SeoField label="Tags" value={(L.seo.tags || []).join(', ')} onCopy={copy} />
              <SeoField label="Description" value={L.seo.description} onCopy={copy} multi />
              <SeoField label="ALT text" value={L.seo.alt} onCopy={copy} multi />
            </div>
          )}
        </div>
      ))}
      {!app.ws.listings.length && <Empty>Pehle Listings screen par listing banayein.</Empty>}
    </>
  )
}

/** One labeled read-only field with a Copy button (input or textarea). */
function SeoField({ label, value, onCopy, multi }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="topbar" style={{ margin: '0 0 4px' }}>
        <span className="muted" style={{ fontWeight: 600 }}>{label}</span>
        <button className="btn sm ghost" onClick={() => onCopy(value || '')}>📋 Copy</button>
      </div>
      {multi ? (
        <textarea readOnly value={value || ''} rows={3} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: 8, fontSize: 13 }} />
      ) : (
        <input readOnly value={value || ''} style={{ width: '100%' }} />
      )}
    </div>
  )
}
