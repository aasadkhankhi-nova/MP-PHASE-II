/**
 * index.js — The BACKEND SERVER (Node.js + Express), hosted on Render.
 * This is the only thing that talks to the database and to Google Gemini.
 * The browser never holds any secret keys — they live here as
 * environment variables (set in the Render dashboard):
 *   DATABASE_URL         Supabase Postgres connection string
 *   GEMINI_API_KEY       Google Gemini key (for SEO)
 *   SUPABASE_URL         https://<project>.supabase.co
 *   SUPABASE_ANON_KEY    public (publishable) key — used to verify logins
 *   SUPABASE_SERVICE_KEY secret key — used for file Storage uploads
 *   CORS_ORIGINS         comma-separated list of allowed website origins
 *   ETSY_API_KEY         Etsy app keystring (for the Etsy integration)
 */
import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import seoRoutes from './routes/seo.js'
import storeRoutes from './routes/stores.js'
import authRoutes from './routes/auth.js'
import workspaceRoutes from './routes/workspace.js'
import uploadRoutes from './routes/upload.js'
import etsyRoutes from './routes/etsy.js'
import { pool } from './db.js'

const app = express()
// 25mb limit because design/mockup images travel as base64 in JSON.
app.use(express.json({ limit: '25mb' }))

// CORS: only allow requests from our own website(s).
const origins = (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim())
app.use(cors({ origin: origins.includes('*') ? true : origins }))

/**
 * GET /api/health — quick self-check used by the app's status chip
 * and by monitoring. Reports whether db / auth / storage are configured.
 */
app.get('/api/health', async (_req, res) => {
  let db = 'not configured'
  if (pool) {
    try { await pool.query('select 1'); db = 'ok' } catch (e) { db = 'error: ' + e.message }
  }
  const auth = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? 'ok' : 'not configured'
  const storage = process.env.SUPABASE_SERVICE_KEY ? 'ok' : 'not configured'
  const etsy = process.env.ETSY_API_KEY ? 'ok' : 'not configured'
  res.json({ ok: true, service: 'mp-backend', version: '2.2.0', db, auth, storage, etsy, time: new Date().toISOString() })
})

// Mount all route groups under /api/...
app.use('/api/auth', authRoutes)           // signup / login
app.use('/api/seo', seoRoutes)             // AI SEO (Gemini)
app.use('/api/stores', storeRoutes)        // stores CRUD (per user)
app.use('/api/workspace', workspaceRoutes) // full workspace pull/push (per store)
app.use('/api/upload', uploadRoutes)       // image upload -> Supabase Storage
app.use('/api/etsy', etsyRoutes)           // Etsy shop connect + publish drafts

const port = process.env.PORT || 4000
app.listen(port, () => console.log(`mp-backend listening on :${port}`))
