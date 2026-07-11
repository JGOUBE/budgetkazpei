export function normalizeAssistantLanguage(language = "fr") {
  const normalized = normalizeForAssistantMatch(language)

  if (["cr", "kr", "kreol", "creole", "kreyol"].includes(normalized)) {
    return "kr"
  }

  return "fr"
}

export function isAssistantKreol(language = "fr") {
  return normalizeAssistantLanguage(language) === "kr"
}

export function normalizeForAssistantMatch(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/€/g, " euro ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
