// Tiny IndexedDB key-value store (per-key JSON). Swappable for API calls in M3/M4.
const DB = 'mp2', STORE = 'kv'

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

export async function kvGet(key) {
  const db = await open()
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    t.onsuccess = () => res(t.result)
    t.onerror = () => rej(t.error)
  })
}

export async function kvSet(key, val) {
  const db = await open()
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readwrite')
    t.objectStore(STORE).put(val, key)
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
  })
}
