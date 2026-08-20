import { useEffect, useMemo, useState } from "react"
import {
  CalendarClock,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Crown,
  ExternalLink,
  FilePenLine,
  FolderCheck,
  Landmark,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Plus,
  RotateCcw,
  Scale,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react"

import { AIDES as FALLBACK_AIDES } from "../../data/categories"
import { supabase } from "../../services/supabase"
import { handoffToAdvisor } from "../../services/advisorHandoff"
import { matchesAidSearch } from "../../services/aidesSearch"
import "./aidesPage.css"

const AIDES_SELECT = `
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
  lien_officiel,
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
`

const DEMARCHES_SELECT = `
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
    montant_max,
    lien,
    lien_officiel
  )
`

const TABS = [
  { id: "pour_moi", Icon: UserRound, fr: "Pour moi", kr: "Pou mwin" },
  { id: "rechercher", Icon: Search, fr: "Rechercher", kr: "Rod in aide" },
  { id: "demarches", Icon: ClipboardList, fr: "Mes démarches", kr: "Mon bann demars" },
]

const STATUSES = [
  { id: "a_preparer", fr: "À préparer", kr: "Pou préparé", tone: "warning" },
  { id: "envoyee", fr: "Envoyée", kr: "Anvoyé", tone: "info" },
  { id: "en_attente", fr: "En attente", kr: "An atant", tone: "waiting" },
  { id: "obtenue", fr: "Obtenue", kr: "Obtenu", tone: "success" },
  { id: "refusee", fr: "Refusée", kr: "Refizé", tone: "danger" },
]

const CATEGORY_LABELS = {
  logement: { fr: "Logement", kr: "Kaz" },
  famille: { fr: "Famille", kr: "Fami" },
  emploi: { fr: "Emploi", kr: "Travay" },
  energie: { fr: "Énergie", kr: "Kouran" },
  mobilite: { fr: "Mobilité", kr: "Déplasman" },
  transport: { fr: "Transport", kr: "Transport" },
  scolarite: { fr: "Scolarité", kr: "Lékol" },
  etudiant: { fr: "Étudiants", kr: "Zétidian" },
  sante: { fr: "Santé", kr: "Santé" },
  handicap: { fr: "Handicap", kr: "Handicap" },
  retraite: { fr: "Retraite", kr: "Rétrèt" },
  social: { fr: "Social", kr: "Sosyal" },
  ccas: { fr: "Commune / CCAS", kr: "Komin / CCAS" },
  entreprise: { fr: "Entreprise", kr: "Antrepriz" },
}

const STATUS_ACTIONS = {
  a_preparer: [
    { id: "dossier", mode: "preparer_dossier", Icon: FolderCheck, fr: "Préparer mon dossier", kr: "Prépar mon dosyé" },
    { id: "courrier", mode: "generer_courrier", Icon: FilePenLine, fr: "Générer un courrier", kr: "Prépar in kourrié" },
    { id: "email", mode: "generer_email", Icon: Mail, fr: "Générer un email", kr: "Prépar in email" },
  ],
  envoyee: [
    { id: "relance", mode: "generer_email", Icon: Mail, fr: "Générer une relance", kr: "Prépar in relans" },
    { id: "rdv", mode: "preparer_rdv", Icon: CalendarClock, fr: "Préparer un rendez-vous", kr: "Prépar in randévou" },
  ],
  en_attente: [
    { id: "relance", mode: "generer_email", Icon: Mail, fr: "Générer une relance", kr: "Prépar in relans" },
    { id: "rdv", mode: "preparer_rdv", Icon: CalendarClock, fr: "Préparer un rendez-vous", kr: "Prépar in randévou" },
  ],
  refusee: [
    { id: "refus", mode: "comprendre_courrier", Icon: MessageSquareText, fr: "Comprendre le refus", kr: "Konprann lo refi" },
    { id: "recours", mode: "preparer_recours", Icon: Scale, fr: "Préparer un recours", kr: "Prépar in rekour" },
  ],
  obtenue: [],
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`´]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function isKreolLang(t) {
  const lang = String(t?.lang || "").toLowerCase()
  return lang === "cr" || lang === "kreol" || t?.("nav", "dashboard") === "Tablo debor"
}

function formatAmount(aide = {}, isKreol = false) {
  if (aide.montant) return aide.montant
  const min = Number(aide.montant_min)
  const max = Number(aide.montant_max)
  const hasMin = Number.isFinite(min) && min > 0
  const hasMax = Number.isFinite(max) && max > 0
  if (hasMin && hasMax && min !== max) return `${Math.round(min)} à ${Math.round(max)} €`
  if (hasMax) return `${isKreol ? "Ziska" : "Jusqu’à"} ${Math.round(max)} €`
  if (hasMin) return `${isKreol ? "Apartir" : "À partir de"} ${Math.round(min)} €`
  return isKreol ? "Pou vérifié" : "À vérifier"
}

function normalizeAide(row = {}) {
  return {
    ...row,
    id: row.id,
    nameFr: row.nom || row.label || row.title || "Aide",
    nameKr: row.nom_kreol || row.label_kr || row.title_kr || row.nom || row.label || "Éd",
    descriptionFr: row.description_fr || row.description || "",
    descriptionKr: row.description_kreol || row.description_kr || row.description_fr || row.description || "",
    stepsFr: row.demarches_fr || row.demarches || "",
    stepsKr: row.demarches_kreol || row.demarches_kr || row.demarches_fr || row.demarches || "",
    category: normalizeText(row.categorie || row.category || "autres").replace(/\s+/g, "_"),
    url: row.lien_officiel || row.lien || row.officialUrl || "",
    isDatabaseAide: row.nom !== undefined,
  }
}

function normalizeDemarche(row = {}) {
  const aide = normalizeAide(row.aides_reunion || {})
  return {
    ...row,
    status: row.statut || "a_preparer",
    aide,
  }
}

function categoryLabel(category, isKreol) {
  const labels = CATEGORY_LABELS[category]
  if (labels) return isKreol ? labels.kr : labels.fr
  const clean = String(category || "autres").replace(/_/g, " ")
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

function matchesProfile(aide, profile = {}) {
  if (!aide.isDatabaseAide) return true
  const children = Number(profile.nombre_enfants || 0)
  const housing = normalizeText(profile.logement || profile.situation_logement)
  const work = normalizeText(profile.situation_professionnelle)
  if (aide.besoin_enfant && children <= 0) return false
  if (aide.besoin_handicap && !profile.handicap) return false
  if (aide.besoin_etudiant && !profile.etudiant) return false
  if (aide.besoin_retraite && !profile.retraite) return false
  if (aide.besoin_demandeur_emploi && !profile.demandeur_emploi && !work.includes("demandeur")) return false
  if (aide.besoin_allocataire_caf && !profile.allocataire_caf) return false
  if (aide.besoin_locataire && housing !== "locataire") return false
  if (aide.besoin_proprietaire && housing !== "proprietaire") return false
  return true
}

function relevanceScore(aide, profile = {}) {
  let score = Number(aide.score_priorite || 0)
  const children = Number(profile.nombre_enfants || 0)
  const housing = normalizeText(profile.logement || profile.situation_logement)
  if (children > 0 && ["famille", "scolarite"].includes(aide.category)) score += 45
  if (profile.etudiant && aide.category === "etudiant") score += 45
  if (housing === "locataire" && aide.category === "logement") score += 40
  if (profile.commune && aide.category === "ccas") score += 35
  if (aide.category === "emploi") score += 20
  if (aide.category === "energie") score += 15
  return score
}

function statusInfo(status) {
  return STATUSES.find(item => item.id === status) || STATUSES[0]
}

function nextActionFor(demarche, isKreol) {
  const custom = isKreol ? demarche.aide.stepsKr : demarche.aide.stepsFr
  if (custom) return custom
  const defaults = {
    a_preparer: isKreol ? "Rasanm bann dokiman ek vérifie lo formulaire." : "Rassemblez les documents et vérifiez le formulaire.",
    envoyee: isKreol ? "Gard in prev d’anvoi ek la dat." : "Conservez une preuve d’envoi et la date.",
    en_attente: isKreol ? "Vérifie si l’organism la demann in dokiman." : "Vérifiez si l’organisme a demandé un document.",
    obtenue: isKreol ? "Gard la décision ek bann justificatifs." : "Conservez la décision et les justificatifs.",
    refusee: isKreol ? "Rod lo motif ékri dann la décision." : "Repérez le motif écrit dans la décision.",
  }
  return defaults[demarche.status] || defaults.a_preparer
}

function buildAdvisorPrompt(action, demarche, isKreol) {
  const aide = demarche.aide
  const name = isKreol ? aide.nameKr : aide.nameFr
  const status = statusInfo(demarche.status)
  const statusLabel = isKreol ? status.kr : status.fr
  const requests = {
    dossier: isKreol ? "Aide a moin prépar mon dosyé." : "Aide-moi à préparer mon dossier.",
    courrier: isKreol ? "Rédiz in kourrié administratif prêt pou kopié." : "Rédige un courrier administratif prêt à copier.",
    email: isKreol ? "Rédiz in email administratif prêt pou kopié." : "Rédige un email administratif prêt à copier.",
    relance: isKreol ? "Rédiz in email relans poli ek kourt." : "Rédige un email de relance poli et concis.",
    rdv: isKreol ? "Prépar mon randévou ek bann kestyon ek dokiman utiles." : "Prépare mon rendez-vous avec les questions et documents utiles.",
    refus: isKreol ? "Aide a moin konprann lo refi san invente naryin." : "Aide-moi à comprendre le refus sans rien inventer.",
    recours: isKreol ? "Aide a moin prépar in rekour avèk prudans." : "Aide-moi à préparer un recours avec prudence.",
  }
  return [
    requests[action.id],
    `${isKreol ? "Aide" : "Aide"} : ${name}`,
    `${isKreol ? "Katégori" : "Catégorie"} : ${categoryLabel(aide.category, isKreol)}`,
    `${isKreol ? "Léta demars" : "Statut de la démarche"} : ${statusLabel}`,
    aide.descriptionFr ? `${isKreol ? "Kontèks itil" : "Contexte utile"} : ${isKreol ? aide.descriptionKr : aide.descriptionFr}` : "",
    nextActionFor(demarche, isKreol) ? `${isKreol ? "Bann zétap koni" : "Étapes connues"} : ${nextActionFor(demarche, isKreol)}` : "",
    isKreol
      ? "Utilise mon profil BudgetKazPéi san répète bann donné pèrsionèl. Demann a moin sèlman info ki mank."
      : "Utilise mon profil BudgetKazPéi sans répéter mes données personnelles. Demande-moi seulement les informations manquantes.",
  ].filter(Boolean).join("\n")
}

function AideCard({ aide, isKreol, tracked, saving, onAdd }) {
  const title = isKreol ? aide.nameKr : aide.nameFr
  const description = isKreol ? aide.descriptionKr : aide.descriptionFr
  const steps = isKreol ? aide.stepsKr : aide.stepsFr

  return (
    <article className="bkp-aide-card">
      <div className="bkp-aide-card-head">
        <div>
          <span className="bkp-aide-category">{categoryLabel(aide.category, isKreol)}</span>
          <h3>{title}</h3>
        </div>
        <span className="bkp-aide-amount">{formatAmount(aide, isKreol)}</span>
      </div>
      <p className="bkp-aide-description">{description || (isKreol ? "Aide pou vérifié selon out situation." : "Aide à vérifier selon votre situation.")}</p>
      <div className="bkp-aide-next">
        <ChevronRight size={16} aria-hidden="true" />
        <span><strong>{isKreol ? "Proshin aksion" : "Prochaine action"}</strong>{steps || (isKreol ? "Vérifie bann kondisyon ek lo lien officiel." : "Vérifiez les conditions et le lien officiel.")}</span>
      </div>
      <div className="bkp-aide-actions">
        <button type="button" className="bkp-button-primary" onClick={() => onAdd(aide)} disabled={tracked || saving || !aide.isDatabaseAide}>
          {saving ? <LoaderCircle className="bkp-spin" size={17} /> : tracked ? <Check size={17} /> : <Plus size={17} />}
          {tracked
            ? (isKreol ? "Déza dann mon demars" : "Déjà dans mes démarches")
            : (isKreol ? "Azout dann mon demars" : "Ajouter à mes démarches")}
        </button>
        {aide.url && (
          <a className="bkp-button-secondary" href={aide.url} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            {isKreol ? "Plis linformasion" : "Plus d’informations"}
          </a>
        )}
      </div>
    </article>
  )
}

function PremiumPlusPromotion({ isKreol, onDiscover }) {
  return (
    <aside className="bkp-aides-premium-promo">
      <span aria-hidden="true"><Crown size={21} /></span>
      <div>
        <strong>{isKreol ? "Akonpagnman avansé bann demars — Premium+" : "Accompagnement avancé des démarches — Premium+"}</strong>
        <p>{isKreol ? "Prépar dosyé, kourrié, email, relans, randévou, refi ek rekour dann Konseyé-la." : "Préparez dossiers, courriers, emails, relances et rendez-vous, puis comprenez les refus et préparez les recours dans le Conseiller."}</p>
      </div>
      <button type="button" onClick={onDiscover}>{isKreol ? "Dékouv Premium+" : "Découvrir Premium+"}</button>
    </aside>
  )
}

function DemarcheCard({ demarche, isKreol, isPremiumPlus, saving, onStatusChange, onDelete }) {
  const aide = demarche.aide
  const status = statusInfo(demarche.status)
  const actions = STATUS_ACTIONS[demarche.status] || []

  function launchAction(action) {
    handoffToAdvisor({
      mode: action.mode,
      prompt: buildAdvisorPrompt(action, demarche, isKreol),
      context: {
        aideId: aide.id,
        aideNameFr: aide.nameFr,
        aideNameKreol: aide.nameKr,
        category: aide.category,
        status: demarche.status,
        descriptionFr: aide.descriptionFr,
        descriptionKreol: aide.descriptionKr,
        stepsFr: nextActionFor(demarche, false),
        stepsKreol: nextActionFor(demarche, true),
        addedAt: demarche.created_at,
      },
    })
  }

  return (
    <article className="bkp-demarche-card">
      <div className="bkp-demarche-main">
        <div className="bkp-demarche-title-row">
          <div>
            <span className="bkp-aide-category">{categoryLabel(aide.category, isKreol)}</span>
            <h3>{isKreol ? aide.nameKr : aide.nameFr}</h3>
          </div>
          <span className={`bkp-status bkp-status--${status.tone}`}>{isKreol ? status.kr : status.fr}</span>
        </div>
        <div className="bkp-demarche-next">
          <strong>{isKreol ? "Proshin aksion" : "Prochaine action"}</strong>
          <p>{nextActionFor(demarche, isKreol)}</p>
        </div>
        <div className="bkp-demarche-meta">
          <span>{formatAmount(aide, isKreol)}</span>
          <span>{categoryLabel(aide.category, isKreol)}</span>
          {demarche.created_at && <span>{new Date(demarche.created_at).toLocaleDateString("fr-FR")}</span>}
        </div>
      </div>

      {isPremiumPlus && actions.length > 0 && (
        <div className="bkp-demarche-tools" aria-label={isKreol ? "Zouti Konseye Premium+" : "Outils du Conseiller Premium+"}>
          {actions.map(action => {
            const Icon = action.Icon
            return <button type="button" key={action.id} onClick={() => launchAction(action)}><Icon size={16} />{isKreol ? action.kr : action.fr}</button>
          })}
        </div>
      )}

      <div className="bkp-demarche-controls">
        <label>
          <span>{isKreol ? "Miz a zour léta" : "Mettre à jour le statut"}</span>
          <select value={demarche.status} onChange={event => onStatusChange(demarche.id, event.target.value)} disabled={saving}>
            {STATUSES.map(item => <option key={item.id} value={item.id}>{isKreol ? item.kr : item.fr}</option>)}
          </select>
        </label>
        <button type="button" className="bkp-delete-button" onClick={() => onDelete(demarche.id)} disabled={saving} aria-label={isKreol ? "Suprim demars" : "Supprimer la démarche"}>
          <Trash2 size={17} />
          {isKreol ? "Suprim" : "Supprimer"}
        </button>
      </div>
    </article>
  )
}

export default function AidesPage({ t, isPremiumPlus = false, user, onDiscover, initialTab = "pour_moi" }) {
  const isKreol = isKreolLang(t)
  const [activeTab, setActiveTab] = useState(initialTab)
  const [profile, setProfile] = useState(null)
  const [aides, setAides] = useState([])
  const [demarches, setDemarches] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")

  useEffect(() => {
    let ignore = false

    async function load() {
      setLoading(true)
      setErrorMessage("")
      const profilePromise = user?.id
        ? supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()
        : Promise.resolve({ data: null, error: null })
      const aidesPromise = supabase.from("aides_reunion").select(AIDES_SELECT).order("score_priorite", { ascending: false })
      const demarchesPromise = user?.id
        ? supabase.from("user_aide_demarche").select(DEMARCHES_SELECT).eq("user_id", user.id).order("updated_at", { ascending: false })
        : Promise.resolve({ data: [], error: null })
      const [profileResult, aidesResult, demarchesResult] = await Promise.all([profilePromise, aidesPromise, demarchesPromise])
      if (ignore) return

      setProfile(profileResult.data || null)
      setAides((aidesResult.data?.length ? aidesResult.data : FALLBACK_AIDES).map(normalizeAide))
      setDemarches((demarchesResult.data || []).map(normalizeDemarche))
      if (aidesResult.error || demarchesResult.error) {
        setErrorMessage(isKreol ? "Sèrtin donné la pa pu sharzé. Réessay in kou." : "Certaines données n’ont pas pu être chargées. Réessayez.")
      }
      setLoading(false)
    }

    load()
    return () => { ignore = true }
  }, [user?.id, isKreol])

  const trackedIds = useMemo(() => new Set(demarches.map(item => Number(item.aide_id))), [demarches])
  const categories = useMemo(() => [...new Set(aides.map(aide => aide.category))].sort((a, b) => categoryLabel(a, isKreol).localeCompare(categoryLabel(b, isKreol), "fr")), [aides, isKreol])
  const recommendations = useMemo(() => aides
    .filter(aide => matchesProfile(aide, profile || {}))
    .sort((a, b) => relevanceScore(b, profile || {}) - relevanceScore(a, profile || {}))
    .slice(0, 12), [aides, profile])
  const searchResults = useMemo(() => aides.filter(aide => (category === "all" || aide.category === category) && matchesAidSearch(aide, query)), [aides, category, query])

  async function addToDemarches(aide) {
    if (!user?.id || !aide.isDatabaseAide) return
    setSavingId(`aide-${aide.id}`)
    setErrorMessage("")
    const { data, error } = await supabase.from("user_aide_demarche").insert({ user_id: user.id, aide_id: aide.id, statut: "a_preparer" }).select(DEMARCHES_SELECT).single()
    setSavingId(null)
    if (error) {
      if (error.code === "23505") return
      setErrorMessage(isKreol ? "Inposib azout aide-la dann out demars." : "Impossible d’ajouter cette aide à vos démarches.")
      return
    }
    setDemarches(previous => [normalizeDemarche(data), ...previous])
  }

  async function updateStatus(id, status) {
    setSavingId(`demarche-${id}`)
    const { data, error } = await supabase.from("user_aide_demarche").update({ statut: status }).eq("id", id).select(DEMARCHES_SELECT).single()
    setSavingId(null)
    if (error) {
      setErrorMessage(isKreol ? "Inposib miz a zour demars-la." : "Impossible de mettre à jour la démarche.")
      return
    }
    setDemarches(previous => previous.map(item => item.id === id ? normalizeDemarche(data) : item))
  }

  async function deleteDemarche(id) {
    if (!window.confirm(isKreol ? "Ou lé sir ou vé suprim demars-la ?" : "Voulez-vous supprimer cette démarche ?")) return
    setSavingId(`demarche-${id}`)
    const { error } = await supabase.from("user_aide_demarche").delete().eq("id", id)
    setSavingId(null)
    if (error) {
      setErrorMessage(isKreol ? "Inposib suprim demars-la." : "Impossible de supprimer la démarche.")
      return
    }
    setDemarches(previous => previous.filter(item => item.id !== id))
  }

  function handleTabKeyDown(event, currentIndex) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    let index = currentIndex
    if (event.key === "ArrowRight") index = (currentIndex + 1) % TABS.length
    if (event.key === "ArrowLeft") index = (currentIndex - 1 + TABS.length) % TABS.length
    if (event.key === "Home") index = 0
    if (event.key === "End") index = TABS.length - 1
    setActiveTab(TABS[index].id)
    document.getElementById(`aides-tab-${TABS[index].id}`)?.focus()
  }

  return (
    <div className="bkp-aides-page">
      <header className="bkp-aides-hero">
        <div className="bkp-aides-hero-icon" aria-hidden="true"><Landmark size={24} /></div>
        <div><p>{isKreol ? "Aides ek droits La Rényon" : "Aides et droits à La Réunion"}</p><h1>{isKreol ? "Trouve, konprann ek swiv out aides" : "Trouvez, comprenez et suivez vos aides"}</h1></div>
      </header>

      <div className="bkp-aides-tabs" role="tablist" aria-label={isKreol ? "Navigasion bann aides" : "Navigation des aides"}>
        {TABS.map((tab, index) => {
          const Icon = tab.Icon
          const selected = activeTab === tab.id
          return (
            <button id={`aides-tab-${tab.id}`} type="button" role="tab" aria-selected={selected} aria-controls={`aides-panel-${tab.id}`} tabIndex={selected ? 0 : -1} className={selected ? "is-active" : ""} onClick={() => setActiveTab(tab.id)} onKeyDown={event => handleTabKeyDown(event, index)} key={tab.id}>
              <Icon size={17} /> <span>{isKreol ? tab.kr : tab.fr}</span>{tab.id === "demarches" && demarches.length > 0 && <em>{demarches.length}</em>}
            </button>
          )
        })}
      </div>

      {errorMessage && <div className="bkp-aides-alert" role="alert"><CircleHelp size={18} /><span>{errorMessage}</span><button type="button" onClick={() => setErrorMessage("")} aria-label={isKreol ? "Ferm mesaj" : "Fermer le message"}><X size={16} /></button></div>}

      {loading ? (
        <div className="bkp-aides-loading" role="status"><LoaderCircle className="bkp-spin" size={25} /><span>{isKreol ? "Nou lé sharz bann aides…" : "Chargement des aides…"}</span></div>
      ) : (
        <>
          {activeTab === "pour_moi" && (
            <section id="aides-panel-pour_moi" role="tabpanel" aria-labelledby="aides-tab-pour_moi" className="bkp-aides-panel">
              <div className="bkp-panel-heading"><div><span><Sparkles size={15} />{isKreol ? "Selon out profil" : "Selon votre profil"}</span><h2>{isKreol ? "Bann aides pou mwin" : "Les aides qui peuvent vous concerner"}</h2><p>{isKreol ? "Nou prioriz bann aides selon bann info out profil. L’organism i konfirme toujours out droits." : "Nous priorisons les aides selon votre profil. L’organisme confirme toujours vos droits."}</p></div></div>
              {recommendations.length ? <div className="bkp-aides-grid">{recommendations.map(aide => <AideCard key={aide.id} aide={aide} isKreol={isKreol} tracked={trackedIds.has(Number(aide.id))} saving={savingId === `aide-${aide.id}`} onAdd={addToDemarches} />)}</div> : <EmptyState isKreol={isKreol} type="recommendations" onAction={() => setActiveTab("rechercher")} />}
            </section>
          )}

          {activeTab === "rechercher" && (
            <section id="aides-panel-rechercher" role="tabpanel" aria-labelledby="aides-tab-rechercher" className="bkp-aides-panel">
              <div className="bkp-panel-heading"><div><span><Search size={15} />{isKreol ? "Tout lo katalog" : "Tout le catalogue"}</span><h2>{isKreol ? "Rod in aide" : "Rechercher une aide"}</h2><p>{isKreol ? "Ékri an fransé ou an kréol, kèl lang lapli lé aktuel." : "Saisissez un terme en français ou en créole, quelle que soit la langue de l’application."}</p></div></div>
              <div className="bkp-aides-searchbox"><Search size={19} aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={isKreol ? "Kaz, marmay, kouran, RSA…" : "Logement, enfant, énergie, RSA…"} aria-label={isKreol ? "Rod dann katalog aides" : "Rechercher dans le catalogue des aides"} />{query && <button type="button" onClick={() => setQuery("")} aria-label={isKreol ? "Efase recherche" : "Effacer la recherche"}><X size={17} /></button>}</div>
              <div className="bkp-category-filters" aria-label={isKreol ? "Filtre kategori" : "Filtres par catégorie"}>
                <button type="button" className={category === "all" ? "is-active" : ""} aria-pressed={category === "all"} onClick={() => setCategory("all")}>{isKreol ? "Tout" : "Toutes"}</button>
                {categories.map(item => <button type="button" className={category === item ? "is-active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)} key={item}>{categoryLabel(item, isKreol)}</button>)}
              </div>
              <p className="bkp-result-count" aria-live="polite">{searchResults.length} {isKreol ? "aide trouvée" : "aide(s) trouvée(s)"}</p>
              {searchResults.length ? <div className="bkp-aides-grid">{searchResults.map(aide => <AideCard key={aide.id} aide={aide} isKreol={isKreol} tracked={trackedIds.has(Number(aide.id))} saving={savingId === `aide-${aide.id}`} onAdd={addToDemarches} />)}</div> : <EmptyState isKreol={isKreol} type="search" onAction={() => { setQuery(""); setCategory("all") }} />}
            </section>
          )}

          {activeTab === "demarches" && (
            <section id="aides-panel-demarches" role="tabpanel" aria-labelledby="aides-tab-demarches" className="bkp-aides-panel">
              <div className="bkp-panel-heading"><div><span><ClipboardList size={15} />{isKreol ? "Suivi manuel" : "Suivi manuel"}</span><h2>{isKreol ? "Mon bann demars" : "Mes démarches"}</h2><p>{isKreol ? "Miz a zour léta ek retrouve proshin aksion pou sak demande." : "Mettez à jour le statut et retrouvez la prochaine action de chaque demande."}</p></div></div>
              {!isPremiumPlus && demarches.length > 0 && <PremiumPlusPromotion isKreol={isKreol} onDiscover={onDiscover} />}
              {demarches.length ? <div className="bkp-demarches-list">{demarches.map(demarche => <DemarcheCard key={demarche.id} demarche={demarche} isKreol={isKreol} isPremiumPlus={isPremiumPlus} saving={savingId === `demarche-${demarche.id}`} onStatusChange={updateStatus} onDelete={deleteDemarche} />)}</div> : <EmptyState isKreol={isKreol} type="demarches" onAction={() => setActiveTab("rechercher")} />}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function EmptyState({ isKreol, type, onAction }) {
  const content = {
    recommendations: { title: isKreol ? "Nout bann rekomandasion lé an kour" : "Vos recommandations sont en préparation", text: isKreol ? "Rod dann tout lo katalog pou trouve in aide toutswit." : "Recherchez dans tout le catalogue pour trouver une aide dès maintenant.", action: isKreol ? "Rod in aide" : "Rechercher une aide" },
    search: { title: isKreol ? "Nou la pa trouve aide" : "Aucune aide trouvée", text: isKreol ? "Ésay in lot mo ou suprim bann filtres." : "Essayez un autre terme ou supprimez les filtres.", action: isKreol ? "Suprim bann filtres" : "Supprimer les filtres" },
    demarches: { title: isKreol ? "Ou na poin demars pou linstan" : "Vous n’avez aucune démarche pour le moment", text: isKreol ? "Rod in aide ek azout ali pou komans suivi." : "Recherchez une aide et ajoutez-la pour commencer son suivi.", action: isKreol ? "Rod in aide" : "Rechercher une aide" },
  }[type]
  return <div className="bkp-aides-empty"><RotateCcw size={25} /><h3>{content.title}</h3><p>{content.text}</p><button type="button" onClick={onAction}>{content.action}</button></div>
}
