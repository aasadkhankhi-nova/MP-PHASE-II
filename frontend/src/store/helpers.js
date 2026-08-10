export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

export function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image()
    if (/^https?:/.test(src)) im.crossOrigin = 'anonymous'  // cloud images: keep canvas clean
    im.onload = () => res(im)
    im.onerror = rej
    im.src = src
  })
}

// Auto light/dark tag from image brightness (ported from legacy app)
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

// Guess placement/variant from filename (ported from legacy)
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

export const PLACEMENTS = ['front', 'back', 'sleeve-left', 'sleeve-right', 'pocket', 'full']
export const VARIANTS = [
  ['dark-design', 'Dark design (for light products)'],
  ['light-design', 'Light design (for dark products)'],
  ['universal', 'Universal'],
]
export const DNUMS = ['single', '1', '2', '3', '4', '5', '6', '7', '8']
export const dnumLabel = (v) => (v === 'single' ? '🎨 Single image' : `Design ${v}`)
