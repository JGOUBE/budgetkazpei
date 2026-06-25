import {
  findReunionIntents,
  textMatchesIntent,
} from "../language/reunionLexicon.ts"

export type ConsistencyState = "ok" | "missing" | "contradiction" | "profile_update"

export interface ConsistencyResult {
  state: ConsistencyState
  missing: string[]
  contradictions: string[]
  suggestions: string[]
  detectedIntents: string[]
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === ""
}

function hasProfileValue(value: unknown) {
  return !isEmpty(value) && normalizeText(String(value)) !== "non renseigne"
}

function pushUnique(list: string[], value: string) {
  if (!list.includes(value)) list.push(value)
}

export function checkProfileConsistency(profile: any = {}, question = ""): ConsistencyResult {
  const text = normalizeText(question)
  const detectedIntents = findReunionIntents(text)

  const result: ConsistencyResult = {
    state: "ok",
    missing: [],
    contradictions: [],
    suggestions: [],
    detectedIntents,
  }

  const logement = normalizeText(profile?.logement)
  const situationPro = normalizeText(profile?.situation_professionnelle)
  const situationFamiliale = normalizeText(profile?.situation_familiale)
  const enfants = profile?.nombre_enfants
  const revenusFoyer = profile?.revenus_foyer

  const talksAboutChildren = textMatchesIntent(text, "enfant")
  const saysOwner = textMatchesIntent(text, "proprietaire")
  const saysTenant = textMatchesIntent(text, "locataire") || textMatchesIntent(text, "loyer")
  const saysFiredOrUnemployed =
    textMatchesIntent(text, "licenciement") || textMatchesIntent(text, "demandeur_emploi")
  const saysWorking = textMatchesIntent(text, "salarie") || textMatchesIntent(text, "smic")
  const saysRetired = textMatchesIntent(text, "retraite")
  const saysStudent = textMatchesIntent(text, "etudiant")
  const asksForBenefits =
    textMatchesIntent(text, "aides") ||
    textMatchesIntent(text, "caf") ||
    textMatchesIntent(text, "rsa") ||
    textMatchesIntent(text, "apl") ||
    textMatchesIntent(text, "prime_activite") ||
    textMatchesIntent(text, "ccas")

  if (talksAboutChildren && isEmpty(enfants)) {
    pushUnique(result.missing, "nombre_enfants")
  }

  if (logement === "locataire" && saysOwner) {
    pushUnique(
      result.contradictions,
      "Le profil indique que l'utilisateur est locataire, mais la question indique une situation de propriétaire."
    )
  }

  if (logement === "proprietaire" && saysTenant) {
    pushUnique(
      result.contradictions,
      "Le profil indique que l'utilisateur est propriétaire, mais la question indique une situation de locataire ou de loyer."
    )
  }

  if (situationPro === "salarie" && saysFiredOrUnemployed) {
    pushUnique(
      result.suggestions,
      "La situation professionnelle semble avoir changé : le profil indique salarié, mais la question parle d'un licenciement, d'une perte d'emploi ou du chômage. Demande confirmation avant de raisonner sur les droits."
    )
  }

  if (situationPro === "demandeur_emploi" && saysWorking) {
    pushUnique(
      result.suggestions,
      "La situation professionnelle semble avoir changé : le profil indique demandeur d'emploi, mais la question parle d'une activité salariée. Demande confirmation avant de raisonner sur les droits."
    )
  }

  if (situationPro === "retraite" && saysWorking) {
    pushUnique(
      result.contradictions,
      "Le profil indique que l'utilisateur est retraité, mais la question parle d'une activité salariée."
    )
  }

  if (situationPro === "salarie" && saysRetired) {
    pushUnique(
      result.suggestions,
      "La situation professionnelle semble avoir changé : le profil indique salarié, mais la question parle d'une situation de retraité. Demande confirmation."
    )
  }

  if (situationPro && situationPro !== "etudiant" && saysStudent) {
    pushUnique(
      result.suggestions,
      "La situation semble avoir changé : la question parle d'un statut étudiant qui n'est pas celui du profil. Demande confirmation."
    )
  }

  if (textMatchesIntent(text, "smic")) {
    pushUnique(
      result.suggestions,
      "Attention : le revenu du foyer ne permet pas de déduire le salaire individuel. Le revenu du foyer peut inclure salaire, aides CAF, RSA, chômage, pensions ou autres ressources. Ne conclus jamais qu'un revenu foyer correspond au SMIC."
    )

    if (hasProfileValue(revenusFoyer)) {
      pushUnique(
        result.suggestions,
        "Si l'utilisateur parle du SMIC alors que le profil contient un revenu du foyer, précise que ces deux informations ne sont pas équivalentes."
      )
    }
  }

  if (asksForBenefits && !hasProfileValue(revenusFoyer)) {
    pushUnique(result.missing, "revenus_foyer")
  }

  if (asksForBenefits && !hasProfileValue(logement)) {
    pushUnique(result.missing, "logement")
  }

  if (asksForBenefits && !hasProfileValue(situationFamiliale)) {
    pushUnique(result.missing, "situation_familiale")
  }

  if (asksForBenefits && !hasProfileValue(situationPro)) {
    pushUnique(result.missing, "situation_professionnelle")
  }

  if (result.contradictions.length > 0) {
    result.state = "contradiction"
  } else if (result.suggestions.length > 0) {
    result.state = "profile_update"
  } else if (result.missing.length > 0) {
    result.state = "missing"
  }

  return result
}