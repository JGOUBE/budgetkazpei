import { useEffect, useMemo, useState } from "react"
import {
  Landmark,
  Sparkles,
  SearchCheck,
  Wallet,
  Home,
  Zap,
  Sun,
  Baby,
  ShoppingBasket,
  Bus,
  Coins,
  ClipboardCheck,
  Trash2,
  FileText,
  Mail,
  FolderCheck,
  Scale,
  HelpCircle,
  Lock,
} from "lucide-react"

import { supabase } from "../../services/supabase"
import { AIDES } from "../../data/categories"
import { AUTRES_AIDES } from "../../data/aides"
import { createColorAliases } from "../../styles/designSystem"
import { useTheme } from "../../styles/ThemeProvider"

const COLORS = createColorAliases({ red: () => "#FB7185" })

function getReadableAccent(color, themeName = COLORS.themeName) {
  if (themeName !== "light") return color
  if (color === COLORS.yellow) return "#B45309"
  if (color === COLORS.green) return "#15803D"
  if (color === COLORS.cyan) return "#0284C7"
  if (color === COLORS.purple) return "#6D28D9"
  if (color === COLORS.accent) return "#EA580C"
  return color
}

const CARD_VARIANTS = [
  {
    bg: "linear-gradient(135deg, rgba(34,197,94,.30), rgba(15,30,56,.96))",
    border: "rgba(34,197,94,.40)",
    glow: "rgba(34,197,94,.16)",
    lightBg: "#E2F1E7",
    lightBorder: "#B9DDC6",
    lightGlow: "rgba(21,128,61,.10)",
    Icon: Wallet,
  },
  {
    bg: "linear-gradient(135deg, rgba(14,165,233,.30), rgba(15,30,56,.96))",
    border: "rgba(14,165,233,.40)",
    glow: "rgba(14,165,233,.16)",
    lightBg: "#DCEEFE",
    lightBorder: "#B7DDF7",
    lightGlow: "rgba(2,132,199,.10)",
    Icon: Home,
  },
  {
    bg: "linear-gradient(135deg, rgba(250,204,21,.28), rgba(15,30,56,.96))",
    border: "rgba(250,204,21,.40)",
    glow: "rgba(250,204,21,.14)",
    lightBg: "#FFF4D9",
    lightBorder: "#F3DCA2",
    lightGlow: "rgba(180,83,9,.10)",
    Icon: Sun,
  },
  {
    bg: "linear-gradient(135deg, rgba(249,115,22,.30), rgba(15,30,56,.96))",
    border: "rgba(249,115,22,.40)",
    glow: "rgba(249,115,22,.16)",
    lightBg: "#FCE7DA",
    lightBorder: "#F4C1A5",
    lightGlow: "rgba(234,88,12,.10)",
    Icon: Zap,
  },
]

const OTHER_AIDES_ICONS = {
  gardeEnfants: Baby,
  bonsAlimentaires: ShoppingBasket,
  mobilite: Bus,
  microcredit: Coins,
}

const AIDE_LINKS = {
  rsa: "https://www.caf.fr/allocataires/aides-et-demarches/mes-demarches",
  apl: "https://www.caf.fr/allocataires/aides-et-demarches/mes-demarches",
  chequeEnergie: "https://chequeenergie.gouv.fr/",
  aideEnergie:
    "https://www.regionreunion.com/aides-services/article/energie-dispositifs-region-reunion-finances-par-l-union-europeenne",
}

const OTHER_AIDES_LINKS = {
  gardeEnfants:
    "https://www.caf.fr/allocataires/aides-et-demarches/droits-et-prestations/vie-personnelle/le-complement-de-libre-choix-du-mode-de-garde-cmg",
  bonsAlimentaires:
    "https://www.service-public.fr/particuliers/vosdroits/N19804",
  mobilite: "https://www.departement974.fr/aide/aide-r-mobilite",
  microcredit:
    "https://www.banque-france.fr/fr/a-votre-service/particuliers/annuaire-microcredit",
}

const CATEGORY_COLORS = {
  emploi: "#38BDF8",
  logement: "#22C55E",
  famille: "#F97316",
  scolarite: "#A78BFA",
  etudiant: "#A78BFA",
  energie: "#FCD34D",
  mobilite: "#23D3D6",
  transport: "#23D3D6",
  ccas: "#FB7185",
  sante: "#22C55E",
  handicap: "#A78BFA",
  retraite: "#FCD34D",
  social: "#FB7185",
  entreprise: "#F97316",
}

const SUIVI_STATUSES = [
  {
    value: "a_preparer",
    fr: "À préparer",
    kr: "Pou préparé",
    icon: "🟡",
    color: COLORS.yellow,
    progress: 20,
  },
  {
    value: "envoyee",
    fr: "Demande envoyée",
    kr: "Demande envoyé",
    icon: "🔵",
    color: COLORS.cyan,
    progress: 45,
  },
  {
    value: "en_attente",
    fr: "En attente",
    kr: "En attente",
    icon: "🟠",
    color: COLORS.accent,
    progress: 65,
  },
  {
    value: "obtenue",
    fr: "Obtenue",
    kr: "Obtenu",
    icon: "🟢",
    color: COLORS.green,
    progress: 100,
  },
  {
    value: "refusee",
    fr: "Refusée",
    kr: "Refusé",
    icon: "🔴",
    color: COLORS.red,
    progress: 0,
  },
]

const ACTIVE_HIDE_STATUSES = ["envoyee", "en_attente", "obtenue"]

function cleanValue(value) {
  if (value === null || value === undefined) return ""
  return String(value).trim()
}

function getLocalizedValue(primary, fallback = "") {
  const value = cleanValue(primary)
  return value || cleanValue(fallback)
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function getCategoryColor(category) {
  const key = normalizeText(category)
  return CATEGORY_COLORS[key] || COLORS.accent
}

function getAideAmountLabel(aide) {
  if (aide?.montant) return aide.montant

  const min = Number(aide?.montant_min)
  const max = Number(aide?.montant_max)

  const hasMin = Number.isFinite(min) && min > 0
  const hasMax = Number.isFinite(max) && max > 0

  if (hasMin && hasMax && min !== max) return `${min.toFixed(0)} à ${max.toFixed(0)} €`
  if (hasMax) return `Jusqu’à ${max.toFixed(0)} €`
  if (hasMin) return `À partir de ${min.toFixed(0)} €`

  return "À vérifier"
}

function getConfidenceFromScore(score) {
  const value = Number(score || 0)
  if (value >= 90) return "tres_pertinent"
  if (value >= 75) return "probable"
  return "a_verifier"
}

function normalizeAideFromDb(row = {}) {
  const category = normalizeText(row.categorie || row.category || "aide")
  const color = getCategoryColor(category)

  return {
    ...row,
    id: `db_${row.id}`,
    dbId: row.id,
    label: row.nom,
    label_kr: row.nom_kreol,
    title: row.nom,
    title_kr: row.nom_kreol,
    description: row.description_fr || row.description,
    description_kr: row.description_kreol,
    demarches: row.demarches_fr,
    demarches_kr: row.demarches_kreol,
    category,
    color,
    montant: getAideAmountLabel(row),
    officialUrl: row.lien || row.lien_officiel,
    confidence: getConfidenceFromScore(row.score_priorite),
    isDbAide: true,
  }
}

function getAideLink(aide) {
  if (aide?.officialUrl) return aide.officialUrl
  if (aide?.lien) return aide.lien
  if (aide?.lien_officiel) return aide.lien_officiel

  const normalizedLabel = `${aide?.id || ""} ${aide?.label || ""} ${aide?.title || ""} ${aide?.nom || ""}`.toLowerCase()

  if (normalizedLabel.includes("rsa")) return AIDE_LINKS.rsa
  if (normalizedLabel.includes("apl")) return AIDE_LINKS.apl
  if (normalizedLabel.includes("chèque") || normalizedLabel.includes("cheque")) return AIDE_LINKS.chequeEnergie
  if (normalizedLabel.includes("énergie") || normalizedLabel.includes("energie")) return AIDE_LINKS.aideEnergie

  return "https://www.service-public.fr/particuliers/vosdroits/N19804"
}

function getAideTitle(aide, isKreol) {
  if (isKreol) {
    return (
      getLocalizedValue(aide?.nom_kreol) ||
      getLocalizedValue(aide?.label_kr) ||
      getLocalizedValue(aide?.title_kr) ||
      getLocalizedValue(aide?.label) ||
      getLocalizedValue(aide?.title) ||
      getLocalizedValue(aide?.nom) ||
      "Éd"
    )
  }

  return (
    getLocalizedValue(aide?.label) ||
    getLocalizedValue(aide?.title) ||
    getLocalizedValue(aide?.nom) ||
    "Aide"
  )
}

function getAideDescription(aide, isKreol) {
  if (isKreol) {
    return (
      getLocalizedValue(aide?.description_kreol) ||
      getLocalizedValue(aide?.description_kr) ||
      getLocalizedValue(aide?.description_fr) ||
      getLocalizedValue(aide?.description) ||
      "Éd à vérifié selon out profil ek out sitiasyon."
    )
  }

  return (
    getLocalizedValue(aide?.description_fr) ||
    getLocalizedValue(aide?.description) ||
    "Aide à vérifier selon votre profil et votre situation."
  )
}

function getAideDemarches(aide, isKreol) {
  if (isKreol) {
    return (
      getLocalizedValue(aide?.demarches_kreol) ||
      getLocalizedValue(aide?.demarches_kr) ||
      getLocalizedValue(aide?.demarches_fr) ||
      getLocalizedValue(aide?.demarches) ||
      ""
    )
  }

  return getLocalizedValue(aide?.demarches_fr) || getLocalizedValue(aide?.demarches) || ""
}

function getAideCategoryLabel(aide, isKreol) {
  const category = String(aide?.category || "").toLowerCase()

  const fr = {
    emploi: "💼 Emploi & revenus",
    logement: "🏠 Logement",
    famille: "👨‍👩‍👧‍👦 Famille",
    scolarite: "🎓 Scolarité",
    etudiant: "🎓 Étudiants",
    energie: "⚡ Énergie",
    mobilite: "🚗 Mobilité",
    transport: "🚌 Transport",
    ccas: "🏛️ Commune / CCAS",
    sante: "💊 Santé",
    handicap: "♿ Handicap",
    social: "🤝 Social",
  }

  const kr = {
    emploi: "💼 Travay & revenus",
    logement: "🏠 Kaz",
    famille: "👨‍👩‍👧‍👦 Fami",
    scolarite: "🎓 Lékol",
    etudiant: "🎓 Étudiant",
    energie: "⚡ Énerzi",
    mobilite: "🚗 Déplasman",
    transport: "🚌 Transport",
    ccas: "🏛️ Komin / CCAS",
    sante: "💊 Santé",
    handicap: "♿ Handicap",
    social: "🤝 Social",
  }

  return isKreol ? kr[category] || "💡 Éd à vérifié" : fr[category] || "💡 Aide à vérifier"
}

function getConfidenceLabel(aide, isKreol) {
  const confidence = String(aide?.confidence || "").toLowerCase()

  if (confidence === "tres_pertinent") return isKreol ? "Très pertinent" : "Très pertinent"
  if (confidence === "probable") return isKreol ? "Probable" : "Probable"
  return isKreol ? "À vérifier" : "À vérifier"
}

function openExternalLink(url) {
  window.open(url, "_blank", "noopener,noreferrer")
}

function getLanguageKey(t) {
  if (typeof t !== "function") return "fr"
  return t("nav", "dashboard") || "fr"
}

function isKreolLang(t) {
  return t?.("nav", "dashboard") === "Tablo débor"
}

function getStatus(statut, isKreol) {
  const found = SUIVI_STATUSES.find(item => item.value === statut) || SUIVI_STATUSES[0]
  return {
    ...found,
    label: isKreol ? found.kr : found.fr,
  }
}

function formatDate(value) {
  if (!value) return ""
  return new Date(value).toLocaleDateString("fr-FR")
}

function createLocalCcasAides(profile = {}) {
  const commune = profile?.commune || ""

  if (!commune) return []

  return [
    {
      id: `ccas_${normalizeText(commune).replace(/\s+/g, "_")}`,
      label: `CCAS ${commune} - aide d’urgence`,
      label_kr: `CCAS ${commune} - éd urgence`,
      montant: "À vérifier en mairie",
      color: "#FB7185",
      category: "ccas",
      target_profiles: ["commune", "faibles_revenus", "famille", "logement"],
      officialUrl: "https://www.service-public.fr/particuliers/vosdroits/N19804",
      description: `Aide à vérifier directement auprès du CCAS ou de la mairie de ${commune}, selon votre situation familiale et financière.`,
      description_kr: `Éd pou vérifié dirèkt kot CCAS ou mairie ${commune}, selon out sitiasyon famiyal ek finansyèr.`,
      organisme: `CCAS / Mairie de ${commune}`,
      confidence: "tres_pertinent",
      isLocalCcas: true,
    },
  ]
}

function shouldShowAide(aide, profile = {}) {
  const id = String(aide?.id || "")
  const category = String(aide?.category || "")
  const enfants = Number(profile?.nombre_enfants || 0)
  const logement = normalizeText(profile?.logement || profile?.situation_logement)
  const situationPro = normalizeText(profile?.situation_professionnelle)
  const situationFamiliale = normalizeText(profile?.situation_familiale)

  const hasCommune = Boolean(profile?.commune)
  const isStudent = Boolean(profile?.etudiant)
  const isRetired = Boolean(profile?.retraite)
  const hasDisability = Boolean(profile?.handicap)
  const hasCaf = Boolean(profile?.allocataire_caf)
  const hasVehicle = Boolean(profile?.vehicule_personnel || profile?.permis_conduire)
  const isJobSeeker =
    Boolean(profile?.demandeur_emploi) ||
    situationPro === "demandeur_emploi" ||
    situationPro.includes("demandeur")

  if (aide?.isDbAide) {
    if (aide.besoin_enfant && enfants <= 0) return false
    if (aide.besoin_handicap && !hasDisability) return false
    if (aide.besoin_etudiant && !isStudent) return false
    if (aide.besoin_retraite && !isRetired) return false
    if (aide.besoin_demandeur_emploi && !isJobSeeker) return false
    if (aide.besoin_allocataire_caf && !hasCaf) return false
    if (aide.besoin_locataire && logement !== "locataire") return false
    if (aide.besoin_proprietaire && logement !== "proprietaire") return false
  }

  const scolaireIds = [
    "ars",
    "bourse_college",
    "bourse_lycee",
    "bourse_merite",
    "fonds_social_collegien",
    "fonds_social_lyceen",
    "fonds_social_cantine",
    "prime_internat",
    "aide_cantine_commune",
  ]

  const etudiantIds = [
    "ares_etudiant",
    "api_etudiant",
    "arrpe_etudiant",
    "aspm_etudiant",
    "atcm_etudiant",
  ]

  const logementIds = ["apl"]
  const handicapIds = ["aah", "pch"]
  const retraiteIds = ["aspa", "apa", "aide_menagere"]

  if (scolaireIds.includes(id)) return enfants > 0
  if (etudiantIds.includes(id) || category === "etudiant") return isStudent
  if (logementIds.includes(id)) return logement === "locataire"
  if (handicapIds.includes(id)) return hasDisability
  if (retraiteIds.includes(id)) return isRetired

  if (category === "ccas") return hasCommune
  if (category === "famille") return enfants > 0 || situationFamiliale === "parent_isole" || hasCaf
  if (category === "mobilite") return hasVehicle || situationPro === "demandeur_emploi"
  if (category === "logement") return logement === "locataire" || logement === "proprietaire"
  if (category === "energie") return true
  if (category === "emploi") return true

  return true
}

function sortAidesByRelevance(aides = [], profile = {}) {
  const enfants = Number(profile?.nombre_enfants || 0)
  const logement = normalizeText(profile?.logement || profile?.situation_logement)
  const isStudent = Boolean(profile?.etudiant)
  const hasCommune = Boolean(profile?.commune)

  return [...aides].sort((a, b) => {
    const score = aide => {
      let value = 0

      value += Number(aide?.score_priorite || 0)

      if (aide.isLocalCcas) value += 100
      if (aide.confidence === "tres_pertinent") value += 40
      if (aide.confidence === "probable") value += 25
      if (aide.category === "scolarite" && enfants > 0) value += 45
      if (aide.category === "etudiant" && isStudent) value += 45
      if (aide.category === "logement" && logement === "locataire") value += 40
      if (aide.category === "ccas" && hasCommune) value += 35
      if (aide.category === "emploi") value += 20
      if (aide.category === "energie") value += 15

      return value
    }

    return score(b) - score(a)
  })
}

function normalizeDemarche(row = {}) {
  const aide = row.aides_reunion || {}

  return {
    ...row,
    status: row.statut || "a_preparer",
    title: aide.nom || row.aide_nom || "Aide",
    title_kr: aide.nom_kreol || aide.nom || row.aide_nom || "Éd",
    description_fr: aide.description_fr || aide.description || "",
    description_kr: aide.description_kreol || "",
    demarches_fr: aide.demarches_fr || row.demarches_fr || "",
    demarches_kr: aide.demarches_kreol || row.demarches_kreol || "",
    amountLabel: getAideAmountLabel(aide),
    amountObtained: row.montant_obtenu || row.amount_obtained || "",
    documents: Array.isArray(row.documents) ? row.documents : [],
    notes: row.notes || "",
    dateLimit: row.date_limite || row.deadline || "",
    category: aide.categorie || "aide",
    color: getCategoryColor(aide.categorie || "aide"),
    aide,
  }
}

export default function AidesPage({ isMobile, t, isPremium, isPremiumPlus = false, user }) {
  const { themeName } = useTheme()
  const languageKey = getLanguageKey(t)
  const isKreol = isKreolLang(t)
  const isLightTheme = themeName === "light"

  const [profile, setProfile] = useState(null)
  const [dbAides, setDbAides] = useState([])
  const [loadingAides, setLoadingAides] = useState(true)
  const [demarches, setDemarches] = useState([])
  const [loadingDemarches, setLoadingDemarches] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [errorMessage, setErrorMessage] = useState("")

  const demarchesByAideId = useMemo(() => {
    const map = new Map()
    demarches.forEach(demarche => {
      if (demarche?.aide_id) map.set(Number(demarche.aide_id), demarche)
    })
    return map
  }, [demarches])

  const profileReady = Boolean(profile)
  const localCcasAides = createLocalCcasAides(profile || {})
  const normalizedDbAides = dbAides.map(normalizeAideFromDb)
  const baseAides = normalizedDbAides.length > 0 ? normalizedDbAides : AIDES
  const allAides = [...localCcasAides, ...baseAides]

  const filteredAides = sortAidesByRelevance(
    allAides.filter(aide => {
      if (!shouldShowAide(aide, profile || {})) return false

      const demarche = aide?.dbId ? demarchesByAideId.get(Number(aide.dbId)) : null

      if (demarche && ACTIVE_HIDE_STATUSES.includes(demarche.status)) return false

      return true
    }),
    profile || {}
  )

  const totalDemarches = demarches.length
  const nbAPreparer = demarches.filter(d => d.status === "a_preparer").length
  const nbEnvoyees = demarches.filter(d => d.status === "envoyee").length
  const nbAttente = demarches.filter(d => d.status === "en_attente").length
  const nbObtenues = demarches.filter(d => d.status === "obtenue").length
  const nbRefusees = demarches.filter(d => d.status === "refusee").length

  const progression =
    totalDemarches === 0
      ? 0
      : Math.round(
          demarches.reduce((sum, demarche) => {
            return sum + getStatus(demarche.status, isKreol).progress
          }, 0) / totalDemarches
        )

  useEffect(() => {
    fetchProfile()
    fetchAidesReunion()
    fetchDemarches()
  }, [user?.id])

  async function fetchAidesReunion() {
    setLoadingAides(true)

    const { data, error } = await supabase
      .from("aides_reunion")
      .select(`
        id,
        nom,
        nom_kreol,
        description,
        description_fr,
        description_kreol,
        demarches_fr,
        demarches_kreol,
        montant_min,
        montant_max,
        categorie,
        condition_logement,
        condition_profession,
        condition_famille,
        revenus_min,
        revenus_max,
        commune,
        lien,
        age_min,
        age_max,
        besoin_enfant,
        besoin_handicap,
        besoin_etudiant,
        besoin_retraite,
        besoin_demandeur_emploi,
        besoin_locataire,
        besoin_proprietaire,
        besoin_allocataire_caf,
        score_priorite
      `)
      .order("score_priorite", { ascending: false })

    if (error) {
      console.error("Erreur chargement aides réunion:", error)
      setDbAides([])
    } else {
      setDbAides(data || [])
    }

    setLoadingAides(false)
  }

  async function fetchProfile() {
    if (!user?.id) {
      setProfile(null)
      return
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()

    if (error) {
      console.error("Erreur chargement profil aides:", error)
      setProfile(null)
      return
    }

    setProfile(data || null)
  }

  async function fetchDemarches() {
    if (!user?.id) {
      setDemarches([])
      setLoadingDemarches(false)
      return
    }

    setLoadingDemarches(true)

    const { data, error } = await supabase
      .from("user_aide_demarche")
      .select(`
        id,
        user_id,
        aide_id,
        statut,
        created_at,
        updated_at,
        aides_reunion (
          id,
          nom,
          nom_kreol,
          categorie,
          description,
          description_fr,
          description_kreol,
          demarches_fr,
          demarches_kreol,
          montant_min,
          montant_max
        )
      `)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })

    if (error) {
      console.error("Erreur chargement démarches:", error)
      setDemarches([])
    } else {
      setDemarches((data || []).map(normalizeDemarche))
    }

    setLoadingDemarches(false)
  }

  async function addAideToDemarches(aide) {
    if (!user?.id) {
      alert(isKreol ? "Connecte aou pou ajout l’éd dann démarches." : "Connectez-vous pour ajouter cette aide à vos démarches.")
      return
    }

    if (!aide?.dbId) {
      alert(isKreol ? "Cette éd doit être vérifiée directement." : "Cette aide doit être vérifiée directement.")
      return
    }

    setSavingId(aide.id)
    setErrorMessage("")

    const { data, error } = await supabase
      .from("user_aide_demarche")
      .insert({
        user_id: user.id,
        aide_id: aide.dbId,
        statut: "a_preparer",
      })
      .select(`
        id,
        user_id,
        aide_id,
        statut,
        created_at,
        updated_at,
        aides_reunion (
          id,
          nom,
          nom_kreol,
          categorie,
          description,
          description_fr,
          description_kreol,
          demarches_fr,
          demarches_kreol,
          montant_min,
          montant_max
        )
      `)
      .single()

    setSavingId(null)

   if (error) {
  console.error("Erreur ajout démarche:", error)
  
  if (error.code === "23505") {
    await fetchDemarches()
    return
  }

  setErrorMessage(
    isKreol
      ? "Impossible d’ajout cette éd dann démarches."
      : "Impossible d’ajouter cette aide à vos démarches."
  )
  return
}

    setDemarches(prev => [normalizeDemarche(data), ...prev])
  }

  async function updateDemarcheStatus(demarcheId, statut) {
    if (!demarcheId) return

    setSavingId(demarcheId)
    setErrorMessage("")

    const { data, error } = await supabase
      .from("user_aide_demarche")
      .update({ statut })
      .eq("id", demarcheId)
      .select(`
        id,
        user_id,
        aide_id,
        statut,
        created_at,
        updated_at,
        aides_reunion (
          id,
          nom,
          nom_kreol,
          categorie,
          description,
          description_fr,
          description_kreol,
          demarches_fr,
          demarches_kreol,
          montant_min,
          montant_max
        )
      `)
      .single()

    setSavingId(null)

    if (error) {
      console.error("Erreur mise à jour statut:", error)
      setErrorMessage(isKreol ? "Erreur pendant la mise à jour." : "Erreur pendant la mise à jour.")
      return
    }

    setDemarches(prev =>
      prev.map(item => (item.id === demarcheId ? normalizeDemarche(data) : item))
    )
  }

  async function deleteDemarche(id) {
    const confirmText = isKreol ? "Supprim cette démarche ?" : "Supprimer cette démarche ?"

    if (!window.confirm(confirmText)) return

    setSavingId(id)

    const { error } = await supabase
      .from("user_aide_demarche")
      .delete()
      .eq("id", id)

    setSavingId(null)

    if (error) {
      console.error("Erreur suppression démarche:", error)
      setErrorMessage(isKreol ? "Erreur pendant suppression." : "Erreur pendant la suppression.")
      return
    }

    setDemarches(prev => prev.filter(item => item.id !== id))
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          background: isLightTheme
            ? "linear-gradient(135deg, #FCE7DA 0%, #DCEEFE 56%, #FFFFFF 100%)"
            : "linear-gradient(135deg, rgba(249,115,22,.32), rgba(14,165,233,.20), rgba(15,30,56,.96))",
          border: isLightTheme ? "1px solid #E6EAF0" : "1px solid rgba(249,115,22,.35)",
          borderRadius: 24,
          padding: isMobile ? 20 : 30,
          boxShadow: isLightTheme ? "0 16px 34px rgba(20,32,51,.08)" : "0 18px 40px rgba(0,0,0,.22)",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -20,
            top: -26,
            fontSize: 128,
            opacity: 0.055,
            transform: "rotate(-14deg)",
            pointerEvents: "none",
          }}
        >
          🌴
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: isLightTheme ? "#FFF4D9" : "rgba(249,115,22,.15)",
              border: isLightTheme ? "1px solid #F3DCA2" : "1px solid rgba(249,115,22,.35)",
              borderRadius: 999,
              padding: "7px 13px",
              color: isLightTheme ? "#EA580C" : "#FDBA74",
              fontSize: 12,
              fontWeight: 800,
              marginBottom: 14,
            }}
          >
            <Sparkles size={15} />
            {isKreol ? "Suivi bann démarches" : "Suivi des démarches"}
          </div>

          <h3
            style={{
              margin: "0 0 8px",
              fontSize: isMobile ? 24 : 30,
              color: COLORS.text,
              fontFamily: "'Baloo 2', 'DM Serif Display', cursive",
              fontWeight: 800,
              letterSpacing: ".2px",
            }}
          >
            {isKreol ? "🏛️ Mes éd & démarches" : "🏛️ Mes aides & démarches"}
          </h3>

          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: COLORS.muted,
              lineHeight: 1.7,
              maxWidth: 760,
            }}
          >
            {isKreol
              ? "BudgetKazPei affiche bann aides selon out profil, out komin, out marmay ek out sitiasyon. Ou peut ajout zot dann out démarches pou suivre zot."
              : "BudgetKazPei affiche les aides selon votre profil, votre commune, vos enfants et votre situation. Vous pouvez les ajouter à vos démarches pour les suivre."}
          </p>
        </div>
      </section>

      {errorMessage && (
        <AlertBox color={COLORS.red} text={`⚠️ ${errorMessage}`} />
      )}

      <section
        style={{
          background: isLightTheme
            ? "linear-gradient(135deg, #E2F1E7 0%, #DCEEFE 70%, #FFFFFF 100%)"
            : "linear-gradient(135deg, rgba(35,211,214,.16), rgba(15,30,56,.96))",
          border: isLightTheme ? "1px solid #C8DEE5" : "1px solid rgba(35,211,214,.28)",
          borderRadius: 22,
          padding: isMobile ? 18 : 22,
          boxShadow: isLightTheme ? "0 14px 30px rgba(20,32,51,.07)" : "0 14px 32px rgba(0,0,0,.16)",
        }}
      >
        <h3
          style={{
            margin: "0 0 14px",
            fontSize: 18,
            color: COLORS.text,
            fontFamily: "'Baloo 2', sans-serif",
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <ClipboardCheck size={20} />
          {isKreol ? "Mes démarches en cours" : "Mes démarches en cours"}
        </h3>

        {demarches.length > 0 && (
          <div
            style={{
              background: isLightTheme ? "#FFFFFF" : "rgba(255,255,255,.04)",
              border: isLightTheme ? "1px solid #E6EAF0" : "1px solid rgba(255,255,255,.08)",
              borderRadius: 16,
              padding: 16,
              marginBottom: 14,
              boxShadow: isLightTheme ? "0 10px 22px rgba(20,32,51,.05)" : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 10,
                color: COLORS.text,
                fontWeight: 900,
                fontSize: 14,
              }}
            >
              <span>📋 {totalDemarches} {isKreol ? "démarche(s)" : "démarche(s)"}</span>
              <span>{progression}%</span>
            </div>

            <div
              style={{
                height: 10,
                background: isLightTheme ? "#E6EAF0" : "rgba(255,255,255,.08)",
                borderRadius: 999,
                overflow: "hidden",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  width: `${progression}%`,
                  height: "100%",
                  background: `linear-gradient(90deg, ${COLORS.green}, ${COLORS.cyan})`,
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                fontSize: 12,
                color: COLORS.muted,
                lineHeight: 1.6,
              }}
            >
              <span>🟡 {nbAPreparer} {isKreol ? "pou préparé" : "à préparer"}</span>
              <span>🔵 {nbEnvoyees} {isKreol ? "envoyé" : "envoyée(s)"}</span>
              <span>🟠 {nbAttente} {isKreol ? "en attente" : "en attente"}</span>
              <span>🟢 {nbObtenues} {isKreol ? "obtenu" : "obtenue(s)"}</span>
              <span>🔴 {nbRefusees} {isKreol ? "refusé" : "refusée(s)"}</span>
            </div>
          </div>
        )}

        {loadingDemarches ? (
          <div style={{ color: COLORS.muted, fontSize: 13 }}>
            {isKreol ? "Chargement..." : "Chargement..."}
          </div>
        ) : demarches.length === 0 ? (
          <div
            style={{
              background: isLightTheme ? "#FFFFFF" : "rgba(255,255,255,.045)",
              border: isLightTheme ? "1px solid #E6EAF0" : "1px solid rgba(255,255,255,.08)",
              borderRadius: 16,
              padding: 16,
              color: COLORS.muted,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {isKreol
              ? "Aucune démarche pou le moman. Clique su “Ajout dann mon bann démarches” su une éd recommandée."
              : "Aucune démarche pour le moment. Cliquez sur “Ajouter à mes démarches” sur une aide recommandée."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {demarches.map(demarche => {
              const status = getStatus(demarche.status, isKreol)
              const title = isKreol
                ? demarche.title_kr || demarche.title || "Démarche"
                : demarche.title || "Démarche"

              return (
                <div
                  key={demarche.id}
                  style={{
                    background: isLightTheme
                      ? "linear-gradient(135deg, #FFFFFF 0%, #F8FBFF 100%)"
                      : "rgba(255,255,255,.045)",
                    border: isLightTheme ? "1px solid #E6EAF0" : "1px solid rgba(255,255,255,.08)",
                    borderRadius: 16,
                    padding: 16,
                    boxShadow: isLightTheme ? "0 10px 22px rgba(20,32,51,.05)" : "none",
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr auto auto",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <div>
                    <div style={{ color: COLORS.text, fontWeight: 900, fontSize: 16, marginBottom: 6 }}>
                      {title}
                    </div>

                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: `${status.color}18`,
                        border: `1px solid ${status.color}44`,
                        color: getReadableAccent(status.color),
                        borderRadius: 999,
                        padding: "4px 9px",
                        fontSize: 11,
                        fontWeight: 900,
                        marginBottom: 10,
                      }}
                    >
                      {status.icon} {status.label}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                        gap: 8,
                        marginTop: 6,
                      }}
                    >
                      <MiniInfoBox
                        label={isKreol ? "Montan estimé" : "Montant estimé"}
                        value={demarche.amountLabel || "À vérifier"}
                        color={COLORS.yellow}
                        icon="💰"
                      />
                      <MiniInfoBox
                        label={isKreol ? "Gain obtenu" : "Montant obtenu"}
                        value={demarche.amountObtained ? `${demarche.amountObtained} €` : "—"}
                        color={COLORS.green}
                        icon="✅"
                      />
                      <MiniInfoBox
                        label={isKreol ? "Date ajout" : "Date d’ajout"}
                        value={formatDate(demarche.created_at) || "—"}
                        color={COLORS.cyan}
                        icon="📅"
                      />
                    </div>

                    {demarche.updated_at && (
                      <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 8 }}>
                        🔄 {isKreol ? "Miz à jour" : "Mis à jour"} {formatDate(demarche.updated_at)}
                      </div>
                    )}

                    {(demarche.demarches_fr || demarche.demarches_kr) && (
                      <div
                        style={{
                          marginTop: 10,
                          background: isLightTheme ? "#DCEEFE" : "rgba(35,211,214,.08)",
                          border: isLightTheme ? "1px solid #B7DDF7" : "1px solid rgba(35,211,214,.18)",
                          borderRadius: 12,
                          padding: 10,
                          color: COLORS.muted,
                          fontSize: 12,
                          lineHeight: 1.5,
                        }}
                      >
                        <strong style={{ color: getReadableAccent(COLORS.cyan) }}>
                          {isKreol ? "Étapes :" : "Étapes :"}
                        </strong>{" "}
                        {isKreol ? demarche.demarches_kr || demarche.demarches_fr : demarche.demarches_fr}
                      </div>
                    )}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                        gap: 8,
                        marginTop: 10,
                      }}
                    >
                      <InfoPanel
                        title={isKreol ? "📄 Documents" : "📄 Documents"}
                        text={
                          demarche.documents?.length
                            ? demarche.documents.join(" • ")
                            : isKreol
                              ? "À compléter plus tard"
                              : "À compléter plus tard"
                        }
                      />
                      <InfoPanel
                        title={isKreol ? "📝 Notes" : "📝 Notes"}
                        text={demarche.notes || (isKreol ? "Aucune note pour le moment" : "Aucune note pour le moment")}
                      />
                    </div>

                    <DemarchePremiumTools
                      isKreol={isKreol}
                      isPremiumPlus={isPremiumPlus}
                    />
                  </div>

                  <select
                    value={demarche.status || "a_preparer"}
                    onChange={e => updateDemarcheStatus(demarche.id, e.target.value)}
                    disabled={savingId === demarche.id}
                    style={{
                      background: COLORS.card,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 10,
                      padding: "9px 11px",
                      color: COLORS.text,
                      fontSize: 12,
                      fontFamily: "inherit",
                    }}
                  >
                    {SUIVI_STATUSES.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.icon} {isKreol ? option.kr : option.fr}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => deleteDemarche(demarche.id)}
                    disabled={savingId === demarche.id}
                    style={{
                      background: "rgba(251,113,133,.10)",
                      border: "1px solid rgba(251,113,133,.28)",
                      borderRadius: 10,
                      color: COLORS.red,
                      padding: "9px 11px",
                      cursor: savingId === demarche.id ? "not-allowed" : "pointer",
                      fontWeight: 900,
                      fontFamily: "inherit",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      opacity: savingId === demarche.id ? 0.6 : 1,
                    }}
                  >
                    <Trash2 size={14} />
                    {isMobile ? "" : isKreol ? "Supprim" : "Supprimer"}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section
        style={{
          background: isLightTheme
            ? "linear-gradient(135deg, #FFF4D9 0%, #FCE7DA 72%, #FFFFFF 100%)"
            : "linear-gradient(135deg, rgba(252,211,77,.14), rgba(249,115,22,.08), rgba(15,30,56,.96))",
          border: isLightTheme ? "1px solid #F3DCA2" : "1px solid rgba(252,211,77,.30)",
          borderRadius: 22,
          padding: isMobile ? 18 : 22,
        }}
      >
        <div style={{ color: getReadableAccent(COLORS.yellow), fontWeight: 900, fontSize: 16, marginBottom: 6 }}>
          {isKreol ? "🎯 Bann aides selon out profil" : "🎯 Aides recommandées selon votre profil"}
        </div>
        <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.5 }}>
          {profileReady
            ? isKreol
              ? `Komin : ${profile?.commune || "pa renseignée"} · Marmay : ${profile?.nombre_enfants || 0}`
              : `Commune : ${profile?.commune || "non renseignée"} · Enfants : ${profile?.nombre_enfants || 0}`
            : isKreol
              ? "Complète out profil pou gagn bann recommandations pli précises."
              : "Complétez votre profil pour obtenir des recommandations plus précises."}
        </div>
      </section>

      {loadingAides ? (
        <AlertBox
          color={COLORS.cyan}
          text={isKreol ? "Chargement bann aides..." : "Chargement des aides..."}
        />
      ) : (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
            gap: 16,
          }}
        >
          {filteredAides.map((aide, index) => {
            const theme = CARD_VARIANTS[index % CARD_VARIANTS.length]
            const Icon = theme.Icon
            const title = getAideTitle(aide, isKreol)
            const description = getAideDescription(aide, isKreol)
            const demarchesLabel = getAideDemarches(aide, isKreol)
            const categoryLabel = getAideCategoryLabel(aide, isKreol)
            const confidenceLabel = getConfidenceLabel(aide, isKreol)
            const suivi = aide?.dbId ? demarchesByAideId.get(Number(aide.dbId)) : null
            const status = suivi ? getStatus(suivi.status, isKreol) : null

            return (
              <article
                key={aide.id}
                style={{
                  position: "relative",
                  overflow: "hidden",
                  background: isLightTheme ? theme.lightBg : theme.bg,
                  border: `1px solid ${aide.isLocalCcas ? getReadableAccent(COLORS.yellow) : (isLightTheme ? theme.lightBorder : theme.border)}`,
                  borderRadius: 22,
                  padding: 22,
                  boxShadow: isLightTheme
                    ? `0 12px 26px rgba(20,32,51,.06), 0 0 22px ${theme.lightGlow}`
                    : `0 14px 32px rgba(0,0,0,.18), 0 0 28px ${theme.glow}`,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    right: -18,
                    top: -16,
                    width: 96,
                    height: 96,
                    borderRadius: 999,
                    background: isLightTheme ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.06)",
                    pointerEvents: "none",
                  }}
                />

                <div
                  style={{
                    position: "absolute",
                    right: 18,
                    top: 18,
                    opacity: 0.11,
                    pointerEvents: "none",
                  }}
                >
                  <Icon size={72} />
                </div>

                <div style={{ position: "relative", zIndex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                      marginBottom: 14,
                    }}
                  >
                    <h4
                      style={{
                        margin: 0,
                        fontSize: 18,
                        color: COLORS.text,
                        fontFamily: "'Baloo 2', sans-serif",
                        fontWeight: 800,
                      }}
                    >
                      {title}
                    </h4>

                    <span
                      style={{
                        fontSize: 10,
                        padding: "5px 10px",
                        borderRadius: 999,
                        background: `${aide.color}22`,
                        color: getReadableAccent(aide.color),
                        fontWeight: 900,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {confidenceLabel}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: 900,
                      color: getReadableAccent(aide.color),
                      fontFamily: "'Baloo 2', 'DM Serif Display', cursive",
                      lineHeight: 1,
                    }}
                  >
                    {getAideAmountLabel(aide)}
                  </div>

                  <p
                    style={{
                      margin: "8px 0 0",
                      fontSize: 13,
                      color: isLightTheme ? "#526074" : "rgba(248,250,252,.68)",
                      fontWeight: 600,
                    }}
                  >
                    {categoryLabel}
                  </p>

                  <p
                    style={{
                      margin: "10px 0 0",
                      fontSize: 13,
                      color: isLightTheme ? "#526074" : "rgba(248,250,252,.72)",
                      fontWeight: 500,
                      lineHeight: 1.5,
                      maxWidth: 620,
                    }}
                  >
                    {description}
                  </p>

                  {demarchesLabel && (
                    <div
                      style={{
                        marginTop: 10,
                        background: isLightTheme ? "#FFFFFF" : "rgba(255,255,255,.045)",
                        border: isLightTheme ? "1px solid #E6EAF0" : "1px solid rgba(255,255,255,.08)",
                        borderRadius: 12,
                        padding: 10,
                        color: isLightTheme ? "#526074" : "rgba(248,250,252,.78)",
                        fontSize: 12,
                        lineHeight: 1.5,
                      }}
                    >
                      <strong style={{ color: getReadableAccent(COLORS.cyan) }}>
                        {isKreol ? "Démarche :" : "Démarche :"}
                      </strong>{" "}
                      {demarchesLabel}
                    </div>
                  )}

                  {aide.organisme && (
                    <div
                      style={{
                        marginTop: 10,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: "rgba(35,211,214,.10)",
                        border: "1px solid rgba(35,211,214,.24)",
                        color: getReadableAccent(COLORS.cyan),
                        borderRadius: 999,
                        padding: "5px 9px",
                        fontSize: 11,
                        fontWeight: 900,
                      }}
                    >
                      🏛️ {aide.organisme}
                    </div>
                  )}

                  {status && (
                    <div
                      style={{
                        marginTop: 12,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        background: `${status.color}18`,
                        border: `1px solid ${status.color}44`,
                        color: status.color,
                        borderRadius: 999,
                        padding: "6px 10px",
                        fontSize: 12,
                        fontWeight: 900,
                      }}
                    >
                      {status.icon} {isKreol ? "Dann démarches :" : "Dans mes démarches :"} {status.label}
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: 16,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    {!status && aide?.dbId && (
                      <button
                        type="button"
                        onClick={() => addAideToDemarches(aide)}
                        disabled={savingId === aide.id}
                        style={{
                          background: savingId === aide.id ? "rgba(142,164,197,.45)" : COLORS.cyan,
                          border: "none",
                          borderRadius: 12,
                          padding: "9px 16px",
                          color: COLORS.card,
                          fontSize: 13,
                          cursor: savingId === aide.id ? "not-allowed" : "pointer",
                          fontFamily: "inherit",
                          fontWeight: 900,
                          boxShadow: "0 10px 20px rgba(0,0,0,.20)",
                        }}
                      >
                        {savingId === aide.id
                          ? isKreol ? "Ajout..." : "Ajout..."
                          : isKreol ? "Ajout dann mon bann démarches" : "Ajouter à mes démarches"}
                      </button>
                    )}

                    {status && !ACTIVE_HIDE_STATUSES.includes(status.value) && (
                      <select
                        value={status.value}
                        onChange={e => updateDemarcheStatus(suivi.id, e.target.value)}
                        disabled={savingId === suivi.id}
                        style={{
                          background: COLORS.card,
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: 12,
                          padding: "9px 11px",
                          color: COLORS.text,
                          fontSize: 12,
                          fontFamily: "inherit",
                        }}
                      >
                        {SUIVI_STATUSES.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.icon} {isKreol ? option.kr : option.fr}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      onClick={() => openExternalLink(getAideLink(aide))}
                      style={{
                        background: aide.color,
                        border: "none",
                        borderRadius: 12,
                        padding: "9px 16px",
                        color: "#fff",
                        fontSize: 13,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontWeight: 800,
                        boxShadow: "0 10px 20px rgba(0,0,0,.20)",
                      }}
                    >
                      {isKreol ? "Plus d’infos" : "Plus d’informations"} →
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      )}

      <section
        className="bkp-other-aides-card"
        style={{
          background: isLightTheme
            ? "linear-gradient(145deg, #E7F5FC 0%, #D7ECFA 52%, #F8FCFF 100%)"
            : "linear-gradient(135deg, rgba(124,58,237,.22), rgba(14,165,233,.15), rgba(15,30,56,.96))",
          border: isLightTheme ? "1px solid #A9D4EE" : "1px solid rgba(56,189,248,.30)",
          borderRadius: 22,
          padding: isMobile ? 18 : 22,
          boxShadow: isLightTheme
            ? "0 12px 28px rgba(3,105,161,.09)"
            : "0 14px 32px rgba(0,0,0,.16)",
        }}
      >
        <h3
          style={{
            margin: "0 0 16px",
            fontSize: 18,
            color: COLORS.text,
            fontFamily: "'Baloo 2', sans-serif",
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Landmark size={20} />
          {t("aides", "autresAides")}
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
            gap: 12,
          }}
        >
          {AUTRES_AIDES.map(aide => {
            const Icon = OTHER_AIDES_ICONS[aide.id] || SearchCheck

            return (
              <div
                key={aide.id}
                className="bkp-other-aides-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: 12,
                  minHeight: 76,
                  padding: "12px 13px",
                  borderRadius: 16,
                  background: isLightTheme ? "rgba(255,255,255,.82)" : "rgba(255,255,255,.045)",
                  border: isLightTheme ? "1px solid #C5DEEC" : "1px solid rgba(255,255,255,.08)",
                }}
              >
                <span
                  style={{
                    display: "grid",
                    gridTemplateColumns: "38px minmax(0, 1fr)",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 0,
                    fontSize: 14,
                    color: COLORS.text,
                    fontWeight: 700,
                    lineHeight: 1.35,
                  }}
                >
                  <span
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      background: isLightTheme ? "#CFE8FB" : "rgba(56,189,248,.11)",
                      border: isLightTheme ? "1px solid #8FC5E8" : "1px solid rgba(56,189,248,.20)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: isLightTheme ? "#0369A1" : "#7DD3FC",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={17} />
                  </span>

                  {t("aides", aide.key)}
                </span>

                <button
                  type="button"
                  className="bkp-other-aides-verify"
                  onClick={() =>
                    openExternalLink(
                      OTHER_AIDES_LINKS[aide.id] ||
                        "https://www.mesdroitssociaux.gouv.fr/"
                    )
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    borderRadius: 10,
                    width: 104,
                    minWidth: 104,
                    minHeight: 40,
                    padding: "8px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                    "--bkp-other-aides-button-bg": isLightTheme ? "#0369A1" : "rgba(56,189,248,.10)",
                    "--bkp-other-aides-button-hover": isLightTheme ? "#075985" : "rgba(56,189,248,.20)",
                    "--bkp-other-aides-button-active": isLightTheme ? "#0C4A6E" : "rgba(56,189,248,.28)",
                    "--bkp-other-aides-button-border": isLightTheme ? "#0369A1" : "rgba(56,189,248,.28)",
                    "--bkp-other-aides-button-text": isLightTheme ? "#FFFFFF" : "#7DD3FC",
                    "--bkp-other-aides-button-disabled-bg": isLightTheme ? "#E2E8F0" : "#334155",
                    "--bkp-other-aides-button-disabled-border": isLightTheme ? "#94A3B8" : "#64748B",
                    "--bkp-other-aides-button-disabled-text": isLightTheme ? "#475569" : "#E2E8F0",
                  }}
                >
                  <SearchCheck size={14} />
                  {t("aides", "check")}
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function MiniInfoBox({ label, value, color, icon }) {
  const { themeName } = useTheme()
  const isLightTheme = themeName === "light"
  const valueColor = getReadableAccent(color, themeName)

  return (
    <div
      style={{
        background: isLightTheme ? "#FFF4D9" : "rgba(10,22,40,.40)",
        border: isLightTheme ? "1px solid #F3DCA2" : "1px solid rgba(255,255,255,.08)",
        borderRadius: 12,
        padding: "9px 10px",
      }}
    >
      <div style={{ color: COLORS.muted, fontSize: 10.5, fontWeight: 900, marginBottom: 4 }}>
        {icon} {label}
      </div>
      <div style={{ color: valueColor, fontSize: 13, fontWeight: 900 }}>
        {value}
      </div>
    </div>
  )
}

function InfoPanel({ title, text }) {
  const { themeName } = useTheme()
  const isLightTheme = themeName === "light"

  return (
    <div
      style={{
        background: isLightTheme ? "#FFFFFF" : "rgba(10,22,40,.34)",
        border: isLightTheme ? "1px solid #E6EAF0" : "1px solid rgba(255,255,255,.07)",
        borderRadius: 12,
        padding: "9px 10px",
        minHeight: 58,
      }}
    >
      <div style={{ color: COLORS.text, fontSize: 12, fontWeight: 900, marginBottom: 5 }}>
        {title}
      </div>
      <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.45 }}>
        {text}
      </div>
    </div>
  )
}

function DemarchePremiumTools({ isKreol, isPremiumPlus }) {
  const { themeName } = useTheme()
  const isLightTheme = themeName === "light"
  const tools = [
    {
      icon: <FolderCheck size={14} />,
      label: isKreol ? "Prépar mon dossier" : "Préparer mon dossier",
    },
    {
      icon: <FileText size={14} />,
      label: isKreol ? "Génér courrier" : "Générer un courrier",
    },
    {
      icon: <Mail size={14} />,
      label: isKreol ? "Génér email" : "Générer un email",
    },
    {
      icon: <Scale size={14} />,
      label: isKreol ? "Prépar recours" : "Préparer un recours",
    },
    {
      icon: <HelpCircle size={14} />,
      label: isKreol ? "Comprann refus" : "Comprendre un refus",
    },
  ]

  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: isLightTheme ? "1px solid #E6EAF0" : "1px solid rgba(255,255,255,.08)",
      }}
    >
      <div
        style={{
          color: isPremiumPlus ? getReadableAccent(COLORS.purple, themeName) : getReadableAccent(COLORS.yellow, themeName),
          fontSize: 12,
          fontWeight: 900,
          marginBottom: 8,
        }}
      >
        {isPremiumPlus ? "✨ Premium+" : "🔒 Premium+"}{" "}
        {isKreol ? "Zouti pou démarche" : "Outils pour cette démarche"}
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {tools.map(tool => (
          <button
            key={tool.label}
            type="button"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: isPremiumPlus
                ? (isLightTheme ? "#EEE7FB" : "rgba(167,139,250,.12)")
                : (isLightTheme ? "#FFF4D9" : "rgba(252,211,77,.08)"),
              border: isPremiumPlus
                ? (isLightTheme ? "1px solid #D8CBF6" : "1px solid rgba(167,139,250,.25)")
                : (isLightTheme ? "1px solid #F3DCA2" : "1px solid rgba(252,211,77,.22)"),
              color: isPremiumPlus ? getReadableAccent(COLORS.purple, themeName) : getReadableAccent(COLORS.yellow, themeName),
              borderRadius: 999,
              padding: "7px 9px",
              cursor: "default",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 900,
            }}
          >
            {!isPremiumPlus && <Lock size={12} />}
            {tool.icon}
            {tool.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function AlertBox({ color, text }) {
  return (
    <div
      style={{
        background: `${color}14`,
        border: `1px solid ${color}44`,
        borderRadius: 12,
        color,
        padding: "10px 12px",
        fontSize: 12,
        fontWeight: 800,
        lineHeight: 1.45,
      }}
    >
      {text}
    </div>
  )
}
