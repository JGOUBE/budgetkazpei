import { useEffect, useMemo, useState } from "react"
import {
  Lock,
  Send,
  Sparkles,
  Star,
  SearchCheck,
  ExternalLink,
  MessageCircle,
  ClipboardCheck,
  TrendingUp,
  Bell,
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
  if (!Number.isFinite(number) || number <= 0) {
    return isKreol ? "Pa ransényé" : "Non renseigné"
  }
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

  if (
    q.includes("vacance") ||
    q.includes("loisir") ||
    q.includes("sortie") ||
    q.includes("centre aere") ||
    q.includes("centre aéré") ||
    q.includes("colo") ||
    q.includes("vacaf") ||
    q.includes("pass colo")
  ) {
    intents.push("vacances", "loisirs", "jeunesse", "famille", "commune", "sport", "culture")
  }

  if (
    q.includes("cantine") ||
    q.includes("repas") ||
    q.includes("manger") ||
    q.includes("alimentaire") ||
    q.includes("alimentation")
  ) {
    intents.push("alimentaire", "cantine", "famille", "commune", "social")
  }

  if (
    q.includes("loyer") ||
    q.includes("logement") ||
    q.includes("apl") ||
    q.includes("maison") ||
    q.includes("kaz") ||
    q.includes("location")
  ) {
    intents.push("logement", "apl", "loyer")
  }

  if (
    q.includes("energie") ||
    q.includes("electricite") ||
    q.includes("edf") ||
    q.includes("eau") ||
    q.includes("facture") ||
    q.includes("courant") ||
    q.includes("kouran")
  ) {
    intents.push("energie", "facture", "social")
  }

  if (
    q.includes("enfant") ||
    q.includes("marmay") ||
    q.includes("ecole") ||
    q.includes("scolaire") ||
    q.includes("garde")
  ) {
    intents.push("famille", "jeunesse", "transport", "scolaire")
  }

  if (
    q.includes("travail") ||
    q.includes("emploi") ||
    q.includes("formation") ||
    q.includes("chomage") ||
    q.includes("chômage") ||
    q.includes("france travail")
  ) {
    intents.push("emploi", "mobilite", "formation")
  }

  if (
    q.includes("permis") ||
    q.includes("voiture") ||
    q.includes("transport") ||
    q.includes("mobilite") ||
    q.includes("mobilité") ||
    q.includes("bus")
  ) {
    intents.push("mobilite", "transport")
  }

  if (
    q.includes("etudiant") ||
    q.includes("étudiant") ||
    q.includes("etude") ||
    q.includes("étude") ||
    q.includes("bourse") ||
    q.includes("universite") ||
    q.includes("université")
  ) {
    intents.push("etudiant")
  }

  if (q.includes("handicap") || q.includes("mdph") || q.includes("aah") || q.includes("pch")) {
    intents.push("handicap")
  }

  if (q.includes("retraite") || q.includes("senior") || q.includes("gramoun") || q.includes("apa")) {
    intents.push("senior")
  }

  if (q.includes("sante") || q.includes("santé") || q.includes("mutuelle") || q.includes("css") || q.includes("ameli")) {
    intents.push("sante", "social")
  }

  if (q.includes("commune") || q.includes("mairie") || q.includes("ccas")) {
    intents.push("commune", "social")
  }

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
  return aide.nom || "Aide"
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
  return String(aide.id || aide.nom || "aide")
}

function getStatusByKey(key) {
  return STATUS_OPTIONS.find(status => status.key === key) || STATUS_OPTIONS[0]
}

function getLevel(score, isKreol = false) {
  if (score >= 80) {
    return { label: isKreol ? "Tré probab" : "Très probable", emoji: "🟢", color: COLORS.green }
  }

  if (score >= 50) {
    return { label: isKreol ? "Probab" : "Probable", emoji: "🟡", color: COLORS.yellow }
  }

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

  if (isTrue(aide.besoin_enfant) && Number(profile.nombre_enfants || 0) <= 0) {
    addExcluded(excluded, "Cette aide nécessite d’avoir au moins un enfant à charge.", "Sa zéd-la i domann davoir omwin in marmay a chaj.", isKreol)
  }

  if (isTrue(aide.besoin_locataire) && profile.logement && profile.logement !== "locataire") {
    addExcluded(excluded, "Cette aide concerne les locataires.", "Sa zéd-la i konsern bann lokatèr.", isKreol)
  }

  if (isTrue(aide.besoin_proprietaire) && profile.logement && profile.logement !== "proprietaire") {
    addExcluded(excluded, "Cette aide concerne les propriétaires.", "Sa zéd-la i konsern bann propriyétèr.", isKreol)
  }

  if (isTrue(aide.besoin_etudiant) && !isTrue(profile.etudiant) && profile.situation_professionnelle !== "etudiant") {
    addExcluded(excluded, "Cette aide concerne les étudiants.", "Sa zéd-la i konsern bann étidyan.", isKreol)
  }

  if (isTrue(aide.besoin_handicap) && !isTrue(profile.handicap)) {
    addExcluded(excluded, "Cette aide nécessite une situation de handicap.", "Sa zéd-la i domann in sitiasyon handicap.", isKreol)
  }

  if (isTrue(aide.besoin_retraite) && !isTrue(profile.retraite) && profile.situation_professionnelle !== "retraite") {
    addExcluded(excluded, "Cette aide concerne les retraités ou les seniors.", "Sa zéd-la i konsern bann retraité ou gramoun.", isKreol)
  }

  if (isTrue(aide.besoin_demandeur_emploi) && profile.situation_professionnelle && profile.situation_professionnelle !== "demandeur_emploi") {
    addExcluded(excluded, "Cette aide concerne surtout les demandeurs d’emploi.", "Sa zéd-la i konsern sirtou bann domandèr d'emploi.", isKreol)
  }

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
  } else if (
    enfants > 0 &&
    (aideText.includes("famille") ||
      aideText.includes("enfant") ||
      aideText.includes("scolaire") ||
      aideText.includes("jeunesse") ||
      aideText.includes("vacances") ||
      aideText.includes("loisirs"))
  ) {
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

  if (
    profile.situation_familiale === "parent_isole" &&
    (aideText.includes("parent") || aideText.includes("famille") || aideText.includes("enfant"))
  ) {
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

function openExternalLink(url) {
  if (!url) return
  window.open(url, "_blank", "noopener,noreferrer")
}

function getPotentialLevel(recommendedAides = []) {
  const strongCount = recommendedAides.filter(aide => aide.score >= 80).length
  const amountTotal = recommendedAides.reduce((sum, aide) => sum + getAideAmountNumber(aide), 0)

  if (strongCount >= 3 || amountTotal >= 500) return "high"
  if (strongCount >= 1 || amountTotal >= 150) return "medium"
  return "low"
}

function buildDashboardStats(recommendedAides = [], statuses = {}) {
  const trackedKeys = recommendedAides.map(getAideKey)
  const trackedStatuses = trackedKeys.map(key => statuses[key]).filter(Boolean)

  return {
    total: recommendedAides.length,
    veryLikely: recommendedAides.filter(aide => aide.score >= 80).length,
    likely: recommendedAides.filter(aide => aide.score >= 50 && aide.score < 80).length,
    toCheck: trackedStatuses.filter(status => status === "a_verifier").length,
    inProgress: trackedStatuses.filter(status => ["dossier", "envoye", "attente"].includes(status)).length,
    accepted: trackedStatuses.filter(status => status === "accepte").length,
    refused: trackedStatuses.filter(status => status === "refuse").length,
    potentialLevel: getPotentialLevel(recommendedAides),
  }
}

function buildSmartAnswer(responseData, isKreol = false, recommendedAides = []) {
  if (!responseData?.profile) return ""

  const profile = responseData.profile
  const question = responseData.question || ""
  const mainIntent = getMainIntent(question)
  const children = Number(profile.nombre_enfants || 0)
  const commune = profile.commune
  const job = profile.situation_professionnelle
  const logement = profile.logement

  const topNames = recommendedAides.slice(0, 3).map(aide => getAideName(aide, isKreol)).filter(Boolean)
  const profileParts = []

  if (children > 0) profileParts.push(isKreol ? `${children} marmay` : `${children} enfant${children > 1 ? "s" : ""}`)
  if (commune) profileParts.push(commune)
  if (job === "demandeur_emploi") profileParts.push(isKreol ? "domandèr d'emploi" : "demandeur d’emploi")
  if (job === "salarie") profileParts.push(isKreol ? "salarié" : "salarié")
  if (logement === "locataire") profileParts.push(isKreol ? "lokatèr" : "locataire")

  const profileText = profileParts.length > 0 ? profileParts.join(", ") : ""

  if (!question.trim()) {
    return isKreol
      ? `Bonzour 👋 Mi analiz out profil${profileText ? ` (${profileText})` : ""}. Mi rode bann zéd ki pé korespond ek out sitiasyon, mi klase azot pou ou, é ou pé suivre chak démarche.`
      : `Bonjour 👋 J’ai analysé votre profil${profileText ? ` (${profileText})` : ""}. Je recherche les aides qui peuvent correspondre à votre situation, je les classe par priorité, puis vous pouvez suivre chaque démarche.`
  }

  if (mainIntent === "vacances") {
    return isKreol
      ? `Bonzour 👋 Mi konpran out demande : ou rod bann zéd pou vakans ou loisirs${children > 0 ? ` pou out ${children} marmay` : ""}. La priorité lé vérifié VACAF/CAF, bann zéd loisirs, Pass Sport/Pass Culture selon laz marmay, é CCAS out komin${commune ? ` (${commune})` : ""}.`
      : `Bonjour 👋 Je comprends votre demande : vous cherchez des aides pour les vacances ou les loisirs${children > 0 ? ` de vos ${children} enfants` : ""}. Les priorités à vérifier sont VACAF/CAF, les aides loisirs, Pass Sport/Pass Culture selon l’âge des enfants, ainsi que le CCAS de votre commune${commune ? ` (${commune})` : ""}.`
  }

  if (mainIntent === "cantine") {
    return isKreol
      ? "Bonzour 👋 Mi konpran : ou rod in zéd pou cantine ou repas marmay. Fo regard mairie, CCAS, zéd alimentaire, é dispositifs famille/scolaire."
      : "Bonjour 👋 Je comprends : vous cherchez une aide pour la cantine ou les repas des enfants. Les pistes à vérifier sont la mairie, le CCAS, les aides alimentaires et les dispositifs famille/scolaire."
  }

  if (mainIntent === "logement") {
    return isKreol
      ? "Bonzour 👋 Mi konpran : out demande konsern logement ou loyer. Si ou lé lokatèr, fo vérifié APL/CAF, FSL, CCAS, é parfois Action Logement."
      : "Bonjour 👋 Je comprends : votre demande concerne le logement ou le loyer. Si vous êtes locataire, les pistes principales sont l’APL/CAF, le FSL, le CCAS et parfois Action Logement."
  }

  if (mainIntent === "facture") {
    return isKreol
      ? "Bonzour 👋 Mi konpran : ou rod in zéd pou in facture. Selon facture-la, fo vérifié chèque énergie, zéd eau, CCAS, CAF ou service social."
      : "Bonjour 👋 Je comprends : vous cherchez une aide pour une facture. Selon le type de facture, il faut vérifier le chèque énergie, les aides eau, le CCAS, la CAF ou un service social."
  }

  if (mainIntent === "transport") {
    return isKreol
      ? "Bonzour 👋 Mi konpran : out demande konsern transport, mobilité ou permis. Bann pistes principales lé Département, Région, France Travail, mission locale, ou dispositifs jeunes."
      : "Bonjour 👋 Je comprends : votre demande concerne le transport, la mobilité ou le permis. Les pistes principales sont le Département, la Région, France Travail, la mission locale ou les dispositifs jeunes."
  }

  if (mainIntent === "emploi") {
    return isKreol
      ? "Bonzour 👋 Mi konpran : out demande lé liée à l’emploi ou formation. Fo regard France Travail, Région, mobilité, formation ou création d’activité selon out profil."
      : "Bonjour 👋 Je comprends : votre demande est liée à l’emploi ou la formation. Il faut regarder France Travail, la Région, les aides mobilité, la formation ou la création d’activité selon votre profil."
  }

  if (mainIntent === "etudiant") {
    return isKreol
      ? "Bonzour 👋 Mi konpran : ou rod bann zéd étudiant. Fo vérifier bourses, Région, Département, logement étudiant, mobilité, équipement informatique."
      : "Bonjour 👋 Je comprends : vous cherchez des aides étudiantes. Il faut vérifier les bourses, les aides Région/Département, le logement étudiant, la mobilité et l’équipement informatique."
  }

  if (mainIntent === "handicap") {
    return isKreol
      ? "Bonzour 👋 Mi konpran : out demande konsern handicap. Bann pistes importantes lé MDPH, AAH, PCH, santé, accompagnement social."
      : "Bonjour 👋 Je comprends : votre demande concerne le handicap. Les pistes importantes sont la MDPH, l’AAH, la PCH, la santé et l’accompagnement social."
  }

  if (mainIntent === "senior") {
    return isKreol
      ? "Bonzour 👋 Mi konpran : out demande konsern retraite, gramoun ou autonomie. Fo regarder APA, Département, CCAS, santé, accompagnement à domicile."
      : "Bonjour 👋 Je comprends : votre demande concerne la retraite, les seniors ou l’autonomie. Il faut regarder l’APA, le Département, le CCAS, la santé et l’accompagnement à domicile."
  }

  if (mainIntent === "sante") {
    return isKreol
      ? "Bonzour 👋 Mi konpran : out demande konsern santé ou mutuelle. Fo vérifier Complémentaire Santé Solidaire, Ameli, CAF ou accompagnement social selon out revenu."
      : "Bonjour 👋 Je comprends : votre demande concerne la santé ou la mutuelle. Il faut vérifier la Complémentaire Santé Solidaire, Ameli, la CAF ou l’accompagnement social selon vos revenus."
  }

  if (topNames.length > 0) {
    return isKreol
      ? `Bonzour 👋 Mi konpran out kestion. Dapré out profil${profileText ? ` (${profileText})` : ""}, bann pistes pli intéressantes pou vérifier lé : ${topNames.join(", ")}.`
      : `Bonjour 👋 Je comprends votre question. D’après votre profil${profileText ? ` (${profileText})` : ""}, les pistes les plus intéressantes à vérifier sont : ${topNames.join(", ")}.`
  }

  return isKreol
    ? "Bonzour 👋 Mi konpran out kestion, mé mi trouv pa in zéd évidente tout de suite. Mi afish kan même bann pistes à vérifier anba."
    : "Bonjour 👋 Je comprends votre question, mais je ne vois pas d’aide évidente immédiatement. Je vous affiche quand même les pistes à vérifier ci-dessous."
}

export default function AssistantAides({ isPremium, isMobile, t, user }) {
  const [question, setQuestion] = useState("")
  const [responseData, setResponseData] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [statuses, setStatuses] = useState({})

  const txt = (key, fallback) => safeT(t, "aides", key, fallback)
  const isKreol = isKreolLanguage(t)
  const storageKey = `budgetkazpei-aide-statuses-${user?.id || "guest"}`

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) setStatuses(JSON.parse(saved))
    } catch (error) {
      console.error("Erreur chargement statuts aides:", error)
    }
  }, [storageKey])

  function updateAideStatus(aide, statusKey) {
    const aideKey = getAideKey(aide)
    const nextStatuses = {
      ...statuses,
      [aideKey]: statusKey,
    }

    setStatuses(nextStatuses)

    try {
      localStorage.setItem(storageKey, JSON.stringify(nextStatuses))
    } catch (error) {
      console.error("Erreur sauvegarde statut aide:", error)
    }
  }

  const recommendedAides = useMemo(() => {
    if (!responseData?.profile || !responseData?.aides) return []
    return getRecommendedAides(responseData.aides, responseData.profile, isKreol, responseData.question || "")
  }, [responseData, isKreol])

  const excludedAides = useMemo(() => {
    if (!responseData?.profile || !responseData?.aides) return []
    return getExcludedAides(responseData.aides, responseData.profile, isKreol)
  }, [responseData, isKreol])

  const dashboardStats = useMemo(() => {
    return buildDashboardStats(recommendedAides, statuses)
  }, [recommendedAides, statuses])

  async function fetchProfile() {
    if (!user?.id) return null

    setLoadingProfile(true)

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "commune,situation_familiale,nombre_enfants,logement,revenus_foyer,situation_professionnelle,age,etudiant,retraite,handicap,allocataire_caf,permis_conduire,vehicule_personnel"
      )
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

    setResponseData({
      type: "scan",
      question: "",
      profile: currentProfile,
      aides,
    })
  }

  async function handleAnalyze() {
    const currentProfile = profile || (await fetchProfile())

    if (!currentProfile) {
      setResponseData({ type: "error" })
      return
    }

    const aides = await fetchAides()

    setResponseData({
      type: "question",
      question,
      profile: currentProfile,
      aides,
    })
  }

  if (!isPremium) {
    return (
      <section
        style={{
          background: `linear-gradient(135deg, rgba(252,211,77,.18), ${COLORS.card})`,
          border: `1px solid rgba(252,211,77,.35)`,
          borderRadius: 22,
          padding: isMobile ? 18 : 24,
        }}
      >
        <Lock size={26} color={COLORS.yellow} />

        <h3 style={{ color: COLORS.text, margin: "12px 0 8px" }}>
          {txt("assistantPremiumTitle", "⭐ Assistant Personnel Premium")}
        </h3>

        <p style={{ color: COLORS.yellow, lineHeight: 1.6, margin: "0 0 8px", fontWeight: 900 }}>
          {txt("assistantPremiumIntro", "Certaines aides sont peu connues.")}
        </p>

        <p style={{ color: COLORS.muted, lineHeight: 1.6, margin: 0 }}>
          {txt(
            "assistantPremiumDescription",
            "BudgetKazPei analyse votre situation parmi plus de 30 aides, droits et dispositifs disponibles à La Réunion pour vous aider à identifier rapidement ceux qui pourraient vous concerner."
          )}
        </p>

        <div style={{ marginTop: 14, display: "grid", gap: 7 }}>
          <div style={{ color: COLORS.text, fontWeight: 800 }}>
            {txt("assistantPremiumBenefit1", "🎯 Analyse personnalisée")}
          </div>
          <div style={{ color: COLORS.text, fontWeight: 800 }}>
            {txt("assistantPremiumBenefit2", "📄 Accompagnement dans les démarches")}
          </div>
          <div style={{ color: COLORS.text, fontWeight: 800 }}>
            {txt("assistantPremiumBenefit3", "💬 Français et créole réunionnais")}
          </div>
          <div style={{ color: COLORS.text, fontWeight: 800 }}>
            {txt("assistantPremiumBenefit4", "🔔 Suivi des nouvelles aides disponibles")}
          </div>
        </div>

        <button
          type="button"
          onClick={() => alert(isKreol ? "Disponib avèk Premium" : "Disponible avec Premium")}
          style={{
            marginTop: 16,
            background: COLORS.yellow,
            color: "#0A1628",
            border: "none",
            borderRadius: 12,
            padding: "11px 16px",
            fontWeight: 900,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {txt("assistantPremiumButton", "Découvrir Premium")}
        </button>
      </section>
    )
  }

  return (
    <section
      style={{
        background: `linear-gradient(135deg, rgba(35,211,214,.16), ${COLORS.card})`,
        border: `1px solid rgba(35,211,214,.32)`,
        borderRadius: 22,
        padding: isMobile ? 18 : 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Star size={26} color={COLORS.cyan} />
        <h3 style={{ color: COLORS.text, margin: 0 }}>
          {isKreol ? "Mon konseye zéd Premium" : "Mon conseiller aides Premium"}
        </h3>
      </div>

      <p style={{ color: COLORS.muted, lineHeight: 1.6 }}>
        {isKreol
          ? "Poz out kestion. Mon konseye i analiz out profil, i répond aou, i klase bann zéd, é ou pé suivre out démarches."
          : "Posez votre question. Votre conseiller analyse votre profil, vous répond, classe les aides et vous permet de suivre vos démarches."}
      </p>

      <div
        style={{
          background: "rgba(255,255,255,.05)",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 18,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.cyan, fontWeight: 900 }}>
          <MessageCircle size={17} />
          {isKreol ? "Diskité ek mon konseye" : "Discuter avec mon conseiller"}
        </div>

        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder={
            isKreol
              ? "Ex : Bonzour, mi na 2 marmay, est-ce que mi pé gagn zéd pou vakans ?"
              : "Ex : Bonjour, j’ai 2 enfants, est-ce que je peux avoir des aides pour les vacances ?"
          }
          style={{
            width: "100%",
            minHeight: 105,
            background: COLORS.cardLight,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 14,
            padding: 14,
            color: COLORS.text,
            fontFamily: "inherit",
            resize: "vertical",
            outline: "none",
          }}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[
            isKreol ? "Zéd pou vakans marmay" : "Aides vacances enfants",
            isKreol ? "Zéd cantine" : "Aide cantine",
            isKreol ? "Zéd facture EDF" : "Aide facture EDF",
            isKreol ? "Zéd logement" : "Aide logement",
          ].map(example => (
            <button
              key={example}
              type="button"
              onClick={() => setQuestion(example)}
              style={{
                background: "rgba(35,211,214,.08)",
                border: "1px solid rgba(35,211,214,.25)",
                borderRadius: 999,
                padding: "7px 11px",
                color: COLORS.cyan,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                fontWeight: 800,
              }}
            >
              {example}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={loadingProfile}
            style={{
              background: loadingProfile ? COLORS.muted : COLORS.accent,
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "11px 16px",
              fontWeight: 900,
              cursor: loadingProfile ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Send size={16} />
            {loadingProfile
              ? "Analyse en cours..."
              : isKreol
                ? "Diskité ek mon konseye"
                : "Discuter avec mon conseiller"}
          </button>

          <button
            type="button"
            onClick={handleScanProfile}
            disabled={loadingProfile}
            style={{
              background: loadingProfile ? COLORS.muted : COLORS.cyan,
              color: "#0A1628",
              border: "none",
              borderRadius: 12,
              padding: "11px 16px",
              fontWeight: 900,
              cursor: loadingProfile ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <SearchCheck size={16} />
            {isKreol ? "Scanner mon profil" : "Scanner mon profil"}
          </button>
        </div>

        {responseData?.type === "error" && (
          <div
            style={{
              background: "rgba(251,113,133,.10)",
              border: "1px solid rgba(251,113,133,.35)",
              borderRadius: 16,
              padding: 14,
              color: COLORS.text,
            }}
          >
            {isKreol
              ? "Inposib sharj out profil pou linstan. Vérifi si out profil lé bien ranpli."
              : "Impossible de charger votre profil pour le moment. Vérifiez que votre profil est bien complété."}
          </div>
        )}

        {responseData?.profile && (
          <div
            style={{
              background: "rgba(35,211,214,.08)",
              border: "1px solid rgba(35,211,214,.22)",
              borderRadius: 16,
              padding: 16,
              color: COLORS.text,
              lineHeight: 1.6,
            }}
          >
            <div
              style={{
                color: COLORS.cyan,
                fontWeight: 900,
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Sparkles size={16} />
              {isKreol ? "Répons mon konseye" : "Réponse de votre conseiller"}
            </div>

            {responseData.type === "question" && (
              <p style={{ margin: "0 0 12px", color: COLORS.muted }}>
                {isKreol ? "Out kestion :" : "Votre question :"}{" "}
                <strong style={{ color: COLORS.text }}>
                  {responseData.question || (isKreol ? "Ou la pa mark kestion" : "Aucune question précisée")}
                </strong>
              </p>
            )}

            <p style={{ margin: "0 0 12px" }}>
              {buildSmartAnswer(responseData, isKreol, recommendedAides)}
            </p>

            <details
              style={{
                marginTop: 12,
                background: "rgba(255,255,255,.04)",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                padding: 12,
              }}
            >
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
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(34,197,94,.14), rgba(35,211,214,.08), rgba(255,255,255,.03))",
              border: "1px solid rgba(34,197,94,.25)",
              borderRadius: 18,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.green, fontWeight: 900, marginBottom: 12 }}>
              <TrendingUp size={18} />
              {isKreol ? "Tablo débor bann zéd" : "Tableau de bord des aides"}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
                gap: 10,
              }}
            >
              {[
                {
                  label: isKreol ? "Zéd trouvées" : "Aides trouvées",
                  value: dashboardStats.total,
                  color: COLORS.cyan,
                },
                {
                  label: isKreol ? "Tré probab" : "Très probables",
                  value: dashboardStats.veryLikely,
                  color: COLORS.green,
                },
                {
                  label: isKreol ? "En cours" : "En cours",
                  value: dashboardStats.inProgress,
                  color: COLORS.yellow,
                },
                {
                  label: isKreol ? "Akseptées" : "Acceptées",
                  value: dashboardStats.accepted,
                  color: COLORS.purple,
                },
              ].map(item => (
                <div
                  key={item.label}
                  style={{
                    background: "rgba(255,255,255,.055)",
                    border: "1px solid rgba(255,255,255,.09)",
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  <div style={{ color: item.color, fontWeight: 900, fontSize: 22 }}>{item.value}</div>
                  <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 800 }}>{item.label}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 12,
                background: "rgba(255,255,255,.045)",
                border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 14,
                padding: 12,
                color: COLORS.text,
                lineHeight: 1.55,
              }}
            >
              <Bell size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />
              {dashboardStats.potentialLevel === "high"
                ? isKreol
                  ? "Potentiel zéd : élevé. Plusieurs dispositifs méritent dèt vérifiés rapidement."
                  : "Potentiel d’aides : élevé. Plusieurs dispositifs méritent d’être vérifiés rapidement."
                : dashboardStats.potentialLevel === "medium"
                  ? isKreol
                    ? "Potentiel zéd : moyen. Commence par bann aides les plus probables."
                    : "Potentiel d’aides : moyen. Commencez par les aides les plus probables."
                  : isKreol
                    ? "Potentiel zéd : à vérifier. Plus out profil lé complet, plus analyse-la sera précise."
                    : "Potentiel d’aides : à vérifier. Plus votre profil est complet, plus l’analyse sera précise."}
            </div>
          </div>

          <div>
            <h4 style={{ margin: "0 0 10px", color: COLORS.text, fontSize: 18 }}>
              🎯 {isKreol ? "Bann zéd rekomandé" : "Aides recommandées"}
            </h4>

            <p style={{ margin: "0 0 14px", color: COLORS.muted }}>
              {isKreol
                ? `${responseData.aides.length} zéd analizé. Bann résultats lé klasé selon out profil ek out kestion.`
                : `${responseData.aides.length} aides analysées. Les résultats sont classés selon votre profil et votre question.`}
            </p>

            {recommendedAides.length === 0 ? (
              <div
                style={{
                  background: "rgba(255,255,255,.05)",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 16,
                  padding: 16,
                  color: COLORS.muted,
                }}
              >
                {isKreol
                  ? "Nana pa zéd assez probab pou linstan. Essaye écrit in kestion pli précise."
                  : "Aucune aide suffisamment probable pour le moment. Essayez d’écrire une question plus précise."}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {recommendedAides.map(aide => {
                  const level = getLevel(aide.score, isKreol)
                  const officialLink = getOfficialLink(aide)
                  const aideKey = getAideKey(aide)
                  const currentStatusKey = statuses[aideKey] || "a_verifier"
                  const currentStatus = getStatusByKey(currentStatusKey)

                  return (
                    <article
                      key={aideKey}
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(255,255,255,.065), rgba(255,255,255,.025))",
                        border: `1px solid ${level.color}55`,
                        borderRadius: 18,
                        padding: 16,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                          marginBottom: 10,
                        }}
                      >
                        <div>
                          <div style={{ color: level.color, fontWeight: 900, fontSize: 13 }}>
                            {level.emoji} {level.label} · {aide.score}%
                          </div>

                          <h5 style={{ margin: "6px 0 0", color: COLORS.text, fontSize: 18 }}>
                            {getAideName(aide, isKreol)}
                          </h5>
                        </div>

                        <span
                          style={{
                            background: `${level.color}22`,
                            color: level.color,
                            border: `1px solid ${level.color}55`,
                            borderRadius: 999,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 900,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatAideAmount(aide, isKreol)}
                        </span>
                      </div>

                      <p style={{ color: COLORS.muted, lineHeight: 1.6 }}>
                        {getAideDescription(aide, isKreol)}
                      </p>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            background: "rgba(34,197,94,.07)",
                            border: "1px solid rgba(34,197,94,.18)",
                            borderRadius: 14,
                            padding: 12,
                          }}
                        >
                          <strong style={{ color: COLORS.green }}>
                            {isKreol ? "Poukoi ?" : "Pourquoi cette aide ?"}
                          </strong>

                          <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: COLORS.text }}>
                            {aide.reasons.slice(0, 4).map((reason, index) => (
                              <li key={index}>{reason}</li>
                            ))}
                          </ul>
                        </div>

                        <div
                          style={{
                            background: "rgba(35,211,214,.07)",
                            border: "1px solid rgba(35,211,214,.18)",
                            borderRadius: 14,
                            padding: 12,
                          }}
                        >
                          <strong style={{ color: COLORS.cyan }}>
                            {isKreol ? "Démars" : "Démarches"}
                          </strong>

                          <p style={{ margin: "8px 0 0", color: COLORS.text, lineHeight: 1.55 }}>
                            {getAideDemarches(aide, isKreol) ||
                              (isKreol
                                ? "Vérifi bann kondisyon su sit ofisyèl."
                                : "Vérifiez les conditions sur le site officiel.")}
                          </p>
                        </div>
                      </div>

                      {aide.missing.length > 0 && (
                        <p style={{ margin: "12px 0 0", color: COLORS.yellow }}>
                          ⚠️ {isKreol ? "Pou vérifié" : "À vérifier"} : {aide.missing.join(", ")}
                        </p>
                      )}

                      <div
                        style={{
                          marginTop: 14,
                          background: "rgba(255,255,255,.045)",
                          border: "1px solid rgba(255,255,255,.08)",
                          borderRadius: 14,
                          padding: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: currentStatus.color, fontWeight: 900, marginBottom: 10 }}>
                          <ClipboardCheck size={16} />
                          {isKreol ? "Suivi démarche" : "Suivi de la démarche"} : {currentStatus.emoji}{" "}
                          {isKreol ? currentStatus.kreol : currentStatus.fr}
                        </div>

                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {STATUS_OPTIONS.map(status => (
                            <button
                              key={status.key}
                              type="button"
                              onClick={() => updateAideStatus(aide, status.key)}
                              style={{
                                background:
                                  currentStatusKey === status.key
                                    ? `${status.color}33`
                                    : "rgba(255,255,255,.04)",
                                border:
                                  currentStatusKey === status.key
                                    ? `1px solid ${status.color}`
                                    : "1px solid rgba(255,255,255,.10)",
                                borderRadius: 999,
                                padding: "7px 10px",
                                color: currentStatusKey === status.key ? status.color : COLORS.muted,
                                fontSize: 12,
                                cursor: "pointer",
                                fontFamily: "inherit",
                                fontWeight: 900,
                              }}
                            >
                              {status.emoji} {isKreol ? status.kreol : status.fr}
                            </button>
                          ))}
                        </div>
                      </div>

                      {officialLink && (
                        <button
                          type="button"
                          onClick={() => openExternalLink(officialLink)}
                          style={{
                            marginTop: 14,
                            background: level.color,
                            color: "#0A1628",
                            border: "none",
                            borderRadius: 12,
                            padding: "10px 14px",
                            fontWeight: 900,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
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
            <div
              style={{
                background: "rgba(251,113,133,.07)",
                border: "1px solid rgba(251,113,133,.25)",
                borderRadius: 16,
                padding: 16,
              }}
            >
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