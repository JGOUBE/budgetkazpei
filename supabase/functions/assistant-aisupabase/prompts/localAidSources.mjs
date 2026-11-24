// Identifie la nature d'un lien enregistré dans une fiche d'aide.
// Une source institutionnelle ou un annuaire tiers n'est PAS le site
// de l'association elle-même. Ne jamais extrapoler à partir du nom.
const normalize = value => String(value ?? "")
  .toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[’']/g, " ")
  .replace(/\s+/g, " ").trim()

export function classifyLocalAidSource(value = "") {
  const source = String(value ?? "").trim()
  if (!/^https:\/\/[^\s<>"']+$/i.test(source)) return { url: "", label: "", type: "unavailable" }
  let hostname
  try { hostname = new URL(source).hostname.toLowerCase() }
  catch { return { url: "", label: "", type: "unavailable" } }
  // These are URL classifications, not live availability checks.
  if (hostname === "reunion.deets.gouv.fr") {
    return { url: source, label: "Référencement officiel DEETS", type: "official_directory" }
  }
  if (hostname === "andes-france.com" || hostname === "www.andes-france.com") {
    return { url: source, label: "Fiche de l’organisme sur ANDES", type: "association_directory" }
  }
  if (hostname.endsWith(".france-assos-sante.org") || hostname === "france-assos-sante.org") {
    return { url: source, label: "Annuaire France Assos Santé", type: "association_directory" }
  }
  if (hostname === "www.service-public.fr" || hostname === "service-public.fr" ||
      hostname === "www.service-public.gouv.fr" || hostname === "service-public.gouv.fr") {
    return { url: source, label: "Fiche Service-Public", type: "institutional_page" }
  }
  if (hostname === "www.caf.fr" || hostname === "caf.fr") {
    return { url: source, label: "Page CAF", type: "institutional_page" }
  }
  if (hostname === "www.departement974.fr" || hostname === "departement974.fr") {
    return { url: source, label: "Page du Département", type: "institutional_page" }
  }
  if (hostname === "www.regionreunion.com" || hostname === "regionreunion.com") {
    return { url: source, label: "Page de la Région Réunion", type: "institutional_page" }
  }
  // Unknown domain: do not claim this is a site's official homepage.
  return { url: source, label: "Lien de référence", type: "other_reference" }
}

// Corrige uniquement les intitulés trompeurs de liens Markdown qui pointent
// déjà vers un URL EXACT issu des sources enregistrées côté serveur.
// Ne touche ni au contenu des conseils ni aux URL absentes du référentiel.
export function clarifyLocalAidLinks(answer = "", trustedFacts = []) {
  const references = new Map()
  for (const item of (Array.isArray(trustedFacts) ? trustedFacts : [])) {
    if (!["source_confirmee", "operateur_reference_2026"].includes(item?.verificationStatus)) continue
    const source = classifyLocalAidSource(item?.officialSource)
    if (source.url) references.set(source.url, source.label)
  }
  if (!references.size) return String(answer ?? "")
  return String(answer ?? "").replace(/\[([^\]\n]{1,100})\]\((https:\/\/[^\s)]+)\)/g,
    (match, rawLabel, url) => {
      const label = references.get(url)
      if (!label) return match
      const generic = normalize(rawLabel)
      if (!/^(?:ici|fiche ici|fiche|lien ici|cliquez ici|voir ici|site|leur site|son site|site officiel|leur site officiel|en savoir plus|plus d infos|plus d informations|consulter la fiche|voir la fiche|fiche de l organisme)$/.test(generic)) {
        return match
      }
      return "[" + label + "](" + url + ")"
    })
}
