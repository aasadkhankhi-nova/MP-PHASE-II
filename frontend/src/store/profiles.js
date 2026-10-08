/**
 * profiles.js — PROFILES system (Vela-style) — now PER-STORE.
 * A profile = a listing "template": materials, all of the Details data
 * (type, who/what/when, partners, category, attributes, renewal),
 * price+quantity, variations (WITHOUT SKU), all shipping data,
 * and the profile part of the description (added below the design description).
 *
 * SKU is never part of a profile — the user enters it on every listing.
 *
 * STORE-SCOPED: every store has its OWN profiles ('mp_profiles_<storeId>') —
 * switch store in the dropdown and you see that store's profiles; a new store
 * starts empty; one store's profiles never show up in another store.
 * (The old GLOBAL list 'mp_profiles' migrates into whichever store first
 * opens profiles — if it lands in the wrong store, delete it there and
 * use Save as Profile again from a listing in the right store.)
 */

const key = (storeId) => 'mp_profiles_' + (storeId || 'nostore')

export function getProfiles(storeId) {
  try {
    let raw = localStorage.getItem(key(storeId))
    if (raw == null) {
      // one-time migration: the old global list moves into this (first) store
      const legacy = localStorage.getItem('mp_profiles')
      if (legacy != null && storeId) {
        localStorage.setItem(key(storeId), legacy)
        localStorage.removeItem('mp_profiles')
        raw = legacy
      }
    }
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
export function saveProfiles(storeId, list) {
  try { localStorage.setItem(key(storeId), JSON.stringify(list)) } catch {}
}
export function upsertProfile(storeId, p) {
  const l = getProfiles(storeId)
  const i = l.findIndex((x) => x.id === p.id)
  if (i >= 0) l[i] = p; else l.push(p)
  saveProfiles(storeId, l)
  return p
}
export function delProfile(storeId, id) {
  saveProfiles(storeId, getProfiles(storeId).filter((x) => x.id !== id))
}
export function newProfileId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/** What is set in a profile — a short summary for the panel chips. */
export function profileSummary(p) {
  const out = []
  if (p.details?.taxonomyId) out.push('Category')
  if (Object.keys(p.details?.attrs || {}).length) out.push('Attributes')
  if (p.materials?.length) out.push(`${p.materials.length} materials`)
  if (p.variations?.products?.length) out.push(`${p.variations.products.length} variations`)
  else if (p.priceQty?.price) out.push(`$${p.priceQty.price}`)
  if (p.shipping?.shippingProfileId) out.push('Shipping')
  if (p.shipping?.returnPolicyId) out.push('Returns')
  if (p.desc2) out.push('Description')
  return out
}
