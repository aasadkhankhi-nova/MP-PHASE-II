/**
 * Designs.jsx — Upload and manage artwork PNGs.
 * Per design, three dropdowns drive the matching engine (compose.js):
 *   placement (front/back/...), color variant (dark/light/universal),
 *   and Design # ('Single image' or 1..8 for multi-artwork shops).
 * IMPORTANT RULE: the dark + light color files of the SAME artwork
 * should be given the SAME Design # — then they act as one design.
 */
import React from 'react'
import { useApp } from '../store/AppState.jsx'
import { Drop, Empty, confirmDel } from '../components/ui.jsx'
import { PLACEMENTS, VARIANTS, DNUMS, dnumLabel } from '../store/helpers.js'

export default function Designs() {
  const app = useApp()
  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>🎨 Designs <span className="chip">{app.ws.designs.length}</span></h3>
        <Drop label="＋ Design PNGs yahan drop karein (transparent PNG best)" accept="image/png,image/svg+xml" onFiles={(f) => app.addDesignFiles(f)} />
      </div>
      <div className="grid">
        {app.ws.designs.map((d) => (
          <div key={d.id} className="card item-card">
            {/* light designs preview on a dark tile so they stay visible */}
            <div className="thumb" style={{ background: d.variant === 'light-design' ? '#1e293b' : '#f1f3f9' }}>
              <img src={d.dataUrl} alt={d.name} style={{ objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
              <span className="chip">{dnumLabel(d.dnum || 'single')}</span>
              <b className="ellip" style={{ flex: 1 }} title={d.name} onDoubleClick={() => { const n = prompt('Rename', d.name); if (n) app.updDesign(d.id, { name: n }) }}>{d.name}</b>
            </div>
            <select style={{ width: '100%', marginTop: 6 }} value={d.placement} onChange={(e) => app.updDesign(d.id, { placement: e.target.value })}>
              {PLACEMENTS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select style={{ width: '100%', marginTop: 6 }} value={d.variant} onChange={(e) => app.updDesign(d.id, { variant: e.target.value })}>
              {VARIANTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select style={{ width: '100%', marginTop: 6 }} value={d.dnum || 'single'} onChange={(e) => app.updDesign(d.id, { dnum: e.target.value })}>
              {DNUMS.map((n) => <option key={n} value={n}>{dnumLabel(n)}</option>)}
            </select>
            <button className="btn sm danger" style={{ marginTop: 8 }} onClick={() => confirmDel(`design "${d.name}"`) && app.delDesign(d.id)}>✕ Delete</button>
          </div>
        ))}
      </div>
      {!app.ws.designs.length && <Empty>Abhi koi design nahi. Dark + light variants ko same Design number dein.</Empty>}
    </>
  )
}
