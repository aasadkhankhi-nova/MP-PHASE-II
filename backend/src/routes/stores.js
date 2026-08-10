/**
 * routes/stores.js — Stores CRUD.
 * A store is the top-level container (one Etsy shop = one store).
 * EVERY query filters by req.user.id, so users can only ever see and
 * change their OWN stores — this is the data-isolation boundary.
 */
import { Router } from 'express'
import { q } from '../db.js'
import { requireUser } from '../auth.js'

const router = Router()
router.use(requireUser)  // all store routes need a valid login

// GET /api/stores -> this user's stores
router.get('/', async (req, res) => {
  try { res.json({ ok: true, stores: await q('select * from stores where user_id=$1 order by created_at', [req.user.id]) }) }
  catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// POST /api/stores { name } -> create a store owned by this user
router.post('/', async (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ ok: false, error: 'name required' })
    const rows = await q('insert into stores (name, user_id) values ($1,$2) returning *', [name.trim(), req.user.id])
    res.json({ ok: true, store: rows[0] })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// PATCH /api/stores/:id { name } -> rename (only if owned by this user)
router.patch('/:id', async (req, res) => {
  try {
    const rows = await q('update stores set name=$3 where id=$1 and user_id=$2 returning *', [req.params.id, req.user.id, req.body.name])
    res.json({ ok: true, store: rows[0] })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// DELETE /api/stores/:id -> delete store; child rows (mockups, designs,
// listings…) are removed automatically by "on delete cascade" in the schema.
router.delete('/:id', async (req, res) => {
  try { await q('delete from stores where id=$1 and user_id=$2', [req.params.id, req.user.id]); res.json({ ok: true }) }
  catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

export default router
