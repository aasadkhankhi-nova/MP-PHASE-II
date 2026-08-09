import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import seoRoutes from './routes/seo.js'
import storeRoutes from './routes/stores.js'
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
  res.json({ ok: true, service: 'mp-backend', version: '2.0.0', db, time: new Date().toISOString() })
})

app.use('/api/seo', seoRoutes)
app.use('/api/stores', storeRoutes)

const port = process.env.PORT || 4000
app.listen(port, () => console.log(`mp-backend listening on :${port}`))
