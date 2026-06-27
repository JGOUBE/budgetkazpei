export const CERTAINTY_FORBIDDEN_PATTERNS = [
  "vous avez droit",
  "tu as droit",
  "ou na droit",
  "ou lé éligible",
  "vous êtes éligible",
  "vous etes eligible",
  "tu es éligible",
  "tu es eligible",
  "vous recevrez",
  "vous toucherez",
  "tu recevras",
  "tu toucheras",
  "ou va gagne",
  "ou va toucher",
  "la caf va accepter",
  "votre dossier sera accepté",
  "votre dossier est accepté",
  "votre dossier est accepte",
  "c est sûr",
  "c est sur",
  "obligatoirement",
  "automatiquement",
]

export const SAFE_CERTAINTY_REPLACEMENTS = [
  "vous pourriez être éligible",
  "cela dépend de votre situation",
  "il faut vérifier avec une simulation officielle",
  "je ne peux pas le confirmer sans justificatif ou réponse officielle",
  "à vérifier auprès de l'organisme concerné",
]

export const MONEY_PATTERN = /(?:\d{1,4}(?:[.,]\d{1,2})?\s?(?:€|euros?))/gi
export const MONEY_RANGE_PATTERN = /(?:entre\s+\d{1,4}\s?(?:€|euros?)\s+et\s+\d{1,4}\s?(?:€|euros?))/gi

export const DEADLINE_PATTERN = /(?:sous|dans|en)\s+\d{1,3}\s+(?:jour|jours|semaine|semaines|mois|heures|heure)/gi

export const OFFICIAL_ORGANIZATIONS = [
  "caf",
  "caf réunion",
  "ccas",
  "france travail",
  "pôle emploi",
  "pole emploi",
  "département",
  "departement",
  "région réunion",
  "region reunion",
  "mdph",
  "cgss",
  "mairie",
  "mission locale",
  "action logement",
  "impôts",
  "impots",
  "service-public",
]