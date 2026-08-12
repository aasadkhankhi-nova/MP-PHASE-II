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
const MODELS = ['gemini-2.5-flash', 'gemini-flash-latest']  // try in order

// Low-level Gemini call with retry + model fallback.
// userKey = the key the user saved in the app (preferred).
async function gemCall(body, userKey) {
  const key = userKey || process.env.GEMINI_API_KEY
  if (!key) throw Object.assign(new Error('Gemini API key nahi mili — app ke Account screen par apni key dalein'), { status: 400 })
  let last
  for (const model of MODELS) {
    for (let att = 0; att < 3; att++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      )
      if (res.ok) return res.json()
      last = Object.assign(new Error(`Gemini HTTP ${res.status}`), { status: res.status })
      if (res.status === 429 || res.status >= 500) {           // rate limit / server issue
        await new Promise((r) => setTimeout(r, 4000 + att * 4000))  // wait, then retry
        continue
      }
      break  // other errors: don't retry this model
    }
    if (last && ![404, 429].includes(last.status) && last.status < 500) break
  }
  throw last
}

// OpenAI-compatible call (Groq / OpenRouter speak the same protocol).
// Vision: images travel as data-URLs inside the chat message.
async function oaiCall(provider, key, sys, userText, images) {
  const base = provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://openrouter.ai/api/v1'
  const model = provider === 'groq' ? 'qwen/qwen3.6-27b' : 'google/gemma-4-31b-it:free'
  const content = [
    { type: 'text', text: userText },
    ...images.map((b) => ({ type: 'image_url', image_url: { url: 'data:image/png;base64,' + b } })),
  ]
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'system', content: sys }, { role: 'user', content }] }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(j.error?.message || `HTTP ${res.status}`), { status: res.status })
  return j.choices?.[0]?.message?.content || ''
}

// POST /api/seo/generate { images: [base64...], category, keywords, apiKey, provider }
router.post('/generate', async (req, res) => {
  try {
    const { images = [], category = 'Canvas', keywords = '', apiKey = '', provider = 'gemini' } = req.body

    // The "system" prompt defines the exact JSON we want back and the
    // Etsy rules (length limits, no brand names, etc.).
    const sys =
      'You are an Etsy SEO copywriting assistant for print-on-demand wall art. ' +
      'Look at the artwork image(s), read any lettering, and produce strictly valid JSON: ' +
      '{"title":"...","tags":["..."],"description":"...","alt":"...","vision":{"subject":"...","theme":"...","text":"..."}}. ' +
      'Rules: title <=140 chars keyword-rich; up to 13 tags each <=20 chars; description <=300 chars about the design; ' +
      'alt 300-500 chars factual visual description; never use brand names, characters, celebrities or famous slogans.'

    const parts = [
      ...images.slice(0, 3).map((b) => ({ inline_data: { mime_type: 'image/png', data: b } })),
      { text: `Product type: "${category}". Extra keywords: "${keywords}". Output only the JSON.` },
    ]
    // which AI to call? gemini = Google's own API; groq/openrouter = OpenAI-style
    let txt = ''
    if (provider === 'groq' || provider === 'openrouter') {
      txt = await oaiCall(provider, apiKey, sys, `Product type: "${category}". Extra keywords: "${keywords}". Output only the JSON.`, images.slice(0, 3))
    } else {
      const j = await gemCall({
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: 2048, responseMimeType: 'application/json' },
      }, apiKey)
      txt = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')
    }
    const m = txt.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no JSON in AI response')
    res.json({ ok: true, seo: JSON.parse(m[0]) })
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.message })
  }
})

export default router
