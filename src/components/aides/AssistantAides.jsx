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

  if (q.includes("vacance") || q.includes("loisir") || q.includes("sortie") || q.includes("centre aere") || q.includes("centre aéré") || q.includes("colo") || q.includes("vacaf") || q.includes("pass colo")) {
    intents.push("vacances", "loisirs", "jeunesse", "famille", "commune", "sport", "culture")
  }

  if (q.includes("cantine") || q.includes("repas") || q.includes("manger") || q.includes("alimentaire") || q.includes("alimentation")) {
    intents.push("alimentaire", "cantine", "famille", "commune", "social")
  }

  if (q.includes("loyer") || q.includes("logement") || q.includes("apl") || q.includes("maison") || q.includes("kaz") || q.includes("location")) {
    intents.push("logement", "apl", "loyer")
  }

  if (q.includes("energie") || q.includes("electricite") || q.includes("edf") || q.includes("eau") || q.includes("facture") || q.includes("courant") || q.includes("kouran")) {
    intents.push("energie", "facture", "social")
  }

  if (q.includes("enfant") || q.includes("marmay") || q.includes("ecole") || q.includes("scolaire") || q.includes("garde")) {
    intents.push("famille", "jeunesse", "transport", "scolaire")
  }

  if (q.includes("travail") || q.includes("emploi") || q.includes("formation") || q.includes("chomage") || q.includes("chômage") || q.includes("france travail")) {
    intents.push("emploi", "mobilite", "formation")
  }

  if (q.includes("permis") || q.includes("voiture") || q.includes("transport") || q.includes("mobilite") || q.includes("mobilité") || q.includes("bus")) {
    intents.push("mobilite", "transport")
  }

  if (q.includes("etudiant") || q.includes("étudiant") || q.includes("etude") || q.includes("étude") || q.includes("bourse") || q.includes("universite") || q.includes("université")) {
    intents.push("etudiant")
  }

  if (q.includes("handicap") || q.includes("mdph") || q.includes("aah") || q.includes("pch")) intents.push("handicap")
  if (q.includes("retraite") || q.includes("senior") || q.includes("gramoun") || q.includes("apa")) intents.push("senior")
  if (q.includes("sante") || q.includes("santé") || q.includes("mutuelle") || q.includes("css") || q.includes("ameli")) intents.push("sante", "social")
  if (q.includes("commune") || q.includes("mairie") || q.includes("ccas")) intents.push("commune", "social")

  return [...new Set(intents)]
}

function getMainIntent(question = "") {
  const q = normalizeText(question)
  if (q.includes("vacance") || q.includes("loisir") || q.includes("centre aere") || q.includes("centre aéré") || q.includes("colo") || q.includes("vacaf")) return "vacances"
  if (q.includes("cantine") || q.includes("repas") || q.includes("alimentaire")) return "cantine"
  if (q.includes("loyer") || q.includes("logement") || q.includes("apl") || q.includes("location")) return "logement"
  if (q.includes("facture") || q.includes("edf") || q.includes("electricite") || q.includes("energie") || q.includes("eau")) return "facture"
  if (q.includes("transport") || q.includes("bus") || q.includes("mobilite") || q.includes("permis")) return "transport"
  if (q.includes("emploi") || q.includes("travail") || q.includes("formation") || q.includes("chomage")) return "emploi"
  if (q.includes("etudiant") || q.includes("bourse") || q.includes("universite")) return "etudiant"
  if (q.includes("handicap") || q.includes("aah") || q.includes("pch") || q.includes("mdph")) return "handicap"
  if (q.includes("retraite") || q.includes("senior") || q.includes("apa") || q.includes("gramoun")) return "senior"
  if (q.includes("sante") || q.includes("mutuelle") || q.includes("css") || q.includes("ameli")) return "sante"
  return "general"
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

  const aideText = normalizeText(
    `${aide.nom || ""} ${aide.nom_kreol || ""} ${aide.categorie || ""} ${aide.description || ""} ${aide.description_fr || ""} ${aide.description_kreol || ""} ${aide.demarches_fr || ""} ${aide.demarches_kreol || ""}`
  )

  const enfants = Number(profile.nombre_enfants || 0)
  const revenus = Number(profile.revenus_foyer || 0)
  const age = Number(profile.age || 0)

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

  return { ...aide, score, excluded: false, level: getLevel(score, isKreol), reasons, missing }
}

function getRecommendedAides(aides = [], profile = {}, isKreol = false, question = "") {
  return aides
    .map(aide => scoreAide(aide, profile, isKreol, question))
    .filter(aide => !aide.excluded && aide.score >= 35)
    .sort((a, b) => b.score - a.score)
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

function buildSmartAnswer(responseData, isKreol = false, recommendedAides = []) {
  if (!responseData?.profile) return ""

  const profile = responseData.profile
  const question = responseData.question || ""
  const mainIntent = getMainIntent(question)
  const children = Number(profile.nombre_enfants || 0)
  const commune = profile.commune

  if (!question.trim()) {
    return isKreol
      ? "Bonzour 👋 Mi analiz out profil. Mi rode bann zéd ki pé korespond ek out sitiasyon, mi klase azot pou ou, é ou pé azouté bann zéd dann out démarches."
      : "Bonjour 👋 J’ai analysé votre profil. Je recherche les aides qui peuvent correspondre à votre situation, je les classe par priorité, puis vous pouvez les ajouter à vos démarches."
  }

  if (mainIntent === "vacances") {
    return isKreol
      ? `Bonzour 👋 Mi konpran out demande : ou rod bann zéd pou vakans ou loisirs${children > 0 ? ` pou out ${children} marmay` : ""}. Fo vérifié VACAF/CAF, zéd loisirs, Pass Sport/Pass Culture, é CCAS${commune ? ` ${commune}` : ""}.`
      : `Bonjour 👋 Je comprends votre demande : vous cherchez des aides pour les vacances ou les loisirs${children > 0 ? ` de vos ${children} enfants` : ""}. Il faut vérifier VACAF/CAF, les aides loisirs, Pass Sport/Pass Culture et le CCAS${commune ? ` de ${commune}` : ""}.`
  }

  if (mainIntent === "cantine") return isKreol ? "Bonzour 👋 Mi konpran : ou rod in zéd pou cantine ou repas marmay. Fo regard mairie, CCAS, zéd alimentaire, é dispositifs famille/scolaire." : "Bonjour 👋 Je comprends : vous cherchez une aide pour la cantine ou les repas des enfants. Les pistes à vérifier sont la mairie, le CCAS, les aides alimentaires et les dispositifs famille/scolaire."
  if (mainIntent === "logement") return isKreol ? "Bonzour 👋 Mi konpran : out demande konsern logement ou loyer. Fo vérifié APL/CAF, FSL, CCAS, é parfois Action Logement." : "Bonjour 👋 Je comprends : votre demande concerne le logement ou le loyer. Les pistes principales sont l’APL/CAF, le FSL, le CCAS et parfois Action Logement."
  if (mainIntent === "facture") return isKreol ? "Bonzour 👋 Mi konpran : ou rod in zéd pou in facture. Fo vérifié chèque énergie, zéd eau, CCAS, CAF ou service social." : "Bonjour 👋 Je comprends : vous cherchez une aide pour une facture. Il faut vérifier le chèque énergie, les aides eau, le CCAS, la CAF ou un service social."

  const topNames = recommendedAides.slice(0, 3).map(aide => getAideName(aide, isKreol)).filter(Boolean)
  if (topNames.length > 0) {
    return isKreol
      ? `Bonzour 👋 Mi konpran out kestion. Bann pistes pli intéressantes pou vérifier lé : ${topNames.join(", ")}.`
      : `Bonjour 👋 Je comprends votre question. Les pistes les plus intéressantes à vérifier sont : ${topNames.join(", ")}.`
  }

  return isKreol
    ? "Bonzour 👋 Mi konpran out kestion. Mi afish bann pistes à vérifier anba."
    : "Bonjour 👋 Je comprends votre question. Je vous affiche les pistes à vérifier ci-dessous."
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
          {[isKreol ? "Zéd pou vakans marmay" : "Aides vacances enfants", isKreol ? "Zéd cantine" : "Aide cantine", isKreol ? "Zéd facture EDF" : "Aide facture EDF", isKreol ? "Zéd logement" : "Aide logement"].map(example => (
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
            Scanner mon profil
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

            <p style={{ margin: "0 0 12px" }}>
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

                      {officialLink && (
                        <button type="button" onClick={() => openExternalLink(officialLink)} style={{ marginTop: 14, background: level.color, color: "#0A1628", border: "none", borderRadius: 12, padding: "10px 14px", fontWeight: 900, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <ExternalLink size={15} />
                          {isKreol ? "Ouvrir lyen ofisyèl" : "Ouvrir le lien officiel"}
                        </button>
                      )}
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