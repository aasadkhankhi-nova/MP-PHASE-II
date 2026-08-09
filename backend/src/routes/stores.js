// Stores CRUD — every workspace object (mockups/designs/listings) belongs to a store.
import { Router } from 'express'
import { q } from '../db.js'

const router = Router()

router.get('/', async (_req, res) => {
  try { res.json({ ok: true, stores: await q('select * from stores order by created_at') }) }
  catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

router.post('/', async (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ ok: false, error: 'name required' })
    const rows = await q('insert into stores (name) values ($1) returning *', [name.trim()])
    res.json({ ok: true, store: rows[0] })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

router.patch('/:id', async (req, res) => {
  try {
    const rows = await q('update stores set name=$2 where id=$1 returning *', [req.params.id, req.body.name])
    res.json({ ok: true, store: rows[0] })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

router.delete('/:id', async (req, res) => {
  try { await q('delete from stores where id=$1', [req.params.id]); res.json({ ok: true }) }
  catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

export default router
