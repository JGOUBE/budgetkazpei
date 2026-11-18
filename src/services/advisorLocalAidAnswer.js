import { normalizeAidName, safeAidSourceUrl } from "./aidesRecommendationQuality.js"

// Source lookups are safe to answer from the existing, dated aid catalogue.
// Any question involving eligibility, amounts, deadlines or personal advice
// continues to the AI and its evidence/uncertainty safeguards.
const SOURCE_WORDS = /\b(?:lien|url|site officiel|site internet|site web|page officielle?|adresse web|ou (?:trouver|consulter) (?:le |la |l )?(?:site|page)|ou (?:faire|deposer|envoyer) (?:ma |une |la )?demande)\b/
const NEEDS_ADVICE = /\b(?:combien|montant|plafond|conditions?|eligible|eligibilite|droit|delai|duree|refus|recours|simulation|est ce que|peux je|puis je|pourquoi|conseil|quel dossier)\b/

export function isLocalAidSourceRequest(question = "") {
  const text = normalizeAidName(question)
  return Boolean(text && SOURCE_WORDS.test(text) && !NEEDS_ADVICE.test(text))
}

export function buildLocalAidSourceAnswer({ question = "", aides = [], language = "fr" } = {}) {
  if (!isLocalAidSourceRequest(question)) return null
  const text = ` ${normalizeAidName(question)} `
  const matches = new Map()
  for (const aide of Array.isArray(aides) ? aides : []) {
    if (!aide || aide.actif === false) continue
    const name = String(aide.nom || "").trim()
    const normalized = normalizeAidName(name)
    if (normalized.length < 3 || !text.includes(` ${normalized} `)) continue
    const url = safeAidSourceUrl(aide.lien_officiel || aide.lien)
    if (!url) continue
    const entry = { id: aide.id, name, url, isOfficial: Boolean(safeAidSourceUrl(aide.lien_officiel)) }
    const existing = matches.get(normalized)
    if (!existing || (!existing.isOfficial && entry.isOfficial)) matches.set(normalized, entry)
  }
  // Two distinct benefits or an absent exact title require reasoning, not guessing.
  if (matches.size !== 1) return null
  const aide = [...matches.values()][0]
  const kreol = language === "kreol" || language === "kr"
  const heading = kreol
    ? (aide.isOfficial ? "Lien officiel enregistré pou" : "Lien de référence enregistré pou")
    : (aide.isOfficial ? "Le lien officiel enregistré pour" : "Le lien de référence enregistré pour")
  const caution = kreol
    ? "Vérifie bann conditions ek demars à jour direct su site-la. Ce lien ne confirme pas out éligibilité."
    : "Vérifiez sur le site les conditions et les démarches à jour. Ce lien ne confirme pas votre éligibilité."
  return {
    answer: `${heading} « ${aide.name} » : ${aide.url}\n\n${caution}`,
    recommendedAidIds: [aide.id],
    recommendedAidNames: [aide.name],
    source: "local_aid_reference",
  }
}
