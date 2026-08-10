import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import seoRoutes from './routes/seo.js'
import storeRoutes from './routes/stores.js'
import authRoutes from './routes/auth.js'
import workspaceRoutes from './routes/workspace.js'
import uploadRoutes from './routes/upload.js'
import { pool } from './db.js'

const app = express()
app.use(express.json({ limit: '25mb' }))

const origins = (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim())
app.use(cors({ origin: origins.includes('*') ? true : origins }))

app.get('/api/health', async (_req, res) => {
  let db = 'not configured'
  if (pool) {
    try { await pool.query('select 1'); db = 'ok' } catch (e) { db = 'error: ' + e.message }
  }
  const auth = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? 'ok' : 'not configured'
  const storage = process.env.SUPABASE_SERVICE_KEY ? 'ok' : 'not configured'
  res.json({ ok: true, service: 'mp-backend', version: '2.1.0', db, auth, storage, time: new Date().toISOString() })
})

app.use('/api/auth', authRoutes)
app.use('/api/seo', seoRoutes)
app.use('/api/stores', storeRoutes)
app.use('/api/workspace', workspaceRoutes)
app.use('/api/upload', uploadRoutes)

const port = process.env.PORT || 4000
app.listen(port, () => console.log(`mp-backend listening on :${port}`))
