const SEARCH_EQUIVALENTS = [
  ["logement", "kaz", "loyer", "location", "locataire"],
  ["enfant", "enfants", "marmay", "marmailles", "famille", "fami"],
  ["energie", "kouran", "electricite", "edf", "facture"],
  ["emploi", "travail", "travay", "chomage", "france travail"],
  ["mobilite", "deplasman", "transport", "bus", "voiture"],
  ["scolarite", "ecole", "lekol", "cantine", "bourse"],
  ["sante", "soin", "mutuelle", "cgss"],
  ["aide", "aides", "ed", "zed"],
]

export function normalizeAidSearchText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`´]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function tokenMatchesHaystack(token, haystack) {
  const group = SEARCH_EQUIVALENTS.find(words => words.includes(token))
  return (group || [token]).some(candidate => haystack.includes(candidate))
}

export function matchesAidSearch(aide, query) {
  const tokens = normalizeAidSearchText(query).split(" ").filter(Boolean)
  if (!tokens.length) return true
  const haystack = normalizeAidSearchText([
    aide.nameFr,
    aide.nameKr,
    aide.descriptionFr,
    aide.descriptionKr,
    aide.stepsFr,
    aide.stepsKr,
    aide.category,
  ].join(" "))
  return tokens.every(token => tokenMatchesHaystack(token, haystack))
}
