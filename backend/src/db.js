/**
 * db.js — PostgreSQL (Supabase) connection pool.
 * The BACKEND is the only thing that connects to the database;
 * the browser can never reach it directly.
 * Uses the pooled ("Session pooler") connection string from Supabase.
 */
import pg from 'pg'
import 'dotenv/config'

export const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },  // Supabase uses TLS; cert chain relaxed for pooler
      max: 5,                              // small pool — Render free tier is single instance
    })
  : null

// q — tiny helper: run a parameterized query, return rows.
// ALWAYS use $1,$2… parameters (never string-concatenate) to stay SQL-injection safe.
export async function q(text, params) {
  if (!pool) throw new Error('DATABASE_URL not configured')
  const res = await pool.query(text, params)
  return res.rows
}
