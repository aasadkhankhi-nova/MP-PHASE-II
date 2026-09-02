/**
 * video.js — listing ki MP4 slideshow video (MP Phase I wala system).
 * Generated photos ko 1080x1080 par bari bari dikha kar MP4 banti hai.
 *
 * PLAN A (naya, reliable): WebCodecs VideoEncoder (H.264) + mp4-muxer —
 *   proper MP4 file banti hai, sahi duration ke sath. Chrome/Edge sab me hai.
 * PLAN B (fallback): purana MediaRecorder tareeqa (jin browsers me WebCodecs
 *   nahi ya H.264 encode support nahi).
 * Dono fail hon to Error throw hota hai (wizard user ko wajah dikhata hai) —
 * pehle chupke se null ho jata tha aur video ghayab rehti thi.
 */
import { Muxer, ArrayBufferTarget } from './mp4muxer.js'

const blobToDataUrl = (blob) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob) })

async function loadImgs(dataUrls, max) {
  const imgs = []
  for (const u of dataUrls.slice(0, max)) {
    const im = new Image()
    await new Promise((r) => { im.onload = r; im.onerror = r; im.src = u })
    if (im.width) imgs.push(im)
  }
  return imgs
}

function drawCover(ctx, im, size) {
  const k = Math.max(size / im.width, size / im.height)   // cover fit
  const w = im.width * k, h = im.height * k
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size)
  ctx.drawImage(im, (size - w) / 2, (size - h) / 2, w, h)
}

// ---- PLAN A: WebCodecs + mp4-muxer ----
async function encodeWebCodecs(imgs, { per, size }) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') throw new Error('WebCodecs nahi')
  const fps = 30
  // H.264 codec — pehla supported profile chunein (baseline pehle: sab jagah chalta hai)
  const CODECS = ['avc1.420028', 'avc1.42E028', 'avc1.640028', 'avc1.42001f']
  let codec = null
  for (const c of CODECS) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec: c, width: size, height: size, bitrate: 6_000_000, framerate: fps })
      if (s.supported) { codec = c; break }
    } catch {}
  }
  if (!codec) throw new Error('H.264 encode support nahi')

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: size, height: size },
    fastStart: 'in-memory',   // moov aage — streaming/preview ke liye behtar
  })
  let encErr = null
  const enc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encErr = e },
  })
  enc.configure({ codec, width: size, height: size, bitrate: 6_000_000, framerate: fps })

  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d')
  const perFrames = Math.max(1, Math.round(per * fps))
  let n = 0
  for (const im of imgs) {
    drawCover(ctx, im, size)
    for (let f = 0; f < perFrames; f++) {
      const ts = Math.round((n * 1e6) / fps)
      const dur = Math.round(1e6 / fps)
      const frame = new VideoFrame(c, { timestamp: ts, duration: dur })
      enc.encode(frame, { keyFrame: f === 0 })
      frame.close()
      n++
      if (encErr) throw encErr
      if (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 8))
    }
  }
  await enc.flush()
  enc.close()
  if (encErr) throw encErr
  muxer.finalize()
  const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' })
  if (blob.size < 2000) throw new Error('encoded video khali nikli')
  return await blobToDataUrl(blob)
}

// ---- PLAN B: purana MediaRecorder tareeqa ----
async function encodeMediaRecorder(imgs, { per, size }) {
  const CAND = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ]
  const mime = typeof MediaRecorder !== 'undefined' && CAND.find((m) => MediaRecorder.isTypeSupported(m))
  if (!mime) throw new Error('browser MP4 recording support nahi karta')

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
    const t0 = performance.now()
    while (performance.now() - t0 < per * 1000) {
      drawCover(ctx, im, size)
      await new Promise((r) => setTimeout(r, 33))
    }
  }
  // aakhri frame thora hold + bacha data
  await new Promise((r) => setTimeout(r, 250))
  try { rec.requestData() } catch {}
  rec.stop()
  await stopped
  const blob = new Blob(chunks, { type: mime })
  if (blob.size < 2000) throw new Error('recording khali nikli')
  return await blobToDataUrl(blob)
}

export async function makeSlideshowVideo(dataUrls, { per = 1.1, size = 1080, max = 6 } = {}) {
  const imgs = await loadImgs(dataUrls, max)
  if (!imgs.length) throw new Error('video ke liye koi photo nahi mili')
  try {
    return await encodeWebCodecs(imgs, { per, size })
  } catch (e) {
    console.warn('WebCodecs video fail — MediaRecorder fallback:', e)
    return await encodeMediaRecorder(imgs, { per, size })
  }
}
