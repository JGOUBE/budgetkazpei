import { useEffect, useMemo, useState } from "react"
import {
  Lock, Send, Sparkles, Star, SearchCheck, ExternalLink,
  MessageCircle, ClipboardCheck, TrendingUp, Bell, PlusCircle, Trash2,
  FileText, CheckCircle2, DollarSign, CalendarDays,
} from "lucide-react"
import { supabase } from "../../services/supabase"

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  yellow: "#FCD34D",
  cyan: "#23D3D6",
  green: "#22C55E",
  text: "#F1F5F9",
  muted: "#8EA4C5",
  red: "#FB7185",
  purple: "#A78BFA",
}

const STATUS_OPTIONS = [
  { key: "a_verifier", fr: "À vérifier", kreol: "Pou vérifié", emoji: "🔍", color: "#23D3D6" },
  { key: "dossier", fr: "Dossier à préparer", kreol: "Dosyé pou préparé", emoji: "📝", color: "#FCD34D" },
  { key: "envoye", fr: "Demande envoyée", kreol: "Domann la parti", emoji: "📤", color: "#A78BFA" },
  { key: "attente", fr: "En attente", kreol: "An atant", emoji: "⏳", color: "#F97316" },
  { key: "accepte", fr: "Acceptée", kreol: "Aksepté", emoji: "✅", color: "#22C55E" },
  { key: "refuse", fr: "Refusée", kreol: "Refizé", emoji: "❌", color: "#FB7185" },
]

function safeT(t, section, key, fallback) {
  if (typeof t !== "function") return fallback
  return t(section, key) || fallback
}

function isKreolLanguage(t) {
  if (typeof t !== "function") return false
  return t("nav", "dashboard") === "Tablo débor"
}

function isTrue(value) {
  return value === true || value === "true" || value === 1 || value === "1"
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function formatValue(value, fallback = "Non renseigné") {
  if (value === null || value === undefined || value === "") return fallback
  return value
}

function formatMoney(value, isKreol = false) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return isKreol ? "Pa ransényé" : "Non renseigné"
  return `${number.toFixed(0).replace(".", ",")} € / mois`
}

function formatSituation(value, isKreol = false) {
  const fr = {
    celibataire: "Célibataire",
    couple: "En couple",
    marie: "Marié(e)",
    parent_isole: "Parent isolé",
    locataire: "Locataire",
    proprietaire: "Propriétaire",
    heberge: "Hébergé gratuitement",
    salarie: "Salarié",
    independant: "Indépendant",
    demandeur_emploi: "Demandeur d’emploi",
    etudiant: "Étudiant",
    retraite: "Retraité",
  }

  const kreol = {
    celibataire: "Sèl",
    couple: "An koup",
    marie: "Maryé",
    parent_isole: "Parent tousèl",
    locataire: "Lokatèr",
    proprietaire: "Propriyétèr",
    heberge: "Ébèrzé gratwi",
    salarie: "Salarié",
    independant: "Travay pou son kont",
    demandeur_emploi: "Domandèr d'emploi",
    etudiant: "Étidyan",
    retraite: "Retraité",
  }

  const map = isKreol ? kreol : fr
  return map[value] || formatValue(value, isKreol ? "Pa ransényé" : "Non renseigné")
}

function buildProfileSummary(profile = {}, isKreol = false) {
  if (isKreol) {
    return [
      `📍 Komin : ${formatValue(profile.commune, "Pa ransényé")}`,
      `👨‍👩‍👧‍👦 Sitiasyon famiy : ${formatSituation(profile.situation_familiale, true)}`,
      `👶 Nomb marmay : ${formatValue(profile.nombre_enfants, "Pa ransényé")}`,
      `🏠 Sitiasyon kaz : ${formatSituation(profile.logement, true)}`,
      `💼 Sitiasyon profesyonèl : ${formatSituation(profile.situation_professionnelle, true)}`,
      `🎂 Laz : ${formatValue(profile.age, "Pa ransényé")}`,
      `💰 Larzan rant dan kaz : ${formatMoney(profile.revenus_foyer, true)}`,
    ].join("\n")
  }

  return [
    `📍 Commune : ${formatValue(profile.commune)}`,
    `👨‍👩‍👧‍👦 Situation familiale : ${formatSituation(profile.situation_familiale)}`,
    `👶 Nombre d’enfants : ${formatValue(profile.nombre_enfants)}`,
    `🏠 Logement : ${formatSituation(profile.logement)}`,
    `💼 Situation professionnelle : ${formatSituation(profile.situation_professionnelle)}`,
    `🎂 Âge : ${formatValue(profile.age)}`,
    `💰 Revenus du foyer : ${formatMoney(profile.revenus_foyer)}`,
  ].join("\n")
}

function getQuestionIntent(question = "") {
  const q = normalizeText(question)
  if (!q.trim()) return []

  const intents = []

  if (q.includes("credit") || q.includes("crédit") || q.includes("pret") || q.includes("prêt") || q.includes("emprunt") || q.includes("microcredit") || q.includes("microcrédit") || q.includes("financement")) {
    intents.push("credit", "microcredit", "social", "budget")
  }

  if (q.includes("dette") || q.includes("surendettement") || q.includes("decouvert") || q.includes("découvert") || q.includes("banque de france") || q.includes("interdit bancaire") || q.includes("fichage") || q.includes("fiche banque") || q.includes("fiché banque")) {
    intents.push("dette", "surendettement", "budget", "social")
  }

  if (q.includes("vacance") || q.includes("loisir") || q.includes("sortie") || q.includes("centre aere") || q.includes("centre aéré") || q.includes("colo") || q.includes("vacaf") || q.includes("pass colo")) {
    intents.push("vacances", "loisirs", "jeunesse", "famille", "commune", "sport", "culture")
  }

  if (q.includes("cantine") || q.includes("repas") || q.includes("manger") || q.includes("alimentaire") || q.includes("alimentation")) {
    intents.push("alimentaire", "cantine", "famille", "commune", "social")
  }

  if (q.includes("loyer") || q.includes("logement") || q.includes("apl") || q.includes("maison") || q.includes("kaz") || q.includes("location") || q.includes("fsl")) {
    intents.push("logement", "apl", "loyer", "fsl")
  }

  if (q.includes("energie") || q.includes("énergie") || q.includes("electricite") || q.includes("électricité") || q.includes("edf") || q.includes("eau") || q.includes("facture") || q.includes("courant") || q.includes("kouran") || q.includes("coupure")) {
    intents.push("energie", "facture", "social")
  }

  if (q.includes("enfant") || q.includes("marmay") || q.includes("ecole") || q.includes("école") || q.includes("scolaire") || q.includes("garde")) {
    intents.push("famille", "jeunesse", "transport", "scolaire")
  }

  if (q.includes("travail") || q.includes("emploi") || q.includes("formation") || q.includes("chomage") || q.includes("chômage") || q.includes("france travail") || q.includes("mission locale") || q.includes("insertion")) {
    intents.push("emploi", "mobilite", "formation")
  }

  if (q.includes("permis") || q.includes("voiture") || q.includes("vehicule") || q.includes("véhicule") || q.includes("transport") || q.includes("mobilite") || q.includes("mobilité") || q.includes("bus") || q.includes("car jaune") || q.includes("réparation voiture") || q.includes("panne voiture")) {
    intents.push("mobilite", "transport", "permis", "voiture", "emploi", "microcredit")
  }

  if (q.includes("etudiant") || q.includes("étudiant") || q.includes("etude") || q.includes("étude") || q.includes("bourse") || q.includes("universite") || q.includes("université") || q.includes("crous")) {
    intents.push("etudiant")
  }

  if (q.includes("creation") || q.includes("création") || q.includes("entreprise") || q.includes("auto entrepreneur") || q.includes("micro entreprise") || q.includes("projet pro") || q.includes("artisan")) {
    intents.push("creation_entreprise", "emploi", "formation", "microcredit")
  }

  if (q.includes("separation") || q.includes("séparation") || q.includes("divorce") || q.includes("conjoint") || q.includes("parent isolé") || q.includes("parent isole")) {
    intents.push("separation", "famille", "logement", "social")
  }

  if (q.includes("handicap") || q.includes("mdph") || q.includes("aah") || q.includes("pch")) intents.push("handicap")
  if (q.includes("retraite") || q.includes("senior") || q.includes("gramoun") || q.includes("apa")) intents.push("senior")
  if (q.includes("sante") || q.includes("santé") || q.includes("mutuelle") || q.includes("css") || q.includes("ameli") || q.includes("soin")) intents.push("sante", "social")
  if (q.includes("commune") || q.includes("mairie") || q.includes("ccas")) intents.push("commune", "social")

  return [...new Set(intents)]
}

function getMainIntent(question = "") {
  const q = normalizeText(question)
  if (!q.trim()) return "general"

  if (q.includes("credit") || q.includes("crédit") || q.includes("pret") || q.includes("prêt") || q.includes("emprunt") || q.includes("microcredit") || q.includes("microcrédit") || q.includes("financement")) return "credit"
  if (q.includes("dette") || q.includes("surendettement") || q.includes("decouvert") || q.includes("découvert") || q.includes("banque de france") || q.includes("interdit bancaire") || q.includes("fichage") || q.includes("fiché banque")) return "dette"
  if (q.includes("permis") || q.includes("voiture") || q.includes("vehicule") || q.includes("véhicule") || q.includes("transport") || q.includes("bus") || q.includes("mobilite") || q.includes("mobilité") || q.includes("car jaune") || q.includes("réparation voiture") || q.includes("panne voiture")) return "transport"
  if (q.includes("facture") || q.includes("edf") || q.includes("electricite") || q.includes("électricité") || q.includes("energie") || q.includes("énergie") || q.includes("eau") || q.includes("coupure")) return "facture"
  if (q.includes("loyer") || q.includes("logement") || q.includes("apl") || q.includes("location") || q.includes("fsl")) return "logement"
  if (q.includes("cantine") || q.includes("repas") || q.includes("alimentaire")) return "cantine"
  if (q.includes("vacance") || q.includes("loisir") || q.includes("centre aere") || q.includes("centre aéré") || q.includes("colo") || q.includes("vacaf")) return "vacances"
  if (q.includes("emploi") || q.includes("travail") || q.includes("formation") || q.includes("chomage") || q.includes("chômage") || q.includes("france travail") || q.includes("mission locale")) return "emploi"
  if (q.includes("creation") || q.includes("création") || q.includes("entreprise") || q.includes("auto entrepreneur") || q.includes("micro entreprise")) return "creation_entreprise"
  if (q.includes("separation") || q.includes("séparation") || q.includes("divorce") || q.includes("parent isolé") || q.includes("parent isole")) return "separation"
  if (q.includes("etudiant") || q.includes("étudiant") || q.includes("bourse") || q.includes("universite") || q.includes("université") || q.includes("crous")) return "etudiant"
  if (q.includes("handicap") || q.includes("aah") || q.includes("pch") || q.includes("mdph")) return "handicap"
  if (q.includes("retraite") || q.includes("senior") || q.includes("apa") || q.includes("gramoun")) return "senior"
  if (q.includes("sante") || q.includes("santé") || q.includes("mutuelle") || q.includes("css") || q.includes("ameli") || q.includes("soin")) return "sante"
  return "general"
}

function hasFocusedQuestion(question = "") {
  return getMainIntent(question) !== "general"
}

function getAideSearchText(aide = "") {
  return normalizeText(
    `${aide.nom || ""} ${aide.nom_kreol || ""} ${aide.aide_nom || ""} ${aide.categorie || ""} ${aide.category || ""} ${aide.type || ""} ${aide.tags || ""} ${aide.description || ""} ${aide.description_fr || ""} ${aide.description_kreol || ""} ${aide.demarches_fr || ""} ${aide.demarches_kreol || ""} ${aide.organisme || ""} ${aide.lien_officiel || ""}`
  )
}

const INTENT_KEYWORDS = {
  // V3.5 : mots vraiment discriminants.
  // On évite les mots trop génériques comme "ccas", "social" ou "famille"
  // dans les intentions fortes, sinon l'assistant remonte des aides hors sujet.
  credit: [
    "microcredit", "microcrédit", "credit", "crédit", "pret", "prêt",
    "emprunt", "financement", "banque", "banque de france",
    "point conseil budget", "pcb", "udaf", "adie"
  ],
  dette: [
    "dette", "dettes", "impaye", "impayé", "impayes", "impayés",
    "surendettement", "banque de france", "decouvert", "découvert",
    "fichage", "interdit bancaire", "point conseil budget", "pcb"
  ],
  transport: [
    "mobilite", "mobilité", "transport", "permis", "voiture",
    "vehicule", "véhicule", "réparation", "reparation", "garage",
    "bus", "car jaune", "france travail", "mission locale",
    "aide permis", "aide mobilité", "insertion"
  ],
  facture: [
    "facture", "edf", "energie", "énergie", "electricite", "électricité",
    "eau", "cheque energie", "chèque énergie", "fournisseur",
    "coupure", "echeancier", "échéancier"
  ],
  logement: [
    "logement", "apl", "loyer", "fsl", "fonds solidarite logement",
    "fonds solidarité logement", "bail", "caution", "depot de garantie",
    "dépôt de garantie", "retard de loyer", "expulsion", "action logement"
  ],
  cantine: [
    "cantine", "scolaire", "repas", "alimentaire", "service scolaire"
  ],
  vacances: [
    "vacances", "vacaf", "loisirs", "sport", "culture", "pass sport",
    "pass culture", "centre aere", "centre aéré", "colo", "colonie"
  ],
  emploi: [
    "emploi", "travail", "formation", "france travail", "mission locale",
    "insertion", "reprise d'emploi", "reprise emploi", "region", "région"
  ],
  creation_entreprise: [
    "creation", "création", "entreprise", "auto entrepreneur",
    "micro entreprise", "adie", "bpi", "initiative", "cci", "cma",
    "microcredit professionnel", "microcrédit professionnel"
  ],
  separation: [
    "separation", "séparation", "divorce", "parent isole", "parent isolé",
    "pension", "asf", "violence", "familiale"
  ],
  etudiant: [
    "etudiant", "étudiant", "bourse", "crous", "universite", "université",
    "scolarite", "scolarité"
  ],
  handicap: [
    "handicap", "mdph", "aah", "pch", "carte mobilité", "carte mobilite"
  ],
  senior: [
    "retraite", "senior", "gramoun", "apa", "maintien domicile",
    "caisse retraite"
  ],
  sante: [
    "sante", "santé", "mutuelle", "css", "complémentaire santé solidaire",
    "complementaire sante solidaire", "cpam", "ameli", "soin", "medical", "médical"
  ],
}

const INTENT_PRIORITY_RULES = {
  credit: [
    { keywords: ["microcredit social", "microcrédit social"], priority: 130 },
    { keywords: ["point conseil budget", "pcb"], priority: 125 },
    { keywords: ["banque de france"], priority: 120 },
    { keywords: ["dettes", "impayés", "impayes", "découvert", "decouvert"], priority: 110 },
    { keywords: ["microcredit", "microcrédit", "credit", "crédit", "pret", "prêt", "financement"], priority: 105 },
  ],
  dette: [
    { keywords: ["banque de france", "surendettement"], priority: 130 },
    { keywords: ["point conseil budget", "pcb"], priority: 125 },
    { keywords: ["dettes", "impayés", "impayes", "découvert", "decouvert"], priority: 120 },
    { keywords: ["microcredit social", "microcrédit social"], priority: 90 },
  ],
  transport: [
    { keywords: ["permis france travail", "aide permis", "permis"], priority: 130 },
    { keywords: ["mobilite france travail", "mobilité france travail", "aide mobilité", "aide mobilite"], priority: 125 },
    { keywords: ["réparation véhicule", "reparation vehicule", "réparation loto", "garage"], priority: 120 },
    { keywords: ["achat véhicule", "achat vehicule", "voiture", "vehicule", "véhicule"], priority: 115 },
    { keywords: ["mission locale"], priority: 110 },
    { keywords: ["microcredit social", "microcrédit social"], priority: 100 },
  ],
  facture: [
    { keywords: ["facture edf", "edf", "energie", "énergie", "chèque énergie", "cheque energie"], priority: 130 },
    { keywords: ["echeancier", "échéancier", "fournisseur"], priority: 120 },
    { keywords: ["facture eau", "eau"], priority: 115 },
    { keywords: ["secours urgence", "ccas"], priority: 90 },
  ],
  logement: [
    { keywords: ["fonds solidarite logement", "fonds solidarité logement", "fsl"], priority: 130 },
    { keywords: ["retard de loyer", "loyer", "expulsion"], priority: 125 },
    { keywords: ["depot de garantie", "dépôt de garantie", "caution"], priority: 120 },
    { keywords: ["apl", "logement"], priority: 110 },
  ],
  cantine: [
    { keywords: ["cantine"], priority: 130 },
    { keywords: ["alimentaire", "repas"], priority: 110 },
    { keywords: ["ccas"], priority: 90 },
  ],
  vacances: [
    { keywords: ["vacances", "vacaf"], priority: 130 },
    { keywords: ["loisirs", "sport", "culture", "centre aere", "centre aéré"], priority: 115 },
  ],
  emploi: [
    { keywords: ["france travail"], priority: 130 },
    { keywords: ["formation", "région", "region"], priority: 120 },
    { keywords: ["mission locale"], priority: 115 },
    { keywords: ["garde d’enfants reprise emploi", "garde d'enfants reprise emploi"], priority: 110 },
  ],
  creation_entreprise: [
    { keywords: ["microcredit professionnel", "microcrédit professionnel", "adie"], priority: 130 },
    { keywords: ["creation entreprise", "création entreprise"], priority: 125 },
    { keywords: ["cci", "cma", "initiative"], priority: 110 },
  ],
  separation: [
    { keywords: ["separation", "séparation", "violence"], priority: 130 },
    { keywords: ["parent isole", "parent isolé", "asf"], priority: 120 },
    { keywords: ["logement", "ccas"], priority: 90 },
  ],
  etudiant: [
    { keywords: ["crous", "etudiant", "étudiant", "bourse"], priority: 130 },
  ],
  handicap: [
    { keywords: ["mdph", "handicap", "aah", "pch"], priority: 130 },
  ],
  senior: [
    { keywords: ["retraite", "apa", "maintien domicile"], priority: 130 },
  ],
  sante: [
    { keywords: ["complementaire sante solidaire", "complémentaire santé solidaire", "css"], priority: 130 },
    { keywords: ["cpam", "ameli", "mutuelle", "sante", "santé"], priority: 115 },
  ],
}

function getIntentPriority(aide = {}, mainIntent = "general") {
  if (!mainIntent || mainIntent === "general") return 0

  const text = getAideSearchText(aide)
  const rules = INTENT_PRIORITY_RULES[mainIntent] || []

  for (const rule of rules) {
    if (rule.keywords.some(keyword => text.includes(normalizeText(keyword)))) {
      return rule.priority
    }
  }

  return 0
}

function aideMatchesMainIntent(aide = {}, mainIntent = "general") {
  if (!mainIntent || mainIntent === "general") return false
  const keywords = INTENT_KEYWORDS[mainIntent] || []
  if (keywords.length === 0) return false
  const text = getAideSearchText(aide)
  return keywords.some(keyword => text.includes(normalizeText(keyword)))
}

function getIntentBoost(aide = {}, mainIntent = "general") {
  if (!mainIntent || mainIntent === "general") {
    return { boost: 0, match: false, priority: 0, matchedKeywords: [] }
  }

  const text = getAideSearchText(aide)
  const name = normalizeText(`${aide.nom || ""} ${aide.nom_kreol || ""} ${aide.aide_nom || ""}`)
  const keywords = INTENT_KEYWORDS[mainIntent] || []
  const matchedKeywords = keywords.filter(keyword => text.includes(normalizeText(keyword)))
  const priority = getIntentPriority(aide, mainIntent)

  // V3.5 : une aide peut être pertinente soit par mot-clé direct,
  // soit par règle prioritaire explicite.
  const match = matchedKeywords.length > 0 || priority > 0

  if (!match) {
    // Forte pénalité quand la question est précise.
    // Exemple : "crédit" ne doit plus remonter "vacances CCAS" ou "APL".
    return { boost: -70, match: false, priority: 0, matchedKeywords: [] }
  }

  let boost = 85

  if (priority >= 130) boost += 45
  else if (priority >= 120) boost += 35
  else if (priority >= 110) boost += 25
  else if (priority >= 100) boost += 15

  if (matchedKeywords.length >= 2) boost += 12
  if (matchedKeywords.length >= 4) boost += 8

  if (keywords.some(keyword => name.includes(normalizeText(keyword)))) boost += 20

  return { boost, match: true, priority, matchedKeywords }
}

function formatAideAmount(aide, isKreol = false) {
  const min = Number(aide.montant_min)
  const max = Number(aide.montant_max)

  if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > 0) {
    if (min === max) return `${min} €`
    return `${min} à ${max} €`
  }

  if (Number.isFinite(min) && min > 0) return isKreol ? `apartir ${min} €` : `à partir de ${min} €`
  if (Number.isFinite(max) && max > 0) return isKreol ? `ziska ${max} €` : `jusqu'à ${max} €`
  return isKreol ? "Montan varyab" : "Montant variable"
}

function getAideAmountNumber(aide = {}) {
  const min = Number(aide.montant_min)
  const max = Number(aide.montant_max)
  if (Number.isFinite(max) && max > 0) return max
  if (Number.isFinite(min) && min > 0) return min
  return 0
}

function getAideName(aide, isKreol = false) {
  if (isKreol && aide.nom_kreol) return aide.nom_kreol
  return aide.nom || aide.aide_nom || "Aide"
}

function getAideDescription(aide, isKreol = false) {
  if (isKreol && aide.description_kreol) return aide.description_kreol
  return aide.description_fr || aide.description || ""
}

function getAideDemarches(aide, isKreol = false) {
  if (isKreol && aide.demarches_kreol) return aide.demarches_kreol
  return aide.demarches_fr || ""
}

function getOfficialLink(aide) {
  return aide.lien_officiel || aide.url || ""
}


function getActionContacts(aide = {}, profile = {}, isKreol = false) {
  const text = getAideSearchText(aide)
  const commune = profile?.commune
  const mairie = commune ? `Mairie / CCAS de ${commune}` : "Mairie / CCAS de votre commune"

  if (text.includes("microcredit") || text.includes("microcrédit") || text.includes("credit") || text.includes("crédit") || text.includes("pret") || text.includes("prêt")) {
    return isKreol
      ? [mairie, "Point Conseil Budget", "UDAF ou association partenaire", "Assistante sociale"]
      : [mairie, "Point Conseil Budget", "UDAF ou association partenaire", "Assistante sociale"]
  }

  if (text.includes("banque de france") || text.includes("surendettement") || text.includes("dette") || text.includes("impaye") || text.includes("impayé")) {
    return isKreol
      ? ["Banque de France", "Point Conseil Budget", mairie, "Assistante sociale"]
      : ["Banque de France", "Point Conseil Budget", mairie, "Assistante sociale"]
  }

  if (text.includes("france travail") || text.includes("permis") || text.includes("mobilite") || text.includes("mobilité") || text.includes("vehicule") || text.includes("véhicule") || text.includes("voiture")) {
    return isKreol
      ? ["Conseiller France Travail", "Mission Locale si jeune", mairie, "Microcrédit social si besoin de financement"]
      : ["Conseiller France Travail", "Mission Locale si jeune", mairie, "Microcrédit social si besoin de financement"]
  }

  if (text.includes("logement") || text.includes("loyer") || text.includes("fsl") || text.includes("apl") || text.includes("caution")) {
    return isKreol
      ? ["CAF", mairie, "Bailleur", "Assistante sociale / Département"]
      : ["CAF", mairie, "Bailleur", "Assistante sociale / Département"]
  }

  if (text.includes("energie") || text.includes("énergie") || text.includes("edf") || text.includes("eau") || text.includes("facture")) {
    return isKreol
      ? ["Fournisseur concerné", mairie, "CAF ou assistante sociale", "Site chèque énergie si concerné"]
      : ["Fournisseur concerné", mairie, "CAF ou assistante sociale", "Site chèque énergie si concerné"]
  }

  if (text.includes("cantine") || text.includes("scolaire") || text.includes("enfant") || text.includes("vacances")) {
    return isKreol
      ? ["Service scolaire de la mairie", mairie, "CAF", "Association locale si besoin"]
      : ["Service scolaire de la mairie", mairie, "CAF", "Association locale si besoin"]
  }

  if (text.includes("sante") || text.includes("santé") || text.includes("css") || text.includes("mutuelle") || text.includes("cpam") || text.includes("ameli")) {
    return isKreol
      ? ["CPAM / Ameli", "Assistante sociale", mairie]
      : ["CPAM / Ameli", "Assistante sociale", mairie]
  }

  return isKreol
    ? [mairie, "CAF ou organisme officiel", "Assistante sociale si besoin"]
    : [mairie, "CAF ou organisme officiel", "Assistante sociale si besoin"]
}

function getImmediateActionSteps(aide = {}, profile = {}, isKreol = false) {
  const text = getAideSearchText(aide)
  const commune = profile?.commune

  if (text.includes("microcredit") || text.includes("microcrédit")) {
    return isKreol
      ? [
          commune ? `Contacte le CCAS ou la mairie de ${commune}.` : "Contacte out CCAS ou mairie.",
          "Demande une orientation vers un microcrédit social.",
          "Prépare un petit résumé : montant demandé, projet, revenus, charges.",
          "Ajoute cette aide dans tes démarches pour suivre les relances.",
        ]
      : [
          commune ? `Contactez le CCAS ou la mairie de ${commune}.` : "Contactez votre CCAS ou votre mairie.",
          "Demandez une orientation vers un microcrédit social.",
          "Préparez un résumé : montant demandé, projet, revenus, charges.",
          "Ajoutez cette aide à vos démarches pour suivre les relances.",
        ]
  }

  if (text.includes("france travail") || text.includes("permis") || text.includes("mobilite") || text.includes("mobilité")) {
    return isKreol
      ? [
          "Contacte ton conseiller France Travail avant d'engager la dépense.",
          "Prépare un devis ou justificatif : auto-école, transport, réparation, formation.",
          "Explique pourquoi cette dépense aide ton retour à l'emploi.",
          "Ajoute la démarche pour suivre date, documents et relances.",
        ]
      : [
          "Contactez votre conseiller France Travail avant d'engager la dépense.",
          "Préparez un devis ou justificatif : auto-école, transport, réparation, formation.",
          "Expliquez pourquoi cette dépense facilite votre retour à l'emploi.",
          "Ajoutez la démarche pour suivre la date, les documents et les relances.",
        ]
  }

  if (text.includes("banque de france") || text.includes("surendettement") || text.includes("dette") || text.includes("impaye") || text.includes("impayé")) {
    return isKreol
      ? [
          "Liste toutes tes dettes, retards, crédits et charges fixes.",
          "Contacte un Point Conseil Budget ou une assistante sociale.",
          "Si la situation est lourde, demande conseil à la Banque de France.",
          "Évite de reprendre un crédit sans accompagnement.",
        ]
      : [
          "Listez vos dettes, retards, crédits et charges fixes.",
          "Contactez un Point Conseil Budget ou une assistante sociale.",
          "Si la situation est lourde, demandez conseil à la Banque de France.",
          "Évitez de reprendre un crédit sans accompagnement.",
        ]
  }

  if (text.includes("logement") || text.includes("loyer") || text.includes("fsl") || text.includes("apl") || text.includes("caution")) {
    return isKreol
      ? [
          "Vérifie CAF/APL puis FSL si retard ou difficulté logement.",
          "Prépare bail, quittance, revenus, RIB et justificatif domicile.",
          "Contacte bailleur, CAF, CCAS ou assistante sociale rapidement.",
          "Ajoute la démarche pour suivre les documents manquants.",
        ]
      : [
          "Vérifiez CAF/APL puis FSL en cas de retard ou difficulté logement.",
          "Préparez bail, quittance, revenus, RIB et justificatif de domicile.",
          "Contactez rapidement bailleur, CAF, CCAS ou assistante sociale.",
          "Ajoutez la démarche pour suivre les documents manquants.",
        ]
  }

  if (text.includes("energie") || text.includes("énergie") || text.includes("edf") || text.includes("eau") || text.includes("facture")) {
    return isKreol
      ? [
          "Contacte le fournisseur avant coupure ou majoration.",
          "Demande un échéancier si tu ne peux pas payer d'un coup.",
          "Prépare facture, revenus, charges et justificatif domicile.",
          "Contacte le CCAS si la facture met le foyer en difficulté.",
        ]
      : [
          "Contactez le fournisseur avant coupure ou majoration.",
          "Demandez un échéancier si vous ne pouvez pas payer en une fois.",
          "Préparez facture, revenus, charges et justificatif de domicile.",
          "Contactez le CCAS si la facture met le foyer en difficulté.",
        ]
  }

  return isKreol
    ? [
        "Lis les conditions de l'aide sur le site officiel.",
        "Prépare les documents indiqués ci-dessous.",
        "Contacte l'organisme ou le CCAS si tu as un doute.",
        "Ajoute la démarche pour suivre l'avancement.",
      ]
    : [
        "Consultez les conditions de l'aide sur le site officiel.",
        "Préparez les documents indiqués ci-dessous.",
        "Contactez l'organisme ou le CCAS en cas de doute.",
        "Ajoutez la démarche pour suivre l'avancement.",
      ]
}

function getAideKey(aide = {}) {
  return String(aide.id || aide.aide_id || aide.nom || "aide")
}

function getStatusByKey(key) {
  return STATUS_OPTIONS.find(status => status.key === key) || STATUS_OPTIONS[0]
}

function normalizeAideName(value) {
  return normalizeText(value)
    .replace(/\bde\b/g, "")
    .replace(/\bd\b/g, "")
    .replace(/\bl\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function uniqueDocuments(documents = []) {
  const seen = new Set()

  return documents.filter(doc => {
    const key = normalizeText(doc.document_nom)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getFallbackDocuments(aideName = "") {
  const name = normalizeText(aideName)

  const common = [
    { document_nom: "Pièce d’identité", document_nom_kreol: "Piès lidantité", obligatoire: true },
    { document_nom: "RIB", document_nom_kreol: "RIB", obligatoire: true },
    { document_nom: "Justificatif de domicile", document_nom_kreol: "Papye ladres", obligatoire: true },
    { document_nom: "Avis d’imposition", document_nom_kreol: "Avi lenpo", obligatoire: false },
  ]

  if (name.includes("apl") || name.includes("logement") || name.includes("loyer")) {
    return [
      { document_nom: "Pièce d’identité", document_nom_kreol: "Piès lidantité", obligatoire: true },
      { document_nom: "RIB", document_nom_kreol: "RIB", obligatoire: true },
      { document_nom: "Bail ou contrat de location", document_nom_kreol: "Bail ou kontra lokasyon", obligatoire: true },
      { document_nom: "Dernière quittance de loyer", document_nom_kreol: "Dernié quittance loyé", obligatoire: false },
      { document_nom: "Avis d’imposition", document_nom_kreol: "Avi lenpo", obligatoire: true },
      { document_nom: "Justificatifs de revenus", document_nom_kreol: "Papye revenu", obligatoire: true },
    ]
  }

  if (name.includes("rentree") || name.includes("rentrée") || name.includes("scolaire") || name.includes("ars")) {
    return [
      { document_nom: "Numéro allocataire CAF", document_nom_kreol: "Niméro allocatèr CAF", obligatoire: true },
      { document_nom: "Livret de famille", document_nom_kreol: "Livré famiy", obligatoire: false },
      { document_nom: "Certificat de scolarité si demandé", document_nom_kreol: "Sertifika lékol si i demande", obligatoire: false },
      { document_nom: "Avis d’imposition", document_nom_kreol: "Avi lenpo", obligatoire: false },
    ]
  }

  if (name.includes("cmg") || name.includes("garde") || name.includes("enfant") || name.includes("creche") || name.includes("crèche")) {
    return [
      { document_nom: "Pièce d’identité", document_nom_kreol: "Piès lidantité", obligatoire: true },
      { document_nom: "RIB", document_nom_kreol: "RIB", obligatoire: true },
      { document_nom: "Contrat avec assistante maternelle, crèche ou garde à domicile", document_nom_kreol: "Kontra ek nounou, krèsh ou gard lakaz", obligatoire: true },
      { document_nom: "Numéro allocataire CAF", document_nom_kreol: "Niméro allocatèr CAF", obligatoire: true },
      { document_nom: "Justificatifs de revenus", document_nom_kreol: "Papye revenu", obligatoire: true },
    ]
  }

  if (name.includes("energie") || name.includes("énergie") || name.includes("edf") || name.includes("electricite") || name.includes("électricité") || name.includes("eau")) {
    return [
      { document_nom: "Facture concernée", document_nom_kreol: "Faktur concerné", obligatoire: true },
      { document_nom: "Pièce d’identité", document_nom_kreol: "Piès lidantité", obligatoire: true },
      { document_nom: "Justificatif de domicile", document_nom_kreol: "Papye ladres", obligatoire: true },
      { document_nom: "Justificatifs de revenus", document_nom_kreol: "Papye revenu", obligatoire: true },
      { document_nom: "Avis d’imposition", document_nom_kreol: "Avi lenpo", obligatoire: false },
    ]
  }

  if (name.includes("ccas") || name.includes("alimentaire") || name.includes("social")) {
    return [
      { document_nom: "Pièce d’identité", document_nom_kreol: "Piès lidantité", obligatoire: true },
      { document_nom: "Justificatif de domicile", document_nom_kreol: "Papye ladres", obligatoire: true },
      { document_nom: "Justificatifs de revenus", document_nom_kreol: "Papye revenu", obligatoire: true },
      { document_nom: "Justificatifs de charges", document_nom_kreol: "Papye charges", obligatoire: true },
      { document_nom: "Livret de famille si enfants", document_nom_kreol: "Livré famiy si ou na marmay", obligatoire: false },
    ]
  }

  if (name.includes("sport")) {
    return [
      { document_nom: "Pièce d’identité", document_nom_kreol: "Piès lidantité", obligatoire: true },
      { document_nom: "Justificatif d’éligibilité", document_nom_kreol: "Papye pou prouv out drwa", obligatoire: true },
      { document_nom: "Attestation CAF si demandée", document_nom_kreol: "Papye CAF si i demande", obligatoire: false },
    ]
  }

  if (name.includes("sante") || name.includes("santé") || name.includes("css") || name.includes("mutuelle")) {
    return [
      { document_nom: "Pièce d’identité", document_nom_kreol: "Piès lidantité", obligatoire: true },
      { document_nom: "Carte vitale ou attestation de droits", document_nom_kreol: "Kart vital ou papye droit", obligatoire: true },
      { document_nom: "Justificatifs de revenus", document_nom_kreol: "Papye revenu", obligatoire: true },
      { document_nom: "Avis d’imposition", document_nom_kreol: "Avi lenpo", obligatoire: false },
    ]
  }

  return common
}

function getDocumentsForAide(aideName = "", aideDocuments = []) {
  const target = normalizeAideName(aideName)

  const exactMatches = aideDocuments.filter(doc => {
    const source = normalizeAideName(doc.aide_nom)
    return source && target && (source === target || source.includes(target) || target.includes(source))
  })

  if (exactMatches.length > 0) return uniqueDocuments(exactMatches)

  const fallback = getFallbackDocuments(aideName)
  return uniqueDocuments(fallback)
}

function getDocumentDisplayName(document, isKreol = false) {
  if (isKreol && document.document_nom_kreol) return document.document_nom_kreol
  return document.document_nom
}

function formatShortDate(value, isKreol = false) {
  if (!value) return isKreol ? "Pa ransényé" : "Non renseigné"

  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value))
  } catch {
    return isKreol ? "Pa ransényé" : "Non renseigné"
  }
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function getLevel(score, isKreol = false) {
  if (score >= 80) return { label: isKreol ? "Tré probab" : "Très probable", emoji: "🟢", color: COLORS.green }
  if (score >= 50) return { label: isKreol ? "Probab" : "Probable", emoji: "🟡", color: COLORS.yellow }
  return { label: isKreol ? "A vérifié" : "À vérifier", emoji: "🔵", color: COLORS.cyan }
}

function addReason(reasons, fr, kreol, isKreol) {
  reasons.push(isKreol ? kreol : fr)
}

function addExcluded(excluded, fr, kreol, isKreol) {
  excluded.push(isKreol ? kreol : fr)
}

function shouldExcludeAide(aide = {}, profile = {}, isKreol = false) {
  const excluded = []
  const income = Number(profile.revenus_foyer)
  const revenusMax = Number(aide.revenus_max)
  const revenusMin = Number(aide.revenus_min)
  const age = Number(profile.age)
  const ageMin = Number(aide.age_min)
  const ageMax = Number(aide.age_max)

  if (Number.isFinite(income) && income > 0) {
    if (Number.isFinite(revenusMax) && revenusMax > 0 && income > revenusMax) {
      addExcluded(excluded, `Revenus du foyer supérieurs au plafond indiqué (${revenusMax} € / mois).`, `Revenu la kaz lé plis o ke plafon indiké (${revenusMax} € / mwa).`, isKreol)
    }
    if (Number.isFinite(revenusMin) && revenusMin > 0 && income < revenusMin) {
      addExcluded(excluded, `Revenus du foyer inférieurs au minimum indiqué (${revenusMin} € / mois).`, `Revenu la kaz lé pli ba ke minimum indiké (${revenusMin} € / mwa).`, isKreol)
    }
  }

  if (Number.isFinite(age) && age > 0) {
    if (Number.isFinite(ageMin) && ageMin > 0 && age < ageMin) {
      addExcluded(excluded, `Âge inférieur au minimum demandé (${ageMin} ans).`, `Out laz lé pli ba ke minimum demandé (${ageMin} an).`, isKreol)
    }
    if (Number.isFinite(ageMax) && ageMax > 0 && age > ageMax) {
      addExcluded(excluded, `Âge supérieur au maximum demandé (${ageMax} ans).`, `Out laz lé pli o ke maximum demandé (${ageMax} an).`, isKreol)
    }
  }

  if (isTrue(aide.besoin_enfant) && Number(profile.nombre_enfants || 0) <= 0) addExcluded(excluded, "Cette aide nécessite d’avoir au moins un enfant à charge.", "Sa zéd-la i domann davoir omwin in marmay a chaj.", isKreol)
  if (isTrue(aide.besoin_locataire) && profile.logement && profile.logement !== "locataire") addExcluded(excluded, "Cette aide concerne les locataires.", "Sa zéd-la i konsern bann lokatèr.", isKreol)
  if (isTrue(aide.besoin_proprietaire) && profile.logement && profile.logement !== "proprietaire") addExcluded(excluded, "Cette aide concerne les propriétaires.", "Sa zéd-la i konsern bann propriyétèr.", isKreol)
  if (isTrue(aide.besoin_etudiant) && !isTrue(profile.etudiant) && profile.situation_professionnelle !== "etudiant") addExcluded(excluded, "Cette aide concerne les étudiants.", "Sa zéd-la i konsern bann étidyan.", isKreol)
  if (isTrue(aide.besoin_handicap) && !isTrue(profile.handicap)) addExcluded(excluded, "Cette aide nécessite une situation de handicap.", "Sa zéd-la i domann in sitiasyon handicap.", isKreol)
  if (isTrue(aide.besoin_retraite) && !isTrue(profile.retraite) && profile.situation_professionnelle !== "retraite") addExcluded(excluded, "Cette aide concerne les retraités ou les seniors.", "Sa zéd-la i konsern bann retraité ou gramoun.", isKreol)
  if (isTrue(aide.besoin_demandeur_emploi) && profile.situation_professionnelle && profile.situation_professionnelle !== "demandeur_emploi") addExcluded(excluded, "Cette aide concerne surtout les demandeurs d’emploi.", "Sa zéd-la i konsern sirtou bann domandèr d'emploi.", isKreol)

  if (aide.commune && profile.commune && normalizeText(aide.commune) !== normalizeText(profile.commune)) {
    addExcluded(excluded, `Cette aide semble réservée à la commune de ${aide.commune}.`, `Sa zéd-la i sanm réservé pou komin ${aide.commune}.`, isKreol)
  }

  return excluded
}

function scoreAide(aide = {}, profile = {}, isKreol = false, question = "") {
  const excludedReasons = shouldExcludeAide(aide, profile, isKreol)

  if (excludedReasons.length > 0) {
    return { ...aide, score: 0, excluded: true, excludedReasons, reasons: [], missing: [] }
  }

  let score = Number(aide.score_priorite || 0)
  if (score > 40) score = Math.round(score * 0.45)

  const reasons = []
  const missing = []
  const intents = getQuestionIntent(question)
  const mainIntent = getMainIntent(question)
  const intentMeta = getIntentBoost(aide, mainIntent)
  const intentPriority = intentMeta.priority || getIntentPriority(aide, mainIntent)

  const aideText = getAideSearchText(aide)

  const enfants = Number(profile.nombre_enfants || 0)
  const revenus = Number(profile.revenus_foyer || 0)
  const age = Number(profile.age || 0)

  if (hasFocusedQuestion(question)) {
    score += intentMeta.boost

    if (intentMeta.match) {
      addReason(
        reasons,
        "Cette piste correspond au sujet précis de votre question.",
        "Sa piste-la i korespond ek sujet précis out kestion.",
        isKreol
      )
    }
  }

  if (intents.length > 0) {
    const matchedIntents = intents.filter(intent => aideText.includes(intent))
    if (matchedIntents.length > 0) {
      score += Math.min(45, matchedIntents.length * 16)
      addReason(reasons, "Cette aide correspond directement à votre question.", "Sa zéd-la i korespond dirèk ek out kestion.", isKreol)
    }
  }

  if (question && normalizeText(question).length > 3) {
    const words = normalizeText(question).split(" ").filter(word => word.length >= 4)
    const matches = words.filter(word => aideText.includes(word)).length
    if (matches > 0) {
      score += Math.min(25, matches * 6)
      addReason(reasons, "Plusieurs mots de votre question correspondent à cette aide.", "Plizièr mo dann out kestion i korespond ek sa zéd-la.", isKreol)
    }
  }

  if (isTrue(aide.besoin_enfant) && enfants > 0) {
    score += 30
    addReason(reasons, "Vous avez des enfants à charge.", "Ou na marmay a chaj.", isKreol)
  } else if (enfants > 0 && (aideText.includes("famille") || aideText.includes("enfant") || aideText.includes("scolaire") || aideText.includes("jeunesse") || aideText.includes("vacances") || aideText.includes("loisirs"))) {
    score += 18
    addReason(reasons, "Cette aide peut concerner les familles avec enfants.", "Sa zéd-la i pé konsern bann famiy ek marmay.", isKreol)
  }

  if (isTrue(aide.besoin_locataire) && profile.logement === "locataire") {
    score += 30
    addReason(reasons, "Votre profil indique que vous êtes locataire.", "Out profil i indik ou lé lokatèr.", isKreol)
  } else if (profile.logement === "locataire" && (aideText.includes("logement") || aideText.includes("loyer") || aideText.includes("apl"))) {
    score += 18
    addReason(reasons, "Votre situation de logement peut ouvrir droit à cette aide.", "Out sitiasyon kaz i pé donn drwa a sa zéd-la.", isKreol)
  }

  if (isTrue(aide.besoin_proprietaire) && profile.logement === "proprietaire") {
    score += 25
    addReason(reasons, "Votre profil indique que vous êtes propriétaire.", "Out profil i indik ou lé propriyétèr.", isKreol)
  }

  if (isTrue(aide.besoin_etudiant) && (isTrue(profile.etudiant) || profile.situation_professionnelle === "etudiant")) {
    score += 35
    addReason(reasons, "Votre profil indique une situation étudiante.", "Out profil i indik ou lé étidyan.", isKreol)
  }

  if (isTrue(aide.besoin_handicap) && isTrue(profile.handicap)) {
    score += 40
    addReason(reasons, "Votre profil indique une situation de handicap.", "Out profil i indik in sitiasyon handicap.", isKreol)
  }

  if (isTrue(aide.besoin_retraite) && (isTrue(profile.retraite) || profile.situation_professionnelle === "retraite")) {
    score += 35
    addReason(reasons, "Votre profil indique une situation de retraité.", "Out profil i indik ou lé retraité.", isKreol)
  }

  if (isTrue(aide.besoin_demandeur_emploi) && profile.situation_professionnelle === "demandeur_emploi") {
    score += 35
    addReason(reasons, "Votre profil indique que vous êtes demandeur d’emploi.", "Out profil i indik ou lé domandèr d'emploi.", isKreol)
  }

  if (isTrue(aide.besoin_allocataire_caf)) {
    if (isTrue(profile.allocataire_caf)) {
      score += 20
      addReason(reasons, "Vous êtes allocataire CAF.", "Ou lé allocatèr CAF.", isKreol)
    } else {
      missing.push(isKreol ? "Statut CAF à vérifier" : "Statut CAF à vérifier")
    }
  }

  if (Number.isFinite(revenus) && revenus > 0) {
    if (aideText.includes("ressource") || aideText.includes("revenu") || aideText.includes("modeste") || aideText.includes("social")) {
      score += 8
      addReason(reasons, "Cette aide peut dépendre des ressources du foyer.", "Sa zéd-la i pé depan revenu la kaz.", isKreol)
    }
  } else {
    missing.push(isKreol ? "Revenu à compléter" : "Revenus à compléter")
  }

  if (Number.isFinite(age) && age > 0) {
    if (aide.age_min || aide.age_max) {
      score += 10
      addReason(reasons, "Votre âge est compatible avec les critères renseignés.", "Out laz lé konpatib ek bann kritèr ransényé.", isKreol)
    }
  } else if (aide.age_min || aide.age_max) {
    missing.push(isKreol ? "Laz à compléter" : "Âge à compléter")
  }

  if (profile.commune && aide.commune) {
    score += 25
    addReason(reasons, "Cette aide correspond à votre commune.", "Sa zéd-la i korespond out komin.", isKreol)
  } else if (aideText.includes("ccas") || aideText.includes("commune")) {
    score += 10
    addReason(reasons, "Cette aide peut dépendre de votre commune ou du CCAS.", "Sa zéd-la i pé depan out komin ou CCAS.", isKreol)
  }

  if (profile.situation_familiale === "parent_isole" && (aideText.includes("parent") || aideText.includes("famille") || aideText.includes("enfant"))) {
    score += 20
    addReason(reasons, "Votre situation de parent isolé peut renforcer votre éligibilité.", "Out sitiasyon parent tousèl i pé ogmant out drwa.", isKreol)
  }

  if (profile.situation_professionnelle === "salarie" && aideText.includes("activite")) {
    score += 18
    addReason(reasons, "Votre activité professionnelle peut être prise en compte.", "Out travay i pé rant dann kondisyon sa zéd-la.", isKreol)
  }

  score = Math.max(0, Math.min(100, score))

  if (reasons.length === 0) {
    score = Math.min(score, 45)
    addReason(reasons, "Cette aide peut être intéressante, mais elle nécessite une vérification.", "Sa zéd-la i pé intérésan, mé fo vérifi.", isKreol)
  }

  return {
    ...aide,
    score,
    excluded: false,
    level: getLevel(score, isKreol),
    reasons,
    missing,
    intentMatch: intentMeta.match,
    intentPriority,
    mainIntent,
  }
}

function getRecommendedAides(aides = [], profile = {}, isKreol = false, question = "") {
  const mainIntent = getMainIntent(question)
  const focusedQuestion = hasFocusedQuestion(question)

  const scored = aides
    .map(aide => scoreAide(aide, profile, isKreol, question))
    .filter(aide => !aide.excluded)
    .sort((a, b) => {
      const priorityDiff = (b.intentPriority || 0) - (a.intentPriority || 0)
      if (priorityDiff !== 0) return priorityDiff
      return b.score - a.score
    })

  if (focusedQuestion) {
    const focusedAides = scored
      .filter(aide => aide.intentMatch && aide.score >= 25)
      .sort((a, b) => {
        const priorityDiff = (b.intentPriority || 0) - (a.intentPriority || 0)
        if (priorityDiff !== 0) return priorityDiff
        return b.score - a.score
      })

    if (focusedAides.length > 0) return focusedAides.slice(0, 7)

    // Pour les demandes comme crédit, dette ou permis, mieux vaut ne rien afficher
    // plutôt que de remonter APL/ARS/CMG qui ne répondent pas à la question.
    if (["credit", "dette", "transport", "creation_entreprise"].includes(mainIntent)) {
      return []
    }
  }

  return scored
    .filter(aide => aide.score >= 35)
    .slice(0, 7)
}

function getExcludedAides(aides = [], profile = {}, isKreol = false) {
  return aides
    .map(aide => scoreAide(aide, profile, isKreol, ""))
    .filter(aide => aide.excluded)
    .slice(0, 5)
}

function getPotentialLevel(recommendedAides = []) {
  const strongCount = recommendedAides.filter(aide => aide.score >= 80).length
  const amountTotal = recommendedAides.reduce((sum, aide) => sum + getAideAmountNumber(aide), 0)
  if (strongCount >= 3 || amountTotal >= 500) return "high"
  if (strongCount >= 1 || amountTotal >= 150) return "medium"
  return "low"
}

function buildDashboardStats(recommendedAides = [], trackedDemarches = {}) {
  const trackedItems = Object.values(trackedDemarches)
  return {
    total: recommendedAides.length,
    tracked: trackedItems.length,
    inProgress: trackedItems.filter(item => ["dossier", "envoye", "attente"].includes(item.status)).length,
    accepted: trackedItems.filter(item => item.status === "accepte").length,
    potentialLevel: getPotentialLevel(recommendedAides),
  }
}

function getSmartAlerts(recommendedAides = [], trackedDemarches = {}, isKreol = false) {
  const alerts = []

  const newStrongAides = recommendedAides.filter(aide => {
    const key = getAideKey(aide)
    return aide.score >= 80 && !trackedDemarches[key]
  })

  if (newStrongAides.length > 0) {
    alerts.push({
      title: isKreol ? "Nouvo zéd à vérifier" : "Nouvelle aide à vérifier",
      text: isKreol
        ? `${getAideName(newStrongAides[0], true)} i semble bien korespond ek out profil. Azout ali dann out démarches pou pa oubli.`
        : `${getAideName(newStrongAides[0], false)} semble bien correspondre à votre profil. Ajoutez-la à vos démarches pour ne pas l’oublier.`,
      color: COLORS.green,
    })
  }

  if (Object.keys(trackedDemarches || {}).length === 0 && recommendedAides.length > 0) {
    alerts.push({
      title: isKreol ? "Commence par 1 démarche" : "Commencez par 1 démarche",
      text: isKreol
        ? "Choisi la zéd pli probab é azout ali dann out démarches. Sa va aide aou suivre out demande."
        : "Choisissez l’aide la plus probable et ajoutez-la à vos démarches. Cela vous permettra de suivre votre demande.",
      color: COLORS.cyan,
    })
  }

  return alerts.slice(0, 2)
}

function getProfileSignals(profile = {}, isKreol = false) {
  const signals = []
  const children = Number(profile.nombre_enfants || 0)

  if (profile.commune) signals.push(isKreol ? `komin ${profile.commune}` : `commune de ${profile.commune}`)
  if (children > 0) signals.push(isKreol ? `${children} marmay` : `${children} enfant(s)`)
  if (profile.situation_familiale === "parent_isole") signals.push(isKreol ? "parent tousèl" : "parent isolé")
  if (profile.logement === "locataire") signals.push(isKreol ? "lokatèr" : "locataire")
  if (profile.logement === "proprietaire") signals.push(isKreol ? "propriyétèr" : "propriétaire")
  if (profile.situation_professionnelle === "demandeur_emploi") signals.push(isKreol ? "domandèr d'emploi" : "demandeur d’emploi")
  if (profile.situation_professionnelle === "etudiant" || isTrue(profile.etudiant)) signals.push(isKreol ? "étidyan" : "étudiant")
  if (isTrue(profile.handicap)) signals.push(isKreol ? "sitiasyon handicap" : "situation de handicap")
  if (isTrue(profile.allocataire_caf)) signals.push(isKreol ? "allocatèr CAF" : "allocataire CAF")
  if (profile.revenus_foyer) signals.push(isKreol ? `revenu déclaré : ${profile.revenus_foyer} €/mwa` : `revenus déclarés : ${profile.revenus_foyer} €/mois`)

  return signals
}

function getIntentAdvice(mainIntent, profile = {}, isKreol = false) {
  const commune = profile.commune
  const hasChildren = Number(profile.nombre_enfants || 0) > 0
  const isParentIsole = profile.situation_familiale === "parent_isole"

  const commonFr = [
    "Vérifiez toujours les conditions exactes sur le site officiel.",
    commune ? `Contactez aussi la mairie ou le CCAS de ${commune}, car certaines aides sont communales.` : "Complétez votre commune dans le profil pour mieux cibler les aides CCAS.",
    "Gardez vos justificatifs à portée de main : identité, domicile, revenus, RIB et situation familiale.",
  ]

  const commonKr = [
    "Vérifie toultan bann kondisyon su site officiel.",
    commune ? `Pran kontak osi ek mairie ou CCAS ${commune}, akoz na bann zéd i dépend la komin.` : "Complète out komin dann profil pou mieux trouvé bann zéd CCAS.",
    "Prépare bann papye : pièce identité, justificatif domicile, revenus, RIB, livret famille si ou na marmay.",
  ]

  const map = {
    credit: {
      fr: [
        "Je ne peux pas confirmer qu’une banque acceptera un crédit classique : cela dépend des revenus réguliers, des charges, des crédits en cours et de la situation bancaire.",
        "Pour une dépense utile ou indispensable, vérifiez surtout le microcrédit social : il est accompagné par un organisme social et peut parfois financer permis, véhicule, formation, équipement ou urgence.",
        commune ? `Priorité : prenez contact avec le CCAS ou la mairie de ${commune}, puis demandez une orientation vers un microcrédit social ou un Point Conseil Budget.` : "Priorité : renseignez votre commune puis contactez votre CCAS ou mairie pour une orientation microcrédit social.",
        "Questions à préciser : montant souhaité, projet exact, revenus actuels, crédits déjà en cours et éventuels retards de paiement.",
      ],
      kr: [
        "Mi pé pa confirmé si banque va accepté crédit classique : sa dépend revenus réguliers, charges, crédits en cours ek situation bancaire.",
        "Pou in dépense utile ou indispensable, vérifie surtout microcrédit social : lé accompagné par organisme social é i pé financer permis, voiture, formation, équipement ou urgence.",
        commune ? `Priorité : contacte CCAS ou mairie ${commune}, puis demande orientation vers microcrédit social ou Point Conseil Budget.` : "Priorité : renseigne out komin puis contacte CCAS ou mairie pou orientation microcrédit social.",
        "Questions à préciser : montant ou veut, projet exact, revenus actuels, crédits déjà en cours ek retards paiement si na.",
      ],
    },
    dette: {
      fr: [
        "S’il y a des dettes, retards ou découverts, la priorité n’est pas de reprendre un crédit trop vite : il faut d’abord sécuriser le budget.",
        "Pistes prioritaires : Point Conseil Budget, assistante sociale, CCAS, Banque de France si la situation devient lourde ou répétée.",
        "Si vous avez plusieurs crédits ou retards, demandez un accompagnement avant de signer un nouveau prêt.",
        commune ? `Le CCAS de ${commune} peut vous orienter vers le bon interlocuteur.` : "Renseignez votre commune pour cibler le CCAS compétent.",
      ],
      kr: [
        "Si ou na dettes, retards ou découvert, priorité lé pa reprendre crédit trop vite : fo sécurise budget dabor.",
        "Pistes prioritaires : Point Conseil Budget, assistante sociale, CCAS, Banque de France si situation lé lourde ou répétée.",
        "Si ou na plusieurs crédits ou retards, demande accompagnement avan signe nouveau prêt.",
        commune ? `CCAS ${commune} i pé oriente aou vers bon interlocuteur.` : "Renseigne out komin pou cible CCAS compétent.",
      ],
    },
    creation_entreprise: {
      fr: [
        "Pour une création d’entreprise, regardez les aides à l’accompagnement avant de chercher seulement un financement.",
        "Pistes : ADIE, Initiative Réunion, BPI/France Travail selon profil, Région Réunion, Chambre de Métiers ou CCI selon l’activité.",
        "Le microcrédit professionnel peut être plus adapté qu’un crédit bancaire classique au démarrage.",
        "Préparez : activité prévue, budget de départ, devis, statut envisagé et besoin exact de financement.",
      ],
      kr: [
        "Pou création entreprise, regarde accompagnement avan cherche seulement financement.",
        "Pistes : ADIE, Initiative Réunion, BPI/France Travail selon profil, Région Réunion, Chambre de Métiers ou CCI selon activité.",
        "Microcrédit professionnel i pé être pli adapté qu’un crédit bancaire classique au démarrage.",
        "Prépare : activité prévue, budget départ, devis, statut envisagé ek besoin exact financement.",
      ],
    },
    separation: {
      fr: [
        "En cas de séparation, il faut vérifier rapidement les droits CAF, le logement, les aides pour parent isolé et l’accompagnement social.",
        "Pistes : CAF, ASF si pension alimentaire absente ou impayée, APL, CCAS, assistante sociale, médiation familiale si besoin.",
        "Mettez à jour votre situation familiale dès que possible auprès des organismes concernés.",
        commune ? `Le CCAS de ${commune} peut vous orienter localement.` : "Renseignez votre commune pour cibler l’aide locale.",
      ],
      kr: [
        "Si séparation, fo vérifié vite droits CAF, logement, aides parent tousèl ek accompagnement social.",
        "Pistes : CAF, ASF si pension alimentaire lé absente ou impayée, APL, CCAS, assistante sociale, médiation familiale si besoin.",
        "Mets à jour out sitiasyon famiyal vitman auprès organismes concernés.",
        commune ? `CCAS ${commune} i pé oriente aou localement.` : "Renseigne out komin pou cible aide locale.",
      ],
    },
    vacances: {
      fr: [
        hasChildren ? "Regardez d’abord les aides CAF liées aux vacances/enfants, puis les dispositifs loisirs, sport et culture." : "Regardez les aides loisirs, vacances, sport et culture selon votre situation.",
        "Pistes utiles : CAF/VACAF si disponible, mairie, CCAS, associations locales, Pass Sport ou Pass Culture selon l’âge.",
        isParentIsole ? "Votre situation de parent isolé peut renforcer certaines demandes sociales." : "",
      ],
      kr: [
        hasChildren ? "Regarde dabor bann zéd CAF pou vakans/marmay, apré loisirs, sport ek culture." : "Regarde bann zéd loisirs, vakans, sport ek culture selon out sitiasyon.",
        "Pistes utiles : CAF/VACAF si disponible, mairie, CCAS, associations, Pass Sport ou Pass Culture selon laz.",
        isParentIsole ? "Out sitiasyon parent tousèl i pé renforcé certaines demandes sociales." : "",
      ],
    },
    cantine: {
      fr: [
        "La cantine dépend souvent de la mairie : quotient familial, revenus et composition du foyer.",
        commune ? `Priorité : contactez le service scolaire/mairie de ${commune}, puis le CCAS si la facture est difficile à payer.` : "Priorité : renseignez votre commune, puis contactez le service scolaire de la mairie.",
        "Demandez aussi s’il existe une aide alimentaire ou un secours ponctuel.",
      ],
      kr: [
        "Cantine i dépend souvent mairie : quotient familial, revenus ek composition la kaz.",
        commune ? `Priorité : contacte service scolaire/mairie ${commune}, apré CCAS si facture lé difficile.` : "Priorité : renseigne out komin, apré contacte service scolaire la mairie.",
        "Demande osi si na aide alimentaire ou secours ponctuel.",
      ],
    },
    logement: {
      fr: [
        "Priorité : APL/CAF si vous êtes locataire, puis FSL, CCAS et parfois Action Logement.",
        "Si vous avez un retard de loyer, n’attendez pas : contactez rapidement CAF, bailleur, assistante sociale ou CCAS.",
        "Documents fréquents : bail, quittance, avis d’imposition, revenus, RIB, justificatif de domicile.",
      ],
      kr: [
        "Priorité : APL/CAF si ou lé lokatèr, apré FSL, CCAS, parfois Action Logement.",
        "Si ou na retard loyé, atend pa : contacte CAF, bailleur, assistante sociale ou CCAS vitman.",
        "Papye souvent demandé : bail, quittance, avis impôt, revenus, RIB, justificatif domicile.",
      ],
    },
    facture: {
      fr: [
        "Pour une facture, les pistes principales sont : chèque énergie, fournisseur, CCAS, CAF ou assistante sociale.",
        "En cas d’urgence, contactez le fournisseur avant coupure et demandez un échéancier.",
        "Un microcrédit social peut parfois aider pour une dépense indispensable, mais il faut se renseigner auprès d’un CCAS, d’une association partenaire ou d’un point conseil budget.",
      ],
      kr: [
        "Pou in facture, regarde : chèque énergie, fournisseur, CCAS, CAF ou assistante sociale.",
        "Si lé urgent, contacte fournisseur avan coupure é demande in échéancier.",
        "Microcrédit social i pé parfois aide pou dépense indispensable, mé fo renseigné auprès CCAS, association partenaire ou point conseil budget.",
      ],
    },
    transport: {
      fr: [
        "Regardez les aides mobilité : Région, Département, France Travail, commune ou dispositifs jeunes selon votre profil.",
        "Pour le permis ou un véhicule nécessaire au travail, renseignez-vous auprès de France Travail, mission locale, CCAS, microcrédit social ou associations d’insertion.",
        "Si vous avez un entretien, une formation ou une reprise d’emploi, notez-le : cela peut appuyer la demande.",
      ],
      kr: [
        "Regarde bann zéd mobilité : Région, Département, France Travail, komin, dispositifs jeunes selon out profil.",
        "Pou permis ou véhicule nécessaire pou travay, renseigne auprès France Travail, mission locale, CCAS, microcrédit social ou associations insertion.",
        "Si ou na entretien, formation ou reprise travail, note ali : sa i pé appuyer demande.",
      ],
    },
    emploi: {
      fr: [
        "Pistes prioritaires : France Travail, Mission Locale si jeune, Région Réunion pour formation/mobilité, aides à la reprise d’emploi.",
        "Demandez aussi les aides transport, garde d’enfant ou équipement si elles bloquent votre retour à l’emploi.",
        "Préparez une explication simple : votre objectif, le coût à financer, et en quoi cela facilite le retour au travail.",
      ],
      kr: [
        "Pistes prioritaires : France Travail, Mission Locale si jeune, Région Réunion pou formation/mobilité, aides reprise emploi.",
        "Demande osi aides transport, garde marmay ou équipement si sa i bloque out retour travail.",
        "Prépare in explication simple : out objectif, le coût, é comment sa i aide aou retrouv travail.",
      ],
    },
    etudiant: {
      fr: [
        "Pistes : CROUS, bourses, aides logement, aides transport, mutuelle/CSS, aides numériques ou communales.",
        "Si la difficulté est urgente, contactez le service social étudiant.",
        "Préparez certificat de scolarité, revenus, avis d’imposition et RIB.",
      ],
      kr: [
        "Pistes : CROUS, bourses, logement, transport, mutuelle/CSS, aides numérique ou communales.",
        "Si lé urgent, contacte service social étudiant.",
        "Prépare certificat scolarité, revenus, avis impôt ek RIB.",
      ],
    },
    handicap: {
      fr: [
        "Pistes : MDPH, AAH, PCH, aides transport, logement adapté, complémentaire santé.",
        "Le dossier peut être long : gardez une trace des dates, courriers et pièces envoyées.",
        "Demandez de l’aide à une assistante sociale si le dossier est complexe.",
      ],
      kr: [
        "Pistes : MDPH, AAH, PCH, transport, logement adapté, complémentaire santé.",
        "Dossier i pé pran tan : garde trace dates, courriers ek papye envoyés.",
        "Demande aide assistante sociale si dossier lé compliqué.",
      ],
    },
    senior: {
      fr: [
        "Pistes : APA, caisse de retraite, CCAS, aides maintien à domicile, mutuelle/CSS, adaptation du logement.",
        "Contactez le CCAS ou le Département pour être orienté.",
        "Notez les besoins concrets : aide à domicile, transport, repas, logement, santé.",
      ],
      kr: [
        "Pistes : APA, caisse retraite, CCAS, maintien domicile, mutuelle/CSS, adaptation logement.",
        "Contacte CCAS ou Département pou être orienté.",
        "Note besoins concrets : aide domicile, transport, repas, logement, santé.",
      ],
    },
    sante: {
      fr: [
        "Pistes : Complémentaire santé solidaire, CPAM/Ameli, mutuelle, CCAS, associations selon la situation.",
        "Si vous renoncez à des soins faute d’argent, contactez une assistante sociale rapidement.",
        "Préparez attestation de droits, revenus, avis d’imposition et justificatifs médicaux si nécessaires.",
      ],
      kr: [
        "Pistes : Complémentaire santé solidaire, CPAM/Ameli, mutuelle, CCAS, associations selon sitiasyon.",
        "Si ou renonce soins akoz larzan, contacte assistante sociale vitman.",
        "Prépare attestation droits, revenus, avis impôt ek justificatifs médicaux si besoin.",
      ],
    },
    general: {
      fr: [
        "Commencez par vérifier les aides les plus probables affichées ci-dessous.",
        "Si vous êtes bloqué financièrement, pensez aussi au CCAS, à une assistante sociale, au microcrédit social ou à un point conseil budget.",
        "Ajoutez les aides intéressantes dans vos démarches pour suivre les dates, documents et relances.",
      ],
      kr: [
        "Commence par vérifié bann zéd pli probab affichées anba.",
        "Si ou lé bloqué financièrement, pense osi CCAS, assistante sociale, microcrédit social ou point conseil budget.",
        "Azout bann zéd intéressantes dann démarches pou suivre dates, papye ek relances.",
      ],
    },
  }

  const selected = map[mainIntent] || map.general
  const specific = (isKreol ? selected.kr : selected.fr).filter(Boolean)
  return [...specific, ...(isKreol ? commonKr : commonFr)]
}

function buildNextActions(recommendedAides = [], profile = {}, isKreol = false) {
  const top = recommendedAides.slice(0, 3)
  if (top.length === 0) {
    return isKreol
      ? [
          "Complète out profil : komin, revenus, logement, situation famiyal.",
          "Pose une question précise : facture, logement, cantine, transport, santé...",
          "Vérifie auprès CCAS ou mairie si ou na urgence sociale.",
        ]
      : [
          "Complétez votre profil : commune, revenus, logement, situation familiale.",
          "Posez une question précise : facture, logement, cantine, transport, santé...",
          "Vérifiez auprès du CCAS ou de la mairie si vous avez une urgence sociale.",
        ]
  }

  const actions = top.map((aide, index) => {
    const name = getAideName(aide, isKreol)
    const amount = formatAideAmount(aide, isKreol)
    const level = getLevel(aide.score, isKreol)

    return isKreol
      ? `${index + 1}. ${level.emoji} ${name} — ${level.label} (${amount}). Vérifie kondisyon, prépare papye, puis azout dann démarches si sa lé pertinent.`
      : `${index + 1}. ${level.emoji} ${name} — ${level.label} (${amount}). Vérifiez les conditions, préparez les documents, puis ajoutez-la à vos démarches si c’est pertinent.`
  })

  return actions
}

function buildSmartAnswer(responseData, isKreol = false, recommendedAides = []) {
  if (!responseData?.profile) return ""

  const profile = responseData.profile
  const question = responseData.question || ""
  const mainIntent = getMainIntent(question)
  const signals = getProfileSignals(profile, isKreol)
  const topAides = recommendedAides.slice(0, 3)
  const advice = getIntentAdvice(mainIntent, profile, isKreol).slice(0, 5)
  const nextActions = buildNextActions(recommendedAides, profile, isKreol)

  if (!question.trim()) {
    return isKreol
      ? [
          "Bonzour 👋 Mi analiz out profil pou rode bann zéd ki pé korespond ek out sitiasyon.",
          "",
          signals.length > 0 ? `📌 Mi pran en compte : ${signals.join(", ")}.` : "📌 Out profil lé encore incomplet : plus ou complète, plus l’analyse lé précise.",
          "",
          "🎯 Mi classe bann zéd par priorité, mi montre poukossa zot lé pertinentes, é ou pé azouté zot dann out démarches pou suivre dossier, documents, dates limites ek relances.",
          "",
          "👉 Pose une question précise, par exemple : “Mi na une facture EDF difficile”, “Mi cherche aide cantine”, “Mi veux aide vacances marmay”, ou clique sur Scanner mon profil.",
        ].join("\n")
      : [
          "Bonjour 👋 J’analyse votre profil pour repérer les aides qui peuvent correspondre à votre situation.",
          "",
          signals.length > 0 ? `📌 Je prends en compte : ${signals.join(", ")}.` : "📌 Votre profil est encore incomplet : plus il est complet, plus l’analyse sera précise.",
          "",
          "🎯 Je classe les aides par priorité, j’explique pourquoi elles peuvent vous concerner, puis vous pouvez les ajouter à vos démarches pour suivre le dossier, les documents, les dates limites et les relances.",
          "",
          "👉 Posez une question précise, par exemple : “J’ai une facture EDF difficile”, “Je cherche une aide cantine”, “Je veux une aide vacances enfants”, ou cliquez sur Scanner mon profil.",
        ].join("\n")
  }

  const intro = isKreol
    ? [
        "Bonzour 👋 Mi konpran out demande.",
        signals.length > 0 ? `📌 Mi tien compte de : ${signals.join(", ")}.` : "📌 Mi mank encore quelques infos dann out profil, mé mi peux déjà orient aou.",
      ]
    : [
        "Bonjour 👋 Je comprends votre demande.",
        signals.length > 0 ? `📌 Je tiens compte de : ${signals.join(", ")}.` : "📌 Il manque encore quelques informations dans votre profil, mais je peux déjà vous orienter.",
      ]

  const topSection =
    topAides.length > 0
      ? [
          "",
          isKreol ? "🎯 Pistes les plus pertinentes à vérifier :" : "🎯 Pistes les plus pertinentes à vérifier :",
          ...topAides.map((aide, index) => {
            const level = getLevel(aide.score, isKreol)
            const amount = formatAideAmount(aide, isKreol)
            const reasons = (aide.reasons || []).slice(0, 2).join(" ")
            return isKreol
              ? `${index + 1}. ${level.emoji} ${getAideName(aide, true)} — ${level.label}, ${amount}. ${reasons}`
              : `${index + 1}. ${level.emoji} ${getAideName(aide, false)} — ${level.label}, ${amount}. ${reasons}`
          }),
        ]
      : [
          "",
          isKreol ? "🎯 Mi trouve pas encore une aide très ciblée, mé voici les pistes à vérifier." : "🎯 Je ne vois pas encore d’aide très ciblée, mais voici les pistes à vérifier.",
        ]

  const adviceSection = [
    "",
    isKreol ? "💡 Conseils concrets :" : "💡 Conseils concrets :",
    ...advice.map(item => `• ${item}`),
  ]

  const actionsSection = [
    "",
    isKreol ? "✅ Prochaines actions recommandées :" : "✅ Prochaines actions recommandées :",
    ...nextActions.slice(0, 4).map(item => `• ${item}`),
  ]

  const closing = [
    "",
    isKreol
      ? "⚠️ Mi lé là pou orient aou, mé décision finale dépend toujours organisme officiel. Si urgence financière, contacte vite CCAS, CAF, assistante sociale ou mairie."
      : "⚠️ Je vous oriente, mais la décision finale dépend toujours de l’organisme officiel. En cas d’urgence financière, contactez rapidement le CCAS, la CAF, une assistante sociale ou la mairie.",
  ]

  return [...intro, ...topSection, ...adviceSection, ...actionsSection, ...closing].join("\n")
}

export default function AssistantAides({ isPremium, isMobile, t, user }) {
  const [question, setQuestion] = useState("")
  const [responseData, setResponseData] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [trackedDemarches, setTrackedDemarches] = useState({})
  const [savingDemarcheKey, setSavingDemarcheKey] = useState(null)
  const [aideDocuments, setAideDocuments] = useState([])
  const [documentChecks, setDocumentChecks] = useState({})
  const [savingDocumentKey, setSavingDocumentKey] = useState(null)
  const [gainInputs, setGainInputs] = useState({})
  const [refusInputs, setRefusInputs] = useState({})

  const txt = (key, fallback) => safeT(t, "aides", key, fallback)
  const isKreol = isKreolLanguage(t)

  const recommendedAides = useMemo(() => {
    if (!responseData?.profile || !responseData?.aides) return []
    return getRecommendedAides(responseData.aides, responseData.profile, isKreol, responseData.question || "")
  }, [responseData, isKreol])

  const visibleRecommendedAides = useMemo(() => {
    return recommendedAides.filter(aide => {
      const aideKey = getAideKey(aide)
      return !trackedDemarches[aideKey]
    })
  }, [recommendedAides, trackedDemarches])

  const excludedAides = useMemo(() => {
    if (!responseData?.profile || !responseData?.aides) return []
    return getExcludedAides(responseData.aides, responseData.profile, isKreol)
  }, [responseData, isKreol])

  const dashboardStats = useMemo(() => {
    return buildDashboardStats(recommendedAides, trackedDemarches)
  }, [recommendedAides, trackedDemarches])

  const gainsTotal = useMemo(() => {
    return Object.values(trackedDemarches).reduce((sum, item) => {
      const value = Number(item.montant_obtenu || 0)
      return Number.isFinite(value) ? sum + value : sum
    }, 0)
  }, [trackedDemarches])

  const smartAlerts = useMemo(() => {
    return getSmartAlerts(recommendedAides, trackedDemarches, isKreol)
  }, [recommendedAides, trackedDemarches, isKreol])

  const trackedList = useMemo(() => {
    return Object.values(trackedDemarches).sort((a, b) => {
      return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
    })
  }, [trackedDemarches])

  async function fetchTrackedDemarches() {
    if (!user?.id) return

    const { data, error } = await supabase
      .from("aide_demarches")
      .select("*")
      .eq("user_id", user.id)

    if (error) {
      console.error("Erreur chargement démarches aides:", error)
      return
    }

    const next = {}
    ;(data || []).forEach(item => {
      next[item.aide_id] = item
    })

    setTrackedDemarches(next)
  }

  async function fetchAideDocuments() {
    const { data, error } = await supabase
      .from("aide_documents")
      .select("*")
      .order("obligatoire", { ascending: false })

    if (error) {
      console.error("Erreur chargement documents aides:", error)
      return
    }

    setAideDocuments(data || [])
  }

  async function fetchDocumentChecks() {
    if (!user?.id) return

    const { data, error } = await supabase
      .from("aide_documents_utilisateur")
      .select("*")
      .eq("user_id", user.id)

    if (error) {
      console.error("Erreur chargement checklist documents:", error)
      return
    }

    const next = {}
    ;(data || []).forEach(item => {
      next[`${item.demarche_id}||${normalizeText(item.document_nom)}`] = item
    })

    setDocumentChecks(next)
  }

  useEffect(() => {
    fetchTrackedDemarches()
    fetchDocumentChecks()
  }, [user?.id])

  useEffect(() => {
    fetchAideDocuments()
  }, [])

  async function addToDemarches(aide) {
    if (!user?.id) {
      alert(isKreol ? "Ou dois être connecté." : "Vous devez être connecté.")
      return
    }

    const aideKey = getAideKey(aide)
    setSavingDemarcheKey(aideKey)

    const payload = {
      user_id: user.id,
      aide_id: aideKey,
      aide_nom: getAideName(aide, false),
      status: "a_verifier",
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from("aide_demarches")
      .upsert(payload, { onConflict: "user_id,aide_id" })
      .select()
      .single()

    setSavingDemarcheKey(null)

    if (error) {
      console.error("Erreur ajout démarche:", error)
      alert(isKreol ? "Erreur pendant l'ajout démarche." : "Erreur pendant l’ajout à vos démarches.")
      return
    }

    setTrackedDemarches(prev => ({ ...prev, [aideKey]: data }))
  }

  async function updateAideStatus(aide, statusKey) {
    if (!user?.id) return

    const aideKey = getAideKey(aide)
    const current = trackedDemarches[aideKey] || aide

    setSavingDemarcheKey(aideKey)

    setTrackedDemarches(prev => ({
      ...prev,
      [aideKey]: {
        ...(prev[aideKey] || {}),
        user_id: user.id,
        aide_id: aideKey,
        aide_nom: current.aide_nom || getAideName(aide, false),
        status: statusKey,
        updated_at: new Date().toISOString(),
      },
    }))

    let result

    if (current?.id) {
      result = await supabase
        .from("aide_demarches")
        .update({ status: statusKey, updated_at: new Date().toISOString() })
        .eq("id", current.id)
        .eq("user_id", user.id)
        .select()
        .single()
    } else {
      result = await supabase
        .from("aide_demarches")
        .upsert(
          {
            user_id: user.id,
            aide_id: aideKey,
            aide_nom: getAideName(aide, false),
            status: statusKey,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,aide_id" }
        )
        .select()
        .single()
    }

    setSavingDemarcheKey(null)

    if (result.error) {
      console.error("Erreur mise à jour statut:", result.error)
      alert(isKreol ? "Erreur sauvegarde statut." : "Erreur lors de la sauvegarde du statut.")
      await fetchTrackedDemarches()
      return
    }

    setTrackedDemarches(prev => ({ ...prev, [aideKey]: result.data }))
  }

  async function deleteDemarche(item) {
    if (!user?.id) return

    const confirmDelete = window.confirm(
      isKreol
        ? "Ou veu vraiment supprim sa démarche-la ?"
        : "Voulez-vous vraiment supprimer cette démarche ?"
    )

    if (!confirmDelete) return

    try {
      const aideKey = item.aide_id || getAideKey(item)

      if (item.id) {
        const { error: documentsError } = await supabase
          .from("aide_documents_utilisateur")
          .delete()
          .eq("user_id", user.id)
          .eq("demarche_id", item.id)

        if (documentsError) throw documentsError
      }

      // Suppression robuste : on supprime par ID quand il existe,
      // sinon par user_id + aide_id. Cela évite les lignes restantes
      // quand certaines anciennes démarches ont été créées différemment.
      let query = supabase
        .from("aide_demarches")
        .delete()
        .eq("user_id", user.id)

      if (item.id) {
        query = query.eq("id", item.id)
      } else if (aideKey) {
        query = query.eq("aide_id", aideKey)
      }

      const { error } = await query
      if (error) throw error

      setTrackedDemarches(prev => {
        const next = { ...prev }

        Object.keys(next).forEach(key => {
          if (
            key === aideKey ||
            next[key]?.id === item.id ||
            next[key]?.aide_id === aideKey
          ) {
            delete next[key]
          }
        })

        return next
      })

      await fetchTrackedDemarches()
      await fetchDocumentChecks()
    } catch (err) {
      console.error("Erreur suppression démarche:", err)
      alert(isKreol ? "Erreur suppression démarche." : "Erreur lors de la suppression.")
    }
  }

  function getCheckKey(demarcheId, documentName) {
    return `${demarcheId}||${normalizeText(documentName)}`
  }

  function getProgressForDemarche(item) {
    const documents = getDocumentsForAide(item.aide_nom, aideDocuments)
    if (documents.length === 0) return { total: 0, checked: 0, percent: 0, documents }

    const checked = documents.filter(document => {
      const key = getCheckKey(item.id, document.document_nom)
      return documentChecks[key]?.checked
    }).length

    return {
      total: documents.length,
      checked,
      percent: Math.round((checked / documents.length) * 100),
      documents,
    }
  }

  async function toggleDocumentCheck(item, document, checked) {
    if (!user?.id || !item?.id) {
      alert(isKreol ? "Démarche introuvable." : "Démarche introuvable.")
      return
    }

    const key = getCheckKey(item.id, document.document_nom)
    const now = new Date().toISOString()

    // Mise à jour immédiate à l'écran.
    setDocumentChecks(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        user_id: user.id,
        demarche_id: item.id,
        document_nom: document.document_nom,
        checked,
        checked_at: checked ? now : null,
      },
    }))

    setSavingDocumentKey(key)

    const existing = documentChecks[key]
    let result

    if (existing?.id) {
      result = await supabase
        .from("aide_documents_utilisateur")
        .update({ checked, checked_at: checked ? now : null })
        .eq("id", existing.id)
        .eq("user_id", user.id)
        .select()
        .single()
    } else {
      result = await supabase
        .from("aide_documents_utilisateur")
        .insert({
          user_id: user.id,
          demarche_id: item.id,
          document_nom: document.document_nom,
          checked,
          checked_at: checked ? now : null,
        })
        .select()
        .single()
    }

    setSavingDocumentKey(null)

    if (result.error) {
      // Si la ligne existe déjà mais n'était pas dans l'état local, on récupère tout et on retente en update plus tard.
      console.error("Erreur checklist document:", result.error)
      alert(isKreol ? "Erreur sauvegarde document." : "Erreur lors de la sauvegarde du document.")
      await fetchDocumentChecks()
      return
    }

    setDocumentChecks(prev => ({
      ...prev,
      [key]: result.data,
    }))
  }

  async function markDemarcheAsSent(item) {
    if (!user?.id || !item?.id) return

    const sentAt = new Date()
    const estimatedAt = addDays(sentAt, 21)

    const { data, error } = await supabase
      .from("aide_demarches")
      .update({
        status: "envoye",
        demande_envoyee_at: sentAt.toISOString(),
        reponse_estimee_at: estimatedAt.toISOString(),
        updated_at: sentAt.toISOString(),
      })
      .eq("id", item.id)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error) {
      console.error("Erreur marquage envoyé:", error)
      alert(isKreol ? "Erreur sauvegarde envoi." : "Erreur lors du marquage comme envoyé.")
      return
    }

    setTrackedDemarches(prev => ({
      ...prev,
      [data.aide_id]: data,
    }))
  }

  async function saveGain(item) {
    if (!user?.id || !item?.id) return

    const value = Number(gainInputs[item.id] ?? item.montant_obtenu ?? 0)

    if (!Number.isFinite(value) || value < 0) {
      alert(isKreol ? "Montan invalide." : "Montant invalide.")
      return
    }

    const { data, error } = await supabase
      .from("aide_demarches")
      .update({
        montant_obtenu: value,
        status: "accepte",
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error) {
      console.error("Erreur sauvegarde gain:", error)
      alert(isKreol ? "Erreur sauvegarde gain." : "Erreur lors de la sauvegarde du gain.")
      return
    }

    setTrackedDemarches(prev => ({
      ...prev,
      [data.aide_id]: data,
    }))
  }

  async function saveRefusReason(item) {
    if (!user?.id || !item?.id) return

    const reason = refusInputs[item.id] ?? item.refus_motif ?? ""

    const { data, error } = await supabase
      .from("aide_demarches")
      .update({
        refus_motif: reason,
        status: "refuse",
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error) {
      console.error("Erreur sauvegarde motif refus:", error)
      alert(isKreol ? "Erreur sauvegarde refus." : "Erreur lors de la sauvegarde du refus.")
      return
    }

    setTrackedDemarches(prev => ({
      ...prev,
      [data.aide_id]: data,
    }))
  }

  async function fetchProfile() {
    if (!user?.id) return null

    setLoadingProfile(true)

    const { data, error } = await supabase
      .from("profiles")
      .select("commune,situation_familiale,nombre_enfants,logement,revenus_foyer,situation_professionnelle,age,etudiant,retraite,handicap,allocataire_caf,permis_conduire,vehicule_personnel")
      .eq("id", user.id)
      .maybeSingle()

    setLoadingProfile(false)

    if (error) {
      console.error("Erreur chargement profil assistant:", error)
      return null
    }

    setProfile(data)
    return data
  }

  async function fetchAides() {
    const { data, error } = await supabase.from("aides_reunion").select("*")
    if (error) {
      console.error("Erreur chargement aides:", error)
      return []
    }
    return data || []
  }

  async function handleScanProfile() {
    const currentProfile = profile || (await fetchProfile())
    if (!currentProfile) {
      setResponseData({ type: "error" })
      return
    }

    const aides = await fetchAides()
    setResponseData({ type: "scan", question: "", profile: currentProfile, aides })
  }

  async function handleAnalyze() {
    const currentProfile = profile || (await fetchProfile())
    if (!currentProfile) {
      setResponseData({ type: "error" })
      return
    }

    const aides = await fetchAides()
    setResponseData({ type: "question", question, profile: currentProfile, aides })
  }

  function openExternalLink(url) {
    if (!url) return
    window.open(url, "_blank", "noopener,noreferrer")
  }

  if (!isPremium) {
    return (
      <section style={{ background: `linear-gradient(135deg, rgba(252,211,77,.18), ${COLORS.card})`, border: `1px solid rgba(252,211,77,.35)`, borderRadius: 22, padding: isMobile ? 18 : 24 }}>
        <Lock size={26} color={COLORS.yellow} />
        <h3 style={{ color: COLORS.text, margin: "12px 0 8px" }}>
          {txt("assistantPremiumTitle", "⭐ Assistant Personnel Premium")}
        </h3>
        <p style={{ color: COLORS.muted, lineHeight: 1.6, margin: 0 }}>
          {txt("assistantPremiumDescription", "BudgetKazPei analyse votre situation parmi les aides disponibles à La Réunion.")}
        </p>
      </section>
    )
  }

  return (
    <section style={{ background: `linear-gradient(135deg, rgba(35,211,214,.16), ${COLORS.card})`, border: `1px solid rgba(35,211,214,.32)`, borderRadius: 22, padding: isMobile ? 18 : 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Star size={26} color={COLORS.cyan} />
        <h3 style={{ color: COLORS.text, margin: 0 }}>
          {isKreol ? "Mon konseye zéd Premium" : "Mon conseiller aides Premium"}
        </h3>
      </div>

      <p style={{ color: COLORS.muted, lineHeight: 1.6 }}>
        {isKreol
          ? "Poz out kestion. Mon konseye i analiz out profil, i répond aou, i klase bann zéd, é ou pé azouté bann zéd dann out démarches."
          : "Posez votre question. Votre conseiller analyse votre profil, vous répond, classe les aides et vous permet d’ajouter les aides à vos démarches."}
      </p>

      <div style={{ background: "rgba(255,255,255,.05)", border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.cyan, fontWeight: 900 }}>
          <MessageCircle size={17} />
          {isKreol ? "Diskité ek mon konseye" : "Discuter avec mon conseiller"}
        </div>

        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder={isKreol ? "Ex : Bonzour, mi na 2 marmay, est-ce que mi pé gagn zéd pou vakans ?" : "Ex : Bonjour, j’ai 2 enfants, est-ce que je peux avoir des aides pour les vacances ?"}
          style={{ width: "100%", minHeight: 105, background: COLORS.cardLight, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 14, color: COLORS.text, fontFamily: "inherit", resize: "vertical", outline: "none" }}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[
            isKreol ? "Zéd pou vakans marmay" : "Aides vacances enfants",
            isKreol ? "Zéd cantine" : "Aide cantine",
            isKreol ? "Zéd facture EDF" : "Aide facture EDF",
            isKreol ? "Zéd logement" : "Aide logement",
            isKreol ? "Microcrédit social" : "Microcrédit social",
            isKreol ? "Aide transport ou permis" : "Aide transport ou permis",
            isKreol ? "Que dois-je faire maintenant ?" : "Que dois-je faire maintenant ?",
          ].map(example => (
            <button key={example} type="button" onClick={() => setQuestion(example)} style={{ background: "rgba(35,211,214,.08)", border: "1px solid rgba(35,211,214,.25)", borderRadius: 999, padding: "7px 11px", color: COLORS.cyan, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 800 }}>
              {example}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button type="button" onClick={handleAnalyze} disabled={loadingProfile} style={{ background: loadingProfile ? COLORS.muted : COLORS.accent, color: "#fff", border: "none", borderRadius: 12, padding: "11px 16px", fontWeight: 900, cursor: loadingProfile ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
            <Send size={16} />
            {loadingProfile ? "Analyse en cours..." : isKreol ? "Diskité ek mon konseye" : "Discuter avec mon conseiller"}
          </button>

          <button type="button" onClick={handleScanProfile} disabled={loadingProfile} style={{ background: loadingProfile ? COLORS.muted : COLORS.cyan, color: "#0A1628", border: "none", borderRadius: 12, padding: "11px 16px", fontWeight: 900, cursor: loadingProfile ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
            <SearchCheck size={16} />
            {isKreol ? "Scanner mon profil" : "Scanner mon profil"}
          </button>
        </div>

        {responseData?.type === "error" && (
          <div style={{ background: "rgba(251,113,133,.10)", border: "1px solid rgba(251,113,133,.35)", borderRadius: 16, padding: 14, color: COLORS.text }}>
            {isKreol ? "Inposib sharj out profil pou linstan." : "Impossible de charger votre profil pour le moment."}
          </div>
        )}

        {responseData?.profile && (
          <div style={{ background: "rgba(35,211,214,.08)", border: "1px solid rgba(35,211,214,.22)", borderRadius: 16, padding: 16, color: COLORS.text, lineHeight: 1.6 }}>
            <div style={{ color: COLORS.cyan, fontWeight: 900, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <Sparkles size={16} />
              {isKreol ? "Répons mon konseye" : "Réponse de votre conseiller"}
            </div>

            {responseData.type === "question" && (
              <p style={{ margin: "0 0 12px", color: COLORS.muted }}>
                {isKreol ? "Out kestion :" : "Votre question :"} <strong style={{ color: COLORS.text }}>{responseData.question || "Aucune question précisée"}</strong>
              </p>
            )}

            <p style={{ margin: "0 0 12px", whiteSpace: "pre-line", lineHeight: 1.65 }}>
              {buildSmartAnswer(responseData, isKreol, recommendedAides)}
            </p>

            <details style={{ marginTop: 12, background: "rgba(255,255,255,.04)", border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 12 }}>
              <summary style={{ cursor: "pointer", color: COLORS.green, fontWeight: 900 }}>
                {isKreol ? "Voir profil analizé" : "Voir le profil analysé"}
              </summary>
              <div style={{ marginTop: 10, whiteSpace: "pre-line", color: COLORS.text }}>
                {buildProfileSummary(responseData.profile, isKreol)}
              </div>
            </details>
          </div>
        )}
      </div>

      {responseData?.profile && (
        <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
          {smartAlerts.length > 0 && (
            <div style={{ display: "grid", gap: 10 }}>
              {smartAlerts.map((alert, index) => (
                <div key={index} style={{ background: `${alert.color}18`, border: `1px solid ${alert.color}55`, borderRadius: 16, padding: 14, color: COLORS.text, lineHeight: 1.5 }}>
                  <div style={{ color: alert.color, fontWeight: 900, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                    <Bell size={16} />
                    {alert.title}
                  </div>
                  {alert.text}
                </div>
              ))}
            </div>
          )}

          <div style={{ background: "linear-gradient(135deg, rgba(34,197,94,.14), rgba(35,211,214,.08), rgba(255,255,255,.03))", border: "1px solid rgba(34,197,94,.25)", borderRadius: 18, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.green, fontWeight: 900, marginBottom: 12 }}>
              <TrendingUp size={18} />
              {isKreol ? "Tablo débor bann zéd" : "Tableau de bord des aides"}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
              {[
                { label: isKreol ? "Zéd trouvées" : "Aides trouvées", value: dashboardStats.total, color: COLORS.cyan },
                { label: "Démarches", value: dashboardStats.tracked, color: COLORS.green },
                { label: "En cours", value: dashboardStats.inProgress, color: COLORS.yellow },
                { label: isKreol ? "Akseptées" : "Acceptées", value: dashboardStats.accepted, color: COLORS.purple },
              ].map(item => (
                <div key={item.label} style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 12 }}>
                  <div style={{ color: item.color, fontWeight: 900, fontSize: 22 }}>{item.value}</div>
                  <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 800 }}>{item.label}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 12, color: COLORS.text, lineHeight: 1.55 }}>
              <Bell size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />
              {dashboardStats.potentialLevel === "high"
                ? "Potentiel d’aides : élevé. Plusieurs dispositifs méritent d’être vérifiés rapidement."
                : dashboardStats.potentialLevel === "medium"
                  ? "Potentiel d’aides : moyen. Commencez par les aides les plus probables."
                  : "Potentiel d’aides : à vérifier. Plus votre profil est complet, plus l’analyse sera précise."}
            </div>

            <div style={{ marginTop: 12, background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.22)", borderRadius: 14, padding: 12, color: COLORS.text, lineHeight: 1.55 }}>
              <DollarSign size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />
              {isKreol ? "Gains obtenus grâce à BudgetKazPei" : "Gains obtenus grâce à BudgetKazPei"} :{" "}
              <strong style={{ color: COLORS.green }}>{gainsTotal.toFixed(0)} €</strong>
            </div>
          </div>

          <div style={{ background: "rgba(255,255,255,.045)", border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.yellow, fontWeight: 900, marginBottom: 12 }}>
              <ClipboardCheck size={18} />
              {isKreol ? "Mes démarches" : "Mes démarches"}
            </div>

            {trackedList.length === 0 ? (
              <p style={{ color: COLORS.muted, margin: 0 }}>
                {isKreol
                  ? "Ou la pa ankor azouté démarche. Azout in zéd recommandée pou suivre ali isi."
                  : "Vous n’avez pas encore ajouté de démarche. Ajoutez une aide recommandée pour la suivre ici."}
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {trackedList.map(item => {
                  const status = getStatusByKey(item.status)

                  return (
                    <div key={item.id || item.aide_id} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <div>
                          <div style={{ color: COLORS.text, fontWeight: 900 }}>{item.aide_nom}</div>
                          <div style={{ color: status.color, fontWeight: 900, marginTop: 4 }}>
                            {status.emoji} {isKreol ? status.kreol : status.fr}
                          </div>
                        </div>

                        <button type="button" onClick={() => deleteDemarche(item)} style={{ background: "rgba(251,113,133,.12)", border: "1px solid rgba(251,113,133,.35)", color: COLORS.red, borderRadius: 10, padding: "8px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Trash2 size={14} />
                          {isKreol ? "Supprimé" : "Supprimer"}
                        </button>
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                        {STATUS_OPTIONS.map(option => (
                          <button key={option.key} type="button" onClick={() => updateAideStatus(item, option.key)} style={{ background: item.status === option.key ? `${option.color}33` : "rgba(255,255,255,.04)", border: item.status === option.key ? `1px solid ${option.color}` : "1px solid rgba(255,255,255,.10)", borderRadius: 999, padding: "7px 10px", color: item.status === option.key ? option.color : COLORS.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 900 }}>
                            {option.emoji} {isKreol ? option.kreol : option.fr}
                          </button>
                        ))}
                      </div>

                      {item.status === "dossier" && (() => {
                        const progress = getProgressForDemarche(item)
                        const dossierReady = progress.total > 0 && progress.checked === progress.total

                        return (
                          <div style={{ marginTop: 12, background: "rgba(252,211,77,.07)", border: "1px solid rgba(252,211,77,.22)", borderRadius: 14, padding: 12 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.yellow, fontWeight: 900, marginBottom: 8 }}>
                              <FileText size={16} />
                              {isKreol ? "Dokiman pou préparé" : "Documents à préparer"}
                            </div>

                            <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 10 }}>
                              {isKreol ? "Progression dosyé" : "Progression du dossier"} :{" "}
                              <strong style={{ color: dossierReady ? COLORS.green : COLORS.yellow }}>
                                {progress.checked} / {progress.total} ({progress.percent}%)
                              </strong>
                            </div>

                            <div style={{ display: "grid", gap: 8 }}>
                              {progress.documents.map(document => {
                                const checkKey = getCheckKey(item.id, document.document_nom)
                                const checked = !!documentChecks[checkKey]?.checked
                                const saving = savingDocumentKey === checkKey

                                return (
                                  <button
                                    key={document.document_nom}
                                    type="button"
                                    disabled={saving}
                                    onClick={() => toggleDocumentCheck(item, document, !checked)}
                                    style={{
                                      width: "100%",
                                      display: "flex",
                                      alignItems: "flex-start",
                                      gap: 10,
                                      textAlign: "left",
                                      background: checked ? "rgba(34,197,94,.10)" : "rgba(255,255,255,.04)",
                                      border: checked ? "1px solid rgba(34,197,94,.28)" : "1px solid rgba(255,255,255,.08)",
                                      borderRadius: 12,
                                      padding: 10,
                                      color: COLORS.text,
                                      cursor: saving ? "not-allowed" : "pointer",
                                      fontFamily: "inherit",
                                    }}
                                  >
                                    <span style={{ marginTop: 1, color: checked ? COLORS.green : COLORS.muted, fontWeight: 900 }}>
                                      {checked ? "☑" : "☐"}
                                    </span>
                                    <span>
                                      <span style={{ fontWeight: 850 }}>
                                        {getDocumentDisplayName(document, isKreol)}
                                      </span>
                                      {!document.obligatoire && (
                                        <span style={{ color: COLORS.muted, fontSize: 12 }}> — {isKreol ? "si demandé" : "si demandé"}</span>
                                      )}
                                    </span>
                                  </button>
                                )
                              })}
                            </div>

                            {dossierReady && (
                              <button type="button" onClick={() => markDemarcheAsSent(item)} style={{ marginTop: 12, background: COLORS.purple, color: "#0A1628", border: "none", borderRadius: 12, padding: "10px 13px", fontWeight: 900, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 8 }}>
                                <Send size={15} />
                                {isKreol ? "Dosyé prêt : mark kom envoyé" : "Dossier prêt : marquer comme envoyé"}
                              </button>
                            )}
                          </div>
                        )
                      })()}

                      {item.status === "envoye" && (
                        <div style={{ marginTop: 12, background: "rgba(167,139,250,.08)", border: "1px solid rgba(167,139,250,.25)", borderRadius: 14, padding: 12, color: COLORS.text }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.purple, fontWeight: 900, marginBottom: 8 }}>
                            <CalendarDays size={16} />
                            {isKreol ? "Demande envoyée" : "Demande envoyée"}
                          </div>
                          <div style={{ color: COLORS.muted, lineHeight: 1.6 }}>
                            {isKreol ? "Envoyé le" : "Envoyée le"} : <strong style={{ color: COLORS.text }}>{formatShortDate(item.demande_envoyee_at || item.updated_at, isKreol)}</strong><br />
                            {isKreol ? "Réponse estimée" : "Réponse estimée"} : <strong style={{ color: COLORS.text }}>{formatShortDate(item.reponse_estimee_at || addDays(new Date(item.updated_at || new Date()), 21), isKreol)}</strong>
                          </div>
                        </div>
                      )}

                      {item.status === "attente" && (
                        <div style={{ marginTop: 12, background: "rgba(249,115,22,.08)", border: "1px solid rgba(249,115,22,.25)", borderRadius: 14, padding: 12, color: COLORS.text, lineHeight: 1.55 }}>
                          ⏳ {isKreol ? "Pense à vérifié out espace CAF, mairie, CCAS ou email. Si zot demande in pièce complémentaire, prépar ali vite." : "Pensez à vérifier votre espace CAF, mairie, CCAS ou vos emails. Si une pièce complémentaire est demandée, préparez-la rapidement."}
                        </div>
                      )}

                      {item.status === "accepte" && (
                        <div style={{ marginTop: 12, background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.25)", borderRadius: 14, padding: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.green, fontWeight: 900, marginBottom: 8 }}>
                            <CheckCircle2 size={16} />
                            {isKreol ? "Zéd aksepté" : "Aide acceptée"}
                          </div>

                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            <input
                              type="number"
                              min="0"
                              value={gainInputs[item.id] ?? item.montant_obtenu ?? ""}
                              onChange={e => setGainInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                              placeholder={isKreol ? "Montan obtenu" : "Montant obtenu"}
                              style={{ background: COLORS.cardLight, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 10px", color: COLORS.text, fontFamily: "inherit", width: 160 }}
                            />
                            <button type="button" onClick={() => saveGain(item)} style={{ background: COLORS.green, color: "#0A1628", border: "none", borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 900 }}>
                              {isKreol ? "Sauvegardé gain" : "Sauvegarder le gain"}
                            </button>
                          </div>
                        </div>
                      )}

                      {item.status === "refuse" && (
                        <div style={{ marginTop: 12, background: "rgba(251,113,133,.08)", border: "1px solid rgba(251,113,133,.25)", borderRadius: 14, padding: 12 }}>
                          <div style={{ color: COLORS.red, fontWeight: 900, marginBottom: 8 }}>
                            {isKreol ? "Motif refus" : "Motif du refus"}
                          </div>
                          <textarea
                            value={refusInputs[item.id] ?? item.refus_motif ?? ""}
                            onChange={e => setRefusInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder={isKreol ? "Ex : revenu trop élevé, document manquant..." : "Ex : revenus trop élevés, document manquant..."}
                            style={{ width: "100%", minHeight: 70, background: COLORS.cardLight, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 10, color: COLORS.text, fontFamily: "inherit", resize: "vertical" }}
                          />
                          <button type="button" onClick={() => saveRefusReason(item)} style={{ marginTop: 8, background: COLORS.red, color: "#0A1628", border: "none", borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 900 }}>
                            {isKreol ? "Sauvegardé motif" : "Sauvegarder le motif"}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <h4 style={{ margin: "0 0 10px", color: COLORS.text, fontSize: 18 }}>
              🎯 {isKreol ? "Bann zéd rekomandé" : "Aides recommandées"}
            </h4>

            <p style={{ margin: "0 0 14px", color: COLORS.muted }}>
              {responseData.aides.length} aides analysées. Ajoutez les aides importantes à vos démarches pour les suivre.
            </p>

            {visibleRecommendedAides.length === 0 ? (
              <div style={{ background: "rgba(255,255,255,.05)", border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 16, color: COLORS.muted }}>
                Aucune aide suffisamment probable pour le moment.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {visibleRecommendedAides.map(aide => {
                  const level = getLevel(aide.score, isKreol)
                  const officialLink = getOfficialLink(aide)
                  const aideKey = getAideKey(aide)
                  const tracked = trackedDemarches[aideKey]
                  const currentStatusKey = tracked?.status || "a_verifier"
                  const currentStatus = getStatusByKey(currentStatusKey)
                  const isSaving = savingDemarcheKey === aideKey
                  const actionSteps = getImmediateActionSteps(aide, responseData?.profile || profile || {}, isKreol)
                  const actionContacts = getActionContacts(aide, responseData?.profile || profile || {}, isKreol)
                  const aideDocs = getDocumentsForAide(getAideName(aide, false), aideDocuments).slice(0, 5)
                  const dossierPreview = [
                    getAideName(aide, isKreol),
                    "",
                    isKreol ? "Actions conseillées :" : "Actions conseillées :",
                    ...actionSteps.map(step => `- ${step}`),
                    "",
                    isKreol ? "Documents à préparer :" : "Documents à préparer :",
                    ...aideDocs.map(doc => `- ${getDocumentDisplayName(doc, isKreol)}`),
                    "",
                    isKreol ? "Organismes à contacter :" : "Organismes à contacter :",
                    ...actionContacts.map(contact => `- ${contact}`),
                  ].join("\n")

                  return (
                    <article key={aideKey} style={{ background: "linear-gradient(135deg, rgba(255,255,255,.065), rgba(255,255,255,.025))", border: `1px solid ${level.color}55`, borderRadius: 18, padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                        <div>
                          <div style={{ color: level.color, fontWeight: 900, fontSize: 13 }}>
                            {level.emoji} {level.label} · {aide.score}%
                          </div>
                          <h5 style={{ margin: "6px 0 0", color: COLORS.text, fontSize: 18 }}>
                            {getAideName(aide, isKreol)}
                          </h5>
                        </div>

                        <span style={{ background: `${level.color}22`, color: level.color, border: `1px solid ${level.color}55`, borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" }}>
                          {formatAideAmount(aide, isKreol)}
                        </span>
                      </div>

                      <p style={{ color: COLORS.muted, lineHeight: 1.6 }}>
                        {getAideDescription(aide, isKreol)}
                      </p>

                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                        <div style={{ background: "rgba(34,197,94,.07)", border: "1px solid rgba(34,197,94,.18)", borderRadius: 14, padding: 12 }}>
                          <strong style={{ color: COLORS.green }}>{isKreol ? "Poukoi ?" : "Pourquoi cette aide ?"}</strong>
                          <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: COLORS.text }}>
                            {aide.reasons.slice(0, 4).map((reason, index) => <li key={index}>{reason}</li>)}
                          </ul>
                        </div>

                        <div style={{ background: "rgba(35,211,214,.07)", border: "1px solid rgba(35,211,214,.18)", borderRadius: 14, padding: 12 }}>
                          <strong style={{ color: COLORS.cyan }}>{isKreol ? "Démars" : "Démarches"}</strong>
                          <p style={{ margin: "8px 0 0", color: COLORS.text, lineHeight: 1.55 }}>
                            {getAideDemarches(aide, isKreol) || "Vérifiez les conditions sur le site officiel."}
                          </p>
                        </div>
                      </div>

                      <div style={{ marginTop: 12, background: "rgba(249,115,22,.07)", border: "1px solid rgba(249,115,22,.22)", borderRadius: 14, padding: 12 }}>
                        <strong style={{ color: COLORS.accent }}>
                          🚀 {isKreol ? "Action immédiate" : "Action immédiate"}
                        </strong>
                        <ol style={{ margin: "8px 0 0", paddingLeft: 18, color: COLORS.text, lineHeight: 1.6 }}>
                          {actionSteps.map((step, index) => <li key={index}>{step}</li>)}
                        </ol>
                      </div>

                      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                        <div style={{ background: "rgba(167,139,250,.07)", border: "1px solid rgba(167,139,250,.20)", borderRadius: 14, padding: 12 }}>
                          <strong style={{ color: COLORS.purple }}>🏢 {isKreol ? "Koté contacté ?" : "Organismes à contacter"}</strong>
                          <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: COLORS.text, lineHeight: 1.55 }}>
                            {actionContacts.slice(0, 4).map((contact, index) => <li key={index}>{contact}</li>)}
                          </ul>
                        </div>

                        <div style={{ background: "rgba(252,211,77,.07)", border: "1px solid rgba(252,211,77,.22)", borderRadius: 14, padding: 12 }}>
                          <strong style={{ color: COLORS.yellow }}>📄 {isKreol ? "Dokiman pou préparé" : "Documents à préparer"}</strong>
                          <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: COLORS.text, lineHeight: 1.55 }}>
                            {aideDocs.map((doc, index) => (
                              <li key={index}>
                                {getDocumentDisplayName(doc, isKreol)}{doc.obligatoire ? " *" : ""}
                              </li>
                            ))}
                          </ul>
                          <div style={{ marginTop: 8, color: COLORS.muted, fontSize: 12 }}>
                            * {isKreol ? "souvent obligatoire" : "souvent obligatoire"}
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10 }}>
                        {officialLink && (
                          <button type="button" onClick={() => openExternalLink(officialLink)} style={{ background: level.color, color: "#0A1628", border: "none", borderRadius: 12, padding: "10px 14px", fontWeight: 900, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <ExternalLink size={15} />
                            {isKreol ? "🚀 Alé voir maintenant" : "🚀 Voir / commencer maintenant"}
                          </button>
                        )}

                        <button type="button" onClick={() => window.alert(dossierPreview)} style={{ background: "rgba(255,255,255,.06)", color: COLORS.text, border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, padding: "10px 14px", fontWeight: 900, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <FileText size={15} />
                          {isKreol ? "📄 Prépare mon dossier" : "📄 Préparer mon dossier"}
                        </button>
                      </div>

                      <div style={{ marginTop: 14, background: tracked ? "rgba(255,255,255,.045)" : "rgba(35,211,214,.06)", border: tracked ? "1px solid rgba(255,255,255,.08)" : "1px solid rgba(35,211,214,.20)", borderRadius: 14, padding: 12 }}>
                        {!tracked ? (
                          <button type="button" onClick={() => addToDemarches(aide)} disabled={isSaving} style={{ background: isSaving ? COLORS.muted : COLORS.cyan, color: "#0A1628", border: "none", borderRadius: 12, padding: "10px 13px", fontWeight: 900, cursor: isSaving ? "not-allowed" : "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <PlusCircle size={16} />
                            {isSaving ? "Ajout en cours..." : isKreol ? "Azouté dann mes démarches" : "Ajouter à mes démarches"}
                          </button>
                        ) : (
                          <>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: currentStatus.color, fontWeight: 900, marginBottom: 10 }}>
                              <ClipboardCheck size={16} />
                              {isKreol ? "Suivi démarche" : "Suivi de la démarche"} : {currentStatus.emoji} {isKreol ? currentStatus.kreol : currentStatus.fr}
                            </div>

                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                              {STATUS_OPTIONS.map(status => (
                                <button key={status.key} type="button" onClick={() => updateAideStatus(aide, status.key)} disabled={isSaving} style={{ background: currentStatusKey === status.key ? `${status.color}33` : "rgba(255,255,255,.04)", border: currentStatusKey === status.key ? `1px solid ${status.color}` : "1px solid rgba(255,255,255,.10)", borderRadius: 999, padding: "7px 10px", color: currentStatusKey === status.key ? status.color : COLORS.muted, fontSize: 12, cursor: isSaving ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 900 }}>
                                  {status.emoji} {isKreol ? status.kreol : status.fr}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          {excludedAides.length > 0 && (
            <div style={{ background: "rgba(251,113,133,.07)", border: "1px solid rgba(251,113,133,.25)", borderRadius: 16, padding: 16 }}>
              <strong style={{ color: COLORS.red }}>
                🚫 {isKreol ? "Zéd ékarté pou out profil" : "Aides écartées pour votre profil"}
              </strong>
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: COLORS.text }}>
                {excludedAides.map(aide => (
                  <li key={aide.id || aide.nom}>
                    {getAideName(aide, isKreol)} : {aide.excludedReasons?.[0]}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p style={{ margin: 0, color: COLORS.muted, fontSize: 13 }}>
            {isKreol
              ? "⚠️ Sa lé in pré-analyse. Fo touzour vérifié bann kondisyon su sit ofisyèl."
              : "⚠️ Cette analyse est une pré-orientation. Les conditions exactes doivent toujours être vérifiées sur les sites officiels."}
          </p>
        </div>
      )}
    </section>
  )
}