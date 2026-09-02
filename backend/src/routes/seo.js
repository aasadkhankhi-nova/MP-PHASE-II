/**
 * routes/seo.js — AI SEO generation (Google Gemini, SERVER-SIDE).
 * The frontend sends design images + product info; Gemini looks at the
 * artwork and writes an Etsy title, tags, description and ALT text.
 *
 * API key: EACH USER brings their own Gemini key (entered on the app's
 * Account screen; sent along with the request). If a request has no key,
 * we fall back to the server's own GEMINI_API_KEY env var (if set).
 * Retries handle rate limits (429) and temporary server errors,
 * and we fall back between model names.
 */
import { Router } from 'express'

const router = Router()
// MODEL LADDER (MP Phase I wala system): har model ka APNA alag daily free
// quota hota hai — ek ka pool khatam ho to agla model foran kaam deta hai.
// CURRENT free-tier models (Aug 2026) pehle — purane naam sirf tail-fallback:
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash']

// PACING: Google ka free tier ~5 requests/minute deta hai. Har API key ke
// liye calls ke darmiyan kam az kam GAP rakhtay hain (in-memory, per key).
const GEM_GAP = 15_000
const GEM_LAST = new Map()   // key(last 8 chars) -> last call time
async function gemPace(key) {
  const k = String(key).slice(-8)
  const w = (GEM_LAST.get(k) || 0) + GEM_GAP - Date.now()
  if (w > 0) await new Promise((r) => setTimeout(r, w))
  GEM_LAST.set(k, Date.now())
}

// Google 429 me batata hai kitna rukna hai (retry-after / retryDelay) — usay parhtay hain
function gemRetrySecs(j, res, att) {
  let s = 0
  try { const ra = res?.headers?.get('retry-after'); if (ra) s = parseInt(ra) || 0 } catch {}
  try {
    for (const d of j?.error?.details || []) {
      const m = String(d.retryDelay || '').match(/(\d+)/)
      if (m) s = Math.max(s, parseInt(m[1]))
    }
  } catch {}
  if (!s) s = Math.min(60, 15 + att * 12)
  return Math.min(70, s + 2)
}

// Low-level Gemini call: pacing + model ladder + PerDay-quota par foran agla model.
// userKey = the key the user saved in the app (preferred).
async function gemCall(body, userKey) {
  const key = userKey || process.env.GEMINI_API_KEY
  if (!key) throw Object.assign(new Error('Gemini API key nahi mili — app ke Account screen par apni key dalein'), { status: 400 })
  let last
  for (const model of MODELS) {
    for (let att = 0; att < 3; att++) {
      await gemPace(key)
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      )
      if (res.ok) return res.json()
      let j = null
      try { j = await res.json() } catch {}
      const emsg = j?.error?.message ? `: ${String(j.error.message).slice(0, 160)}` : ''
      last = Object.assign(new Error(`Gemini HTTP ${res.status}${emsg}`), { status: res.status })
      if (res.status === 429) {
        // DAILY quota khatam? intezar bekar hai — AGLA model foran try karo
        // (har model ka apna alag daily pool hota hai)
        if (/PerDay|per day/i.test(JSON.stringify(j || {}))) break
        // per-minute limit: Google jitna kahe utna ruk kar dobara
        if (att < 2) { await new Promise((r) => setTimeout(r, gemRetrySecs(j, res, att) * 1000)); continue }
        break
      }
      if (res.status >= 500 && att < 2) { await new Promise((r) => setTimeout(r, 5000 + att * 5000)); continue }
      break  // other errors: don't retry this model
    }
    if (last && ![404, 429].includes(last.status) && last.status < 500) break
  }
  if (last && last.status === 429) {
    last.message = 'Sab Gemini models ka aaj ka free quota khatam lagta hai (reset ~dopahar PKT) — ' +
      'Account settings me provider Groq ya OpenRouter par switch karein (dono ka apna free quota hai). [' + last.message + ']'
  }
  throw last
}

// OpenAI-compatible call (OpenAI / Groq / OpenRouter — same protocol).
// Vision: images travel as data-URLs inside the chat message.
// OpenAI TOKEN-SAVER (Phase I v35 wala system): mini models par image-tokens
// ~33x gin kar charge hote hain — is liye sirf 1 image + detail:'low' (~2.8k
// tokens fixed), aur gpt-5 family par hidden reasoning bhi 'low'.
const OAI_MODELS = {
  groq: ['qwen/qwen3.6-27b'],
  openrouter: ['google/gemma-4-31b-it:free'],
  openai: ['gpt-5-mini', 'gpt-5-nano', 'gpt-4o-mini'],   // ladder: 404/429 par agla
}
async function oaiCall(provider, key, sys, userText, images) {
  const base = provider === 'groq' ? 'https://api.groq.com/openai/v1'
    : provider === 'openrouter' ? 'https://openrouter.ai/api/v1'
    : 'https://api.openai.com/v1'
  const imgs = provider === 'openai' ? images.slice(0, 1) : images
  const content = [
    { type: 'text', text: userText + (provider === 'openai' ? '\nNote: only the FIRST artwork image is attached — analyze it fully (read all lettering).' : '') },
    ...imgs.map((b) => ({ type: 'image_url', image_url: { url: 'data:image/png;base64,' + b, ...(provider === 'openai' ? { detail: 'low' } : {}) } })),
  ]
  let last
  for (const model of (OAI_MODELS[provider] || OAI_MODELS.openai)) {
    for (let att = 0; att < 2; att++) {
      const body = { model, max_tokens: 2048, messages: [{ role: 'system', content: sys }, { role: 'user', content }] }
      if (/^gpt-5/.test(model)) body.reasoning_effort = 'low'   // SEO ko gehri soch nahi chahiye — chhupe tokens bachao
      const r2 = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify(body),
      })
      const j = await r2.json().catch(() => ({}))
      if (r2.ok) {
        const tx = j.choices?.[0]?.message?.content || ''
        if (tx.trim()) return tx
        last = Object.assign(new Error(`empty response (${model})`), { status: 500 }); break
      }
      last = Object.assign(new Error((j.error?.message || `HTTP ${r2.status}`) + ` (${model})`), { status: r2.status })
      if (r2.status === 429 && att < 1) { await new Promise((r) => setTimeout(r, 15000)); continue }
      break   // 404 / dead model -> ladder ka agla model
    }
  }
  throw last
}

// POST /api/seo/generate { images: [base64...], category, keywords, apiKey, provider }
router.post('/generate', async (req, res) => {
  try {
    const { images = [], category = 'Canvas', keywords = '', apiKey = '', provider = 'gemini' } = req.body

    // The "system" prompt defines the exact JSON we want back and the
    // Etsy rules — Phase I v33 wale HARD length rules (chhota SEO qabool nahi).
    const sys =
      'You are an Etsy SEO copywriting assistant for print-on-demand products. ' +
      'Look at the artwork image(s), READ any lettering word by word, and produce strictly valid JSON: ' +
      '{"title":"...","tags":["..."],"description":"...","alt":"...","alts":["..."],"vision":{"subject":"...","theme":"...","text":"..."}}. ' +
      'Rules: title MUST be 130-140 characters long — a HARD requirement, never short; build it as 4-6 keyword-rich buyer search phrases separated by commas (most searched first), combining artwork subject/theme + product type + audience/occasion/gift angles. ' +
      'tags: EXACTLY 13 items, each a MULTI-WORD long-tail phrase 12-20 characters (2-3 words) real Etsy buyers search — never single generic words, no duplicates. ' +
      'description: 270-300 characters — use the FULL 300 budget, never less than 270 — about THE DESIGN itself (what it shows, quoted text, style/colors/mood) on the given product, ending with a soft call to action. ' +
      'alt: 150-250 chars factual visual description of THE DESIGN (its lettering, style, colors, mood) on the product. ' +
      'alts: EXACTLY 8 DIFFERENT alt-text variations, each 120-250 chars, ALL describing THE DESIGN from different angles (wording, mood, occasion, audience) — never file names, never placeholder words. ' +
      'Never use brand names, characters, celebrities or famous slogans. No text outside the JSON.'

    const userTxt = `Product type: "${category}". Extra keywords: "${keywords}". Output only the JSON.`
    const parts = [
      ...images.slice(0, 3).map((b) => ({ inline_data: { mime_type: 'image/png', data: b } })),
      { text: userTxt },
    ]
    // 2 rounds: agar model chhota SEO de (title/desc/tags adhure) to EK bar dobara
    let seo = null, lastErr = null
    for (let round = 0; round < 2 && !seo; round++) {
      let txt = ''
      // which AI to call? gemini = Google's own API; openai/groq/openrouter = OpenAI-style
      if (provider === 'openai' || provider === 'groq' || provider === 'openrouter') {
        txt = await oaiCall(provider, apiKey, sys, userTxt, images.slice(0, 3))
      } else {
        const j = await gemCall({
          system_instruction: { parts: [{ text: sys }] },
          contents: [{ parts }],
          generationConfig: { maxOutputTokens: 2048, responseMimeType: 'application/json' },
        }, apiKey)
        txt = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')
      }
      const m = txt.match(/\{[\s\S]*\}/)
      if (!m) { lastErr = 'no JSON in AI response'; continue }
      const o = JSON.parse(m[0])
      // lambe tags DROP nahi hote — word-boundary par 20 tak tarashe jate hain
      o.tags = [...new Set((o.tags || []).map((x) => {
        let t = String(x).trim().toLowerCase()
        if (t.length > 20) { t = t.slice(0, 20); const c = t.lastIndexOf(' '); if (c > 9) t = t.slice(0, c); t = t.trim() }
        return t
      }).filter(Boolean))].slice(0, 13)
      // alt/alts: Etsy ki 250-char limit par tarasho; alts = design-based variations
      o.alt = String(o.alt || '').trim().slice(0, 250)
      o.alts = (Array.isArray(o.alts) ? o.alts : []).map((s) => String(s).trim().slice(0, 250)).filter(Boolean).slice(0, 10)
      const tl = String(o.title || '').length, dl = String(o.description || '').length
      if (round === 0 && (tl < 110 || dl < 220 || o.tags.length < 13)) { lastErr = `SEO adhura (title ${tl}, desc ${dl}, ${o.tags.length}/13 tags)`; continue }
      seo = o
    }
    if (!seo) throw new Error(lastErr || 'AI se poora SEO nahi mila')
    res.json({ ok: true, seo })
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.message })
  }
})

export default router
