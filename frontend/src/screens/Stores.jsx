/**
 * Stores.jsx — Create / open / rename / delete stores.
 * One store = one Etsy shop = one fully ISOLATED workspace.
 * If no store is selected, App.jsx forces the user onto this screen.
 */
import React, { useState } from 'react'
import { useApp } from '../store/AppState.jsx'
import { confirmDel } from '../components/ui.jsx'

export default function Stores() {
  const app = useApp()
  const [name, setName] = useState('')

  // Create a store and immediately open it.
  const create = async () => {
    if (!name.trim()) return
    const st = await app.addStore(name)
    setName('')
    await app.selectStore(st.id)
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>🏬 Etsy Stores</h3>
        <p className="muted">Har store ka apna alag workspace hai — mockups, designs, listings sab store ke andar rehte hain.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="Store ka naam (e.g. CanvasArtCo)"
            style={{ flex: 1, minWidth: 220 }}
          />
          <button className="btn" onClick={create}>＋ Create store</button>
        </div>
      </div>
      {/* One card per store: Open / Rename / Delete */}
      <div className="grid">
        {app.stores.map((s) => (
          <div key={s.id} className={'card store-card' + (app.curStoreId === s.id ? ' sel' : '')}>
            <div style={{ fontSize: 26 }}>🏬</div>
            <b>{s.name}</b>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {app.curStoreId === s.id ? (
                <span className="chip ok">● selected</span>
              ) : (
                <button className="btn sm" onClick={() => app.selectStore(s.id)}>Open</button>
              )}
              <button className="btn sm ghost" onClick={() => { const n = prompt('New name', s.name); if (n) app.renameStore(s.id, n) }}>Rename</button>
              <button className="btn sm danger" onClick={() => confirmDel(`store "${s.name}"`) && app.deleteStore(s.id)}>Delete</button>
            </div>
          </div>
        ))}
        {!app.stores.length && <div className="card"><p className="muted">Abhi koi store nahi — upar se pehla store banayein.</p></div>}
      </div>
    </>
  )
}
