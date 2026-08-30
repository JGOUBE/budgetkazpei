import { getAidTopicTermsForToken } from "./aidTopics.js"

const GENERIC_SEARCH_EQUIVALENTS = ["aide", "aides", "ed", "zed"]

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
  const candidates = GENERIC_SEARCH_EQUIVALENTS.includes(token)
    ? GENERIC_SEARCH_EQUIVALENTS
    : getAidTopicTermsForToken(token)
  return candidates.some(candidate => haystack.includes(normalizeAidSearchText(candidate)))
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
