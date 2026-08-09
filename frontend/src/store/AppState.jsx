import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { kvGet, kvSet } from './idb.js'
import { uid, readFileAsDataURL, detectTag, guessFromName } from './helpers.js'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

const EMPTY_WS = { mockups: [], designs: [], sets: [], listings: [] }

export function AppStateProvider({ children }) {
  const [stores, setStores] = useState([])
  const [curStoreId, setCurStoreId] = useState(null)
  const [ws, setWs] = useState(EMPTY_WS)   // current store workspace
  const [ready, setReady] = useState(false)

  // load stores + last selected store on boot
  useEffect(() => {
    ;(async () => {
      const s = (await kvGet('stores')) || []
      const cur = (await kvGet('curStore')) || null
      setStores(s)
      if (cur && s.find((x) => x.id === cur)) {
        setCurStoreId(cur)
        setWs((await kvGet('ws:' + cur)) || EMPTY_WS)
      }
      setReady(true)
    })()
  }, [])

  const saveStores = useCallback(async (next) => {
    setStores(next)
    await kvSet('stores', next)
  }, [])

  const saveWs = useCallback(async (storeId, next) => {
    setWs(next)
    await kvSet('ws:' + storeId, next)
  }, [])

  const api = {
    ready, stores, curStoreId, ws,
    curStore: stores.find((s) => s.id === curStoreId) || null,

    async addStore(name) {
      const st = { id: uid(), name: name.trim(), created: Date.now() }
      await saveStores([...stores, st])
      return st
    },
    async renameStore(id, name) {
      await saveStores(stores.map((s) => (s.id === id ? { ...s, name } : s)))
    },
    async deleteStore(id) {
      await saveStores(stores.filter((s) => s.id !== id))
      await kvSet('ws:' + id, null)
      if (curStoreId === id) { setCurStoreId(null); setWs(EMPTY_WS); await kvSet('curStore', null) }
    },
    async selectStore(id) {
      setCurStoreId(id)
      await kvSet('curStore', id)
      setWs((await kvGet('ws:' + id)) || EMPTY_WS)
    },

    async addMockupFiles(files) {
      const items = []
      for (const f of files) {
        if (!/^image\/(jpeg|png|webp)/.test(f.type)) continue
        const dataUrl = await readFileAsDataURL(f)
        const tag = await detectTag(dataUrl)
        items.push({ id: uid(), name: f.name.replace(/\.[^.]+$/, ''), dataUrl, colorTag: tag, boxes: [], setIds: [] })
      }
      if (items.length) await saveWs(curStoreId, { ...ws, mockups: [...ws.mockups, ...items] })
      return items.length
    },
    async updMockup(id, patch) {
      await saveWs(curStoreId, { ...ws, mockups: ws.mockups.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
    },
    async delMockup(id) {
      await saveWs(curStoreId, { ...ws, mockups: ws.mockups.filter((m) => m.id !== id) })
    },

    async addDesignFiles(files) {
      const items = []
      for (const f of files) {
        if (!/^image\/(png|svg\+xml)/.test(f.type)) continue
        const dataUrl = await readFileAsDataURL(f)
        const g = guessFromName(f.name)
        items.push({ id: uid(), name: f.name.replace(/\.[^.]+$/, ''), dataUrl, placement: g.placement, variant: g.variant, dnum: 'single' })
      }
      if (items.length) await saveWs(curStoreId, { ...ws, designs: [...ws.designs, ...items] })
      return items.length
    },
    async updDesign(id, patch) {
      await saveWs(curStoreId, { ...ws, designs: ws.designs.map((d) => (d.id === id ? { ...d, ...patch } : d)) })
    },
    async delDesign(id) {
      await saveWs(curStoreId, { ...ws, designs: ws.designs.filter((d) => d.id !== id) })
    },

    async addSet(name) {
      await saveWs(curStoreId, { ...ws, sets: [...ws.sets, { id: uid(), name: name.trim() }] })
    },
    async renameSet(id, name) {
      await saveWs(curStoreId, { ...ws, sets: ws.sets.map((s) => (s.id === id ? { ...s, name } : s)) })
    },
    async delSet(id) {
      await saveWs(curStoreId, {
        ...ws,
        sets: ws.sets.filter((s) => s.id !== id),
        mockups: ws.mockups.map((m) => ({ ...m, setIds: (m.setIds || []).filter((x) => x !== id) })),
      })
    },
    async toggleMockupSet(mid, sid) {
      await saveWs(curStoreId, {
        ...ws,
        mockups: ws.mockups.map((m) => {
          if (m.id !== mid) return m
          const has = (m.setIds || []).includes(sid)
          return { ...m, setIds: has ? m.setIds.filter((x) => x !== sid) : [...(m.setIds || []), sid] }
        }),
      })
    },
  }

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}
