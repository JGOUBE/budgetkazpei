import { useEffect, useState } from "react"
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
  DollarSign,
  CheckCircle2,
} from "lucide-react"

import { supabase } from "../../services/supabase"
import { AIDES } from "../../data/categories"
import { AUTRES_AIDES } from "../../data/aides"
import AssistantAides from "./AssistantAides"

// AidesPage V29 - Produit final aides & droits : gains robustes + suivi propre + alertes utilisateur

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
    labelKey: "monthlyPayment",
  },
  {
    bg: "linear-gradient(135deg, rgba(14,165,233,.30), rgba(15,30,56,.96))",
    border: "rgba(14,165,233,.40)",
    glow: "rgba(14,165,233,.16)",
    Icon: Home,
    labelKey: "housingAid",
  },
  {
    bg: "linear-gradient(135deg, rgba(250,204,21,.28), rgba(15,30,56,.96))",
    border: "rgba(250,204,21,.40)",
    glow: "rgba(250,204,21,.14)",
    Icon: Sun,
    labelKey: "energySupport",
  },
  {
    bg: "linear-gradient(135deg, rgba(249,115,22,.30), rgba(15,30,56,.96))",
    border: "rgba(249,115,22,.40)",
    glow: "rgba(249,115,22,.16)",
    Icon: Zap,
    labelKey: "aidToRequest",
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
  apl: "https://wwwd.caf.fr/wps/portal/caffr/aidesetdemarches/mesdemarches/faireunedemandedeprestation?codeThematique=Logement",
  aideEnergie:
    "https://www.regionreunion.com/aides-services/article/energie-dispositifs-region-reunion-finances-par-l-union-europeenne",
  chequeEnergie: "https://chequeenergie.gouv.fr/",
}

const OTHER_AIDES_LINKS = {
  gardeEnfants:
    "https://www.caf.fr/allocataires/aides-et-demarches/droits-et-prestations/vie-personnelle/le-complement-de-libre-choix-du-mode-de-garde-cmg",
  bonsAlimentaires:
    "https://www.saintleu.re/les-dispositifs-daides-a-la-mairie-de-saint-leu",
  mobilite: "https://www.departement974.fr/aide/aide-r-mobilite",
  microcredit:
    "https://www.banque-france.fr/fr/a-votre-service/particuliers/annuaire-microcredit",
}

const STATUS_OPTIONS = [
  { value: "a_faire", fr: "À faire", kr: "Pou fé", color: COLORS.yellow },
  { value: "commence", fr: "Dossier commencé", kr: "Dossier commencé", color: COLORS.cyan },
  { value: "documents_envoyes", fr: "Documents envoyés", kr: "Dokiman envoyés", color: COLORS.green },
  { value: "en_attente", fr: "En attente", kr: "En attente", color: COLORS.accent },
  { value: "accepte", fr: "Accepté", kr: "Accepté", color: COLORS.green },
  { value: "refuse", fr: "Refusé", kr: "Refusé", color: COLORS.red },
]

function getAideLink(aide) {
  const normalizedLabel = `${aide.id || ""} ${aide.label || ""}`.toLowerCase()

  if (normalizedLabel.includes("rsa")) return AIDE_LINKS.rsa
  if (normalizedLabel.includes("apl")) return AIDE_LINKS.apl
  if (normalizedLabel.includes("chèque") || normalizedLabel.includes("cheque")) return AIDE_LINKS.chequeEnergie
  if (normalizedLabel.includes("énergie") || normalizedLabel.includes("energie")) return AIDE_LINKS.aideEnergie

  return "https://www.caf.fr/allocataires/aides-et-demarches/mes-demarches"
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

function getStatus(status, isKreol) {
  const found = STATUS_OPTIONS.find(item => item.value === status)
  if (!found) return STATUS_OPTIONS[0]

  return {
    ...found,
    label: isKreol ? found.kr : found.fr,
  }
}

function formatDate(value) {
  if (!value) return ""
  return new Date(value).toLocaleDateString("fr-FR")
}

function getDaysLeft(deadline) {
  if (!deadline) return null

  const today = new Date()
  const limit = new Date(deadline)

  today.setHours(0, 0, 0, 0)
  limit.setHours(0, 0, 0, 0)

  return Math.ceil((limit - today) / (1000 * 60 * 60 * 24))
}

function getDaysSince(value) {
  if (!value) return 0

  const today = new Date()
  const date = new Date(value)

  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)

  return Math.floor((today - date) / (1000 * 60 * 60 * 24))
}

function getDemarcheProgress(demarche) {
  const status = demarche.status || "a_faire"

  if (status === "accepte") return 100
  if (status === "refuse") return 0
  if (status === "documents_envoyes") return 75
  if (status === "en_attente") return 75
  if (status === "commence") return demarche.documents_ready ? 55 : 35
  if (demarche.documents_ready) return 45

  return 10
}

function getGainAmount(demarche) {
  const value = Number(demarche?.montant_obtenu ?? 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}

function formatEuro(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return "0 €"
  return `${amount.toFixed(0)} €`
}


function getDemarchePriority(demarche) {
  const status = demarche.status || "a_faire"
  const daysLeft = getDaysLeft(demarche.deadline)

  if (status === "accepte") return 90
  if (status === "refuse") return 95
  if (daysLeft !== null && daysLeft < 0 && status !== "accepte") return 1
  if (daysLeft !== null && daysLeft <= 3 && status !== "accepte") return 2
  if (daysLeft !== null && daysLeft <= 7 && status !== "accepte") return 3
  if (!demarche.documents_ready && !["documents_envoyes", "en_attente", "accepte", "refuse"].includes(status)) return 4
  if (status === "a_faire") return 5
  if (status === "commence") return 6
  if (status === "en_attente") return 7
  if (status === "documents_envoyes") return 8

  return 50
}

function getDemarchePriorityLabel(demarche, isKreol) {
  const status = demarche.status || "a_faire"
  const daysLeft = getDaysLeft(demarche.deadline)

  if (status === "accepte") {
    return {
      color: COLORS.green,
      text: isKreol ? "✅ Dossier accepté" : "✅ Dossier accepté",
    }
  }

  if (status === "refuse") {
    return {
      color: COLORS.red,
      text: isKreol ? "❌ Dossier refusé" : "❌ Dossier refusé",
    }
  }

  if (daysLeft !== null && daysLeft < 0) {
    return {
      color: COLORS.red,
      text: isKreol ? "🚨 Date limite dépassée" : "🚨 Date limite dépassée",
    }
  }

  if (daysLeft !== null && daysLeft <= 3) {
    return {
      color: COLORS.yellow,
      text: isKreol ? "🔥 Urgent" : "🔥 Urgent",
    }
  }

  if (daysLeft !== null && daysLeft <= 7) {
    return {
      color: COLORS.yellow,
      text: isKreol ? "⏰ Date proche" : "⏰ Date proche",
    }
  }

  if (!demarche.documents_ready && !["documents_envoyes", "en_attente", "accepte", "refuse"].includes(status)) {
    return {
      color: COLORS.cyan,
      text: isKreol ? "📄 Dokiman à préparé" : "📄 Documents à préparer",
    }
  }

  if (status === "en_attente") {
    return {
      color: COLORS.accent,
      text: isKreol ? "⏳ En attente" : "⏳ En attente",
    }
  }

  return null
}

export default function AidesPage({ isMobile, t, isPremium, user }) {
  const languageKey = getLanguageKey(t)
  const isKreol = isKreolLang(t)

  const [demarches, setDemarches] = useState([])
  const [loadingDemarches, setLoadingDemarches] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [noteDrafts, setNoteDrafts] = useState({})
  const [gainInputs, setGainInputs] = useState({})

  const totalDemarches = demarches.length

  const nbAFaire = demarches.filter(d => d.status === "a_faire").length
  const nbCommence = demarches.filter(d => d.status === "commence").length
  const nbAttente = demarches.filter(d => d.status === "en_attente").length
  const nbAccepte = demarches.filter(d => d.status === "accepte").length
  const nbDocumentsEnvoyes = demarches.filter(d => d.status === "documents_envoyes").length
  const nbDocumentsPrets = demarches.filter(d => d.documents_ready).length
  const gainsTotal = demarches.reduce((sum, demarche) => sum + getGainAmount(demarche), 0)
  const demarchesAvecGain = demarches.filter(d => getGainAmount(d) > 0)
  const demarchesAccepteesSansGain = demarches.filter(d => d.status === "accepte" && getGainAmount(d) <= 0)
  const nbGainsRenseignes = demarchesAvecGain.length
  const gainsMoyen = nbGainsRenseignes > 0 ? Math.round(gainsTotal / nbGainsRenseignes) : 0
  const derniersGains = [...demarchesAvecGain]
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
    .slice(0, 3)

  const nbDeadlinesProches = demarches.filter(d => {
    const days = getDaysLeft(d.deadline)
    return days !== null && days >= 0 && days <= 7
  }).length

  const nbDeadlinesDepassees = demarches.filter(d => {
    const days = getDaysLeft(d.deadline)
    return days !== null && days < 0 && d.status !== "accepte"
  }).length

  const nbAttenteLongue = demarches.filter(d => {
    const referenceDate = d.updated_at || d.created_at
    return d.status === "en_attente" && getDaysSince(referenceDate) >= 14
  }).length

  const nbDocumentsApreparer = demarches.filter(d => {
    return !d.documents_ready && !["documents_envoyes", "en_attente", "accepte"].includes(d.status)
  }).length

  const progression =
    totalDemarches === 0
      ? 0
      : Math.round(
          demarches.reduce((sum, demarche) => sum + getDemarcheProgress(demarche), 0) /
            totalDemarches
        )

  const sortedDemarches = [...demarches].sort((a, b) => {
    const priorityDiff = getDemarchePriority(a) - getDemarchePriority(b)

    if (priorityDiff !== 0) return priorityDiff

    const aDays = getDaysLeft(a.deadline)
    const bDays = getDaysLeft(b.deadline)

    if (aDays !== null && bDays !== null) return aDays - bDays
    if (aDays !== null) return -1
    if (bDays !== null) return 1

    return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
  })

  useEffect(() => {
    fetchDemarches()
  }, [user?.id])

  async function fetchDemarches() {
    if (!user?.id) {
      setDemarches([])
      setLoadingDemarches(false)
      return
    }

    setLoadingDemarches(true)

    const { data, error } = await supabase
      .from("aide_demarches")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Erreur chargement démarches:", error)
      setDemarches([])
    } else {
      setDemarches(data || [])
    }

    setLoadingDemarches(false)
  }

  async function updateDemarche(id, updates) {
    const updatedAt = new Date().toISOString()

    setSavingId(id)

    const { error } = await supabase
      .from("aide_demarches")
      .update({
        ...updates,
        updated_at: updatedAt,
      })
      .eq("id", id)

    setSavingId(null)

    if (error) {
      console.error("Erreur mise à jour démarche:", error)
      alert(
        isKreol
          ? "Erreur pendant la mise à jour."
          : "Erreur pendant la mise à jour."
      )
      return
    }

    setDemarches(prev =>
      prev.map(item =>
        item.id === id ? { ...item, ...updates, updated_at: updatedAt } : item
      )
    )
  }

  async function saveGain(demarche) {
    if (!demarche?.id) return

    const rawValue = gainInputs[demarche.id] ?? demarche.montant_obtenu ?? ""
    const value = Number(rawValue)

    if (!Number.isFinite(value) || value < 0) {
      alert(isKreol ? "Montan invalide." : "Montant invalide.")
      return
    }

    setSavingId(demarche.id)

    const updatedAt = new Date().toISOString()
    const { error } = await supabase
      .from("aide_demarches")
      .update({
        montant_obtenu: value,
        status: "accepte",
        updated_at: updatedAt,
      })
      .eq("id", demarche.id)

    setSavingId(null)

    if (error) {
      console.error("Erreur sauvegarde gain:", error)
      alert(isKreol ? "Erreur sauvegarde gain." : "Erreur lors de la sauvegarde du gain.")
      return
    }

    setDemarches(prev =>
      prev.map(item =>
        item.id === demarche.id
          ? { ...item, montant_obtenu: value, status: "accepte", updated_at: updatedAt }
          : item
      )
    )

    setGainInputs(prev => ({
      ...prev,
      [demarche.id]: String(value),
    }))
  }

  async function addFollowUpNote(demarche) {
    const rawNote = noteDrafts[demarche.id] || ""
    const note = rawNote.trim()

    if (!note) {
      alert(
        isKreol
          ? "Écris une note avant d'ajouter."
          : "Écrivez une note avant d'ajouter."
      )
      return
    }

    const now = new Date()
    const dateLabel = now.toLocaleDateString("fr-FR")
    const timeLabel = now.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    })

    const newLine = `${dateLabel} à ${timeLabel} - ${note}`
    const previousNotes = demarche.notes ? `${demarche.notes}\n${newLine}` : newLine

    await updateDemarche(demarche.id, {
      notes: previousNotes,
    })

    setNoteDrafts(prev => ({
      ...prev,
      [demarche.id]: "",
    }))
  }

  async function deleteDemarche(id) {
    const confirmText = isKreol
      ? "Supprim cette démarche ?"
      : "Supprimer cette démarche ?"

    if (!window.confirm(confirmText)) return

    const { error } = await supabase
      .from("aide_demarches")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("Erreur suppression démarche:", error)
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
              ? "Suiv bann aides ajouté depuis les opportunités, prépare out dokiman et pose out question à l’assistant."
              : "Suivez les aides ajoutées depuis vos opportunités, préparez vos documents et posez vos questions à l’assistant."}
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
              <span>
                📋 {totalDemarches}{" "}
                {isKreol ? "démarche(s)" : "démarche(s)"}
              </span>
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
              <span>🟡 {nbAFaire} {isKreol ? "pou fé" : "à faire"}</span>
              <span>🔵 {nbCommence} {isKreol ? "commencé" : "commencée(s)"}</span>
              <span>✅ {nbDocumentsPrets} {isKreol ? "dokiman prêts" : "documents prêts"}</span>
              <span>🟣 {nbDocumentsEnvoyes} {isKreol ? "dokiman envoyés" : "documents envoyés"}</span>
              <span>🟠 {nbAttente} {isKreol ? "en attente" : "en attente"}</span>
              <span>🟢 {nbAccepte} {isKreol ? "accepté" : "acceptée(s)"}</span>
              <span>⏰ {nbDeadlinesProches} {isKreol ? "date proche" : "date limite proche"}</span>
            </div>

            <div
              style={{
                marginTop: 12,
                background: "linear-gradient(135deg, rgba(34,197,94,.13), rgba(35,211,214,.07))",
                border: "1px solid rgba(34,197,94,.24)",
                borderRadius: 14,
                padding: 14,
                color: COLORS.text,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900 }}>
                  <DollarSign size={18} color={COLORS.green} />
                  {isKreol ? "Gains cumulés" : "Gains cumulés"}
                </div>

                <strong style={{ color: COLORS.green, fontSize: 22 }}>
                  {formatEuro(gainsTotal)}
                </strong>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 10,
                  color: COLORS.muted,
                  fontSize: 12,
                  lineHeight: 1.55,
                }}
              >
                <span>✅ {nbGainsRenseignes} {isKreol ? "gain(s) renseignés" : "gain(s) renseigné(s)"}</span>
                <span>🟢 {nbAccepte} {isKreol ? "dossier(s) accepté(s)" : "dossier(s) accepté(s)"}</span>
                {gainsMoyen > 0 && <span>📊 {isKreol ? "Moyenne" : "Moyenne"} : {formatEuro(gainsMoyen)}</span>}
                {demarchesAccepteesSansGain.length > 0 && (
                  <span style={{ color: COLORS.yellow, fontWeight: 900 }}>
                    ⚠️ {demarchesAccepteesSansGain.length} {isKreol ? "gain(s) à renseigner" : "gain(s) à renseigner"}
                  </span>
                )}
              </div>

              {derniersGains.length > 0 && (
                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gap: 6,
                    color: COLORS.text,
                    fontSize: 12,
                  }}
                >
                  <div style={{ color: COLORS.green, fontWeight: 900 }}>
                    {isKreol ? "Derniers gains enregistrés" : "Derniers gains enregistrés"}
                  </div>
                  {derniersGains.map(gain => (
                    <div
                      key={`gain-${gain.id}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        background: "rgba(255,255,255,.045)",
                        border: "1px solid rgba(255,255,255,.08)",
                        borderRadius: 10,
                        padding: "7px 9px",
                      }}
                    >
                      <span>{isKreol ? gain.title_kr || gain.title || gain.aide_nom : gain.title || gain.aide_nom}</span>
                      <strong style={{ color: COLORS.green }}>{formatEuro(getGainAmount(gain))}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(nbDeadlinesProches > 0 ||
              nbDeadlinesDepassees > 0 ||
              nbAttenteLongue > 0 ||
              nbDocumentsApreparer > 0 ||
              demarchesAccepteesSansGain.length > 0) && (
              <div
                style={{
                  marginTop: 14,
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
                  gap: 10,
                }}
              >
                {nbDeadlinesDepassees > 0 && (
                  <AlertBox
                    color={COLORS.red}
                    text={`⚠️ ${nbDeadlinesDepassees} date limite dépassée`}
                  />
                )}

                {nbDeadlinesProches > 0 && (
                  <AlertBox
                    color={COLORS.yellow}
                    text={
                      isKreol
                        ? `⏰ ${nbDeadlinesProches} date limite i approche`
                        : `⏰ ${nbDeadlinesProches} date limite approche`
                    }
                  />
                )}

                {nbAttenteLongue > 0 && (
                  <AlertBox
                    color={COLORS.accent}
                    text={`🔔 ${nbAttenteLongue} dossier en attente depuis 14 jours`}
                  />
                )}

                {nbDocumentsApreparer > 0 && (
                  <AlertBox
                    color={COLORS.cyan}
                    text={
                      isKreol
                        ? `📄 ${nbDocumentsApreparer} dossier avec dokiman à préparé`
                        : `📄 ${nbDocumentsApreparer} dossier avec documents à préparer`
                    }
                  />
                )}


                {demarchesAccepteesSansGain.length > 0 && (
                  <AlertBox
                    color={COLORS.yellow}
                    text={
                      isKreol
                        ? `💰 ${demarchesAccepteesSansGain.length} dossier accepté avec gain à renseigner`
                        : `💰 ${demarchesAccepteesSansGain.length} dossier accepté avec gain à renseigner`
                    }
                  />
                )}
              </div>
            )}
          </div>
        )}

        {loadingDemarches ? (
          <div style={{ color: COLORS.muted, fontSize: 13 }}>
            Chargement...
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
              ? "Aucune démarche pou le moman. Alé dann Bon plan détecté, ouvre une aide, puis clique su “Azout dann mes démarches”."
              : "Aucune démarche pour le moment. Allez dans Opportunités détectées, ouvrez une aide, puis cliquez sur “Ajouter à mes démarches”."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {sortedDemarches.map(demarche => {
              const status = getStatus(demarche.status, isKreol)
              const title = isKreol
                ? demarche.title_kr || demarche.title || demarche.aide_nom || "Démarche"
                : demarche.title || demarche.aide_nom || "Démarche"
              const daysLeft = getDaysLeft(demarche.deadline)

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
                    <div
                      style={{
                        color: COLORS.text,
                        fontWeight: 900,
                        fontSize: 15,
                        marginBottom: 6,
                      }}
                    >
                      {title}
                    </div>

                    {getDemarchePriorityLabel(demarche, isKreol) && (
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: `${getDemarchePriorityLabel(demarche, isKreol).color}18`,
                          border: `1px solid ${getDemarchePriorityLabel(demarche, isKreol).color}44`,
                          color: getDemarchePriorityLabel(demarche, isKreol).color,
                          borderRadius: 999,
                          padding: "4px 9px",
                          fontSize: 11,
                          fontWeight: 900,
                          marginBottom: 8,
                          marginRight: 8,
                        }}
                      >
                        {getDemarchePriorityLabel(demarche, isKreol).text}
                      </div>
                    )}

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
                      ● {status.label}
                    </div>

                    <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.6 }}>
                      📅 {isKreol ? "Ajouté le" : "Ajouté le"}{" "}
                      {formatDate(demarche.created_at)}
                    </div>

                    {demarche.updated_at && (
                      <div style={{ color: COLORS.muted, fontSize: 12 }}>
                        🔄 {isKreol ? "Miz à jour" : "Mis à jour"}{" "}
                        {formatDate(demarche.updated_at)}
                      </div>
                    )}

                    {demarche.deadline && (
                      <div
                        style={{
                          marginTop: 6,
                          color:
                            daysLeft !== null && daysLeft < 0
                              ? COLORS.red
                              : daysLeft !== null && daysLeft <= 7
                                ? COLORS.yellow
                                : COLORS.muted,
                          fontSize: 12,
                          fontWeight: daysLeft !== null && daysLeft <= 7 ? 800 : 600,
                        }}
                      >
                        ⏰ Date limite : {formatDate(demarche.deadline)}
                        {daysLeft !== null && daysLeft >= 0
                          ? ` • ${daysLeft} jour(s) restant(s)`
                          : ""}
                        {daysLeft !== null && daysLeft < 0 ? " • dépassée" : ""}
                      </div>
                    )}

                    {demarche.notes && (
                      <div
                        style={{
                          marginTop: 8,
                          color: COLORS.text,
                          fontSize: 12,
                          background: "rgba(255,255,255,.045)",
                          border: "1px solid rgba(255,255,255,.08)",
                          borderRadius: 10,
                          padding: 10,
                          lineHeight: 1.55,
                          whiteSpace: "pre-line",
                        }}
                      >
                        <div
                          style={{
                            color: COLORS.cyan,
                            fontWeight: 900,
                            marginBottom: 6,
                          }}
                        >
                          📝 {isKreol ? "Journal suivi" : "Journal de suivi"}
                        </div>
                        {demarche.notes}
                      </div>
                    )}

                    {demarche.documents_ready && (
                      <div
                        style={{
                          marginTop: 6,
                          color: COLORS.green,
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        ✅ {isKreol ? "Dokiman préparé" : "Documents prêts"}
                      </div>
                    )}

                    {demarche.status === "accepte" && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: 12,
                          background: "rgba(34,197,94,.08)",
                          border: "1px solid rgba(34,197,94,.25)",
                          borderRadius: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            color: COLORS.green,
                            fontWeight: 900,
                            fontSize: 13,
                            marginBottom: 10,
                          }}
                        >
                          <CheckCircle2 size={16} />
                          {isKreol ? "Zéd aksepté - indique le montant gagné" : "Aide acceptée - indiquez le montant obtenu"}
                        </div>

                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                          <input
                            type="number"
                            min="0"
                            value={gainInputs[demarche.id] ?? demarche.montant_obtenu ?? ""}
                            onChange={e =>
                              setGainInputs(prev => ({
                                ...prev,
                                [demarche.id]: e.target.value,
                              }))
                            }
                            placeholder={isKreol ? "Montan obtenu" : "Montant obtenu"}
                            style={{
                              background: COLORS.card,
                              border: `1px solid ${COLORS.border}`,
                              borderRadius: 10,
                              padding: "9px 10px",
                              color: COLORS.text,
                              fontSize: 12,
                              fontFamily: "inherit",
                              width: 170,
                            }}
                          />

                          <button
                            type="button"
                            onClick={() => saveGain(demarche)}
                            disabled={savingId === demarche.id}
                            style={{
                              background: savingId === demarche.id ? "rgba(142,164,197,.35)" : COLORS.green,
                              color: COLORS.card,
                              border: "none",
                              borderRadius: 10,
                              padding: "9px 12px",
                              cursor: savingId === demarche.id ? "not-allowed" : "pointer",
                              fontSize: 12,
                              fontWeight: 900,
                              fontFamily: "inherit",
                            }}
                          >
                            {isKreol ? "Sauvegard gain" : "Sauvegarder le gain"}
                          </button>
                        </div>

                        {getGainAmount(demarche) > 0 ? (
                          <div
                            style={{
                              marginTop: 8,
                              color: COLORS.green,
                              fontWeight: 800,
                              fontSize: 12,
                            }}
                          >
                            ✅ {isKreol ? "Gain enregistré" : "Gain enregistré"} : {formatEuro(demarche.montant_obtenu)}
                          </div>
                        ) : (
                          <div
                            style={{
                              marginTop: 8,
                              color: COLORS.yellow,
                              fontWeight: 800,
                              fontSize: 12,
                            }}
                          >
                            ⚠️ {isKreol ? "Renseigne le montant pour l’ajouter aux gains cumulés." : "Renseignez le montant pour l’ajouter aux gains cumulés."}
                          </div>
                        )}
                      </div>
                    )}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "1fr 180px",
                        gap: 10,
                        marginTop: 12,
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <textarea
                          value={noteDrafts[demarche.id] || ""}
                          onChange={e =>
                            setNoteDrafts(prev => ({
                              ...prev,
                              [demarche.id]: e.target.value,
                            }))
                          }
                          placeholder={
                            isKreol
                              ? "📝 Ajoute une note : appel CAF, RDV, pièce manquante..."
                              : "📝 Ajouter une note : appel CAF, RDV, pièce manquante..."
                          }
                          style={{
                            minHeight: 70,
                            background: COLORS.card,
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 12,
                            padding: 10,
                            color: COLORS.text,
                            fontSize: 12,
                            fontFamily: "inherit",
                            resize: "vertical",
                          }}
                        />

                        <button
                          type="button"
                          onClick={() => addFollowUpNote(demarche)}
                          disabled={savingId === demarche.id}
                          style={{
                            alignSelf: "flex-start",
                            background:
                              savingId === demarche.id
                                ? "rgba(142,164,197,.25)"
                                : `linear-gradient(135deg, ${COLORS.cyan}, ${COLORS.accent})`,
                            border: "none",
                            borderRadius: 10,
                            color: COLORS.card,
                            padding: "8px 12px",
                            cursor:
                              savingId === demarche.id ? "not-allowed" : "pointer",
                            fontSize: 12,
                            fontWeight: 900,
                            fontFamily: "inherit",
                          }}
                        >
                          {isKreol ? "➕ Ajout note" : "➕ Ajouter au journal"}
                        </button>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            color: COLORS.text,
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(demarche.documents_ready)}
                            onChange={e =>
                              updateDemarche(demarche.id, {
                                documents_ready: e.target.checked,
                              })
                            }
                          />
                          {isKreol ? "Dokiman prêts" : "Documents prêts"}
                        </label>

                        <input
                          type="date"
                          value={demarche.deadline || ""}
                          onChange={e =>
                            updateDemarche(demarche.id, {
                              deadline: e.target.value || null,
                            })
                          }
                          style={{
                            background: COLORS.card,
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 10,
                            padding: "9px 10px",
                            color: COLORS.text,
                            fontSize: 12,
                            fontFamily: "inherit",
                          }}
                        />

                        {savingId === demarche.id && (
                          <div style={{ color: COLORS.cyan, fontSize: 11 }}>
                            Sauvegarde...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <select
                    value={demarche.status || "a_faire"}
                    onChange={e =>
                      updateDemarche(demarche.id, {
                        status: e.target.value,
                      })
                    }
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
                    {STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {isKreol ? option.kr : option.fr}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => deleteDemarche(demarche.id)}
                    style={{
                      background: "rgba(251,113,133,.10)",
                      border: "1px solid rgba(251,113,133,.28)",
                      borderRadius: 10,
                      color: COLORS.red,
                      padding: "9px 11px",
                      cursor: "pointer",
                      fontWeight: 900,
                      fontFamily: "inherit",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
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
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
          gap: 16,
        }}
      >
        {AIDES.map((aide, index) => {
          const theme = CARD_VARIANTS[index % CARD_VARIANTS.length]
          const Icon = theme.Icon

          return (
            <article
              key={aide.id}
              style={{
                position: "relative",
                overflow: "hidden",
                background: theme.bg,
                border: `1px solid ${theme.border}`,
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
                    {aide.label}
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
                    {t("aides", aide.statutKey)}
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
                  {aide.montant}
                </div>

                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 13,
                    color: "rgba(248,250,252,.68)",
                    fontWeight: 600,
                  }}
                >
                  {t("aides", theme.labelKey)}
                </p>

                {aide.statutKey !== "statutActif" && (
                  <button
                    type="button"
                    onClick={() => openExternalLink(getAideLink(aide))}
                    style={{
                      marginTop: 16,
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
                    {t("aides", "cta")} →
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </section>

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