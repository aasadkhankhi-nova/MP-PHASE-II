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
// MODEL LADDER (the MP Phase I system): every model has its OWN separate daily free
// quota — when one pool runs out the next model takes over immediately.
// CURRENT free-tier models (Aug 2026) first — older names only as tail fallback:
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash']

// PACING: Google's free tier allows ~5 requests/minute. For each API key
// we keep a minimum GAP between calls (in-memory, per key).
const GEM_GAP = 15_000
const GEM_LAST = new Map()   // key(last 8 chars) -> last call time
async function gemPace(key) {
  const k = String(key).slice(-8)
  const w = (GEM_LAST.get(k) || 0) + GEM_GAP - Date.now()
  if (w > 0) await new Promise((r) => setTimeout(r, w))
  GEM_LAST.set(k, Date.now())
}

// Google's 429 says how long to wait (retry-after / retryDelay) — we read it
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

// Low-level Gemini call: pacing + model ladder + on a PerDay quota hit, switch to the next model immediately.
// userKey = the key the user saved in the app (preferred).
async function gemCall(body, userKey) {
  const key = userKey || process.env.GEMINI_API_KEY
  if (!key) throw Object.assign(new Error('No Gemini API key found — add your key on the Account screen in the app'), { status: 400 })
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
        // DAILY quota used up? waiting is pointless — try the NEXT model immediately
        // (every model has its own separate daily pool)
        if (/PerDay|per day/i.test(JSON.stringify(j || {}))) break
        // per-minute limit: wait as long as Google says, then retry
        if (att < 2) { await new Promise((r) => setTimeout(r, gemRetrySecs(j, res, att) * 1000)); continue }
        break
      }
      if (res.status >= 500 && att < 2) { await new Promise((r) => setTimeout(r, 5000 + att * 5000)); continue }
      break  // other errors: don't retry this model
    }
    if (last && ![404, 429].includes(last.status) && last.status < 500) break
  }
  if (last && last.status === 429) {
    last.message = 'Today\'s free quota for all Gemini models seems to be used up (resets ~noon PKT) — ' +
      'switch the provider to Groq or OpenRouter in Account settings (both have their own free quota). [' + last.message + ']'
  }
  throw last
}

// OpenAI-compatible call (OpenAI / Groq / OpenRouter — same protocol).
// Vision: images travel as data-URLs inside the chat message.
// OpenAI TOKEN-SAVER (the Phase I v35 system): on mini models image tokens
// are charged ~33x — so only 1 image + detail:'low' (~2.8k
// tokens fixed), and hidden reasoning is also 'low' on the gpt-5 family.
const OAI_MODELS = {
  groq: ['qwen/qwen3.6-27b'],
  openrouter: ['google/gemma-4-31b-it:free'],
  openai: ['gpt-5-mini', 'gpt-5-nano', 'gpt-4o-mini'],   // ladder: next one on 404/429
}
async function oaiCall(provider, key, sys, userText, images) {
  const base = provider === 'groq' ? 'https://api.groq.com/openai/v1'
    : provider === 'openrouter' ? 'https://openrouter.ai/api/v1'
    : 'https://api.openai.com/v1'
  const imgs = provider === 'openai' ? images.slice(0, 1) : images
  const content = [
    { type: 'text', text: userText + (provider === 'openai' ? '\nNote: only the FIRST artwork image is attached — analyze it fully (read all lettering).' : '') },
    ...imgs.map((b) => ({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b, ...(provider === 'openai' ? { detail: 'low' } : {}) } })),
  ]
  let last
  for (const model of (OAI_MODELS[provider] || OAI_MODELS.openai)) {
    for (let att = 0; att < 2; att++) {
      const body = { model, max_tokens: 2048, messages: [{ role: 'system', content: sys }, { role: 'user', content }] }
      if (/^gpt-5/.test(model)) body.reasoning_effort = 'low'   // SEO doesn't need deep thinking — save hidden tokens
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
      break   // 404 / dead model -> next model in the ladder
    }
  }
  throw last
}

// long tags are NOT dropped — they are trimmed to 20 chars at a word boundary
const trimTags = (arr) => [...new Set((arr || []).map((x) => {
  let t = String(x).trim().toLowerCase()
  if (t.length > 20) { t = t.slice(0, 20); const c = t.lastIndexOf(' '); if (c > 9) t = t.slice(0, c); t = t.trim() }
  return t
}).filter(Boolean))].slice(0, 13)

// POST /api/seo/generate { images: [base64...], category, keywords, apiKey, provider,
//   only?: 'title'|'tags'|'description', vision?: {subject,theme,text}, prev?: ... }
// `only` = REGENERATE mode: only that ONE field is regenerated, as a TEXT-ONLY
// call (no image — the `vision` info from the first generation is reused)
// — so it costs almost no tokens (TOKEN-SAVER).
router.post('/generate', async (req, res) => {
  try {
    const { images = [], category = 'Canvas', keywords = '', apiKey = '', provider = 'gemini', only = '', vision = null, prev = null } = req.body

    if (only === 'title' || only === 'tags' || only === 'description') {
      const v = vision || {}
      const rules = {
        title: 'Return strictly valid JSON {"title":"..."}. title MUST be 130-140 characters long — a HARD requirement, never short; 4-6 keyword-rich buyer search phrases separated by commas (most searched first), combining design subject/theme + product type + audience/occasion/gift angles.',
        tags: 'Return strictly valid JSON {"tags":["..."]}. EXACTLY 13 items, each a MULTI-WORD long-tail phrase 12-20 characters (2-3 words) real Etsy buyers search — never single generic words, no duplicates.',
        description: 'Return strictly valid JSON {"description":"..."}. 270-300 characters — use the FULL 300 budget, never less than 270 — about THE DESIGN itself (what it shows, quoted text, style/colors/mood) on the given product, ending with a soft call to action.',
      }[only]
      const sys2 = 'You are an Etsy SEO copywriting assistant for print-on-demand products. ' + rules +
        ' Never use brand names, characters, celebrities or famous slogans. No text outside the JSON.'
      const userTxt2 =
        `The design (from an earlier vision analysis): subject="${v.subject || ''}", theme="${v.theme || ''}", lettering on artwork="${v.text || ''}". ` +
        `Product type: "${category}". Extra keywords: "${keywords}". ` +
        (prev ? `The previous ${only} was: ${JSON.stringify(prev).slice(0, 700)} — produce a CLEARLY DIFFERENT new one. ` : '') +
        'Output only the JSON.'
      let seo = null, lastErr = null
      for (let round = 0; round < 2 && !seo; round++) {
        let txt = ''
        if (provider === 'openai' || provider === 'groq' || provider === 'openrouter') {
          txt = await oaiCall(provider, apiKey, sys2, userTxt2, [])   // NO images
        } else {
          const j = await gemCall({
            system_instruction: { parts: [{ text: sys2 }] },
            contents: [{ parts: [{ text: userTxt2 }] }],
            generationConfig: { maxOutputTokens: 1024, responseMimeType: 'application/json' },
          }, apiKey)
          txt = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')
        }
        const m = txt.match(/\{[\s\S]*\}/)
        if (!m) { lastErr = 'no JSON in AI response'; continue }
        const o = JSON.parse(m[0])
        if (only === 'tags') {
          const tags = trimTags(o.tags)
          if (round === 0 && tags.length < 13) { lastErr = `${tags.length}/13 tags`; continue }
          seo = { tags }
        } else if (only === 'title') {
          const t = String(o.title || '').trim()
          if (round === 0 && t.length < 110) { lastErr = `title too short (${t.length})`; continue }
          seo = { title: t.slice(0, 140) }
        } else {
          const d = String(o.description || '').trim()
          if (round === 0 && d.length < 220) { lastErr = `description too short (${d.length})`; continue }
          seo = { description: d }
        }
      }
      if (!seo) throw new Error(lastErr || `${only} could not be regenerated`)
      return res.json({ ok: true, seo })
    }

    // The "system" prompt defines the exact JSON we want back and the
    // Etsy rules — the Phase I v33 HARD length rules (short SEO is not accepted).
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
      ...images.slice(0, 3).map((b) => ({ inline_data: { mime_type: 'image/jpeg', data: b } })),
      { text: userTxt },
    ]
    // 2 rounds: if the model returns short SEO (incomplete title/desc/tags), retry ONCE
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
      o.tags = trimTags(o.tags)
      // alt/alts: trim to Etsy's 250-char limit; alts = design-based variations
      o.alt = String(o.alt || '').trim().slice(0, 250)
      o.alts = (Array.isArray(o.alts) ? o.alts : []).map((s) => String(s).trim().slice(0, 250)).filter(Boolean).slice(0, 10)
      const tl = String(o.title || '').length, dl = String(o.description || '').length
      if (round === 0 && (tl < 110 || dl < 220 || o.tags.length < 13)) { lastErr = `SEO adhura (title ${tl}, desc ${dl}, ${o.tags.length}/13 tags)`; continue }
      seo = o
    }
    if (!seo) throw new Error(lastErr || 'Could not get complete SEO from the AI')
    res.json({ ok: true, seo })
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.message })
  }
})

export default router
