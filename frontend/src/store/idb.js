/**
 * idb.js — Tiny wrapper around the browser's IndexedDB.
 *
 * WHY: We keep a local copy of all data (stores, mockups, designs, listings)
 * inside the browser, so the app works instantly and even offline.
 * When the user is logged in, the same data is ALSO synced to the cloud
 * (see AppState.jsx). This file only handles the local part.
 *
 * It exposes just two functions:
 *   kvGet(key)        -> read one value
 *   kvSet(key, value) -> write one value
 * Values are plain JS objects (IndexedDB stores them as-is).
 */
const DB = 'mp2'      // database name
const STORE = 'kv'    // single key-value table

// Open (or create) the database. Called by every get/set.
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    // First time only: create the key-value table
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

// Read one value by key. Returns undefined if the key does not exist.
export async function kvGet(key) {
  const db = await open()
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    t.onsuccess = () => res(t.result)
    t.onerror = () => rej(t.error)
  })
}

// Write one value under a key (overwrites if it already exists).
export async function kvSet(key, val) {
  const db = await open()
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readwrite')
    t.objectStore(STORE).put(val, key)
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
  })
}
