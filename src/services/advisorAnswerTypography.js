// Normalisation visuelle des réponses du Conseiller (FR et créole).
// Ne change jamais les faits, montants, conditions ni noms des aides.
export function normalizeAdvisorAnswerTypography(value = "") {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    // Le modèle peut produire "1.\n**Organisme**" : garder le numéro avec le titre.
    .replace(/(^|\n)([ \t]*\d{1,2}[.)])[ \t]*\n+[ \t]*(?=\*\*|[A-Za-zÀ-ÖØ-öø-ÿ])/g, "$1$2 ")
    // Éviter "**Organisme**\n: description" : ponctuation orpheline.
    .replace(/(\*\*[^*\n]{2,120}\*\*)[ \t]*\n+[ \t]*:[ \t]*/g, "$1 — ")
    // Même cas si le modèle écrit "1. **Organisme** : description".
    .replace(/(^|\n)([ \t]*\d{1,2}[.)][ \t]+\*\*[^*\n]{2,120}\*\*)[ \t]*:[ \t]*/g, "$1$2 — ")
    // Titres non gras également possibles : "2. Croix-Rouge\n: description".
    .replace(/(^|\n)([ \t]*\d{1,2}[.)][ \t]+[^\n:]{2,90})[ \t]*\n+[ \t]*:[ \t]*/g, "$1$2 — ")
    .replace(/(^|\n)[ \t]*:[ \t]*(?=\S)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// Seulement HTTPS pour les liens cliquables fournis dans les réponses IA.
// Les segments sont ensuite rendus comme du texte React (jamais du HTML injecté).
const INLINE_MARKUP = /(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https:\/\/[^)\s]+\)|https:\/\/[^\s<>)]+)/g

export function tokenizeAdvisorAnswerLine(line = "") {
  const text = String(line ?? "")
  const tokens = []
  let previous = 0
  for (const match of text.matchAll(INLINE_MARKUP)) {
    if (match.index > previous) tokens.push({ kind: "text", value: text.slice(previous, match.index) })
    const value = match[0]
    const link = value.match(/^\[([^\]\n]+)\]\((https:\/\/[^)\s]+)\)$/)
    if (link) {
      tokens.push({ kind: "link", label: link[1], url: link[2] })
    } else if (/^\*\*[^*\n]+\*\*$/.test(value)) {
      tokens.push({ kind: "strong", value: value.slice(2, -2) })
    } else if (value.startsWith("https://")) {
      // Ne pas inclure les points de fin de phrase dans l'URL.
      const url = value.replace(/[.,;!?]+$/, "")
      tokens.push({ kind: "link", label: url, url })
      if (url.length < value.length) tokens.push({ kind: "text", value: value.slice(url.length) })
    } else {
      tokens.push({ kind: "text", value })
    }
    previous = match.index + value.length
  }
  if (previous < text.length) tokens.push({ kind: "text", value: text.slice(previous) })
  return tokens
}
