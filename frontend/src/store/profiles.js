/**
 * profiles.js — PROFILES system (Vela jaisa).
 * Ek profile = listing ka "template": materials, Details ka sara data
 * (type, who/what/when, partners, category, attributes, renewal, section),
 * price+quantity, variations (SKU ke BAGHAIR), shipping ka sara data,
 * aur description ka profile-wala hissa (design-description ke neeche lagta hai).
 *
 * SKU kabhi profile me nahi hota — wo user har listing par khud dalta hai.
 * Storage: is browser me (localStorage) — 'mp_profiles'.
 */

export function getProfiles() {
  try { return JSON.parse(localStorage.getItem('mp_profiles') || '[]') } catch { return [] }
}
export function saveProfiles(list) {
  localStorage.setItem('mp_profiles', JSON.stringify(list))
}
export function upsertProfile(p) {
  const l = getProfiles()
  const i = l.findIndex((x) => x.id === p.id)
  if (i >= 0) l[i] = p; else l.push(p)
  saveProfiles(l)
  return p
}
export function delProfile(id) {
  saveProfiles(getProfiles().filter((x) => x.id !== id))
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
