/**
 * routes/workspace.js — Whole-workspace sync for one store.
 *   GET  /api/workspace/:storeId  -> download everything (pull)
 *   PUT  /api/workspace/:storeId  -> replace everything (push)
 *
 * WHY replace-all: the frontend auto-saves the complete workspace
 * (debounced), which is much simpler and safer than tracking individual
 * row changes. The PUT runs inside a TRANSACTION: delete old rows +
 * insert new ones — either everything succeeds or nothing changes.
 * Images are URLs only (uploaded separately via /api/upload).
 */
import { Router } from 'express'
import { pool, q } from '../db.js'
import { requireUser } from '../auth.js'

const router = Router()
router.use(requireUser)

// Safety check used by both endpoints: does this store belong to this user?
async function ownStore(storeId, userId) {
  const r = await q('select id from stores where id=$1 and user_id=$2', [storeId, userId])
  return r.length > 0
}

router.get('/:storeId', async (req, res) => {
  try {
    const { storeId } = req.params
    if (!(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    // fetch all four tables in parallel
    const [mockups, designs, sets, listings] = await Promise.all([
      q('select * from mockups where store_id=$1 order by created_at', [storeId]),
      q('select * from designs where store_id=$1 order by created_at', [storeId]),
      q('select * from sets where store_id=$1 order by created_at', [storeId]),
      q('select * from listings where store_id=$1 order by created_at', [storeId]),
    ])
    res.json({ ok: true, ws: { mockups, designs, sets, listings } })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

router.put('/:storeId', async (req, res) => {
  const client = await pool.connect()
  try {
    const { storeId } = req.params
    if (!(await ownStore(storeId, req.user.id))) return res.status(404).json({ ok: false, error: 'store not found' })
    const { mockups = [], designs = [], sets = [], listings = [] } = req.body.ws || {}

    await client.query('begin')  // ---- transaction start ----
    for (const t of ['mockups', 'designs', 'sets', 'listings'])
      await client.query(`delete from ${t} where store_id=$1`, [storeId])
    for (const m of mockups)
      await client.query(
        'insert into mockups (id, store_id, name, color_tag, image_url, boxes, set_ids) values ($1,$2,$3,$4,$5,$6,$7)',
        [m.id, storeId, m.name || '', m.colorTag || 'light', m.imageUrl || null, JSON.stringify(m.boxes || []), JSON.stringify(m.setIds || [])]
      )
    for (const d of designs)
      await client.query(
        'insert into designs (id, store_id, name, placement, variant, dnum, image_url) values ($1,$2,$3,$4,$5,$6,$7)',
        [d.id, storeId, d.name || '', d.placement || 'front', d.variant || 'dark-design', String(d.dnum || 'single'), d.imageUrl || null]
      )
    for (const s of sets)
      await client.query('insert into sets (id, store_id, name) values ($1,$2,$3)', [s.id, storeId, s.name || ''])
    for (const L of listings)
      await client.query(
        'insert into listings (id, store_id, name, category, keywords, design_ids, mockup_ids, seo, status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [L.id, storeId, L.name || '', L.category || '', L.keywords || '', JSON.stringify(L.designIds || []), JSON.stringify(L.mockupIds || []), L.seo ? JSON.stringify(L.seo) : null, L.status || 'draft']
      )
    await client.query('commit')  // ---- transaction end ----

    res.json({ ok: true, counts: { mockups: mockups.length, designs: designs.length, sets: sets.length, listings: listings.length } })
  } catch (e) {
    await client.query('rollback').catch(() => {})  // undo everything on any error
    res.status(500).json({ ok: false, error: e.message })
  } finally {
    client.release()
  }
})

export default router
