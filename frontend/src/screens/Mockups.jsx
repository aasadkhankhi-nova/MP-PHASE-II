import React from 'react'
import { useApp } from '../store/AppState.jsx'
import { Drop, Empty, confirmDel } from '../components/ui.jsx'

export default function Mockups() {
  const app = useApp()
  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>🖼️ Mockups <span className="chip">{app.ws.mockups.length}</span></h3>
        <Drop label="＋ Mockup photos yahan drop karein (JPG/PNG/WebP)" accept="image/jpeg,image/png,image/webp" onFiles={(f) => app.addMockupFiles(f)} />
      </div>
      <div className="grid">
        {app.ws.mockups.map((m) => (
          <div key={m.id} className="card item-card">
            <div className="thumb"><img src={m.dataUrl} alt={m.name} /></div>
            <b className="ellip" title={m.name} onDoubleClick={() => { const n = prompt('Rename', m.name); if (n) app.updMockup(m.id, { name: n }) }}>{m.name}</b>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={m.colorTag} onChange={(e) => app.updMockup(m.id, { colorTag: e.target.value })}>
                <option value="light">Light product</option>
                <option value="dark">Dark product</option>
                <option value="mixed">Mixed</option>
              </select>
              <span className="chip">{(m.boxes || []).length} boxes</span>
              <button className="btn sm danger" onClick={() => confirmDel(`mockup "${m.name}"`) && app.delMockup(m.id)}>✕</button>
            </div>
            {app.ws.sets.length > 0 && (
              <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                {app.ws.sets.map((s) => (
                  <button
                    key={s.id}
                    className={'chip clickable' + ((m.setIds || []).includes(s.id) ? ' on' : '')}
                    onClick={() => app.toggleMockupSet(m.id, s.id)}
                  >🗂️ {s.name}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {!app.ws.mockups.length && <Empty>Abhi koi mockup nahi. Upar drop-zone se upload karein.</Empty>}
    </>
  )
}
