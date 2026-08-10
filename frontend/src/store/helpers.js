/**
 * helpers.js — Small utility functions shared across the app.
 * No app logic here: only generic tools (ids, file reading, image loading)
 * and the fixed option lists (placements, variants, design numbers).
 */

// Random unique id for new objects (good enough for client-side ids).
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

// Read an uploaded File as a base64 data-URL (so we can show + store it).
export function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

// Load an image and wait until it is ready to draw on a canvas.
// For cloud (http) images we set crossOrigin so the canvas stays "clean"
// and we are still allowed to export PNGs from it.
export function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image()
    if (/^https?:/.test(src)) im.crossOrigin = 'anonymous'
    im.onload = () => res(im)
    im.onerror = rej
    im.src = src
  })
}

/**
 * detectTag — Guess if a mockup photo is a light or dark product.
 * HOW: draw the photo tiny (32x32), average all pixel brightness.
 * bright => 'light', dark => 'dark', in between => 'mixed'.
 * The user can always correct it manually in the Mockups screen.
 */
export async function detectTag(dataUrl) {
  try {
    const img = await loadImg(dataUrl)
    const cv = document.createElement('canvas')
    const s = 32
    cv.width = s; cv.height = s
    const ctx = cv.getContext('2d')
    ctx.drawImage(img, 0, 0, s, s)
    const d = ctx.getImageData(0, 0, s, s).data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3
    const avg = sum / (d.length / 4)
    return avg > 150 ? 'light' : avg < 90 ? 'dark' : 'mixed'
  } catch { return 'light' }
}

/**
 * guessFromName — Guess placement/variant from the uploaded file name.
 * Example: "cat-mom-light-front.png" -> placement 'front', variant 'light-design'.
 * Just a convenience; the user can change both on the Designs screen.
 */
export function guessFromName(name) {
  const n = name.toLowerCase()
  const placement =
    /back/.test(n) ? 'back' :
    /sleeve[-_ ]?l/.test(n) ? 'sleeve-left' :
    /sleeve[-_ ]?r/.test(n) ? 'sleeve-right' :
    /sleeve/.test(n) ? 'sleeve-left' :
    /pocket/.test(n) ? 'pocket' : 'front'
  const variant = /light/.test(n) ? 'light-design' : /dark/.test(n) ? 'dark-design' : 'dark-design'
  return { placement, variant }
}

// Fixed option lists used by dropdowns in several screens.
export const PLACEMENTS = ['front', 'back', 'sleeve-left', 'sleeve-right', 'pocket', 'full']
export const VARIANTS = [
  ['dark-design', 'Dark design (for light products)'],
  ['light-design', 'Light design (for dark products)'],
  ['universal', 'Universal'],
]

/**
 * Design numbers — the manual grouping system.
 * 'single' = the shop sells ONE artwork (its dark+light color files both stay 'single').
 * '1'..'8' = multiple artworks (e.g. Mommy=1, Daddy=2, Kid=3).
 * Mockup boxes can target a number, so the right artwork lands in the right box.
 */
export const DNUMS = ['single', '1', '2', '3', '4', '5', '6', '7', '8']
export const dnumLabel = (v) => (v === 'single' ? '🎨 Single image' : `Design ${v}`)
