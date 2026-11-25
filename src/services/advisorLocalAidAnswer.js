import { normalizeAidName, safeAidSourceUrl } from "./aidesRecommendationQuality.js"

// Source lookups are safe to answer from the existing, dated aid catalogue.
// Any question involving eligibility, amounts, deadlines or personal advice
// continues to the AI and its evidence/uncertainty safeguards.
const SOURCE_WORDS = /\b(?:lien|url|site officiel|site internet|site web|page officielle?|adresse web|ou (?:trouver|consulter) (?:le |la |l )?(?:site|page)|ou (?:faire|deposer|envoyer) (?:ma |une |la )?demande)\b/
const NEEDS_ADVICE = /\b(?:combien|montant|plafond|conditions?|eligible|eligibilite|droit|delai|duree|refus|recours|simulation|est ce que|peux je|puis je|pourquoi|conseil|quel dossier|et|ainsi que)\b/

function referenceLabel(url = "") {
  let host = ""
  try { host = new URL(url).hostname.toLowerCase() } catch { return "Lien de référence" }
  // A directory page is proof of referencing, not the association's own website.
  if (host === "reunion.deets.gouv.fr") return "Référencement officiel DEETS"
  if (host === "andes-france.com" || host === "www.andes-france.com") return "Fiche de l’organisme sur ANDES"
  if (host === "caf.fr" || host === "www.caf.fr") return "Page de la CAF"
  if (host === "departement974.fr" || host === "www.departement974.fr") return "Page du Département"
  if (host === "regionreunion.com" || host === "www.regionreunion.com") return "Page de la Région"
  if (host === "service-public.fr" || host === "www.service-public.fr" ||
      host === "service-public.gouv.fr" || host === "www.service-public.gouv.fr") return "Fiche Service-Public"
  return "Lien de référence"
}

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
    if (!url || !url.startsWith("https://")) continue
    const entry = { id: aide.id, name, url, isOfficial: Boolean(safeAidSourceUrl(aide.lien_officiel)) }
    const existing = matches.get(normalized)
    if (!existing || (!existing.isOfficial && entry.isOfficial)) matches.set(normalized, entry)
  }
  // Two distinct benefits or an absent exact title require reasoning, not guessing.
  if (matches.size !== 1) return null
  const aide = [...matches.values()][0]
  const kreol = language === "kreol" || language === "kr"
  const heading = kreol
    ? "Pou « " + aide.name + " », voici lien de référence enregistré : "
    : "Pour « " + aide.name + " », voici le lien de référence enregistré : "
  const evidence = "[" + referenceLabel(aide.url) + "](" + aide.url + ")"
  const caution = kreol
    ? "Ce lien i prouve pa si l'association lé ouverte astèr ni si ou lé éligible. Vérifie bann conditions ek kontak."
    : "Ce lien ne confirme pas votre éligibilité ni l'ouverture actuelle du service. Vérifiez les conditions avant de vous déplacer."
  return {
    answer: `${heading}${evidence}\n\n${caution}`,
    recommendedAidIds: [aide.id],
    recommendedAidNames: [aide.name],
    source: "local_aid_reference",
  }
}

// Exact title only. Reproduce the recorded procedure, not an inferred entitlement.
// The source is dated and does not certify current availability.
function requestedProcedureName(question=""){
  const t=normalizeAidName(question)
  if(t.length>200||(String(question).match(/\?/g)||[]).length>1)return ""
  const m=t.match(/^(?:comment (?:demander|faire une demande pour|deposer une demande pour)|koman demann|koman demande) (.+)$/)
  if(!m||/\b(?:combien|montant|delai|eligible|eligibilite|droit|recours|refus|et comment|et combien|si je|avec mon|sans mon)\b/.test(m[1]))return ""
  return m[1].replace(/^(?:l |la |le |les |une |un )/,"").trim()
}
export function isLocalAidProcedureRequest(question=""){return Boolean(requestedProcedureName(question))}
export function buildLocalAidProcedureAnswer({question="",aides=[],language="fr"}={}){
  const requested=requestedProcedureName(question)
  if(!requested)return null
  const matches=(Array.isArray(aides)?aides:[]).filter(a=>a?.actif!==false&&["source_confirmee","operateur_reference_2026"].includes(a?.statut_verification)&&[a.nom,a.nom_kreol].some(n=>normalizeAidName(n).replace(/^(?:l |la |le |les |une |un )/,"")===requested))
  if(matches.length!==1)return null
  const a=matches[0],url=safeAidSourceUrl(a.lien_officiel||a.lien)
  if(!url||!url.startsWith("https://"))return null
  const kr=language==="kreol"||language==="kr"
  const steps=String(kr?a.demarches_kreol||a.demarches_fr:a.demarches_fr||"").trim()
  // Do not cut instructions mid-sentence, or repeat dated financial or deadline claims.
  if(!steps||steps.length>1200||/\d\s*(?:€|euros?|jours?|semaines?|mois|ans)\b/i.test(steps)||/https?:\/\//i.test(steps))return null
  const date=/^\d{4}-\d{2}-\d{2}/.test(String(a.date_verification||""))?String(a.date_verification).slice(0,10).split("-").reverse().join("/"):""
  const heading=kr?"**Démarche anrezistrée pou "+a.nom+"**":"**Démarche enregistrée pour "+a.nom+"**"
  return {answer:heading+"\n\n"+steps+"\n\n"+(date?(kr?"Référence vérifiée le ":"Fiche vérifiée le ")+date+".\n\n":"")+"["+referenceLabel(url)+"]("+url+")\n\n"+(kr?"Vérifie bann conditions actuelles auprès de l'organisme. Sa i confirme pa out droit.":"Vérifiez les conditions et modalités actuelles auprès de l'organisme. Cette fiche ne confirme pas votre éligibilité."),recommendedAidIds:[a.id],recommendedAidNames:[a.nom],source:"local_aid_procedure"}
}
