// Generation engine — ported from the legacy app with the FINAL manual Design# system:
// each design is tagged 'single' or '1'..'8'; each box targets 'any' | 'single' | '1'..'8'.
import { loadImg } from './helpers.js'

export const desDnum = (d) => {
  const v = d && d.dnum
  if (v === undefined || v === null || v === '' || v === 'single' || v === 0 || v === '0') return 'single'
  return /^[1-8]$/.test(String(v)) ? String(v) : 'single'
}
export const boxDnum = (b) => {
  const v = b && b.dnum
  if (v === undefined || v === null || v === '' || v === 'any' || v === 0 || v === '0') return 'any'
  if (v === 'single') return 'single'
  return /^[1-8]$/.test(String(v)) ? String(v) : 'any'
}
// pick correct colour variant for a box area
export const pick = (cand, tag) => {
  if (tag === 'light') return cand.find((x) => x.variant === 'dark-design') || cand.find((x) => x.variant === 'universal') || null
  if (tag === 'dark') return cand.find((x) => x.variant === 'light-design') || cand.find((x) => x.variant === 'universal') || null
  return cand.find((x) => x.variant === 'universal') || null
}

export function matchDesign(designs, box) {
  const target = boxDnum(box)
  if (target !== 'any') {
    const inNum = designs.filter((d) => desDnum(d) === target)
    let cand = inNum.filter((d) => d.placement === box.name)
    if (!cand.length) cand = inNum
    return cand.length ? pick(cand, box.tag) || cand[0] : null
  }
  const cand = designs.filter((d) => d.placement === box.name)
  if (!cand.length) return null
  return pick(cand, box.tag)
}

// Compose one mockup + designs -> output dataURL. Returns {dataUrl, missed:[boxLabel]}
export async function composeMockup(mockup, designs, imgCache) {
  const mimg = imgCache[mockup.id] || (imgCache[mockup.id] = await loadImg(mockup.dataUrl))
  const cv = document.createElement('canvas')
  cv.width = mimg.naturalWidth
  cv.height = mimg.naturalHeight
  const ctx = cv.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(mimg, 0, 0)
  const boxes = mockup.boxes && mockup.boxes.length
    ? mockup.boxes
    : [{ name: 'front', tag: mockup.colorTag === 'dark' ? 'dark' : 'light', x: 0.3, y: 0.3, w: 0.4, h: 0.4, pad: 0, rot: 0 }]
  const missed = []
  let placed = 0
  for (const b of boxes) {
    const d = matchDesign(designs, b)
    if (!d) { missed.push(`${mockup.name} / ${b.name || '?'}`); continue }
    const dimg = imgCache[d.id] || (imgCache[d.id] = await loadImg(d.dataUrl))
    const padf = (b.pad || 0) / 100
    let bx = b.x * cv.width, by = b.y * cv.height, bw = b.w * cv.width, bh = b.h * cv.height
    bx += (bw * padf) / 2; by += (bh * padf) / 2; bw *= 1 - padf; bh *= 1 - padf
    const s = Math.min(bw / dimg.naturalWidth, bh / dimg.naturalHeight)
    const dw = dimg.naturalWidth * s, dh = dimg.naturalHeight * s
    const dx = bx + (bw - dw) / 2, dy = by + (bh - dh) / 2
    ctx.save()
    if (b.rot) {
      ctx.translate(bx + bw / 2, by + bh / 2)
      ctx.rotate((b.rot * Math.PI) / 180)
      ctx.translate(-(bx + bw / 2), -(by + bh / 2))
    }
    ctx.drawImage(dimg, dx, dy, dw, dh)
    ctx.restore()
    placed++
  }
  return { dataUrl: placed ? cv.toDataURL('image/jpeg', 0.92) : null, missed, placed }
}

export async function runGeneration({ mockups, designs, onProgress }) {
  const outputs = []
  const missed = []
  const cache = {}
  for (let i = 0; i < mockups.length; i++) {
    onProgress && onProgress(i, mockups.length, mockups[i].name)
    const r = await composeMockup(mockups[i], designs, cache)
    missed.push(...r.missed)
    if (r.dataUrl) outputs.push({ id: mockups[i].id + '-out', name: mockups[i].name, dataUrl: r.dataUrl })
    await new Promise((r2) => setTimeout(r2, 10))
  }
  return { outputs, missed }
}
