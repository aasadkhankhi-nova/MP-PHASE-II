/**
 * video.js — MP4 slideshow video for a listing (the MP Phase I system).
 * Shows the generated photos one by one at 1080x1080 and builds an MP4.
 *
 * PLAN A (new, reliable): WebCodecs VideoEncoder (H.264) + mp4-muxer —
 *   produces a proper MP4 file with the correct duration. Available in Chrome/Edge.
 * PLAN B (fallback): the old MediaRecorder method (for browsers without WebCodecs
 *   or without H.264 encode support).
 * If both fail an Error is thrown (the wizard shows the user why) —
 * previously it silently returned null and the video went missing.
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
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') throw new Error('WebCodecs not available')
  const fps = 30
  // H.264 codec — pick the first supported profile (baseline first: works everywhere)
  const CODECS = ['avc1.420028', 'avc1.42E028', 'avc1.640028', 'avc1.42001f']
  let codec = null
  for (const c of CODECS) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec: c, width: size, height: size, bitrate: 6_000_000, framerate: fps })
      if (s.supported) { codec = c; break }
    } catch {}
  }
  if (!codec) throw new Error('H.264 encoding not supported')

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: size, height: size },
    fastStart: 'in-memory',   // moov first — better for streaming/preview
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

// ---- PLAN B: old MediaRecorder method ----
async function encodeMediaRecorder(imgs, { per, size }) {
  const CAND = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ]
  const mime = typeof MediaRecorder !== 'undefined' && CAND.find((m) => MediaRecorder.isTypeSupported(m))
  if (!mime) throw new Error('This browser does not support MP4 recording')

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
  // hold the last frame briefly + flush remaining data
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
  if (!imgs.length) throw new Error('No photos found for the video')
  try {
    return await encodeWebCodecs(imgs, { per, size })
  } catch (e) {
    console.warn('WebCodecs video fail — MediaRecorder fallback:', e)
    return await encodeMediaRecorder(imgs, { per, size })
  }
}
