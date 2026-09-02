/**
 * video.js — listing ki MP4 slideshow video (MP Phase I wala system).
 * Generated photos ko 1080x1080 canvas par bari bari dikha kar
 * MediaRecorder se MP4 banate hain (Etsy webm reject karta hai, MP4 leta hai).
 * Agar browser MP4 recording support na kare to null (video skip).
 */
export async function makeSlideshowVideo(dataUrls, { per = 1.1, size = 1080, max = 6 } = {}) {
  const CAND = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ]
  const mime = typeof MediaRecorder !== 'undefined' && CAND.find((m) => MediaRecorder.isTypeSupported(m))
  if (!mime) return null

  const imgs = []
  for (const u of dataUrls.slice(0, max)) {
    const im = new Image()
    await new Promise((r, j) => { im.onload = r; im.onerror = r; im.src = u })
    if (im.width) imgs.push(im)
  }
  if (!imgs.length) return null

  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d')
  const stream = c.captureStream(30)
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 })
  const chunks = []
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
  const stopped = new Promise((r) => { rec.onstop = r })
  rec.start(200)

  for (const im of imgs) {
    const k = Math.max(size / im.width, size / im.height)   // cover fit
    const w = im.width * k, h = im.height * k
    const t0 = performance.now()
    while (performance.now() - t0 < per * 1000) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size)
      ctx.drawImage(im, (size - w) / 2, (size - h) / 2, w, h)
      await new Promise((r) => setTimeout(r, 33))
    }
  }
  // aakhri frame thora sa hold + bacha hua data nikalo (kuch browsers me
  // warna video ka end katta hai ya file adhoori rehti hai)
  await new Promise((r) => setTimeout(r, 250))
  try { rec.requestData() } catch {}
  rec.stop()
  await stopped
  const blob = new Blob(chunks, { type: mime })
  if (blob.size < 2000) return null
  return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob) })
}
