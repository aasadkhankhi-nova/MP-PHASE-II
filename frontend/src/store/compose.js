/**
 * compose.js — The GENERATION ENGINE.
 * Takes mockup photos + design PNGs and produces the final product photos.
 *
 * Flow for one mockup:
 *   1. Draw the mockup photo on a canvas (full resolution).
 *   2. For every print-area "box" drawn in the Box Editor:
 *      a. matchDesign() picks WHICH design goes in this box.
 *      b. The design is scaled to fit inside the box (aspect ratio kept),
 *         padding + rotation applied, then drawn.
 *   3. Export the canvas as a JPEG data-URL.
 */
import { loadImg } from './helpers.js'

// Normalize a design's number tag. Anything invalid becomes 'single'.
export const desDnum = (d) => {
  const v = d && d.dnum
  if (v === undefined || v === null || v === '' || v === 'single' || v === 0 || v === '0') return 'single'
  return /^[1-8]$/.test(String(v)) ? String(v) : 'single'
}

// Normalize a box's target. Anything invalid becomes 'any' (= auto match).
export const boxDnum = (b) => {
  const v = b && b.dnum
  if (v === undefined || v === null || v === '' || v === 'any' || v === 0 || v === '0') return 'any'
  if (v === 'single') return 'single'
  return /^[1-8]$/.test(String(v)) ? String(v) : 'any'
}

/**
 * pick — choose the right COLOR variant for a box.
 * A box on a light product area needs the dark version of the artwork
 * (so it is visible), and vice versa. 'universal' works anywhere.
 */
export const pick = (cand, tag) => {
  if (tag === 'light') return cand.find((x) => x.variant === 'dark-design') || cand.find((x) => x.variant === 'universal') || null
  if (tag === 'dark') return cand.find((x) => x.variant === 'light-design') || cand.find((x) => x.variant === 'universal') || null
  return cand.find((x) => x.variant === 'universal') || null
}

/**
 * matchDesign — the core matching rule (ported from the legacy app):
 * 1. If the box targets a design number ('single' or '1'..'8'):
 *    only designs with that same number qualify; prefer matching placement,
 *    then pick the right color variant.
 * 2. If the box is 'any': match by placement first, then color variant.
 * Returns null when nothing fits (reported as "missed" to the user).
 */
export function matchDesign(designs, box) {
  const target = boxDnum(box)
  if (target !== 'any') {
    const inNum = designs.filter((d) => desDnum(d) === target)
    let cand = inNum.filter((d) => d.placement === box.name)
    if (!cand.length) cand = inNum   // number chosen but placement differs -> still use that artwork
    return cand.length ? pick(cand, box.tag) || cand[0] : null
  }
  const cand = designs.filter((d) => d.placement === box.name)
  if (!cand.length) return null
  return pick(cand, box.tag)
}

/**
 * composeMockup — render ONE mockup with its matched designs.
 * imgCache avoids re-decoding the same image for every listing.
 * If a mockup has no boxes at all, we fall back to one centered box.
 */
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

    // Box rectangle in pixels (box coords are stored as 0..1 fractions).
    const padf = (b.pad || 0) / 100
    let bx = b.x * cv.width, by = b.y * cv.height, bw = b.w * cv.width, bh = b.h * cv.height
    bx += (bw * padf) / 2; by += (bh * padf) / 2; bw *= 1 - padf; bh *= 1 - padf

    // Fit design inside the box, keep aspect ratio, center it.
    const s = Math.min(bw / dimg.naturalWidth, bh / dimg.naturalHeight)
    const dw = dimg.naturalWidth * s, dh = dimg.naturalHeight * s
    const dx = bx + (bw - dw) / 2, dy = by + (bh - dh) / 2

    ctx.save()
    if (b.rot) {  // optional rotation around the box center
      ctx.translate(bx + bw / 2, by + bh / 2)
      ctx.rotate((b.rot * Math.PI) / 180)
      ctx.translate(-(bx + bw / 2), -(by + bh / 2))
    }
    ctx.drawImage(dimg, dx, dy, dw, dh)
    ctx.restore()
    placed++
  }
  // JPEG at 92% keeps files reasonable at full resolution.
  return { dataUrl: placed ? cv.toDataURL('image/jpeg', 0.92) : null, missed, placed }
}

/**
 * runGeneration — loop over all selected mockups and build every photo.
 * onProgress lets the UI show "3 / 12 — mockup-name" while working.
 */
export async function runGeneration({ mockups, designs, onProgress }) {
  const outputs = []
  const missed = []
  const cache = {}
  for (let i = 0; i < mockups.length; i++) {
    onProgress && onProgress(i, mockups.length, mockups[i].name)
    const r = await composeMockup(mockups[i], designs, cache)
    missed.push(...r.missed)
    if (r.dataUrl) outputs.push({ id: mockups[i].id + '-out', name: mockups[i].name, dataUrl: r.dataUrl })
    await new Promise((r2) => setTimeout(r2, 10))  // let the UI breathe
  }
  return { outputs, missed }
}
