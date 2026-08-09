import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useApp } from '../store/AppState.jsx'
import { loadImg, uid, PLACEMENTS } from '../store/helpers.js'
import { dnumLabel, DNUMS } from '../store/helpers.js'

const HANDLE = 9

export default function BoxEditor({ mockupId, onClose }) {
  const app = useApp()
  const mock = app.ws.mockups.find((m) => m.id === mockupId)
  const cvRef = useRef(null)
  const imgRef = useRef(null)
  const [boxes, setBoxes] = useState(() => (mock?.boxes || []).map((b) => ({ ...b })))
  const [sel, setSel] = useState(boxes[0]?.id || null)
  const [hist, setHist] = useState([])
  const dragRef = useRef(null)

  const snap = useCallback(() => {
    setHist((h) => [...h.slice(-24), JSON.stringify(boxes)])
  }, [boxes])

  const undo = useCallback(() => {
    setHist((h) => {
      if (!h.length) return h
      setBoxes(JSON.parse(h[h.length - 1]))
      return h.slice(0, -1)
    })
  }, [])

  // load image once
  useEffect(() => {
    let live = true
    if (mock) loadImg(mock.dataUrl).then((im) => { if (live) { imgRef.current = im; draw() } })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockupId])

  const draw = useCallback(() => {
    const cv = cvRef.current, img = imgRef.current
    if (!cv || !img) return
    const maxW = Math.min(860, window.innerWidth - 80)
    const scale = Math.min(maxW / img.naturalWidth, 560 / img.naturalHeight)
    cv.width = Math.round(img.naturalWidth * scale)
    cv.height = Math.round(img.naturalHeight * scale)
    const ctx = cv.getContext('2d')
    ctx.drawImage(img, 0, 0, cv.width, cv.height)
    for (const b of boxes) {
      const x = b.x * cv.width, y = b.y * cv.height, w = b.w * cv.width, h = b.h * cv.height
      ctx.save()
      ctx.translate(x + w / 2, y + h / 2)
      ctx.rotate(((b.rot || 0) * Math.PI) / 180)
      ctx.strokeStyle = b.id === sel ? '#4f6df5' : 'rgba(79,109,245,.55)'
      ctx.lineWidth = b.id === sel ? 2.5 : 1.5
      ctx.setLineDash(b.id === sel ? [] : [6, 4])
      ctx.strokeRect(-w / 2, -h / 2, w, h)
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(79,109,245,.10)'
      ctx.fillRect(-w / 2, -h / 2, w, h)
      ctx.restore()
      // label
      ctx.fillStyle = '#4f6df5'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(`${b.name || '?'} · ${b.tag || '?'}${b.dnum && b.dnum !== 'any' ? ' · ' + dnumLabel(b.dnum) : ''}`, x + 4, y - 5)
      if (b.id === sel) {
        ctx.fillStyle = '#4f6df5'
        ctx.fillRect(x + w - HANDLE / 2, y + h - HANDLE / 2, HANDLE, HANDLE)
      }
    }
  }, [boxes, sel])

  useEffect(() => { draw() }, [draw])

  const pos = (e) => {
    const cv = cvRef.current
    const r = cv.getBoundingClientRect()
    return [((e.clientX - r.left) * cv.width) / r.width, ((e.clientY - r.top) * cv.height) / r.height]
  }

  const onDown = (e) => {
    const cv = cvRef.current
    const [px, py] = pos(e)
    // resize handle of selected?
    const s = boxes.find((b) => b.id === sel)
    if (s) {
      const hx = (s.x + s.w) * cv.width, hy = (s.y + s.h) * cv.height
      if (Math.abs(px - hx) < HANDLE + 3 && Math.abs(py - hy) < HANDLE + 3) {
        snap(); dragRef.current = { mode: 'resize', id: s.id }; return
      }
    }
    // inside an existing box? (topmost)
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i]
      const x = b.x * cv.width, y = b.y * cv.height, w = b.w * cv.width, h = b.h * cv.height
      if (px >= x && px <= x + w && py >= y && py <= y + h) {
        setSel(b.id); snap()
        dragRef.current = { mode: 'move', id: b.id, dx: px - x, dy: py - y }
        return
      }
    }
    // empty area → create new box
    snap()
    const nb = { id: uid(), name: 'front', tag: mock.colorTag === 'dark' ? 'dark' : 'light', dnum: 'any', x: px / cv.width, y: py / cv.height, w: 0.01, h: 0.01, rot: 0, pad: 0 }
    setBoxes((bs) => [...bs, nb]); setSel(nb.id)
    dragRef.current = { mode: 'resize', id: nb.id }
  }

  const onMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const cv = cvRef.current
    const [px, py] = pos(e)
    setBoxes((bs) => bs.map((b) => {
      if (b.id !== d.id) return b
      if (d.mode === 'move') {
        return { ...b, x: Math.max(0, Math.min(1 - b.w, (px - d.dx) / cv.width)), y: Math.max(0, Math.min(1 - b.h, (py - d.dy) / cv.height)) }
      }
      return { ...b, w: Math.max(0.02, px / cv.width - b.x), h: Math.max(0.02, py / cv.height - b.y) }
    }))
  }

  const onUp = () => { dragRef.current = null }

  const upd = (id, patch) => setBoxes((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  const del = (id) => { snap(); setBoxes((bs) => bs.filter((b) => b.id !== id)); if (sel === id) setSel(null) }

  const save = async () => {
    const bad = boxes.find((b) => !b.name || !b.tag)
    if (bad) { alert('Har box ka placement aur color tag set karein.'); return }
    await app.updMockup(mockupId, { boxes })
    onClose()
  }

  useEffect(() => {
    const key = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo() } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [undo])

  if (!mock) return null

  return (
    <div className="modal-overlay" onMouseUp={onUp}>
      <div className="modal-card">
        <div className="topbar" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>📦 Print-area boxes — {mock.name}</h2>
          <button className="btn sm ghost" onClick={onClose}>✕ Close</button>
        </div>
        <p className="muted" style={{ margin: '0 0 10px' }}>
          Khali jagah par drag = naya box · box ke andar drag = move · neele kone se resize · Ctrl+Z = undo
        </p>
        <canvas
          ref={cvRef}
          className="box-canvas"
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
        />
        <div style={{ marginTop: 10 }}>
          {boxes.map((b, i) => (
            <div key={b.id} className={'box-row' + (sel === b.id ? ' sel' : '')} onClick={() => setSel(b.id)}>
              <span className="chip">Box {i + 1}</span>
              <select value={b.name} onChange={(e) => upd(b.id, { name: e.target.value })}>
                {PLACEMENTS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={b.tag} onChange={(e) => upd(b.id, { tag: e.target.value })}>
                <option value="dark">Dark area</option>
                <option value="light">Light area</option>
              </select>
              <select value={b.dnum || 'any'} onChange={(e) => upd(b.id, { dnum: e.target.value })} title="Design #">
                <option value="any">Any (auto match)</option>
                {DNUMS.map((n) => <option key={n} value={n}>{dnumLabel(n)}</option>)}
              </select>
              <label className="muted" style={{ fontSize: 12 }}>
                rot <input type="range" min="-45" max="45" value={b.rot || 0} onChange={(e) => upd(b.id, { rot: +e.target.value })} style={{ width: 80, verticalAlign: 'middle' }} /> {b.rot || 0}°
              </label>
              <button className="btn sm danger" onClick={(e) => { e.stopPropagation(); del(b.id) }}>✕</button>
            </div>
          ))}
          {!boxes.length && <p className="muted">Abhi koi box nahi — canvas par drag kar ke banayein.</p>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={undo}>↺ Undo</button>
          <button className="btn" onClick={save}>✓ Save boxes</button>
        </div>
      </div>
    </div>
  )
}
