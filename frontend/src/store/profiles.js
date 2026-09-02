/**
 * profiles.js — PROFILES system (Vela jaisa) — ab PER-STORE.
 * Ek profile = listing ka "template": materials, Details ka sara data
 * (type, who/what/when, partners, category, attributes, renewal),
 * price+quantity, variations (SKU ke BAGHAIR), shipping ka sara data,
 * aur description ka profile-wala hissa (design-description ke neeche lagta hai).
 *
 * SKU kabhi profile me nahi hota — wo user har listing par khud dalta hai.
 *
 * STORE-SCOPED: har store ki APNI profiles hain ('mp_profiles_<storeId>') —
 * dropdown se store badlo to usi store ki profiles dikhti hain; naya store
 * khali shuru hota hai; kisi store ki profile doosre store me nazar nahi aati.
 * (Purani GLOBAL list 'mp_profiles' pehli bar jis store me profiles khulti
 * hain USI me migrate ho jati hai — ghalat store me aa jaye to wahan delete
 * kar ke sahi store ki listing se dobara Save as Profile kar lein.)
 */

const key = (storeId) => 'mp_profiles_' + (storeId || 'nostore')

export function getProfiles(storeId) {
  try {
    let raw = localStorage.getItem(key(storeId))
    if (raw == null) {
      // one-time migration: purani global list is (pehli) store me chali jati hai
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

/** Profile me kya kya set hai — panel ke chips ke liye chhota summary. */
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
