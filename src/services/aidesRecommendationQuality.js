// Personalization is a discovery signal, NOT a legal eligibility decision.
// "besoin_*" columns identify likely audiences. They are neither statutory
// conditions nor a safe reason to hide all other assistance.
export function normalizeAidName(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[’'\u2019]/g," ").replace(/[^a-z0-9]+/g," ").trim()
    .replace(/\s+/g," ")
}

export function safeAidSourceUrl(value = "") {
  const raw = String(value || "").trim()
  if (!raw) return ""
  try {
    const url = new URL(raw)
    return ["https:","http:"].includes(url.protocol) && url.hostname.includes(".")
      ? url.href : ""
  } catch { return "" }
}

export function aidSourceStatus(aide = {}) {
  const url = safeAidSourceUrl(aide.lien_officiel || aide.lien || aide.officialUrl || aide.url)
  return { available: Boolean(url), url,
    label: url ? "reference_disponible" : "reference_a_confirmer" }
}

function present(value) {
  return value !== undefined && value !== null && String(value).trim() !== ""
}

function profileMatches(aide = {}, profile = {}) {
  const matches = []
  const children = profile.nombre_enfants
  const housing = normalizeAidName(profile.logement || profile.situation_logement || "")
  const work = normalizeAidName(profile.situation_professionnelle || "")
  const commune = normalizeAidName(profile.commune || "")
  const aidCommune = normalizeAidName(aide.commune || "")
  if (present(children) && Number(children) > 0 && (aide.besoin_enfant || aide.categorie === "famille" || aide.category === "famille")) {
    matches.push("famille")
  }
  if (housing === "locataire" && (aide.besoin_locataire || ["logement","housing"].includes(aide.categorie || aide.category))) {
    matches.push("logement")
  }
  if (housing === "proprietaire" && aide.besoin_proprietaire) matches.push("logement")
  if ((profile.demandeur_emploi === true || work.includes("demandeur")) && aide.besoin_demandeur_emploi) {
    matches.push("emploi")
  }
  if (profile.allocataire_caf === true && aide.besoin_allocataire_caf) matches.push("caf")
  if (commune && aidCommune && commune === aidCommune) matches.push("commune")
  return matches
}

export function aidProfileSignals(aide = {}, profile = {}) {
  const reasons = profileMatches(aide, profile)
  const source = aidSourceStatus(aide)
  return {
    reasons,
    source,
    // Extra relevance is strictly soft, not proof of entitlement.
    score: Number(aide.score_priorite || 0) + reasons.length * 24 + (source.available ? 10 : 0),
    possible: aide.actif !== false,
  }
}

// Prefer a tracked ID when duplicates have the same title, so users are not
// prompted to add an aid they are already following. Otherwise prefer a
// source-backed entry, then priority, without editing/deleting any source row.
export function rankAidDiscovery(aides = [], profile = {}, trackedIds = [], limit = 12) {
  const tracked = new Set(Array.from(trackedIds || []).map(value => String(value)))
  const groups = new Map()
  for (const aide of Array.isArray(aides) ? aides : []) {
    if (!aide || aide.actif === false) continue
    const name = aide.nom || aide.nameFr || aide.label || aide.title || ""
    const key = normalizeAidName(name) || "id:" + String(aide.id)
    const signals = aidProfileSignals(aide, profile)
    const candidate = { ...aide, matchReasons: signals.reasons, sourceStatus: signals.source, discoveryScore: signals.score }
    const current = groups.get(key)
    if (!current) { groups.set(key, candidate); continue }
    const currentTracked = tracked.has(String(current.id))
    const candidateTracked = tracked.has(String(candidate.id))
    if (candidateTracked !== currentTracked) {
      if (candidateTracked) groups.set(key, candidate)
      continue
    }
    if (candidate.sourceStatus.available !== current.sourceStatus.available) {
      if (candidate.sourceStatus.available) groups.set(key, candidate)
      continue
    }
    if (candidate.discoveryScore > current.discoveryScore) groups.set(key, candidate)
  }
  const sorted = [...groups.values()].sort((a,b) =>
    b.discoveryScore - a.discoveryScore ||
    String(a.nom || a.nameFr || "").localeCompare(String(b.nom || b.nameFr || ""), "fr"))
  return sorted.slice(0, Math.max(0,Number.isFinite(limit) ? limit : sorted.length))
}
