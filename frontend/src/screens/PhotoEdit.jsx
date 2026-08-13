/**
 * PhotoEdit.jsx — Etsy jaisa FULL-SCREEN photo editor.
 * Layout bilkul Etsy wala: center me picture, neeche tools ki patti
 * (Adjust / Transform ke do mode), upar-right Apply + Cancel.
 *
 * Adjust  — Etsy ke sab 11 controls: Brightness, Exposure, Shadows,
 *           Highlights, Blacks, Whites, Contrast, Saturation,
 *           Temperature, Sharpness, Clarity. (pixel-level, browser me hi;
 *           kisi tool par click karo to uska slider khulta hai)
 * Transform — Rotate ⟲/⟳ 90°, Flip horizontal/vertical, Crop
 *           (ratio chuno, box ko pakar kar sarkao, size slider se chhota/bara)
 *
 * Apply   — full-resolution par sab effects laga kar nayi image banti hai
 *           aur PARENT ko dataURL milta hai (wo Etsy par replace karta hai).
 * Cancel  — kuch nahi badalta.
 */
import React, { useState, useEffect, useRef } from 'react'

const TOOLS = [
  ['brightness', 'Brightness'], ['exposure', 'Exposure'], ['shadows', 'Shadows'],
  ['highlights', 'Highlights'], ['blacks', 'Blacks'], ['whites', 'Whites'],
  ['contrast', 'Contrast'], ['saturation', 'Saturation'], ['temperature', 'Temperature'],
  ['sharpness', 'Sharpness'], ['clarity', 'Clarity'],
]
const ZERO = Object.fromEntries(TOOLS.map(([k]) => [k, 0]))
const RATIOS = [['off', 'No crop'], ['1', '1:1'], ['0.8', '4:5'], ['1.5', '3:2'], ['1.7778', '16:9']]

// ---------- pixel math (Adjust ke sab sliders ek pass me) ----------
function adjustPixels(d, p) {
  const ex = Math.pow(2, p.exposure / 100)                     // exposure = light ka doubling
  const br = p.brightness * 0.8
  const ck = (259 * (p.contrast * 1.28 + 255)) / (255 * (259 - p.contrast * 1.28))
  const sat = 1 + p.saturation / 100
  const tmp = p.temperature * 0.5                              // + = warm (red), - = cool (blue)
  const sh = p.shadows / 100, hl = p.highlights / 100
  const bl = p.blacks / 100, wh = p.whites / 100
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * ex + br + tmp
    let g = d[i + 1] * ex + br
    let b = d[i + 2] * ex + br - tmp
    let l = 0.299 * r + 0.587 * g + 0.114 * b
    if (sh) { const f = sh * Math.max(0, 1 - l / 140) * 70; r += f; g += f; b += f }
    if (hl) { const f = hl * Math.max(0, (l - 128) / 127) * 70; r += f; g += f; b += f }
    if (bl) { const f = bl * Math.max(0, 1 - l / 70) * 70; r += f; g += f; b += f }
    if (wh) { const f = wh * Math.max(0, (l - 190) / 65) * 70; r += f; g += f; b += f }
    r = (r - 128) * ck + 128; g = (g - 128) * ck + 128; b = (b - 128) * ck + 128
    l = 0.299 * r + 0.587 * g + 0.114 * b
    r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r
    d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g
    d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b
  }
}

// separable box-blur (sharpness/clarity ke unsharp-mask ke liye)
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length), out = new Uint8ClampedArray(src.length)
  const n = 2 * r + 1
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let c = 0; c < 3; c++) {
      let sum = 0
      for (let x = -r; x <= r; x++) sum += src[(row + Math.min(w - 1, Math.max(0, x))) * 4 + c]
      for (let x = 0; x < w; x++) {
        tmp[(row + x) * 4 + c] = sum / n
        sum += src[(row + Math.min(w - 1, x + r + 1)) * 4 + c] - src[(row + Math.max(0, x - r)) * 4 + c]
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0
      for (let y = -r; y <= r; y++) sum += tmp[(Math.min(h - 1, Math.max(0, y)) * w + x) * 4 + c]
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 4 + c] = sum / n
        sum += tmp[(Math.min(h - 1, y + r + 1) * w + x) * 4 + c] - tmp[(Math.max(0, y - r) * w + x) * 4 + c]
      }
    }
  }
  return out
}

// unsharp mask: pixel + amount * (pixel - blurred)
function unsharp(d, w, h, radius, amount) {
  const bl = boxBlur(d, w, h, radius)
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = d[i + c] + amount * (d[i + c] - bl[i + c])
      d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v
    }
  }
}

export default function PhotoEdit({ src, onApply, onCancel }) {
  const [img, setImg] = useState(null)          // loaded Image element
  const [err, setErr] = useState(null)
  const [mode, setMode] = useState('adjust')    // 'adjust' | 'transform'
  const [tool, setTool] = useState(null)        // kaunsa Adjust slider khula hai
  const [p, setP] = useState({ ...ZERO })       // slider values
  const [rot, setRot] = useState(0)             // 0/90/180/270
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [ratio, setRatio] = useState('off')     // crop ratio ('off' = nahi)
  const [crop, setCrop] = useState({ cx: 0.5, cy: 0.5, s: 0.9 })  // center + size (fractions)
  const [busy, setBusy] = useState(false)
  const cvRef = useRef(null)
  const dragRef = useRef(null)

  // image load (parent dataURL deta hai — CDN ho to backend proxy se aati hai)
  useEffect(() => {
    const im = new Image()
    im.onload = () => setImg(im)
    im.onerror = () => setErr('Image load nahi hui')
    im.src = src
  }, [src])

  // rotate/flip laga kar ek canvas banao (maxSide tak scale)
  const orient = (maxSide) => {
    const sw = img.width, sh = img.height
    const rotated = rot % 180 !== 0
    const ow = rotated ? sh : sw, oh = rotated ? sw : sh
    const k = Math.min(1, maxSide / Math.max(ow, oh))
    const c = document.createElement('canvas')
    c.width = Math.round(ow * k); c.height = Math.round(oh * k)
    const x = c.getContext('2d')
    x.translate(c.width / 2, c.height / 2)
    x.rotate((rot * Math.PI) / 180)
    x.scale(flipH ? -1 : 1, flipV ? -1 : 1)
    x.drawImage(img, -sw * k / 2, -sh * k / 2, sw * k, sh * k)
    return c
  }

  // crop box (canvas coords) — ratio ke hisaab se max fit, phir s se chhota
  const cropRect = (W, H) => {
    const R = parseFloat(ratio)
    let w = Math.min(W, H * R), h = w / R
    w *= crop.s; h *= crop.s
    let x = crop.cx * W - w / 2, y = crop.cy * H - h / 2
    x = Math.max(0, Math.min(W - w, x)); y = Math.max(0, Math.min(H - h, y))
    return { x, y, w, h }
  }

  // ---- live preview (har slider/transform change par) ----
  useEffect(() => {
    if (!img || !cvRef.current) return
    const base = orient(640)
    const w = base.width, h = base.height
    const bx = base.getContext('2d')
    const id = bx.getImageData(0, 0, w, h)
    adjustPixels(id.data, p)
    if (p.sharpness) unsharp(id.data, w, h, 1, (p.sharpness / 100) * 1.4)
    if (p.clarity) unsharp(id.data, w, h, Math.max(2, Math.round(Math.min(w, h) / 50)), (p.clarity / 100) * 0.7)
    bx.putImageData(id, 0, 0)
    const cv = cvRef.current
    cv.width = w; cv.height = h
    const cx = cv.getContext('2d')
    cx.drawImage(base, 0, 0)
    // crop overlay: bahar ka hissa dark + white border
    if (mode === 'transform' && ratio !== 'off') {
      const rct = cropRect(w, h)
      cx.fillStyle = 'rgba(0,0,0,0.45)'
      cx.fillRect(0, 0, w, rct.y)
      cx.fillRect(0, rct.y, rct.x, rct.h)
      cx.fillRect(rct.x + rct.w, rct.y, w - rct.x - rct.w, rct.h)
      cx.fillRect(0, rct.y + rct.h, w, h - rct.y - rct.h)
      cx.strokeStyle = '#fff'; cx.lineWidth = 2
      cx.strokeRect(rct.x, rct.y, rct.w, rct.h)
    }
  }, [img, p, rot, flipH, flipV, mode, ratio, crop])

  // crop box ko pakar kar sarkana
  const pDown = (e) => {
    if (mode !== 'transform' || ratio === 'off') return
    dragRef.current = { x: e.clientX, y: e.clientY, cx: crop.cx, cy: crop.cy }
  }
  const pMove = (e) => {
    const d = dragRef.current
    if (!d || !cvRef.current) return
    const r = cvRef.current.getBoundingClientRect()
    setCrop((c) => ({ ...c, cx: Math.max(0, Math.min(1, d.cx + (e.clientX - d.x) / r.width)), cy: Math.max(0, Math.min(1, d.cy + (e.clientY - d.y) / r.height)) }))
  }
  const pUp = () => { dragRef.current = null }

  // ---- Apply: full-resolution par sab kuch laga kar parent ko do ----
  const apply = async () => {
    if (!img) return
    setBusy(true)
    // UI ko saans lene do, phir heavy kaam
    await new Promise((r) => setTimeout(r, 30))
    try {
      let base = orient(3000)
      if (ratio !== 'off') {
        const rct = cropRect(base.width, base.height)
        const c2 = document.createElement('canvas')
        c2.width = Math.round(rct.w); c2.height = Math.round(rct.h)
        c2.getContext('2d').drawImage(base, rct.x, rct.y, rct.w, rct.h, 0, 0, c2.width, c2.height)
        base = c2
      }
      const w = base.width, h = base.height
      const bx = base.getContext('2d')
      const id = bx.getImageData(0, 0, w, h)
      adjustPixels(id.data, p)
      if (p.sharpness) unsharp(id.data, w, h, Math.max(1, Math.round(w / 640)), (p.sharpness / 100) * 1.4)
      if (p.clarity) unsharp(id.data, w, h, Math.max(2, Math.round(Math.min(w, h) / 50)), (p.clarity / 100) * 0.7)
      bx.putImageData(id, 0, 0)
      onApply(base.toDataURL('image/jpeg', 0.92))
    } catch (e) { setErr(e.message || String(e)) } finally { setBusy(false) }
  }

  const changed = rot || flipH || flipV || ratio !== 'off' || Object.values(p).some((v) => v !== 0)

  return (
    <div className="pe-overlay" onMouseMove={pMove} onMouseUp={pUp}>
      {/* top bar — Apply / Cancel (Etsy jaisa upar-right) */}
      <div className="pe-top">
        <button className="pe-apply" disabled={busy || !img || !changed} onClick={apply}>{busy ? '⏳…' : 'Apply'}</button>
        <button className="pe-cancel" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>

      {/* center — picture */}
      <div className="pe-stage">
        {!img && !err && <p className="muted">⏳ image load ho rahi hai…</p>}
        {err && <p className="muted">⚠ {err}</p>}
        {img && <canvas ref={cvRef} className="pe-canvas" onMouseDown={pDown} style={{ cursor: mode === 'transform' && ratio !== 'off' ? 'move' : 'default' }} />}
      </div>

      {/* bottom — tools */}
      <div className="pe-bottom">
        {/* Adjust: chune hue tool ka slider */}
        {mode === 'adjust' && tool && (
          <div className="pe-sliderow">
            <span className="pe-slabel">{TOOLS.find(([k]) => k === tool)?.[1]}</span>
            <input type="range" min="-100" max="100" value={p[tool]} onChange={(e) => setP({ ...p, [tool]: Number(e.target.value) })} />
            <span className="pe-sval">{p[tool]}</span>
            <button className="pe-reset" onClick={() => setP({ ...p, [tool]: 0 })}>↺</button>
          </div>
        )}

        {mode === 'adjust' && (
          <div className="pe-tools">
            {TOOLS.map(([k, label]) => (
              <button key={k} className={'pe-tool' + (tool === k ? ' on' : '')} onClick={() => setTool(tool === k ? null : k)}>
                <span className="pe-tico">{p[k] !== 0 ? '●' : '○'}</span>
                {label}
              </button>
            ))}
          </div>
        )}

        {mode === 'transform' && (
          <div className="pe-tools">
            <button className="pe-tool" onClick={() => setRot((rot + 270) % 360)}>⟲ Rotate left</button>
            <button className="pe-tool" onClick={() => setRot((rot + 90) % 360)}>⟳ Rotate right</button>
            <button className={'pe-tool' + (flipH ? ' on' : '')} onClick={() => setFlipH(!flipH)}>⇋ Flip H</button>
            <button className={'pe-tool' + (flipV ? ' on' : '')} onClick={() => setFlipV(!flipV)}>⇵ Flip V</button>
            <span className="pe-sep" />
            {RATIOS.map(([v, label]) => (
              <button key={v} className={'pe-tool' + (ratio === v ? ' on' : '')} onClick={() => setRatio(v)}>{label}</button>
            ))}
            {ratio !== 'off' && (
              <span className="pe-cropsize">
                Size <input type="range" min="30" max="100" value={Math.round(crop.s * 100)} onChange={(e) => setCrop({ ...crop, s: Number(e.target.value) / 100 })} />
              </span>
            )}
          </div>
        )}

        {/* mode toggle — Etsy jaisa Adjust / Transform */}
        <div className="pe-modes">
          <button className={'pe-mode' + (mode === 'adjust' ? ' on' : '')} onClick={() => setMode('adjust')}>Adjust</button>
          <button className={'pe-mode' + (mode === 'transform' ? ' on' : '')} onClick={() => { setMode('transform'); setTool(null) }}>Transform</button>
        </div>
      </div>
    </div>
  )
}
