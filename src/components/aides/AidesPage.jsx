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
} from "lucide-react"

import { supabase } from "../../services/supabase"
import { AIDES } from "../../data/categories"
import { AUTRES_AIDES } from "../../data/aides"
import AssistantAides from "./AssistantAides"

const COLORS = {
  text: "#F1F5F9",
  muted: "#8EA4C5",
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  yellow: "#FCD34D",
  cyan: "#23D3D6",
  green: "#22C55E",
  red: "#FB7185",
}

const CARD_VARIANTS = [
  {
    bg: "linear-gradient(135deg, rgba(34,197,94,.30), rgba(15,30,56,.96))",
    border: "rgba(34,197,94,.40)",
    glow: "rgba(34,197,94,.16)",
    Icon: Wallet,
  },
  {
    bg: "linear-gradient(135deg, rgba(14,165,233,.30), rgba(15,30,56,.96))",
    border: "rgba(14,165,233,.40)",
    glow: "rgba(14,165,233,.16)",
    Icon: Home,
  },
  {
    bg: "linear-gradient(135deg, rgba(250,204,21,.28), rgba(15,30,56,.96))",
    border: "rgba(250,204,21,.40)",
    glow: "rgba(250,204,21,.14)",
    Icon: Sun,
  },
  {
    bg: "linear-gradient(135deg, rgba(249,115,22,.30), rgba(15,30,56,.96))",
    border: "rgba(249,115,22,.40)",
    glow: "rgba(249,115,22,.16)",
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
    category: aide.categorie || "aide",
    color: getCategoryColor(aide.categorie || "aide"),
    aide,
  }
}

export default function AidesPage({ isMobile, t, isPremium, user }) {
  const languageKey = getLanguageKey(t)
  const isKreol = isKreolLang(t)

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
          description_kreol
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
          description_kreol
        )
      `)
      .single()

    setSavingId(null)

   if (error) {
  console.error("ERREUR AJOUT DEMARCHE =", error)
  alert(JSON.stringify(error, null, 2))

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
          description_kreol
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
          background:
            "linear-gradient(135deg, rgba(249,115,22,.32), rgba(14,165,233,.20), rgba(15,30,56,.96))",
          border: "1px solid rgba(249,115,22,.35)",
          borderRadius: 24,
          padding: isMobile ? 20 : 30,
          boxShadow: "0 18px 40px rgba(0,0,0,.22)",
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
              background: "rgba(249,115,22,.15)",
              border: "1px solid rgba(249,115,22,.35)",
              borderRadius: 999,
              padding: "7px 13px",
              color: "#FDBA74",
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

      <AssistantAides
        key={`assistant-aides-${languageKey}`}
        isPremium={isPremium}
        isMobile={isMobile}
        t={t}
        user={user}
      />

      {errorMessage && (
        <AlertBox color={COLORS.red} text={`⚠️ ${errorMessage}`} />
      )}

      <section
        style={{
          background:
            "linear-gradient(135deg, rgba(35,211,214,.16), rgba(15,30,56,.96))",
          border: "1px solid rgba(35,211,214,.28)",
          borderRadius: 22,
          padding: isMobile ? 18 : 22,
          boxShadow: "0 14px 32px rgba(0,0,0,.16)",
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
              background: "rgba(255,255,255,.04)",
              border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 16,
              padding: 16,
              marginBottom: 14,
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
                background: "rgba(255,255,255,.08)",
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
              background: "rgba(255,255,255,.045)",
              border: "1px solid rgba(255,255,255,.08)",
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
                    background: "rgba(255,255,255,.045)",
                    border: "1px solid rgba(255,255,255,.08)",
                    borderRadius: 16,
                    padding: 16,
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr auto auto",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <div>
                    <div style={{ color: COLORS.text, fontWeight: 900, fontSize: 15, marginBottom: 6 }}>
                      {title}
                    </div>

                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: `${status.color}18`,
                        border: `1px solid ${status.color}44`,
                        color: status.color,
                        borderRadius: 999,
                        padding: "4px 9px",
                        fontSize: 11,
                        fontWeight: 900,
                        marginBottom: 8,
                      }}
                    >
                      {status.icon} {status.label}
                    </div>

                    <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.6 }}>
                      📅 {isKreol ? "Ajouté le" : "Ajouté le"} {formatDate(demarche.created_at)}
                    </div>

                    {demarche.updated_at && (
                      <div style={{ color: COLORS.muted, fontSize: 12 }}>
                        🔄 {isKreol ? "Miz à jour" : "Mis à jour"} {formatDate(demarche.updated_at)}
                      </div>
                    )}

                    <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.55, marginTop: 8 }}>
                      {isKreol
                        ? "Structure prête pou ajouté plus tard : notes, dokiman, date limite, gain obtenu."
                        : "Structure prête pour ajouter plus tard : notes, documents, date limite, gain obtenu."}
                    </div>
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
          background:
            "linear-gradient(135deg, rgba(252,211,77,.14), rgba(249,115,22,.08), rgba(15,30,56,.96))",
          border: "1px solid rgba(252,211,77,.30)",
          borderRadius: 22,
          padding: isMobile ? 18 : 22,
        }}
      >
        <div style={{ color: COLORS.yellow, fontWeight: 900, fontSize: 16, marginBottom: 6 }}>
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
                  background: theme.bg,
                  border: `1px solid ${aide.isLocalCcas ? COLORS.yellow : theme.border}`,
                  borderRadius: 22,
                  padding: 22,
                  boxShadow: `0 14px 32px rgba(0,0,0,.18), 0 0 28px ${theme.glow}`,
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
                    background: "rgba(255,255,255,.06)",
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
                        color: aide.color,
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
                      color: aide.color,
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
                      color: "rgba(248,250,252,.68)",
                      fontWeight: 600,
                    }}
                  >
                    {categoryLabel}
                  </p>

                  <p
                    style={{
                      margin: "10px 0 0",
                      fontSize: 13,
                      color: "rgba(248,250,252,.72)",
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
                        background: "rgba(255,255,255,.045)",
                        border: "1px solid rgba(255,255,255,.08)",
                        borderRadius: 12,
                        padding: 10,
                        color: "rgba(248,250,252,.78)",
                        fontSize: 12,
                        lineHeight: 1.5,
                      }}
                    >
                      <strong style={{ color: COLORS.cyan }}>
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
                        color: COLORS.cyan,
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
        style={{
          background:
            "linear-gradient(135deg, rgba(124,58,237,.22), rgba(14,165,233,.15), rgba(15,30,56,.96))",
          border: "1px solid rgba(56,189,248,.30)",
          borderRadius: 22,
          padding: isMobile ? 18 : 22,
          boxShadow: "0 14px 32px rgba(0,0,0,.16)",
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
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 14px",
                  borderRadius: 16,
                  background: "rgba(255,255,255,.045)",
                  border: "1px solid rgba(255,255,255,.08)",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 14,
                    color: COLORS.text,
                    fontWeight: 700,
                  }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      background: "rgba(56,189,248,.11)",
                      border: "1px solid rgba(56,189,248,.20)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#7DD3FC",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={17} />
                  </span>

                  {t("aides", aide.key)}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    openExternalLink(
                      OTHER_AIDES_LINKS[aide.id] ||
                        "https://www.mesdroitssociaux.gouv.fr/"
                    )
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "rgba(56,189,248,.10)",
                    border: "1px solid rgba(56,189,248,.28)",
                    borderRadius: 10,
                    padding: "7px 12px",
                    color: "#7DD3FC",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
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
