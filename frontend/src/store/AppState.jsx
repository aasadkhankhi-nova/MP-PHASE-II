import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { kvGet, kvSet } from './idb.js'
import { uid, readFileAsDataURL, detectTag, guessFromName } from './helpers.js'
import { getSession, setSession, cloudStores, cloudWs, uploadImage } from '../api.js'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

const EMPTY_WS = { mockups: [], designs: [], sets: [], listings: [] }

// cloud row (snake_case) -> local object (camelCase)
const fromCloud = (ws) => ({
  mockups: (ws.mockups || []).map((m) => ({
    id: m.id, name: m.name, colorTag: m.color_tag || 'light',
    imageUrl: m.image_url || null, dataUrl: m.image_url || null,
    boxes: m.boxes || [], setIds: m.set_ids || [],
  })),
  designs: (ws.designs || []).map((d) => ({
    id: d.id, name: d.name, placement: d.placement || 'front',
    variant: d.variant || 'dark-design', dnum: d.dnum || 'single',
    imageUrl: d.image_url || null, dataUrl: d.image_url || null,
  })),
  sets: (ws.sets || []).map((s) => ({ id: s.id, name: s.name })),
  listings: (ws.listings || []).map((L) => ({
    id: L.id, name: L.name, category: L.category || '', keywords: L.keywords || '',
    designIds: L.design_ids || [], mockupIds: L.mockup_ids || [],
    seo: L.seo || null, status: L.status || 'draft', outputs: [], report: null,
  })),
})

// local ws -> cloud payload (images by URL only, outputs stay local)
const toCloud = (ws) => ({
  mockups: ws.mockups.map((m) => ({ id: m.id, name: m.name, colorTag: m.colorTag, imageUrl: m.imageUrl || null, boxes: m.boxes || [], setIds: m.setIds || [] })),
  designs: ws.designs.map((d) => ({ id: d.id, name: d.name, placement: d.placement, variant: d.variant, dnum: d.dnum || 'single', imageUrl: d.imageUrl || null })),
  sets: ws.sets.map((s) => ({ id: s.id, name: s.name })),
  listings: ws.listings.map((L) => ({ id: L.id, name: L.name, category: L.category, keywords: L.keywords, designIds: L.designIds, mockupIds: L.mockupIds, seo: L.seo || null, status: L.status || 'draft' })),
})

export function AppStateProvider({ children }) {
  const [session, setSess] = useState(getSession())
  const [stores, setStores] = useState([])
  const [curStoreId, setCurStoreId] = useState(null)
  const [ws, setWs] = useState(EMPTY_WS)
  const [ready, setReady] = useState(false)
  const [sync, setSync] = useState({ state: session ? 'idle' : 'off', at: null })
  const pushTimer = useRef(null)
  const wsRef = useRef(ws); wsRef.current = ws
  const storeRef = useRef(curStoreId); storeRef.current = curStoreId

  const authed = !!session

  // ---- boot ----
  useEffect(() => {
    ;(async () => {
      if (session) {
        try {
          const r = await cloudStores.list()
          setStores(r.stores.map((s) => ({ id: s.id, name: s.name })))
        } catch { setStores((await kvGet('stores')) || []) }
      } else {
        setStores((await kvGet('stores')) || [])
      }
      const cur = (await kvGet('curStore')) || null
      if (cur) { await openStore(cur, true) }
      setReady(true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveLocalStores = useCallback(async (next) => { setStores(next); await kvSet('stores', next) }, [])

  // ---- workspace open/pull ----
  async function openStore(id, silent) {
    setCurStoreId(id)
    await kvSet('curStore', id)
    const cached = (await kvGet('ws:' + id)) || EMPTY_WS
    if (!getSession()) { setWs(cached); return }
    try {
      setSync((s) => ({ ...s, state: 'pulling' }))
      const r = await cloudWs.pull(id)
      const cloud = fromCloud(r.ws)
      // outputs live only locally — attach cached outputs to pulled listings
      const outByListing = {}
      for (const L of cached.listings || []) outByListing[L.id] = L.outputs || []
      cloud.listings = cloud.listings.map((L) => ({ ...L, outputs: outByListing[L.id] || [] }))
      // one-time: upload any local-only images from cache that cloud is missing
      setWs(cloud)
      await kvSet('ws:' + id, cloud)
      setSync({ state: 'ok', at: Date.now() })
    } catch (e) {
      if (!silent) console.warn('pull failed', e)
      setWs(cached)
      setSync({ state: 'error', at: Date.now(), err: String(e.message || e) })
    }
  }

  // ---- debounced cloud push ----
  const schedulePush = useCallback(() => {
    if (!getSession() || !storeRef.current) return
    if (pushTimer.current) clearTimeout(pushTimer.current)
    setSync((s) => ({ ...s, state: 'pending' }))
    pushTimer.current = setTimeout(async () => {
      try {
        await cloudWs.push(storeRef.current, toCloud(wsRef.current))
        setSync({ state: 'ok', at: Date.now() })
      } catch (e) {
        setSync({ state: 'error', at: Date.now(), err: String(e.message || e) })
      }
    }, 2500)
  }, [])

  const saveWs = useCallback(async (storeId, next) => {
    setWs(next)
    await kvSet('ws:' + storeId, next)
    schedulePush()
  }, [schedulePush])

  const api = {
    ready, stores, curStoreId, ws, session, authed, sync,
    curStore: stores.find((s) => s.id === curStoreId) || null,

    async loginDone(sess) {
      setSess(sess)
      setSync({ state: 'idle', at: null })
      try {
        const r = await cloudStores.list()
        setStores(r.stores.map((s) => ({ id: s.id, name: s.name })))
        if (storeRef.current && r.stores.find((s) => s.id === storeRef.current)) await openStore(storeRef.current)
        else if (r.stores.length) await openStore(r.stores[0].id)
        else { setCurStoreId(null); setWs(EMPTY_WS); await kvSet('curStore', null) }
      } catch {}
    },
    logout() {
      setSession(null); setSess(null)
      setSync({ state: 'off', at: null })
    },
    async syncNow() { if (storeRef.current) await openStore(storeRef.current) },

    async addStore(name) {
      if (authed) {
        const r = await cloudStores.create(name)
        const st = { id: r.store.id, name: r.store.name }
        setStores((x) => [...x, st])
        return st
      }
      const st = { id: uid(), name: name.trim(), created: Date.now() }
      await saveLocalStores([...stores, st])
      return st
    },
    async renameStore(id, name) {
      if (authed) { await cloudStores.rename(id, name) }
      const next = stores.map((s) => (s.id === id ? { ...s, name } : s))
      await saveLocalStores(next)
    },
    async deleteStore(id) {
      if (authed) { try { await cloudStores.remove(id) } catch {} }
      await saveLocalStores(stores.filter((s) => s.id !== id))
      await kvSet('ws:' + id, null)
      if (curStoreId === id) { setCurStoreId(null); setWs(EMPTY_WS); await kvSet('curStore', null) }
    },
    async selectStore(id) { await openStore(id) },

    async addMockupFiles(files) {
      let n = 0
      const items = []
      for (const f of files) {
        if (!/^image\/(jpeg|png|webp)/.test(f.type)) continue
        const dataUrl = await readFileAsDataURL(f)
        const tag = await detectTag(dataUrl)
        let imageUrl = null
        if (authed) { try { imageUrl = await uploadImage(dataUrl, f.name) } catch {} }
        items.push({ id: uid(), name: f.name.replace(/\.[^.]+$/, ''), dataUrl, imageUrl, colorTag: tag, boxes: [], setIds: [] })
        n++
      }
      if (n) await saveWs(curStoreId, { ...wsRef.current, mockups: [...wsRef.current.mockups, ...items] })
      return n
    },
    async updMockup(id, patch) {
      await saveWs(curStoreId, { ...wsRef.current, mockups: wsRef.current.mockups.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
    },
    async delMockup(id) {
      await saveWs(curStoreId, { ...wsRef.current, mockups: wsRef.current.mockups.filter((m) => m.id !== id) })
    },

    async addDesignFiles(files) {
      let n = 0
      const items = []
      for (const f of files) {
        if (!/^image\/(png|svg\+xml)/.test(f.type)) continue
        const dataUrl = await readFileAsDataURL(f)
        const g = guessFromName(f.name)
        let imageUrl = null
        if (authed) { try { imageUrl = await uploadImage(dataUrl, f.name) } catch {} }
        items.push({ id: uid(), name: f.name.replace(/\.[^.]+$/, ''), dataUrl, imageUrl, placement: g.placement, variant: g.variant, dnum: 'single' })
        n++
      }
      if (n) await saveWs(curStoreId, { ...wsRef.current, designs: [...wsRef.current.designs, ...items] })
      return n
    },
    async updDesign(id, patch) {
      await saveWs(curStoreId, { ...wsRef.current, designs: wsRef.current.designs.map((d) => (d.id === id ? { ...d, ...patch } : d)) })
    },
    async delDesign(id) {
      await saveWs(curStoreId, { ...wsRef.current, designs: wsRef.current.designs.filter((d) => d.id !== id) })
    },

    async addSet(name) {
      await saveWs(curStoreId, { ...wsRef.current, sets: [...wsRef.current.sets, { id: uid(), name: name.trim() }] })
    },
    async renameSet(id, name) {
      await saveWs(curStoreId, { ...wsRef.current, sets: wsRef.current.sets.map((s) => (s.id === id ? { ...s, name } : s)) })
    },
    async delSet(id) {
      await saveWs(curStoreId, {
        ...wsRef.current,
        sets: wsRef.current.sets.filter((s) => s.id !== id),
        mockups: wsRef.current.mockups.map((m) => ({ ...m, setIds: (m.setIds || []).filter((x) => x !== id) })),
      })
    },
    async toggleMockupSet(mid, sid) {
      await saveWs(curStoreId, {
        ...wsRef.current,
        mockups: wsRef.current.mockups.map((m) => {
          if (m.id !== mid) return m
          const has = (m.setIds || []).includes(sid)
          return { ...m, setIds: has ? m.setIds.filter((x) => x !== sid) : [...(m.setIds || []), sid] }
        }),
      })
    },

    async updListing(id, patch, createIfMissing) {
      const ex = wsRef.current.listings.find((l) => l.id === id)
      let listings
      if (!ex && createIfMissing) listings = [...wsRef.current.listings, { ...patch }]
      else listings = wsRef.current.listings.map((l) => (l.id === id ? { ...l, ...patch } : l))
      await saveWs(curStoreId, { ...wsRef.current, listings })
    },
    async delListing(id) {
      await saveWs(curStoreId, { ...wsRef.current, listings: wsRef.current.listings.filter((l) => l.id !== id) })
    },
  }

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}
