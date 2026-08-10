/**
 * Results.jsx — All generated photos from every listing, in one place.
 * Single downloads + "Download all" as a ZIP (folder per listing).
 * NOTE: outputs live only in this browser (IndexedDB) — they are large,
 * so they are not cloud-synced. The ZIP is the way to take them out.
 */
import React, { useState } from 'react'
import { useApp } from '../store/AppState.jsx'
import { Empty } from '../components/ui.jsx'

export default function Results() {
  const app = useApp()
  const [busy, setBusy] = useState(false)
  // flatten: every output of every listing, remembering its listing name
  const all = app.ws.listings.flatMap((L) => (L.outputs || []).map((o) => ({ ...o, listing: L.name })))

  // Build one ZIP with a folder per listing. jszip is lazy-loaded
  // (dynamic import) so the main app bundle stays small.
  const zipAll = async () => {
    if (!all.length) return
    setBusy(true)
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      for (const o of all) {
        const b64 = o.dataUrl.split(',')[1]
        zip.file(`${o.listing}/${o.name}.jpg`, b64, { base64: true })
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'mp-outputs.zip'
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card">
        <div className="topbar" style={{ margin: 0 }}>
          <h3 style={{ margin: 0 }}>📦 All results <span className="chip">{all.length}</span></h3>
          <button className="btn" disabled={busy || !all.length} onClick={zipAll}>{busy ? '⏳ Zipping…' : '⬇ Download all (ZIP)'}</button>
        </div>
      </div>
      <div className="grid">
        {all.map((o, i) => (
          <div key={i} className="card item-card">
            <div className="thumb"><img src={o.dataUrl} alt={o.name} /></div>
            <b className="ellip">{o.name}</b>
            <span className="chip">{o.listing}</span>
            <a className="btn sm ghost" style={{ marginTop: 6, textAlign: 'center', textDecoration: 'none' }} href={o.dataUrl} download={o.name + '.jpg'}>⬇ Download</a>
          </div>
        ))}
      </div>
      {!all.length && <Empty>Abhi koi output nahi — Listings me generate karein.</Empty>}
    </>
  )
}
