// Postgres (Supabase) connection pool. Backend is the ONLY thing that talks to the DB.
import pg from 'pg'
import 'dotenv/config'

export const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
    })
  : null

export async function q(text, params) {
  if (!pool) throw new Error('DATABASE_URL not configured')
  const res = await pool.query(text, params)
  return res.rows
}
