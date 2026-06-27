import type { OpportunityProfile } from "./types.ts"

export interface ProfileAnalysis {
  profile: OpportunityProfile
  tags: string[]
  strengths: string[]
  missing: string[]
  risks: string[]
  priorityDomains: string[]
}

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== ""
}

function toNumber(value: unknown): number | undefined {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function pushUnique(list: string[], value: string) {
  if (!list.includes(value)) list.push(value)
}

export function analyzeOpportunityProfile(rawProfile: any = {}): ProfileAnalysis {
  const profile: OpportunityProfile = {
    age: toNumber(rawProfile.age),
    commune: rawProfile.commune || undefined,
    codePostal: rawProfile.code_postal || rawProfile.codePostal || undefined,
    departement: rawProfile.departement || rawProfile.department || "974",
    situationProfessionnelle:
      rawProfile.situation_professionnelle || rawProfile.situationProfessionnelle,
    situationFamiliale:
      rawProfile.situation_familiale || rawProfile.situationFamiliale,
    logement: rawProfile.logement,
    revenusFoyer: toNumber(rawProfile.revenus_foyer || rawProfile.revenusFoyer),
    nombreEnfants: toNumber(rawProfile.nombre_enfants || rawProfile.nombreEnfants),
    handicap: rawProfile.handicap === true,
    retraite: rawProfile.retraite === true,
    etudiant: rawProfile.etudiant === true,
    allocataireCAF:
      rawProfile.allocataire_caf === true || rawProfile.allocataireCAF === true,
    permis: rawProfile.permis === true,
    vehicule: rawProfile.vehicule === true,
  }

  const tags: string[] = []
  const strengths: string[] = []
  const missing: string[] = []
  const risks: string[] = []
  const priorityDomains: string[] = []

  const situationPro = normalize(profile.situationProfessionnelle)
  const situationFamille = normalize(profile.situationFamiliale)
  const logement = normalize(profile.logement)

  if (hasValue(profile.commune)) {
    pushUnique(tags, "commune_connue")
    pushUnique(strengths, "Commune connue")
  } else {
    pushUnique(missing, "commune")
  }

  if (hasValue(profile.age)) {
    pushUnique(tags, "age_connu")

    if ((profile.age || 0) < 26) {
      pushUnique(tags, "jeune")
      pushUnique(priorityDomains, "jeunesse")
    }

    if ((profile.age || 0) >= 60) {
      pushUnique(tags, "senior")
      pushUnique(priorityDomains, "retraite")
    }
  } else {
    pushUnique(missing, "age")
  }

  if (profile.nombreEnfants && profile.nombreEnfants > 0) {
    pushUnique(tags, "famille_avec_enfants")
    pushUnique(priorityDomains, "famille")
    pushUnique(strengths, "Nombre d'enfants connu")
  } else if (!hasValue(profile.nombreEnfants)) {
    pushUnique(missing, "nombre_enfants")
  }

  if (situationFamille.includes("couple")) {
    pushUnique(tags, "couple")
  }

  if (
    situationFamille.includes("seul") ||
    situationFamille.includes("isole") ||
    situationFamille.includes("solo")
  ) {
    pushUnique(tags, "parent_isole_possible")
    pushUnique(priorityDomains, "famille")
  }

  if (logement.includes("locataire")) {
    pushUnique(tags, "locataire")
    pushUnique(priorityDomains, "logement")
    pushUnique(strengths, "Situation logement connue")
  } else if (logement.includes("proprietaire")) {
    pushUnique(tags, "proprietaire")
    pushUnique(priorityDomains, "logement")
  } else if (!hasValue(profile.logement)) {
    pushUnique(missing, "logement")
  }

  if (situationPro.includes("salarie")) {
    pushUnique(tags, "salarie")
    pushUnique(priorityDomains, "emploi")
  } else if (
    situationPro.includes("chomage") ||
    situationPro.includes("demandeur") ||
    situationPro.includes("emploi")
  ) {
    pushUnique(tags, "demandeur_emploi")
    pushUnique(priorityDomains, "emploi")
    pushUnique(priorityDomains, "urgence")
  } else if (situationPro.includes("retraite")) {
    pushUnique(tags, "retraite")
    pushUnique(priorityDomains, "retraite")
  } else if (!hasValue(profile.situationProfessionnelle)) {
    pushUnique(missing, "situation_professionnelle")
  }

  if (profile.etudiant) {
    pushUnique(tags, "etudiant")
    pushUnique(priorityDomains, "etudes")
  }

  if (profile.handicap) {
    pushUnique(tags, "handicap")
    pushUnique(priorityDomains, "handicap")
    pushUnique(priorityDomains, "sante")
  }

  if (profile.allocataireCAF) {
    pushUnique(tags, "allocataire_caf")
    pushUnique(strengths, "Statut CAF connu")
  }

  if (hasValue(profile.revenusFoyer)) {
    pushUnique(tags, "revenus_foyer_connus")

    const revenus = profile.revenusFoyer || 0

    if (revenus <= 900) {
      pushUnique(tags, "revenus_tres_modestes")
      pushUnique(risks, "Revenus du foyer très faibles")
      pushUnique(priorityDomains, "urgence")
      pushUnique(priorityDomains, "alimentaire")
    } else if (revenus <= 1800) {
      pushUnique(tags, "revenus_modestes")
      pushUnique(priorityDomains, "logement")
      pushUnique(priorityDomains, "famille")
    } else if (revenus <= 2600) {
      pushUnique(tags, "revenus_intermediaires")
      pushUnique(priorityDomains, "budget")
    }
  } else {
    pushUnique(missing, "revenus_foyer")
  }

  if (!profile.vehicule) {
    pushUnique(tags, "mobilite_a_verifier")
    pushUnique(priorityDomains, "mobilite")
  }

  if (!profile.permis) {
    pushUnique(tags, "permis_a_verifier")
    pushUnique(priorityDomains, "mobilite")
  }

  return {
    profile,
    tags,
    strengths,
    missing,
    risks,
    priorityDomains,
  }
}