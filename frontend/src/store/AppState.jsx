/**
 * AppState.jsx — THE HEART OF THE APP's DATA.
 *
 * One React context that every screen uses (via useApp()). It owns:
 *   - the login session
 *   - the list of stores (one store = one Etsy shop = one isolated workspace)
 *   - the CURRENT store's workspace: { mockups, designs, sets, listings }
 *
 * STORAGE STRATEGY (why two layers):
 *   1. IndexedDB (local)  — instant loads, offline safety, and generated
 *      photos (outputs) live ONLY here because they are large.
 *   2. Cloud (Supabase via backend) — when logged in, every change is
 *      auto-pushed (debounced 2.5s) and images are uploaded to Storage,
 *      so the same data appears on any device after login.
 *
 * ISOLATION: everything is saved under the current store's id
 * ("ws:<storeId>" locally, store_id column in the cloud), so different
 * stores can never mix.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { kvGet, kvSet } from './idb.js'
import { uid, readFileAsDataURL, detectTag, guessFromName } from './helpers.js'
import { getSession, setSession, cloudStores, cloudWs, uploadImage } from '../api.js'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

/**
 * shrinkForCloud — CLOUD copy ke liye photo compress (Supabase Storage sirf
 * 1 GB free hai). Max 2000px — Etsy ki recommended quality barqarar rehti hai.
 * Mockups = JPEG (chhota), designs = PNG (transparency zaruri hai).
 * LOCAL copy full-size hi rehti hai; sirf upload hone wali copy chhoti hoti hai.
 */
function shrinkForCloud(dataUrl, { png = false } = {}) {
  return new Promise((resolve) => {
    const im = new Image()
    im.onload = () => {
      try {
        const k = Math.min(1, 2000 / Math.max(im.width, im.height))
        if (k === 1 && !png) {
          // already chhoti + JPEG chahiye — phir bhi JPEG me convert (PNG mockup bara hota hai)
        }
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k))
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height)
        resolve(png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85))
      } catch { resolve(dataUrl) }
    }
    im.onerror = () => resolve(dataUrl)
    im.src = dataUrl
  })
}

const EMPTY_WS = { mockups: [], designs: [], sets: [], listings: [] }

/**
 * fromCloud — convert database rows (snake_case: color_tag, image_url…)
 * into the local object shape (camelCase: colorTag, imageUrl…).
 * Cloud images become both imageUrl AND dataUrl so <img> and canvas
 * code can use one field everywhere.
 * NOTE: outputs are NOT stored in the cloud (too big) — they start empty
 * here and get re-attached from the local cache in openStore().
 */
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

/**
 * toCloud — the reverse: local objects -> the payload the backend expects.
 * Images travel as URLs only (never base64 — those were uploaded separately),
 * and listing outputs are stripped (local-only by design).
 */
const toCloud = (ws) => ({
  mockups: ws.mockups.map((m) => ({ id: m.id, name: m.name, colorTag: m.colorTag, imageUrl: m.imageUrl || null, boxes: m.boxes || [], setIds: m.setIds || [] })),
  designs: ws.designs.map((d) => ({ id: d.id, name: d.name, placement: d.placement, variant: d.variant, dnum: d.dnum || 'single', imageUrl: d.imageUrl || null })),
  sets: ws.sets.map((s) => ({ id: s.id, name: s.name })),
  listings: ws.listings.map((L) => ({ id: L.id, name: L.name, category: L.category, keywords: L.keywords, designIds: L.designIds, mockupIds: L.mockupIds, seo: L.seo || null, status: L.status || 'draft' })),
})

export function AppStateProvider({ children }) {
  const [session, setSess] = useState(getSession())     // login info (or null)
  const [stores, setStores] = useState([])              // all stores of this user
  const [curStoreId, setCurStoreId] = useState(null)    // which store is open
  const [ws, setWs] = useState(EMPTY_WS)                // current store's workspace
  const [ready, setReady] = useState(false)             // boot finished?
  const [sync, setSync] = useState({ state: session ? 'idle' : 'off', at: null })  // cloud sync status for the UI chip
  const pushTimer = useRef(null)                        // debounce timer for cloud pushes
  // refs mirror the latest state so async callbacks never use stale values
  const wsRef = useRef(ws); wsRef.current = ws
  const storeRef = useRef(curStoreId); storeRef.current = curStoreId

  const authed = !!session

  // ---- boot: load store list (cloud if logged in) + reopen last store ----
  useEffect(() => {
    ;(async () => {
      if (session) {
        try {
          const r = await cloudStores.list()
          setStores(r.stores.map((s) => ({ id: s.id, name: s.name })))
        } catch { setStores((await kvGet('stores')) || []) }   // offline fallback
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

  /**
   * openStore — switch to a store and load its workspace.
   * Logged out: just read the local cache.
   * Logged in:  pull from the cloud (source of truth), re-attach locally
   *             cached outputs to listings, then cache the merged result.
   */
  async function openStore(id, silent) {
    setCurStoreId(id)
    await kvSet('curStore', id)
    const cached = (await kvGet('ws:' + id)) || EMPTY_WS
    if (!getSession()) { setWs(cached); return }
    try {
      setSync((s) => ({ ...s, state: 'pulling' }))
      const r = await cloudWs.pull(id)
      const cloud = fromCloud(r.ws)
      // Listings ke LOCAL-only hisse wapas jorho (cloud me nahi jate):
      // outputs (photos), video, sku, profileId, etsy link.
      cloud.listings = cloud.listings.map((L) => {
        const loc = (cached.listings || []).find((c) => c.id === L.id) || {}
        return { ...L, outputs: loc.outputs || [], video: loc.video || null, sku: loc.sku || '', profileId: loc.profileId || null, etsy: loc.etsy || null }
      })
      // SELF-HEAL merge: agar cloud me image_url NAHI hai (upload us waqt fail
      // hua tha) lekin local cache me asli photo (data:) mojud hai to use
      // wapas laga do — warna refresh ke baad photo "tooti" dikhti hai.
      const mergeKeep = (cloudArr, cacheArr) => cloudArr.map((it) => {
        if (it.dataUrl) return it
        const loc = (cacheArr || []).find((c) => c.id === it.id)
        return loc && String(loc.dataUrl || '').startsWith('data:') ? { ...it, dataUrl: loc.dataUrl } : it
      })
      cloud.mockups = mergeKeep(cloud.mockups, cached.mockups)
      cloud.designs = mergeKeep(cloud.designs, cached.designs)
      setWs(cloud)
      await kvSet('ws:' + id, cloud)
      setSync({ state: 'ok', at: Date.now() })
      healUploads(id, cloud)   // background: jo photos cloud par nahi pahunchi unhe ab upload karo
    } catch (e) {
      if (!silent) console.warn('pull failed', e)
      setWs(cached)   // offline: keep working with the local copy
      setSync({ state: 'error', at: Date.now(), err: String(e.message || e) })
    }
  }

  /**
   * schedulePush — auto-save to the cloud, debounced.
   * Many quick edits become ONE upload 2.5s after the last change.
   * The ☁ chip in the top bar reflects this: pending -> ok / error.
   */
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

  // saveWs — EVERY data change goes through here:
  // update React state -> save to IndexedDB -> schedule a cloud push.
  const saveWs = useCallback(async (storeId, next) => {
    setWs(next)
    await kvSet('ws:' + storeId, next)
    schedulePush()
  }, [schedulePush])

  // healUploads — background repair: jis mockup/design ki photo LOCAL me hai
  // (data:...) lekin cloud imageUrl nahi bana (upload fail hua tha), use ab
  // dubara upload kar ke workspace update kar do. Ek waqt me ek hi run.
  // AHEM: items ka SNAPSHOT parameter me aata hai — pehle wsRef se parhta tha
  // jo store khulte waqt abhi PURANA hota tha, is liye heal kabhi chalta hi
  // nahi tha (dost ke laptop par photos tooti rehti thin).
  const healing = useRef(false)
  async function healUploads(storeId, snapshot) {
    if (healing.current || !getSession() || !snapshot) return
    healing.current = true
    try {
      for (const kind of ['mockups', 'designs']) {
        for (const it of snapshot[kind] || []) {
          if (storeRef.current !== storeId) return
          if (it.imageUrl || !String(it.dataUrl || '').startsWith('data:')) continue
          try {
            const up = await shrinkForCloud(it.dataUrl, { png: kind === 'designs' })
            const url = await uploadImage(up, it.name || 'img')
            if (storeRef.current !== storeId) return
            // ab tak render ho chuka hota hai — wsRef.current TAZA hai
            const cur = wsRef.current
            await saveWs(storeId, { ...cur, [kind]: (cur[kind] || []).map((x) => (x.id === it.id ? { ...x, imageUrl: url } : x)) })
          } catch { /* agli bar (boot/sync) par phir try hoga */ }
        }
      }
    } finally { healing.current = false }
  }

  // The public API object that all screens use via useApp().
  const api = {
    ready, stores, curStoreId, ws, session, authed, sync,
    curStore: stores.find((s) => s.id === curStoreId) || null,

    // Called by the Login screen after a successful sign-in.
    async loginDone(sess) {
      setSess(sess)
      setSync({ state: 'idle', at: null })
      try {
        const r = await cloudStores.list()
        setStores(r.stores.map((s) => ({ id: s.id, name: s.name })))
        if (storeRef.current && r.stores.find((s) => s.id === storeRef.current)) await openStore(storeRef.current)
        else if (r.stores.length) await openStore(r.stores[0].id)   // auto-open first store
        else { setCurStoreId(null); setWs(EMPTY_WS); await kvSet('curStore', null) }
      } catch {}
    },
    logout() {
      setSession(null); setSess(null)
      setSync({ state: 'off', at: null })
    },
    async syncNow() { if (storeRef.current) await openStore(storeRef.current) },

    // ---- stores (cloud when logged in, local otherwise) ----
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

    // ---- import (MP Phase I backup / project files) ----
    // Creates a NEW store and fills it with the imported mockups/designs/sets.
    // Images are uploaded to cloud Storage one by one (when logged in),
    // then the whole workspace is pushed in one go. onProgress(i, total).
    async importStore(name, incoming, onProgress) {
      const st = await api.addStore(name || 'Imported store')
      const wsNew = {
        mockups: incoming.mockups || [],
        designs: incoming.designs || [],
        sets: incoming.sets || [],
        listings: [],
      }
      const items = [...wsNew.mockups, ...wsNew.designs]
      const nMock = wsNew.mockups.length
      for (let i = 0; i < items.length; i++) {
        if (onProgress) onProgress(i + 1, items.length)
        if (authed && items[i].dataUrl && !items[i].imageUrl) {
          try {
            const up = await shrinkForCloud(items[i].dataUrl, { png: i >= nMock })  // designs PNG, mockups JPEG
            items[i].imageUrl = await uploadImage(up, items[i].name || 'img')
          } catch {}
        }
      }
      await kvSet('ws:' + st.id, wsNew)
      if (authed) { try { await cloudWs.push(st.id, toCloud(wsNew)) } catch (e) { console.error('import push', e) } }
      await openStore(st.id)
      return st
    },

    // importIntoCurrent — Phase I ka EK store ka data ISI (current) store me
    // MERGE karta hai (naya store nahi banta). Etsy-OAuth se connected store
    // me purana kaam laane ke liye. Id-clash par nayi id, sets ka link qaim.
    async importIntoCurrent(incoming, onProgress) {
      if (!curStoreId) throw new Error('Pehle koi store select karein')
      const wsAdd = {
        mockups: incoming.mockups || [],
        designs: incoming.designs || [],
        sets: incoming.sets || [],
      }
      const items = [...wsAdd.mockups, ...wsAdd.designs]
      const nMock2 = wsAdd.mockups.length
      for (let i = 0; i < items.length; i++) {
        if (onProgress) onProgress(i + 1, items.length)
        if (authed && items[i].dataUrl && !items[i].imageUrl) {
          try {
            const up = await shrinkForCloud(items[i].dataUrl, { png: i >= nMock2 })
            items[i].imageUrl = await uploadImage(up, items[i].name || 'img')
          } catch {}
        }
      }
      const cur = wsRef.current
      const exist = new Set([...cur.mockups, ...cur.designs, ...cur.sets].map((x) => x.id))
      const setMap = {}
      const sets = wsAdd.sets.map((s) => {
        if (!exist.has(s.id)) return s
        const ns = { ...s, id: uid() }; setMap[s.id] = ns.id; return ns
      })
      const mockups = wsAdd.mockups.map((m) => ({
        ...(exist.has(m.id) ? { ...m, id: uid() } : m),
        setIds: (m.setIds || []).map((id) => setMap[id] || id),
      }))
      const designs = wsAdd.designs.map((d) => (exist.has(d.id) ? { ...d, id: uid() } : d))
      await saveWs(curStoreId, {
        ...cur,
        mockups: [...cur.mockups, ...mockups],
        designs: [...cur.designs, ...designs],
        sets: [...cur.sets, ...sets],
      })
      return { mockups: mockups.length, designs: designs.length, sets: sets.length }
    },

    // ---- mockups ----
    // On upload: read file -> auto light/dark tag -> (if logged in) upload
    // the image to cloud Storage so other devices can see it too.
    // setIds (optional): naye mockups seedha in sets me chale jayen (Sets screen se upload)
    async addMockupFiles(files, setIds = []) {
      let n = 0, failed = 0
      const items = []
      for (const f of files) {
        if (!/^image\/(jpeg|png|webp)/.test(f.type)) continue
        const dataUrl = await readFileAsDataURL(f)
        const tag = await detectTag(dataUrl)
        let imageUrl = null
        if (authed) {
          const up = await shrinkForCloud(dataUrl)   // cloud copy 2000px JPEG (storage bachao)
          try { imageUrl = await uploadImage(up, f.name) }
          catch { try { imageUrl = await uploadImage(up, f.name) } catch { failed++ } }  // ek retry, phir warn
        }
        items.push({ id: uid(), name: f.name.replace(/\.[^.]+$/, ''), dataUrl, imageUrl, colorTag: tag, boxes: [], setIds: [...setIds] })
        n++
      }
      if (n) await saveWs(curStoreId, { ...wsRef.current, mockups: [...wsRef.current.mockups, ...items] })
      if (failed) alert(`⚠ ${failed} photo(s) cloud par upload NahI ho saki(n) (backend/internet issue).\nWo abhi sirf is browser me hain — app agli sync par khud dubara upload karega.\nBackend theek hone tak page refresh karne se pehle ☁ chip green hone ka intezar karein.`)
      return n
    },
    async updMockup(id, patch) {
      await saveWs(curStoreId, { ...wsRef.current, mockups: wsRef.current.mockups.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
    },
    async delMockup(id) {
      await saveWs(curStoreId, { ...wsRef.current, mockups: wsRef.current.mockups.filter((m) => m.id !== id) })
    },

    // ---- designs (same upload pattern as mockups) ----
    async addDesignFiles(files) {
      let n = 0, failed = 0
      const items = []
      for (const f of files) {
        if (!/^image\/(png|svg\+xml)/.test(f.type)) continue
        const dataUrl = await readFileAsDataURL(f)
        const g = guessFromName(f.name)
        let imageUrl = null
        if (authed) {
          const up = await shrinkForCloud(dataUrl, { png: true })   // design = PNG (transparency), max 2000px
          try { imageUrl = await uploadImage(up, f.name) }
          catch { try { imageUrl = await uploadImage(up, f.name) } catch { failed++ } }
        }
        items.push({ id: uid(), name: f.name.replace(/\.[^.]+$/, ''), dataUrl, imageUrl, placement: g.placement, variant: g.variant, dnum: 'single' })
        n++
      }
      if (n) await saveWs(curStoreId, { ...wsRef.current, designs: [...wsRef.current.designs, ...items] })
      if (failed) alert(`⚠ ${failed} design(s) cloud par upload nahi ho sake — abhi sirf is browser me hain, app agli sync par khud dubara try karega.`)
      return n
    },
    async updDesign(id, patch) {
      await saveWs(curStoreId, { ...wsRef.current, designs: wsRef.current.designs.map((d) => (d.id === id ? { ...d, ...patch } : d)) })
    },
    async delDesign(id) {
      await saveWs(curStoreId, { ...wsRef.current, designs: wsRef.current.designs.filter((d) => d.id !== id) })
    },

    // ---- sets (groups of mockups, e.g. "Framed 24x36") ----
    async addSet(name) {
      await saveWs(curStoreId, { ...wsRef.current, sets: [...wsRef.current.sets, { id: uid(), name: name.trim() }] })
    },
    async renameSet(id, name) {
      await saveWs(curStoreId, { ...wsRef.current, sets: wsRef.current.sets.map((s) => (s.id === id ? { ...s, name } : s)) })
    },
    async delSet(id) {
      // also detach this set from every mockup that referenced it
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

    // ---- listings ----
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
