// SEO generation — Gemini runs SERVER-SIDE so the API key never reaches the browser.
import { Router } from 'express'

const router = Router()
const MODELS = ['gemini-2.5-flash', 'gemini-flash-latest']

async function gemCall(body) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw Object.assign(new Error('GEMINI_API_KEY not configured on server'), { status: 503 })
  let last
  for (const model of MODELS) {
    for (let att = 0; att < 3; att++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      )
      if (res.ok) return res.json()
      last = Object.assign(new Error(`Gemini HTTP ${res.status}`), { status: res.status })
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 4000 + att * 4000))
        continue
      }
      break
    }
    if (last && ![404, 429].includes(last.status) && last.status < 500) break
  }
  throw last
}

// POST /api/seo/generate  { images: [base64...], category, keywords }
router.post('/generate', async (req, res) => {
  try {
    const { images = [], category = 'Canvas', keywords = '' } = req.body
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
    const j = await gemCall({
      system_instruction: { parts: [{ text: sys }] },
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: 2048, responseMimeType: 'application/json' },
    })
    const txt = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('')
    const m = txt.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no JSON in AI response')
    res.json({ ok: true, seo: JSON.parse(m[0]) })
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.message })
  }
})

export default router
