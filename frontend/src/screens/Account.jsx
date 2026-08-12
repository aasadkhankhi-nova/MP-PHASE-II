/**
 * Account.jsx — "Account settings" (opens from the avatar in the icon rail).
 * Vela-style layout:
 *   - Contact information: avatar + first/last name
 *   - Email: current email; change with new email + password check
 *   - Password: current + new + confirm
 *   - one Save button for whatever changed; Log out on top-right
 * Below that: Import (Phase I data) and the AI API-key card
 * (provider dropdown first — like MP Phase I — then the key box).
 */
import React, { useState, useEffect } from 'react'
import { useApp } from '../store/AppState.jsx'
import Stores from './Stores.jsx'
import {
  getSession, setSession,
  authUpdateProfile, authChangeEmail, authChangePassword,
  getAI, setAI, AI_PROVIDERS,
  getApiBase, setApiBase, health, etsy,
} from '../api.js'

export default function Account() {
  const app = useApp()
  const u = app.session?.user || {}
  // split the saved full name into first/last for the two boxes
  const [first, setFirst] = useState(() => (u.name || '').split(' ')[0] || '')
  const [last, setLast] = useState(() => (u.name || '').split(' ').slice(1).join(' ') || '')
  const [newEmail, setNewEmail] = useState('')
  const [emailPw, setEmailPw] = useState('')
  const [curPw, setCurPw] = useState('')
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [apiUrl, setApiUrl] = useState(getApiBase())

  // ONE Save for all three sections — only the changed ones are sent.
  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const done = []
      const newName = `${first.trim()} ${last.trim()}`.trim()
      if (newName && newName !== (u.name || '')) {
        await authUpdateProfile(first.trim(), last.trim())
        const sess = getSession()
        if (sess) { sess.user.name = newName; setSession(sess) }
        done.push('naam update ho gaya')
      }
      if (newEmail.trim()) {
        if (!emailPw) throw new Error('Email badalne ke liye password likhein')
        await authChangeEmail(newEmail.trim(), emailPw, u.email)
        done.push('email — confirmation link dono inbox me bheja gaya hai')
      }
      if (curPw || p1 || p2) {
        if (p1.length < 6) throw new Error('Naya password kam az kam 6 harf ka ho')
        if (p1 !== p2) throw new Error('Naye passwords match nahi karte')
        if (!curPw) throw new Error('Current password likhein')
        await authChangePassword(p1, curPw, u.email)
        done.push('password update ho gaya')
      }
      if (!done.length) { setMsg('Kuch badla hi nahi 🙂'); return }
      setMsg('✅ ' + done.join(' · '))
      setNewEmail(''); setEmailPw(''); setCurPw(''); setP1(''); setP2('')
      // sidebar avatar/name refresh ke liye halka sa reload
      if (done[0].startsWith('naam')) setTimeout(() => location.reload(), 900)
    } catch (e) {
      setMsg('⚠ ' + (e.message || e))
    } finally { setBusy(false) }
  }

  const saveUrl = async () => {
    setApiBase(apiUrl); setMsg('⏳ testing…')
    try { const h = await health(); setMsg(`✅ Backend: db ${h.db} · auth ${h.auth} · storage ${h.storage}`) }
    catch (e) { setMsg('⚠ ' + e.message) }
  }

  return (
    <>
      {/* ---- Contact information + Log out (Vela-style header) ---- */}
      <div className="card">
        <div className="topbar" style={{ margin: '0 0 12px' }}>
          <h3 style={{ margin: 0 }}>Contact information</h3>
          <button className="btn ghost" onClick={() => app.logout()}>⇦ Log out</button>
        </div>
        <div className="avatar" style={{ width: 64, height: 64, fontSize: 20, marginBottom: 14 }}>
          {(u.name || u.email || '?').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>First name</label>
            <input value={first} onChange={(e) => setFirst(e.target.value)} style={{ minWidth: 180 }} />
          </span>
          <span>
            <label className="muted" style={{ fontSize: 12, display: 'block' }}>Last name</label>
            <input value={last} onChange={(e) => setLast(e.target.value)} style={{ minWidth: 180 }} />
          </span>
        </div>
      </div>

      {/* ---- Email ---- */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Email</h3>
        <p className="muted" style={{ marginBottom: 2 }}>Current Email</p>
        <p style={{ margin: '0 0 12px', fontWeight: 600 }}>{u.email}</p>
        <label className="muted" style={{ fontSize: 12, display: 'block' }}>New Email</label>
        <input placeholder="Enter new email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={{ minWidth: 260, marginBottom: 10 }} /><br />
        <label className="muted" style={{ fontSize: 12, display: 'block' }}>Password</label>
        <input placeholder="Enter password" type="password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} style={{ minWidth: 260 }} />
      </div>

      {/* ---- Password ---- */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Password</h3>
        <label className="muted" style={{ fontSize: 12, display: 'block' }}>Current password</label>
        <input placeholder="Enter current password" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} style={{ minWidth: 260, marginBottom: 10 }} /><br />
        <label className="muted" style={{ fontSize: 12, display: 'block' }}>New password</label>
        <input placeholder="Enter new password" type="password" value={p1} onChange={(e) => setP1(e.target.value)} style={{ minWidth: 260, marginBottom: 10 }} /><br />
        <label className="muted" style={{ fontSize: 12, display: 'block' }}>Confirm new password</label>
        <input placeholder="Confirm new password" type="password" value={p2} onChange={(e) => setP2(e.target.value)} style={{ minWidth: 260 }} />
      </div>

      {/* ---- Save (bottom, Vela-style) ---- */}
      <div className="card" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
        {msg && <span className="muted">{msg}</span>}
        <button className="btn" disabled={busy} onClick={save}>{busy ? '⏳ Saving…' : 'Save'}</button>
      </div>

      {/* ---- Import (purani Phase I app se) ---- */}
      <ImportCard />

      {/* ---- AI API key (provider dropdown pehle — Phase I style) ---- */}
      <AICard />

      {/* ---- stores manage (rename/delete) + Etsy connection ---- */}
      <Stores />
      {app.curStoreId && <EtsyConnect storeId={app.curStoreId} storeName={app.curStore?.name} />}

      {/* ---- developer-only backend URL (console: localStorage.setItem('mp_dev','1')) ---- */}
      {localStorage.getItem('mp_dev') === '1' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>⚙ Backend (developer)</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
            <button className="btn ghost" onClick={saveUrl}>Save & test</button>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * AICard — SEO ke liye AI ki key. PEHLE provider ka dropdown (jaise MP
 * Phase I me tha), phir us provider ki key ka box, phir Save.
 * Har provider ki key alag yaad rehti hai; jo provider chuna hua hai
 * usi se SEO chalta hai. Keys sirf IS browser me rehti hain.
 */
function AICard() {
  const [ai, setAiState] = useState(() => {
    const a = getAI()
    return { prov: a.prov || 'gemini', keys: { gemini: '', groq: '', openrouter: '', ...(a.keys || {}) } }
  })
  const [kMsg, setKMsg] = useState(null)
  const prov = AI_PROVIDERS.find((p) => p.id === ai.prov) || AI_PROVIDERS[0]

  const save = () => {
    setAI(ai)
    setKMsg(ai.keys[ai.prov] ? `✅ ${prov.label} save ho gaya (sirf is browser me)` : '🗑 Key khali hai — SEO band rahega')
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3 style={{ marginTop: 0 }}>🔑 API key (SEO ke liye)</h3>
      {/* line 1: provider dropdown */}
      <select value={ai.prov} onChange={(e) => { setAiState({ ...ai, prov: e.target.value }); setKMsg(null) }} style={{ width: '100%', marginBottom: 10 }}>
        {AI_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      {/* line 2: key box + save */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          placeholder="Enter your API key"
          type="password"
          value={ai.keys[ai.prov] || ''}
          onChange={(e) => setAiState({ ...ai, keys: { ...ai.keys, [ai.prov]: e.target.value.trim() } })}
          style={{ flex: 1, minWidth: 240 }}
        />
        <button className="btn" onClick={save}>Save</button>
      </div>
      <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
        Free key yahan se: <a className="lnk" href={'https://' + prov.help} target="_blank" rel="noreferrer">{prov.help}</a> · key sirf aap ke browser me rehti hai.
      </p>
      {kMsg && <p className="muted" style={{ marginTop: 6 }}>{kMsg}</p>}
    </div>
  )
}

/**
 * Etsy-connection card for the currently selected store.
 * "Connect Etsy" sends the browser to Etsy's own permission page;
 * after Allow, the backend saves the tokens and brings the user back.
 * Once connected we show the shop name + a peek at its listings.
 */
function EtsyConnect({ storeId, storeName }) {
  const [st, setSt] = useState(null)        // {connected, shop, keyReady}
  const [lst, setLst] = useState(null)      // peek at shop listings
  const [eMsg, setEMsg] = useState(null)
  const [eBusy, setEBusy] = useState(false)

  // load connection status whenever the selected store changes
  useEffect(() => {
    setSt(null); setLst(null); setEMsg(null)
    etsy.status(storeId).then(setSt).catch((e) => setEMsg('⚠ ' + e.message))
    // show the "connected!" note if we just came back from Etsy
    const h = window.location.hash || ''
    if (h.startsWith('#etsy=')) {
      const v = decodeURIComponent(h.slice(6))
      setEMsg(v.startsWith('connected:') ? '✅ Etsy connect ho gaya: ' + v.slice(10) : '⚠ ' + v.replace(/^error:/, ''))
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [storeId])

  const connect = async () => {
    setEBusy(true); setEMsg(null)
    try {
      const r = await etsy.connectUrl(storeId)
      window.location.href = r.url          // -> Etsy permission page
    } catch (e) { setEMsg('⚠ ' + e.message); setEBusy(false) }
  }

  const disconnect = async () => {
    if (!confirm('Etsy connection hatana hai? (Data delete nahi hota, sirf link tootta hai)')) return
    await etsy.disconnect(storeId)
    setSt({ ...st, connected: false, shop: null }); setLst(null)
  }

  const peek = async () => {
    setEBusy(true); setEMsg(null)
    try { setLst(await etsy.listings(storeId, 'active')) }
    catch (e) { setEMsg('⚠ ' + e.message) }
    finally { setEBusy(false) }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>🛍️ Etsy — {storeName || 'store'}</h3>
      {!st && !eMsg && <p className="muted">⏳ checking…</p>}
      {st && !st.keyReady && (
        <p className="muted">Etsy integration abhi taiyar ho rahi hai (server par Etsy API key set hone ka intezar).</p>
      )}
      {st && st.keyReady && !st.connected && (
        <>
          <p className="muted">Is store ko apni Etsy shop se jorein — phir listings seedha Etsy par draft ban kar jayengi.</p>
          <button className="btn" disabled={eBusy} onClick={connect}>🔗 Connect Etsy</button>
        </>
      )}
      {st && st.connected && (
        <>
          <p className="muted">✅ Connected: <b>{st.shop?.shop_name}</b> <span className="chip ok">shop #{st.shop?.shop_id}</span></p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn ghost" disabled={eBusy} onClick={peek}>👀 Shop listings dekhein</button>
            <button className="btn danger" onClick={disconnect}>Disconnect</button>
          </div>
          {lst && (
            <div style={{ marginTop: 10 }}>
              <p className="muted"><b>{lst.count}</b> active listings{lst.listings.length ? ' — pehli ' + lst.listings.length + ':' : ''}</p>
              {lst.listings.map((l) => (
                <p key={l.id} className="muted" style={{ margin: '3px 0' }}>• {l.title} <span className="chip">{l.state}</span></p>
              ))}
            </div>
          )}
        </>
      )}
      {eMsg && <p className="muted" style={{ marginTop: 8 }}>{eMsg}</p>}
      {/* Required by Etsy's API terms — must be shown in any app using their API */}
      <p className="muted" style={{ marginTop: 10, fontSize: 11.5 }}>
        The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.
      </p>
    </div>
  )
}

/**
 * ImportCard — bring old MP Phase I data into ListPilot.
 * Accepts BOTH Phase I file types:
 *   .mpbackup — "Backup ALL data": every store + its mockups/boxes/designs/sets
 *   .mpproj   — single-store "Save project" export
 * Each Phase I store becomes a NEW ListPilot store (cloud-synced).
 * Old designs might not carry a Design# — they default to "Single image".
 */
function ImportCard() {
  const app = useApp()
  const [prog, setProg] = useState(null)   // "store 1/3 · image 12/80"
  const [iMsg, setIMsg] = useState(null)

  const mapDesign = (d) => ({
    id: d.id, name: d.name, dataUrl: d.dataUrl,
    placement: d.placement || 'front',
    variant: d.variant || 'universal',
    dnum: d.dnum || 'single',
  })
  const mapMockup = (m) => ({
    id: m.id, name: m.name, dataUrl: m.dataUrl, w: m.w, h: m.h,
    colorTag: m.colorTag || 'light', setIds: m.setIds || [], boxes: m.boxes || [],
  })

  const doImport = async (file) => {
    if (!file) return
    setIMsg(null)
    try {
      const data = JSON.parse(await file.text())
      // which stores are inside this file?
      let stores = []
      if (data.kind === 'mpbackup' && Array.isArray(data.stores)) {
        stores = data.stores
          .filter((s) => s.ws && ((s.ws.mockups || []).length || (s.ws.designs || []).length))
          .map((s) => ({ name: s.store?.name || 'Imported', ws: s.ws }))
      } else if (data.mockups || data.designs) {
        // .mpproj — one store's data at the top level
        stores = [{ name: file.name.replace(/\.[^.]+$/, ''), ws: data }]
      }
      if (!stores.length) throw new Error('Is file me koi store data nahi mila')
      if (!confirm(`${stores.length} store(s) milen — har ek ListPilot me NAYA store banega. Import shuru karein?`)) return

      for (let si = 0; si < stores.length; si++) {
        const s = stores[si]
        const ws = {
          mockups: (s.ws.mockups || []).map(mapMockup),
          designs: (s.ws.designs || []).map(mapDesign),
          sets: (s.ws.sets || []).map((x) => ({ id: x.id, name: x.name })),
        }
        await app.importStore(s.name, ws, (i, n) =>
          setProg(`store ${si + 1}/${stores.length} (${s.name}) · image ${i}/${n} upload…`))
      }
      setProg(null)
      setIMsg(`✅ Import mukammal — ${stores.length} store(s) aa gaye. Sidebar dropdown se dekhein!`)
    } catch (e) {
      setProg(null)
      setIMsg('⚠ ' + (e.message || e))
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>📂 Import (purani MP Phase I app se)</h3>
      <p className="muted">
        Phase I me Dashboard par <b>"💾 Backup ALL data"</b> daba kar jo <b>.mpbackup</b> file bane, usay yahan
        chunein — saare stores (mockups, boxes, designs, sets samet) ListPilot me aa jayenge.
        Single-store <b>.mpproj</b> file bhi chalti hai.
      </p>
      {prog ? (
        <p className="muted">⏳ {prog}</p>
      ) : (
        <label className="btn ghost" style={{ cursor: 'pointer' }}>
          📂 File chunein (.mpbackup / .mpproj)
          <input type="file" accept=".mpbackup,.mpproj,application/json" style={{ display: 'none' }}
            onChange={(e) => { doImport(e.target.files[0]); e.target.value = '' }} />
        </label>
      )}
      {iMsg && <p className="muted" style={{ marginTop: 8 }}>{iMsg}</p>}
    </div>
  )
}
