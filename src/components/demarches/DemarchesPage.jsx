import { useEffect, useState } from "react"
import {
  ClipboardCheck,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  FileText,
  Mail,
  FolderCheck,
  Scale,
  HelpCircle,
  Lock,
  PlusCircle,
  X,
} from "lucide-react"

import { supabase } from "../../services/supabase"

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
  orange: "#FB923C",
  purple: "#A78BFA",
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

function getIsKreol(language) {
  return language === "kreol" || language === "cr" || language === "re"
}

function getCategoryColor(category) {
  const key = String(category || "").toLowerCase().trim()

  const colors = {
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
  }

  return colors[key] || COLORS.accent
}

function getAideAmountLabel(aide = {}) {
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

function getStatus(statut, isKreol) {
  const found = SUIVI_STATUSES.find(item => item.value === statut) || SUIVI_STATUSES[0]

  return {
    ...found,
    label: isKreol ? found.kr : found.fr,
  }
}

function formatDate(value) {
  if (!value) return "—"

  try {
    return new Date(value).toLocaleDateString("fr-FR")
  } catch {
    return String(value)
  }
}

function parseMontantObtenu(value) {
  if (value === "" || value === null || value === undefined) return null

  const normalized = String(value)
    .replace(",", ".")
    .replace(/[^\d.]/g, "")

  const parts = normalized.split(".")
  const clean =
    parts.length > 1
      ? `${parts[0]}.${parts.slice(1).join("")}`
      : normalized

  const number = Number(clean)

  return Number.isFinite(number) ? number : null
}

function getReminderInfo(reminder, isKreol) {
  if (!reminder?.date) {
    return {
      text: isKreol ? "Rappel enregistré" : "Rappel enregistré",
      color: COLORS.yellow,
      bg: "rgba(252,211,77,.10)",
      border: "1px solid rgba(252,211,77,.24)",
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const target = new Date(`${reminder.date}T00:00:00`)
  target.setHours(0, 0, 0, 0)

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000)

  if (diffDays < 0) {
    return {
      text: isKreol
        ? `Relance en retard depuis ${Math.abs(diffDays)} jour(s)`
        : `Relance en retard depuis ${Math.abs(diffDays)} jour(s)`,
      color: COLORS.red,
      bg: "rgba(251,113,133,.10)",
      border: "1px solid rgba(251,113,133,.28)",
    }
  }

  if (diffDays === 0) {
    return {
      text: isKreol ? "Relance prévue aujourd’hui" : "Relance prévue aujourd’hui",
      color: COLORS.orange,
      bg: "rgba(251,146,60,.10)",
      border: "1px solid rgba(251,146,60,.28)",
    }
  }

  return {
    text: isKreol
      ? `Relance prévue dans ${diffDays} jour(s)`
      : `Relance prévue dans ${diffDays} jour(s)`,
    color: COLORS.green,
    bg: "rgba(34,197,94,.10)",
    border: "1px solid rgba(34,197,94,.26)",
  }
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
    amountObtained: row.montant_obtenu ?? row.amount_obtained ?? "",
    dateObtention: row.date_obtention || row.obtained_at || "",
    documents: Array.isArray(row.documents) ? row.documents : [],
    notes: row.notes || "",
    dateLimit: row.date_limite || row.deadline || "",
    category: aide.categorie || "aide",
    color: getCategoryColor(aide.categorie || "aide"),
    aide,
  }
}

export default function DemarchesPage({
  user,
  language = "fr",
  isMobile = false,
  isPremiumPlus = false,
  onGoAides,
  onGoPremium,
}) {
  const isKreol = getIsKreol(language)

  const [demarches, setDemarches] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [selectedTool, setSelectedTool] = useState(null)
  const [reminders, setReminders] = useState({})
  const [gainModalDemarche, setGainModalDemarche] = useState(null)

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
    fetchDemarches()
    setSelectedTool(null)
  }, [user?.id])

  useEffect(() => {
    fetchReminders()
  }, [user?.id])

  async function fetchDemarches() {
    if (!user?.id) {
      setDemarches([])
      setLoading(false)
      return
    }

    setLoading(true)
    setErrorMessage("")

    const { data, error } = await supabase
      .from("user_aide_demarche")
      .select(`
        id,
        user_id,
        aide_id,
        statut,
        montant_obtenu,
        date_obtention,
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
      setErrorMessage(isKreol ? "Erreur chargement démarches." : "Erreur chargement des démarches.")
      setDemarches([])
    } else {
      setDemarches((data || []).map(normalizeDemarche))
    }

    setLoading(false)
  }

  async function updateDemarcheStatus(demarcheId, statut) {
    if (!demarcheId) return

    setSavingId(demarcheId)
    setErrorMessage("")

    const { data, error } = await supabase
      .from("user_aide_demarche")
      .update({ statut })
      .eq("id", demarcheId)
      .eq("user_id", user.id)
      .select(`
        id,
        user_id,
        aide_id,
        statut,
        montant_obtenu,
        date_obtention,
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

    const normalizedDemarche = normalizeDemarche(data)

    setDemarches(prev =>
      prev.map(item => (item.id === demarcheId ? normalizedDemarche : item))
    )

    if (statut === "obtenue") {
      setGainModalDemarche(normalizedDemarche)
    }
  }

  async function updateDemarcheGain(demarcheId, payload = {}) {
    if (!demarcheId || !user?.id) return { error: new Error("Utilisateur non connecté.") }

    const montantObtenu = parseMontantObtenu(payload.montant_obtenu)
    const dateObtention = payload.date_obtention || null

    setSavingId(demarcheId)
    setErrorMessage("")

    const { data, error } = await supabase
      .from("user_aide_demarche")
      .update({
        montant_obtenu: montantObtenu,
        date_obtention: dateObtention,
        statut: "obtenue",
      })
      .eq("id", demarcheId)
      .eq("user_id", user.id)
      .select(`
        id,
        user_id,
        aide_id,
        statut,
        montant_obtenu,
        date_obtention,
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
      console.error("Erreur sauvegarde gain obtenu:", error)
      setErrorMessage(isKreol ? "Erreur pendant sauvegarde gain." : "Erreur pendant la sauvegarde du gain obtenu.")
      return { error }
    }

    const normalizedDemarche = normalizeDemarche(data)

    setDemarches(prev =>
      prev.map(item => (item.id === demarcheId ? normalizedDemarche : item))
    )

    setGainModalDemarche(null)
    return { data, error: null }
  }

  async function deleteDemarche(id) {
    const confirmText = isKreol ? "Supprim cette démarche ?" : "Supprimer cette démarche ?"

    if (!window.confirm(confirmText)) return

    setSavingId(id)
    setErrorMessage("")

    const { error } = await supabase
      .from("user_aide_demarche")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    setSavingId(null)

    if (error) {
      console.error("Erreur suppression démarche:", error)
      setErrorMessage(isKreol ? "Erreur pendant suppression." : "Erreur pendant la suppression.")
      return
    }

    setDemarches(prev => prev.filter(item => item.id !== id))
  }

  async function fetchReminders() {
    if (!user?.id) {
      setReminders({})
      return
    }

    const { data, error } = await supabase
      .from("user_reminders")
      .select("id, user_id, demarche_id, reminder_date, note, updated_at")
      .eq("user_id", user.id)

    if (error) {
      console.error("Erreur chargement rappels:", error)
      setErrorMessage(isKreol ? "Erreur chargement rappels." : "Erreur chargement des rappels.")
      setReminders({})
      return
    }

    const mapped = {}

    ;(data || []).forEach(item => {
      if (!item.demarche_id) return

      mapped[item.demarche_id] = {
        id: item.id,
        date: item.reminder_date || "",
        note: item.note || "",
        updatedAt: item.updated_at || "",
      }
    })

    setReminders(mapped)
  }

  async function saveReminder(demarcheId, reminder) {
    if (!demarcheId || !user?.id) return { error: new Error("Utilisateur non connecté.") }

    setSavingId(demarcheId)
    setErrorMessage("")

    const cleanReminder = {
      user_id: user.id,
      demarche_id: demarcheId,
      reminder_date: reminder.date || null,
      note: reminder.note || "",
    }

    const existingId = reminders[demarcheId]?.id

    let result

    if (existingId) {
      result = await supabase
        .from("user_reminders")
        .update({
          reminder_date: cleanReminder.reminder_date,
          note: cleanReminder.note,
        })
        .eq("id", existingId)
        .eq("user_id", user.id)
        .select("id, user_id, demarche_id, reminder_date, note, updated_at")
        .single()
    } else {
      result = await supabase
        .from("user_reminders")
        .insert(cleanReminder)
        .select("id, user_id, demarche_id, reminder_date, note, updated_at")
        .single()
    }

    setSavingId(null)

    const { data, error } = result

    if (error) {
      console.error("Erreur sauvegarde rappel:", error)
      setErrorMessage(isKreol ? "Erreur pendant sauvegarde rappel." : "Erreur pendant la sauvegarde du rappel.")
      return { error }
    }

    setReminders(prev => ({
      ...prev,
      [demarcheId]: {
        id: data.id,
        date: data.reminder_date || "",
        note: data.note || "",
        updatedAt: data.updated_at || "",
      },
    }))

    return { data, error: null }
  }

  async function deleteReminder(demarcheId) {
    if (!demarcheId || !user?.id) return { error: new Error("Utilisateur non connecté.") }

    const reminderId = reminders[demarcheId]?.id

    setSavingId(demarcheId)
    setErrorMessage("")

    if (reminderId) {
      const { error } = await supabase
        .from("user_reminders")
        .delete()
        .eq("id", reminderId)
        .eq("user_id", user.id)

      setSavingId(null)

      if (error) {
        console.error("Erreur suppression rappel:", error)
        setErrorMessage(isKreol ? "Erreur pendant suppression rappel." : "Erreur pendant la suppression du rappel.")
        return { error }
      }
    } else {
      setSavingId(null)
    }

    setReminders(prev => {
      const next = { ...prev }
      delete next[demarcheId]
      return next
    })

    return { error: null }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
        <h2
          style={{
            margin: "0 0 8px",
            fontSize: isMobile ? 26 : 34,
            color: COLORS.text,
            fontFamily: "'DM Serif Display', Georgia, serif",
            fontWeight: 900,
          }}
        >
          📋 {isKreol ? "Mon bann démarches" : "Mes démarches"}
        </h2>

        <p
          style={{
            margin: 0,
            color: COLORS.muted,
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          {isKreol
            ? "Suiv ici tout bann aides ou la ajouté depuis Aides & Droits."
            : "Suivez ici toutes les aides ajoutées depuis Aides & Droits."}
        </p>
      </section>

      {errorMessage && (
        <AlertBox color={COLORS.red} text={`⚠️ ${errorMessage}`} />
      )}

      {demarches.length > 0 && (
        <div
          style={{
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 16,
            padding: 16,
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

      {loading ? (
        <AlertBox
          color={COLORS.cyan}
          text={isKreol ? "Chargement..." : "Chargement..."}
        />
      ) : demarches.length === 0 ? (
        <div
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 22,
            padding: isMobile ? 24 : 34,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 52, marginBottom: 12 }}>📭</div>
          <div style={{ color: COLORS.text, fontSize: 21, fontWeight: 900, marginBottom: 8 }}>
            {isKreol ? "Ou nana pa ankor ajouté démarche." : "Vous n'avez pas encore ajouté de démarche."}
          </div>
          <div style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.55 }}>
            {isKreol
              ? "Retourne dann Aides & Droits épi appuie su “Ajouter à mes démarches”."
              : "Retournez dans Aides & Droits puis appuyez sur “Ajouter à mes démarches”."}
          </div>

          {onGoAides && (
            <button
              type="button"
              onClick={onGoAides}
              style={{
                marginTop: 18,
                background: COLORS.cyan,
                border: "none",
                borderRadius: 12,
                color: COLORS.card,
                padding: "11px 15px",
                cursor: "pointer",
                fontWeight: 900,
                fontFamily: "inherit",
              }}
            >
              <PlusCircle size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              {isKreol ? "Voir Aides & Droits" : "Voir Aides & Droits"}
            </button>
          )}
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
                  borderRadius: 18,
                  padding: 16,
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
                      color: status.color,
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
                      value={
                        demarche.amountObtained
                          ? `${demarche.amountObtained} €${demarche.dateObtention ? ` · ${formatDate(demarche.dateObtention)}` : ""}`
                          : "—"
                      }
                      color={COLORS.green}
                      icon="✅"
                    />
                    <MiniInfoBox
                      label={isKreol ? "Date ajout" : "Date d’ajout"}
                      value={formatDate(demarche.created_at)}
                      color={COLORS.cyan}
                      icon="📅"
                    />
                  </div>

                  {demarche.updated_at && (
                    <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 8 }}>
                      🔄 {isKreol ? "Miz à jour" : "Mis à jour"} {formatDate(demarche.updated_at)}
                    </div>
                  )}

                  {reminders[demarche.id] && (() => {
                    const reminderInfo = getReminderInfo(reminders[demarche.id], isKreol)

                    return (
                      <div
                        style={{
                          marginTop: 8,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: reminderInfo.bg,
                          border: reminderInfo.border,
                          borderRadius: 999,
                          padding: "5px 9px",
                          color: reminderInfo.color,
                          fontSize: 11,
                          fontWeight: 900,
                        }}
                      >
                        ⏰ {reminderInfo.text}
                        {reminders[demarche.id]?.date && (
                          <span style={{ opacity: 0.9 }}>
                            · {formatDate(reminders[demarche.id].date)}
                          </span>
                        )}
                      </div>
                    )
                  })()}

                  {(demarche.demarches_fr || demarche.demarches_kr) && (
                    <div
                      style={{
                        marginTop: 10,
                        background: "rgba(35,211,214,.08)",
                        border: "1px solid rgba(35,211,214,.18)",
                        borderRadius: 12,
                        padding: 10,
                        color: COLORS.muted,
                        fontSize: 12,
                        lineHeight: 1.5,
                      }}
                    >
                      <strong style={{ color: COLORS.cyan }}>
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
                          : "À compléter plus tard"
                      }
                    />
                    <InfoPanel
                      title={isKreol ? "📝 Notes" : "📝 Notes"}
                      text={demarche.notes || "Aucune note pour le moment"}
                    />
                  </div>

                  <DemarchePremiumTools
                    demarche={demarche}
                    isKreol={isKreol}
                    isPremiumPlus={isPremiumPlus}
                    onGoPremium={onGoPremium}
                    onOpenTool={(tool, currentDemarche) =>
                      setSelectedTool({ tool, demarche: currentDemarche })
                    }
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

      {selectedTool?.tool === "prepare_dossier" && (
        <PreparationDossierPanel
          demarche={selectedTool.demarche}
          isKreol={isKreol}
          isMobile={isMobile}
          onClose={() => setSelectedTool(null)}
        />
      )}

      {selectedTool?.tool === "generate_email" && (
        <GeneratedEmailPanel
          demarche={selectedTool.demarche}
          isKreol={isKreol}
          isMobile={isMobile}
          onClose={() => setSelectedTool(null)}
        />
      )}

      {selectedTool?.tool === "generate_letter" && (
        <GeneratedLetterPanel
          demarche={selectedTool.demarche}
          isKreol={isKreol}
          isMobile={isMobile}
          onClose={() => setSelectedTool(null)}
        />
      )}

      {selectedTool?.tool === "understand_refusal" && (
        <UnderstandRefusalPanel
          demarche={selectedTool.demarche}
          isKreol={isKreol}
          isMobile={isMobile}
          onClose={() => setSelectedTool(null)}
        />
      )}

      {selectedTool?.tool === "prepare_appeal" && (
        <PrepareAppealPanel
          demarche={selectedTool.demarche}
          isKreol={isKreol}
          isMobile={isMobile}
          onClose={() => setSelectedTool(null)}
        />
      )}

      {selectedTool?.tool === "admin_reminder" && (
        <AdminReminderPanel
          demarche={selectedTool.demarche}
          reminder={reminders[selectedTool.demarche?.id] || null}
          isKreol={isKreol}
          isMobile={isMobile}
          onSave={saveReminder}
          onDelete={deleteReminder}
          onClose={() => setSelectedTool(null)}
        />
      )}

      {gainModalDemarche && (
        <GainObtainedPanel
          demarche={gainModalDemarche}
          isKreol={isKreol}
          isMobile={isMobile}
          onSave={updateDemarcheGain}
          onClose={() => setGainModalDemarche(null)}
        />
      )}

      {selectedTool?.tool &&
        selectedTool.tool !== "prepare_dossier" &&
        selectedTool.tool !== "generate_email" &&
        selectedTool.tool !== "generate_letter" &&
        selectedTool.tool !== "understand_refusal" &&
        selectedTool.tool !== "prepare_appeal" &&
        selectedTool.tool !== "admin_reminder" && (
          <ComingSoonPanel
            demarche={selectedTool.demarche}
            isKreol={isKreol}
            isMobile={isMobile}
            tool={selectedTool.tool}
            onClose={() => setSelectedTool(null)}
          />
        )}
    </div>
  )
}

function MiniInfoBox({ label, value, color, icon }) {
  return (
    <div
      style={{
        background: "rgba(10,22,40,.40)",
        border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 12,
        padding: "9px 10px",
      }}
    >
      <div style={{ color: COLORS.muted, fontSize: 10.5, fontWeight: 900, marginBottom: 4 }}>
        {icon} {label}
      </div>
      <div style={{ color, fontSize: 13, fontWeight: 900 }}>
        {value}
      </div>
    </div>
  )
}

function InfoPanel({ title, text }) {
  return (
    <div
      style={{
        background: "rgba(10,22,40,.34)",
        border: "1px solid rgba(255,255,255,.07)",
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

function DemarchePremiumTools({
  demarche,
  isKreol,
  isPremiumPlus,
  onGoPremium,
  onOpenTool,
}) {
  const tools = [
    {
      id: "prepare_dossier",
      icon: <FolderCheck size={14} />,
      label: isKreol ? "Prépar mon dossier" : "Préparer mon dossier",
      enabled: true,
    },
    {
      id: "generate_letter",
      icon: <FileText size={14} />,
      label: isKreol ? "Génér courrier" : "Générer un courrier",
      enabled: true,
    },
    {
      id: "generate_email",
      icon: <Mail size={14} />,
      label: isKreol ? "Génér email" : "Générer un email",
      enabled: true,
    },
    {
      id: "prepare_appeal",
      icon: <Scale size={14} />,
      label: isKreol ? "Prépar recours" : "Préparer un recours",
      enabled: true,
    },
    {
      id: "admin_reminder",
      icon: <Clock size={14} />,
      label: isKreol ? "Mettre rappel" : "Ajouter un rappel",
      enabled: true,
    },
    {
      id: "understand_refusal",
      icon: <HelpCircle size={14} />,
      label: isKreol ? "Comprann refus" : "Comprendre un refus",
      enabled: true,
    },
  ]

  function handleToolClick(tool) {
    if (!isPremiumPlus) {
      if (onGoPremium) onGoPremium()
      return
    }

    if (
      (tool.id === "prepare_dossier" ||
        tool.id === "generate_email" ||
        tool.id === "generate_letter" ||
        tool.id === "understand_refusal" ||
        tool.id === "prepare_appeal" ||
        tool.id === "admin_reminder") &&
      onOpenTool
    ) {
      onOpenTool(tool.id, demarche)
      return
    }

    if (onOpenTool) {
      onOpenTool(tool.id, demarche)
    }
  }

  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px solid rgba(255,255,255,.08)",
      }}
    >
      <div
        style={{
          color: isPremiumPlus ? COLORS.purple : COLORS.yellow,
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
            key={tool.id}
            type="button"
            onClick={() => handleToolClick(tool)}
            title={
              isPremiumPlus
                ? tool.enabled
                  ? ""
                  : isKreol
                    ? "Fonction bientôt disponible"
                    : "Fonction bientôt disponible"
                : isKreol
                  ? "Réservé Premium+"
                  : "Réservé Premium+"
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: isPremiumPlus ? "rgba(167,139,250,.12)" : "rgba(252,211,77,.08)",
              border: isPremiumPlus ? "1px solid rgba(167,139,250,.25)" : "1px solid rgba(252,211,77,.22)",
              color: isPremiumPlus ? "#DDD6FE" : COLORS.yellow,
              borderRadius: 999,
              padding: "7px 9px",
              cursor: isPremiumPlus ? "pointer" : "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 900,
              opacity: isPremiumPlus && !tool.enabled ? 0.75 : 1,
            }}
          >
            {!isPremiumPlus && <Lock size={12} />}
            {tool.icon}
            {tool.label}
            {isPremiumPlus && !tool.enabled && " · bientôt"}
          </button>
        ))}
      </div>
    </div>
  )
}

function PreparationDossierPanel({ demarche, isKreol, isMobile, onClose }) {
  const title = isKreol
    ? demarche.title_kr || demarche.title || "Démarche"
    : demarche.title || "Démarche"

  const documents = getSuggestedDocuments(demarche, isKreol)
  const steps = getSuggestedSteps(demarche, isKreol)
  const warning = getPreparationWarning(demarche, isKreol)

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(3,7,18,.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 22,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 900,
          maxHeight: isMobile ? "100dvh" : "88dvh",
          overflowY: "auto",
          background: "linear-gradient(135deg, #0F1E38, #132747)",
          border: `1px solid ${COLORS.border}`,
          borderRadius: isMobile ? 0 : 24,
          padding: isMobile ? 18 : 24,
          boxShadow: "0 24px 80px rgba(0,0,0,.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            marginBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                color: COLORS.purple,
                fontWeight: 900,
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              ✨ Premium+ · {isKreol ? "Prépar dossier" : "Préparer mon dossier"}
            </div>

            <h2
              style={{
                color: COLORS.text,
                margin: 0,
                fontSize: isMobile ? 24 : 32,
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontWeight: 900,
              }}
            >
              📋 {title}
            </h2>

            <p
              style={{
                color: COLORS.muted,
                margin: "8px 0 0",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              {isKreol
                ? "BudgetKazPei prépare une checklist simple pou ou rassembl bann pièces avant l’envoi."
                : "BudgetKazPei prépare une checklist simple pour rassembler les pièces avant l’envoi."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              width: 38,
              height: 38,
              borderRadius: 12,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.1fr .9fr",
            gap: 14,
          }}
        >
          <PanelCard title={isKreol ? "📄 Documents à préparer" : "📄 Documents à préparer"}>
            <div style={{ display: "grid", gap: 9 }}>
              {documents.map((doc, index) => (
                <CheckRow key={index} text={doc} />
              ))}
            </div>
          </PanelCard>

          <PanelCard title={isKreol ? "💰 Infos à vérifier" : "💰 Infos à vérifier"}>
            <InfoLine
              label={isKreol ? "Montant estimé" : "Montant estimé"}
              value={demarche.amountLabel || "À vérifier"}
              color={COLORS.yellow}
            />
            <InfoLine
              label={isKreol ? "Statut actuel" : "Statut actuel"}
              value={getStatus(demarche.status, isKreol).label}
              color={getStatus(demarche.status, isKreol).color}
            />
            <InfoLine
              label={isKreol ? "Date ajout" : "Date d’ajout"}
              value={formatDate(demarche.created_at)}
              color={COLORS.cyan}
            />
          </PanelCard>
        </div>

        <PanelCard
          title={isKreol ? "🧭 Étapes conseillées" : "🧭 Étapes conseillées"}
          style={{ marginTop: 14 }}
        >
          <ol
            style={{
              margin: 0,
              paddingLeft: 20,
              color: COLORS.muted,
              fontSize: 13,
              lineHeight: 1.8,
            }}
          >
            {steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </PanelCard>

        <div
          style={{
            marginTop: 14,
            background: "rgba(252,211,77,.10)",
            border: "1px solid rgba(252,211,77,.25)",
            borderRadius: 16,
            padding: 14,
            color: COLORS.yellow,
            fontSize: 13,
            lineHeight: 1.55,
            fontWeight: 800,
          }}
        >
          ⚠️ {warning}
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              borderRadius: 13,
              padding: "11px 14px",
              cursor: "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            {isKreol ? "Fermer" : "Fermer"}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            style={{
              background: COLORS.purple,
              border: "none",
              color: "#fff",
              borderRadius: 13,
              padding: "11px 14px",
              cursor: "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            {isKreol ? "Imprimer checklist" : "Imprimer la checklist"}
          </button>
        </div>
      </div>
    </div>
  )
}

function GeneratedEmailPanel({ demarche, isKreol, isMobile, onClose }) {
  const [copied, setCopied] = useState(false)

  const title = isKreol
    ? demarche.title_kr || demarche.title || "cette aide"
    : demarche.title || "cette aide"

  const subject = getGeneratedEmailSubject(demarche, isKreol)
  const body = getGeneratedEmailBody(demarche, isKreol)

  async function copyEmail() {
    const content = `Objet : ${subject}\n\n${body}`

    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      const textarea = document.createElement("textarea")
      textarea.value = content
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(3,7,18,.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 22,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 900,
          maxHeight: isMobile ? "100dvh" : "88dvh",
          overflowY: "auto",
          background: "linear-gradient(135deg, #0F1E38, #132747)",
          border: `1px solid ${COLORS.border}`,
          borderRadius: isMobile ? 0 : 24,
          padding: isMobile ? 18 : 24,
          boxShadow: "0 24px 80px rgba(0,0,0,.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            marginBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                color: COLORS.purple,
                fontWeight: 900,
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              ✨ Premium+ · {isKreol ? "Génér email" : "Générer un email"}
            </div>

            <h2
              style={{
                color: COLORS.text,
                margin: 0,
                fontSize: isMobile ? 24 : 32,
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontWeight: 900,
              }}
            >
              ✉️ {title}
            </h2>

            <p
              style={{
                color: COLORS.muted,
                margin: "8px 0 0",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              {isKreol
                ? "Modèle neutre, sans nom ni prénom, à vérifier avant envoi."
                : "Modèle neutre, sans nom ni prénom, à vérifier avant envoi."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              width: 38,
              height: 38,
              borderRadius: 12,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <PanelCard title={isKreol ? "📌 Objet" : "📌 Objet"}>
          <div
            style={{
              color: COLORS.yellow,
              fontSize: 14,
              fontWeight: 900,
              lineHeight: 1.5,
            }}
          >
            {subject}
          </div>
        </PanelCard>

        <PanelCard title={isKreol ? "✉️ Email prêt à copier" : "✉️ Email prêt à copier"} style={{ marginTop: 14 }}>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              color: COLORS.text,
              fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            {body}
          </pre>
        </PanelCard>

        <div
          style={{
            marginTop: 14,
            background: "rgba(252,211,77,.10)",
            border: "1px solid rgba(252,211,77,.25)",
            borderRadius: 16,
            padding: 14,
            color: COLORS.yellow,
            fontSize: 13,
            lineHeight: 1.55,
            fontWeight: 800,
          }}
        >
          ⚠️ {isKreol
            ? "BudgetKazPei ne rajoute aucune donnée personnelle automatiquement. Complétez uniquement ce que vous souhaitez partager et vérifiez toujours auprès de l’organisme."
            : "BudgetKazPei n’ajoute aucune donnée personnelle automatiquement. Complétez uniquement ce que vous souhaitez partager et vérifiez toujours auprès de l’organisme."}
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              borderRadius: 13,
              padding: "11px 14px",
              cursor: "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            Fermer
          </button>

          <button
            type="button"
            onClick={copyEmail}
            style={{
              background: COLORS.purple,
              border: "none",
              color: "#fff",
              borderRadius: 13,
              padding: "11px 14px",
              cursor: "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            {copied ? "✅ Copié" : "📋 Copier l’email"}
          </button>
        </div>
      </div>
    </div>
  )
}


function GeneratedLetterPanel({ demarche, isKreol, isMobile, onClose }) {
  const [copied, setCopied] = useState(false)

  const title = isKreol
    ? demarche.title_kr || demarche.title || "cette aide"
    : demarche.title || "cette aide"

  const subject = getGeneratedLetterSubject(demarche, isKreol)
  const body = getGeneratedLetterBody(demarche, isKreol)

  async function copyLetter() {
    const content = `Objet : ${subject}\n\n${body}`

    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      const textarea = document.createElement("textarea")
      textarea.value = content
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(3,7,18,.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 22,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 900,
          maxHeight: isMobile ? "100dvh" : "88dvh",
          overflowY: "auto",
          background: "linear-gradient(135deg, #0F1E38, #132747)",
          border: `1px solid ${COLORS.border}`,
          borderRadius: isMobile ? 0 : 24,
          padding: isMobile ? 18 : 24,
          boxShadow: "0 24px 80px rgba(0,0,0,.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            marginBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                color: COLORS.purple,
                fontWeight: 900,
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              ✨ Premium+ · {isKreol ? "Génér courrier" : "Générer un courrier"}
            </div>

            <h2
              style={{
                color: COLORS.text,
                margin: 0,
                fontSize: isMobile ? 24 : 32,
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontWeight: 900,
              }}
            >
              📄 {title}
            </h2>

            <p
              style={{
                color: COLORS.muted,
                margin: "8px 0 0",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              {isKreol
                ? "Modèle administratif neutre, sans nom ni prénom, à vérifier avant envoi."
                : "Modèle administratif neutre, sans nom ni prénom, à vérifier avant envoi."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              width: 38,
              height: 38,
              borderRadius: 12,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <PanelCard title={isKreol ? "📌 Objet" : "📌 Objet"}>
          <div
            style={{
              color: COLORS.yellow,
              fontSize: 14,
              fontWeight: 900,
              lineHeight: 1.5,
            }}
          >
            {subject}
          </div>
        </PanelCard>

        <PanelCard title={isKreol ? "📄 Courrier prêt à copier" : "📄 Courrier prêt à copier"} style={{ marginTop: 14 }}>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              color: COLORS.text,
              fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            {body}
          </pre>
        </PanelCard>

        <div
          style={{
            marginTop: 14,
            background: "rgba(252,211,77,.10)",
            border: "1px solid rgba(252,211,77,.25)",
            borderRadius: 16,
            padding: 14,
            color: COLORS.yellow,
            fontSize: 13,
            lineHeight: 1.55,
            fontWeight: 800,
          }}
        >
          ⚠️ {isKreol
            ? "BudgetKazPei ne rajoute aucune donnée personnelle automatiquement. Complétez uniquement ce que vous souhaitez partager et vérifiez toujours auprès de l’organisme."
            : "BudgetKazPei n’ajoute aucune donnée personnelle automatiquement. Complétez uniquement ce que vous souhaitez partager et vérifiez toujours auprès de l’organisme."}
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              borderRadius: 13,
              padding: "11px 14px",
              cursor: "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            Fermer
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              borderRadius: 13,
              padding: "11px 14px",
              cursor: "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            🖨️ Imprimer
          </button>

          <button
            type="button"
            onClick={copyLetter}
            style={{
              background: COLORS.purple,
              border: "none",
              color: "#fff",
              borderRadius: 13,
              padding: "11px 14px",
              cursor: "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            {copied ? "✅ Copié" : "📋 Copier le courrier"}
          </button>
        </div>
      </div>
    </div>
  )
}


function UnderstandRefusalPanel({ demarche, isKreol, isMobile, onClose }) {
  const [refusalText, setRefusalText] = useState("")
  const [analysis, setAnalysis] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  const title = isKreol
    ? demarche.title_kr || demarche.title || "cette aide"
    : demarche.title || "cette aide"

  async function analyzeRefusal() {
    const cleanText = refusalText.trim()

    if (cleanText.length < 40) {
      setError(
        isKreol
          ? "Colle un courrier assez complet pou l'analyse."
          : "Collez un courrier assez complet pour lancer l’analyse."
      )
      return
    }

    setLoading(true)
    setError("")
    setAnalysis("")

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("assistant-aisupabase", {
        body: {
          action: "analyze_refusal",
          question: cleanText,
          refusalText: cleanText,
          isKreol,
          isQuickPreset: false,
          profile: {
            premium_plus: true,
            subscription_plan: "premium_plus",
          },
          demarche: {
            title: demarche.title || "",
            title_kr: demarche.title_kr || "",
            category: demarche.category || "",
            demarches_fr: demarche.demarches_fr || "",
            demarches_kr: demarche.demarches_kr || "",
          },
        },
      })

      if (invokeError) throw invokeError

      if (!data?.success) {
        throw new Error(data?.error || "Analyse impossible pour le moment.")
      }

      setAnalysis(data.answer || "")
    } catch (err) {
      console.error("Erreur analyse refus:", err)
      setError(
        isKreol
          ? "Analyse impossible pou linstan. Réessaye talèr."
          : "Analyse impossible pour le moment. Réessayez dans quelques instants."
      )
    } finally {
      setLoading(false)
    }
  }

  async function copyAnalysis() {
    try {
      await navigator.clipboard.writeText(analysis)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      const textarea = document.createElement("textarea")
      textarea.value = analysis
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(3,7,18,.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 22,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 980,
          maxHeight: isMobile ? "100dvh" : "88dvh",
          overflowY: "auto",
          background: "linear-gradient(135deg, #0F1E38, #132747)",
          border: `1px solid ${COLORS.border}`,
          borderRadius: isMobile ? 0 : 24,
          padding: isMobile ? 18 : 24,
          boxShadow: "0 24px 80px rgba(0,0,0,.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            marginBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                color: COLORS.purple,
                fontWeight: 900,
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              ✨ Premium+ · {isKreol ? "Comprann refus" : "Comprendre un refus"}
            </div>

            <h2
              style={{
                color: COLORS.text,
                margin: 0,
                fontSize: isMobile ? 24 : 32,
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontWeight: 900,
              }}
            >
              ❌ {isKreol ? "Analiz in refus" : title}
            </h2>

            <p
              style={{
                color: COLORS.muted,
                margin: "8px 0 0",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              {isKreol
                ? "Kol isi lo kouryé reçu. BudgetKazPei i analiz sèlman sak lé écrit, san inventé."
                : "Collez le courrier reçu. BudgetKazPei analyse uniquement ce qui est écrit, sans inventer."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              width: 38,
              height: 38,
              borderRadius: 12,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <PanelCard title={isKreol ? "📄 Kouryé reçu" : "📄 Courrier reçu"}>
          <textarea
            value={refusalText}
            onChange={e => setRefusalText(e.target.value)}
            placeholder={
              isKreol
                ? "Kol isi lo kouryé refus ou lo mesaj reçu..."
                : "Collez ici le courrier de refus ou le message reçu..."
            }
            style={{
              width: "100%",
              minHeight: 190,
              resize: "vertical",
              boxSizing: "border-box",
              background: "rgba(3,7,18,.42)",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 14,
              color: COLORS.text,
              padding: 13,
              fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
              fontSize: 14,
              lineHeight: 1.6,
              outline: "none",
            }}
          />

          <div
            style={{
              marginTop: 10,
              color: COLORS.muted,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            🔐 {isKreol
              ? "Bann données personnelles lé pa utilisé pou invent in réponse. L\'analyse i reste limitée sèlman au texte collé."
              : "Les données personnelles ne sont pas utilisées pour inventer une réponse. L’analyse reste limitée au texte collé."}
          </div>
        </PanelCard>

        {error && (
          <div style={{ marginTop: 14 }}>
            <AlertBox color={COLORS.red} text={`⚠️ ${error}`} />
          </div>
        )}

        {analysis && (
          <PanelCard title={isKreol ? "🧾 Analyse du refus" : "🧾 Analyse du refus"} style={{ marginTop: 14 }}>
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                color: COLORS.text,
                fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
                fontSize: 14,
                lineHeight: 1.7,
              }}
            >
              {analysis}
            </pre>
          </PanelCard>
        )}

        <div
          style={{
            marginTop: 14,
            background: "rgba(252,211,77,.10)",
            border: "1px solid rgba(252,211,77,.25)",
            borderRadius: 16,
            padding: 14,
            color: COLORS.yellow,
            fontSize: 13,
            lineHeight: 1.55,
            fontWeight: 800,
          }}
        >
          ⚠️ {isKreol
            ? "BudgetKazPei lé pa in conseil juridique. L\'analyse aide a konprann lo kouryé mé fo toujou vérifié avèk l\'organisme."
            : "BudgetKazPei ne donne pas d’avis juridique. L’analyse aide à comprendre le courrier, mais il faut toujours vérifier auprès de l’organisme."}
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              borderRadius: 13,
              padding: "11px 14px",
              cursor: "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            Fermer
          </button>

          {analysis && (
            <button
              type="button"
              onClick={copyAnalysis}
              style={{
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.12)",
                color: COLORS.text,
                borderRadius: 13,
                padding: "11px 14px",
                cursor: "pointer",
                fontWeight: 900,
                fontFamily: "inherit",
              }}
            >
              {copied ? "✅ Kopié" : isKreol ? "📋 Kopi l\'analyse" : "📋 Copier l’analyse"}
            </button>
          )}

          <button
            type="button"
            onClick={analyzeRefusal}
            disabled={loading}
            style={{
              background: COLORS.purple,
              border: "none",
              color: "#fff",
              borderRadius: 13,
              padding: "11px 14px",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
              opacity: loading ? 0.65 : 1,
            }}
          >
            {loading ? (isKreol ? "⏳ Analyse en cours..." : "⏳ Analyse...") : (isKreol ? "🧠 Analiz lo refus" : "🧠 Analyser le refus")}
          </button>
        </div>
      </div>
    </div>
  )
}



function GainObtainedPanel({ demarche, isKreol, isMobile, onSave, onClose }) {
  const [montant, setMontant] = useState(
    demarche?.amountObtained !== undefined && demarche?.amountObtained !== null
      ? String(demarche.amountObtained)
      : ""
  )
  const [dateObtention, setDateObtention] = useState(
    demarche?.dateObtention || new Date().toISOString().slice(0, 10)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const title = isKreol
    ? demarche.title_kr || demarche.title || "Démarche"
    : demarche.title || "Démarche"

  async function handleSave() {
    const parsedAmount = parseMontantObtenu(montant)

    if (parsedAmount === null || parsedAmount < 0) {
      setError(
        isKreol
          ? "Indique un montant valide pou le gain obtenu."
          : "Indiquez un montant valide pour le gain obtenu."
      )
      return
    }

    setSaving(true)
    setError("")

    const result = await onSave(demarche.id, {
      montant_obtenu: montant,
      date_obtention: dateObtention,
    })

    setSaving(false)

    if (result?.error) {
      setError(
        isKreol
          ? "Impossible d’enregistrer le gain pou linstan."
          : "Impossible d’enregistrer le gain pour le moment."
      )
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(3,7,18,.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 22,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: isMobile ? "100dvh" : "88dvh",
          overflowY: "auto",
          background: "linear-gradient(135deg, #0F1E38, #132747)",
          border: `1px solid ${COLORS.border}`,
          borderRadius: isMobile ? 0 : 24,
          padding: isMobile ? 18 : 24,
          boxShadow: "0 24px 80px rgba(0,0,0,.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            marginBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                color: COLORS.green,
                fontWeight: 900,
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              ✅ {isKreol ? "Aide obtenue" : "Aide obtenue"}
            </div>

            <h2
              style={{
                color: COLORS.text,
                margin: 0,
                fontSize: isMobile ? 24 : 32,
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontWeight: 900,
              }}
            >
              💰 {title}
            </h2>

            <p
              style={{
                color: COLORS.muted,
                margin: "8px 0 0",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              {isKreol
                ? "Indique le montant réellement obtenu pou suivre largent récupéré."
                : "Indiquez le montant réellement obtenu pour suivre l’argent récupéré."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              width: 38,
              height: 38,
              borderRadius: 12,
              cursor: saving ? "not-allowed" : "pointer",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              opacity: saving ? 0.6 : 1,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <PanelCard title={isKreol ? "💰 Montant obtenu" : "💰 Montant obtenu"}>
          <input
            type="number"
            min="0"
            step="0.01"
            value={montant}
            onChange={e => setMontant(e.target.value)}
            placeholder={isKreol ? "Ex : 800" : "Ex : 800"}
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "rgba(3,7,18,.42)",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 14,
              color: COLORS.text,
              padding: 13,
              fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
              fontSize: 14,
              outline: "none",
            }}
          />
        </PanelCard>

        <PanelCard title={isKreol ? "📅 Date d’obtention" : "📅 Date d’obtention"} style={{ marginTop: 14 }}>
          <input
            type="date"
            value={dateObtention}
            onChange={e => setDateObtention(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "rgba(3,7,18,.42)",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 14,
              color: COLORS.text,
              padding: 13,
              fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
              fontSize: 14,
              outline: "none",
            }}
          />
        </PanelCard>

        <div
          style={{
            marginTop: 14,
            background: "rgba(34,197,94,.10)",
            border: "1px solid rgba(34,197,94,.25)",
            borderRadius: 16,
            padding: 14,
            color: COLORS.green,
            fontSize: 13,
            lineHeight: 1.55,
            fontWeight: 800,
          }}
        >
          ✅ {isKreol
            ? "Ce montant servira pou calculer largent récupéré grâce à BudgetKazPei."
            : "Ce montant servira à calculer l’argent récupéré grâce à BudgetKazPei."}
        </div>

        {error && (
          <div style={{ marginTop: 14 }}>
            <AlertBox color={COLORS.red} text={`⚠️ ${error}`} />
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              borderRadius: 13,
              padding: "11px 14px",
              cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {isKreol ? "Annuler" : "Annuler"}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              background: COLORS.green,
              border: "none",
              color: "#052E16",
              borderRadius: 13,
              padding: "11px 14px",
              cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
              opacity: saving ? 0.75 : 1,
            }}
          >
            {saving
              ? isKreol ? "⏳ Enregistrement..." : "⏳ Enregistrement..."
              : isKreol ? "💾 Enregistrer gain" : "💾 Enregistrer le gain"}
          </button>
        </div>
      </div>
    </div>
  )
}


function AdminReminderPanel({ demarche, reminder, isKreol, isMobile, onSave, onDelete, onClose }) {
  const [date, setDate] = useState(reminder?.date || "")
  const [note, setNote] = useState(reminder?.note || "")
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const title = isKreol
    ? demarche.title_kr || demarche.title || "Démarche"
    : demarche.title || "Démarche"

  async function handleSave() {
    if (!date && !note.trim()) {
      window.alert(
        isKreol
          ? "Ajoute une date ou une note pou le rappel."
          : "Ajoutez une date ou une note pour le rappel."
      )
      return
    }

    setSaving(true)
    setError("")

    const result = await onSave(demarche.id, {
      date,
      note: note.trim(),
    })

    setSaving(false)

    if (result?.error) {
      setError(
        isKreol
          ? "Impossible d’enregistrer le rappel pou linstan."
          : "Impossible d’enregistrer le rappel pour le moment."
      )
      return
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  async function handleDelete() {
    if (!reminder) {
      setDate("")
      setNote("")
      return
    }

    const confirmText = isKreol
      ? "Supprim ce rappel ?"
      : "Supprimer ce rappel ?"

    if (!window.confirm(confirmText)) return

    setSaving(true)
    setError("")

    const result = await onDelete(demarche.id)

    setSaving(false)

    if (result?.error) {
      setError(
        isKreol
          ? "Impossible de supprimer le rappel pou linstan."
          : "Impossible de supprimer le rappel pour le moment."
      )
      return
    }

    setDate("")
    setNote("")
    onClose()
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(3,7,18,.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 22,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 760,
          maxHeight: isMobile ? "100dvh" : "88dvh",
          overflowY: "auto",
          background: "linear-gradient(135deg, #0F1E38, #132747)",
          border: `1px solid ${COLORS.border}`,
          borderRadius: isMobile ? 0 : 24,
          padding: isMobile ? 18 : 24,
          boxShadow: "0 24px 80px rgba(0,0,0,.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            marginBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                color: COLORS.purple,
                fontWeight: 900,
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              ✨ Premium+ · {isKreol ? "Rappel administratif" : "Rappel administratif"}
            </div>

            <h2
              style={{
                color: COLORS.text,
                margin: 0,
                fontSize: isMobile ? 24 : 32,
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontWeight: 900,
              }}
            >
              ⏰ {title}
            </h2>

            <p
              style={{
                color: COLORS.muted,
                margin: "8px 0 0",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              {isKreol
                ? "Ajoute in date ou une note pou penser à relancer, vérifier ou déposer un document."
                : "Ajoutez une date ou une note pour penser à relancer, vérifier ou déposer un document."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              width: 38,
              height: 38,
              borderRadius: 12,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <PanelCard title={isKreol ? "📅 Date du rappel" : "📅 Date du rappel"}>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              width: "100%",
              background: "rgba(3,7,18,.42)",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 14,
              color: COLORS.text,
              padding: 13,
              fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
              fontSize: 14,
              outline: "none",
            }}
          />
        </PanelCard>

        <PanelCard title={isKreol ? "📝 Note du rappel" : "📝 Note du rappel"} style={{ marginTop: 14 }}>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={
              isKreol
                ? "Ex : Relancer la CAF, déposer justificatif, vérifier réponse..."
                : "Ex : Relancer la CAF, déposer un justificatif, vérifier la réponse..."
            }
            style={{
              width: "100%",
              minHeight: 130,
              resize: "vertical",
              boxSizing: "border-box",
              background: "rgba(3,7,18,.42)",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 14,
              color: COLORS.text,
              padding: 13,
              fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
              fontSize: 14,
              lineHeight: 1.6,
              outline: "none",
            }}
          />
        </PanelCard>

        <div
          style={{
            marginTop: 14,
            background: "rgba(252,211,77,.10)",
            border: "1px solid rgba(252,211,77,.25)",
            borderRadius: 16,
            padding: 14,
            color: COLORS.yellow,
            fontSize: 13,
            lineHeight: 1.55,
            fontWeight: 800,
          }}
        >
          ⚠️ {isKreol
            ? "Ce rappel est enregistré dans BudgetKazPei. Vérifie toujours les délais officiels auprès de l'organisme."
            : "Ce rappel est enregistré dans BudgetKazPei. Vérifiez toujours les délais officiels auprès de l'organisme."}
        </div>

        {saved && (
          <div style={{ marginTop: 14 }}>
            <AlertBox
              color={COLORS.green}
              text={isKreol ? "✅ Rappel enregistré." : "✅ Rappel enregistré."}
            />
          </div>
        )}

        {error && (
          <div style={{ marginTop: 14 }}>
            <AlertBox color={COLORS.red} text={`⚠️ ${error}`} />
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              borderRadius: 13,
              padding: "11px 14px",
              cursor: "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            {isKreol ? "Fermé" : "Fermer"}
          </button>

          {(reminder || date || note) && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              style={{
                background: "rgba(251,113,133,.10)",
                border: "1px solid rgba(251,113,133,.28)",
                color: COLORS.red,
                borderRadius: 13,
                padding: "11px 14px",
                cursor: "pointer",
                fontWeight: 900,
                fontFamily: "inherit",
              }}
            >
              🗑️ {isKreol ? "Supprim rappel" : "Supprimer le rappel"}
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              background: COLORS.purple,
              border: "none",
              color: "#fff",
              borderRadius: 13,
              padding: "11px 14px",
              cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
              opacity: saving ? 0.65 : 1,
            }}
          >
            {saving
              ? isKreol ? "⏳ Enregistrement..." : "⏳ Enregistrement..."
              : `💾 ${isKreol ? "Enregistrer rappel" : "Enregistrer le rappel"}`}
          </button>
        </div>
      </div>
    </div>
  )
}


function ComingSoonPanel({ demarche, isKreol, isMobile, tool, onClose }) {
  const title = isKreol
    ? demarche.title_kr || demarche.title || "Démarche"
    : demarche.title || "Démarche"

  const toolLabels = {
    generate_letter: isKreol ? "Générer un courrier" : "Générer un courrier",
    prepare_appeal: isKreol ? "Préparer un recours" : "Préparer un recours",
    admin_reminder: isKreol ? "Ajouter un rappel" : "Ajouter un rappel",
    understand_refusal: isKreol ? "Comprendre un refus" : "Comprendre un refus",
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(3,7,18,.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 22,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 680,
          background: "linear-gradient(135deg, #0F1E38, #132747)",
          border: `1px solid ${COLORS.border}`,
          borderRadius: isMobile ? 0 : 24,
          padding: isMobile ? 18 : 24,
          boxShadow: "0 24px 80px rgba(0,0,0,.45)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ color: COLORS.purple, fontWeight: 900, fontSize: 13, marginBottom: 6 }}>
              ✨ Premium+ · {toolLabels[tool] || "Fonction"}
            </div>
            <h2
              style={{
                color: COLORS.text,
                margin: 0,
                fontSize: isMobile ? 23 : 30,
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontWeight: 900,
              }}
            >
              {title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              width: 38,
              height: 38,
              borderRadius: 12,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            marginTop: 18,
            background: "rgba(252,211,77,.10)",
            border: "1px solid rgba(252,211,77,.25)",
            borderRadius: 16,
            padding: 16,
            color: COLORS.yellow,
            fontSize: 14,
            lineHeight: 1.6,
            fontWeight: 800,
          }}
        >
          🚧 Cette fonction sera ajoutée après le modèle d’email. Elle restera prudente : aucune donnée personnelle automatique, aucune information inventée.
        </div>
      </div>
    </div>
  )
}


function PanelCard({ title, children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(10,22,40,.44)",
        border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 16,
        padding: 15,
        ...style,
      }}
    >
      <div style={{ color: COLORS.text, fontWeight: 900, fontSize: 15, marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function CheckRow({ text }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 9,
        color: COLORS.muted,
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <span style={{ color: COLORS.green, fontWeight: 900 }}>☐</span>
      <span>{text}</span>
    </div>
  )
}

function InfoLine({ label, value, color }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        borderBottom: "1px solid rgba(255,255,255,.08)",
        padding: "9px 0",
        fontSize: 13,
      }}
    >
      <span style={{ color: COLORS.muted }}>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  )
}

function getSuggestedDocuments(demarche, isKreol) {
  const rawTitle = `${demarche.title || ""} ${demarche.title_kr || ""} ${demarche.category || ""}`.toLowerCase()

  const base = isKreol
    ? [
        "Pièce identité",
        "Justificatif domicile récent",
        "RIB",
        "Dernier avis d’imposition ou justificatif revenus",
      ]
    : [
        "Pièce d’identité",
        "Justificatif de domicile récent",
        "RIB",
        "Dernier avis d’imposition ou justificatif de revenus",
      ]

  if (rawTitle.includes("apl") || rawTitle.includes("logement") || rawTitle.includes("loyer")) {
    return [
      ...base,
      isKreol ? "Bail ou contrat location" : "Bail ou contrat de location",
      isKreol ? "Quittance de loyer ou attestation hébergement" : "Quittance de loyer ou attestation d’hébergement",
      isKreol ? "Numéro allocataire CAF si disponible" : "Numéro allocataire CAF si disponible",
    ]
  }

  if (rawTitle.includes("energie") || rawTitle.includes("énergie") || rawTitle.includes("edf")) {
    return [
      ...base,
      isKreol ? "Facture EDF / eau / énergie" : "Facture EDF / eau / énergie",
      isKreol ? "Devis travaux si demandé" : "Devis de travaux si demandé",
    ]
  }

  if (rawTitle.includes("dette") || rawTitle.includes("impaye") || rawTitle.includes("impayé")) {
    return [
      ...base,
      isKreol ? "Justificatif dette ou impayé" : "Justificatif de dette ou d’impayé",
      isKreol ? "Courriers reçus de l’organisme" : "Courriers reçus de l’organisme",
      isKreol ? "Budget mensuel rapide du foyer" : "Budget mensuel rapide du foyer",
    ]
  }

  return [
    ...base,
    isKreol ? "Tout courrier reçu concernant cette aide" : "Tout courrier reçu concernant cette aide",
  ]
}

function getSuggestedSteps(demarche, isKreol) {
  const officialSteps =
    isKreol
      ? demarche.demarches_kr || demarche.demarches_fr
      : demarche.demarches_fr

  if (officialSteps) {
    return [
      officialSteps,
      isKreol ? "Rassembl bann documents avant dépôt." : "Rassembler les documents avant le dépôt.",
      isKreol ? "Garde une copie de tout dossier envoyé." : "Garder une copie de tout dossier envoyé.",
      isKreol ? "Mettre le statut à jour dans BudgetKazPei." : "Mettre le statut à jour dans BudgetKazPei.",
    ]
  }

  return isKreol
    ? [
        "Vérifie conditions de l’aide.",
        "Rassembl les documents.",
        "Dépose la demande sur le site officiel ou auprès de l’organisme.",
        "Garde une copie du dossier.",
        "Mets le statut à jour dans BudgetKazPei.",
      ]
    : [
        "Vérifier les conditions de l’aide.",
        "Rassembler les documents.",
        "Déposer la demande sur le site officiel ou auprès de l’organisme.",
        "Garder une copie du dossier.",
        "Mettre le statut à jour dans BudgetKazPei.",
      ]
}

function getPreparationWarning(demarche, isKreol) {
  const title = demarche.title || "cette démarche"

  return isKreol
    ? `Cette checklist aide à préparer ${title}, mais les conditions officielles doivent toujours être vérifiées auprès de l’organisme.`
    : `Cette checklist vous aide à préparer ${title}, mais les conditions officielles doivent toujours être vérifiées auprès de l’organisme.`
}


function getGeneratedEmailSubject(demarche, isKreol) {
  const title = isKreol
    ? demarche.title_kr || demarche.title || "cette aide"
    : demarche.title || "cette aide"

  return isKreol
    ? `Demande d’informations concernant ${title}`
    : `Demande d’informations concernant ${title}`
}

function getGeneratedEmailBody(demarche, isKreol) {
  const title = isKreol
    ? demarche.title_kr || demarche.title || "cette aide"
    : demarche.title || "cette aide"

  const steps = isKreol
    ? demarche.demarches_kr || demarche.demarches_fr || ""
    : demarche.demarches_fr || ""

  const extra = steps
    ? `\nJ’ai noté que la démarche semble indiquer : ${steps}\n`
    : ""

  if (isKreol) {
    return [
      "Bonjour,",
      "",
      `Je souhaite obtenir des informations concernant ${title}.`,
      "",
      "Pouvez-vous m’indiquer les conditions à vérifier, les documents à préparer et la procédure à suivre ?",
      extra.trim(),
      "Je vous remercie par avance pour votre retour.",
      "",
      "Cordialement,",
      "",
      "[À compléter si vous le souhaitez]",
    ]
      .filter(Boolean)
      .join("\n")
  }

  return [
    "Bonjour,",
    "",
    `Je souhaite obtenir des informations concernant ${title}.`,
    "",
    "Pouvez-vous m’indiquer les conditions à vérifier, les documents à préparer et la procédure à suivre ?",
    extra.trim(),
    "Je vous remercie par avance pour votre retour.",
    "",
    "Cordialement,",
    "",
    "[À compléter si vous le souhaitez]",
  ]
    .filter(Boolean)
    .join("\n")
}



function getGeneratedLetterSubject(demarche, isKreol) {
  const title = isKreol
    ? demarche.title_kr || demarche.title || "cette aide"
    : demarche.title || "cette aide"

  return `Demande d’information concernant ${title}`
}

function getGeneratedLetterBody(demarche, isKreol) {
  const title = isKreol
    ? demarche.title_kr || demarche.title || "cette aide"
    : demarche.title || "cette aide"

  const steps = isKreol
    ? demarche.demarches_kr || demarche.demarches_fr || ""
    : demarche.demarches_fr || ""

  const extra = steps
    ? `\nJ’ai noté que la démarche semble indiquer : ${steps}\n`
    : ""

  return [
    "[Vos coordonnées]",
    "[Adresse]",
    "[Code postal – Ville]",
    "",
    "[Organisme destinataire]",
    "[Adresse de l’organisme]",
    "[Code postal – Ville]",
    "",
    "À [Ville], le [Date]",
    "",
    `Objet : Demande d’information concernant ${title}`,
    "",
    "Madame, Monsieur,",
    "",
    `Je souhaite obtenir des informations concernant ${title}.`,
    "",
    "Pouvez-vous m’indiquer les conditions d’éligibilité, les pièces justificatives nécessaires ainsi que les modalités de dépôt du dossier ?",
    extra.trim(),
    "Je vous remercie par avance pour votre retour.",
    "",
    "Cordialement,",
    "",
    "[Signature à compléter]",
  ]
    .filter(Boolean)
    .join("\n")
}



function PrepareAppealPanel({ demarche, isKreol, isMobile, onClose }) {
  const [copied, setCopied] = useState(false)

  const title = isKreol
    ? demarche.title_kr || demarche.title || "cette aide"
    : demarche.title || "cette aide"

  const subject = isKreol
    ? `Demande réexamen concernant ${title}`
    : `Demande de réexamen concernant ${title}`

  const appeal = getGeneratedAppealBody(demarche, isKreol)

  async function copyAppeal() {
    try {
      await navigator.clipboard.writeText(`Objet : ${subject}\n\n${appeal}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      const textarea = document.createElement("textarea")
      textarea.value = `Objet : ${subject}\n\n${appeal}`
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(3,7,18,.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 22,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 900,
          maxHeight: isMobile ? "100dvh" : "88dvh",
          overflowY: "auto",
          background: "linear-gradient(135deg, #0F1E38, #132747)",
          border: `1px solid ${COLORS.border}`,
          borderRadius: isMobile ? 0 : 24,
          padding: isMobile ? 18 : 24,
          boxShadow: "0 24px 80px rgba(0,0,0,.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            marginBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                color: COLORS.purple,
                fontWeight: 900,
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              ✨ Premium+ · {isKreol ? "Prépar recours" : "Préparer un recours"}
            </div>

            <h2
              style={{
                color: COLORS.text,
                margin: 0,
                fontSize: isMobile ? 24 : 32,
                fontFamily: "'DM Serif Display', Georgia, serif",
                fontWeight: 900,
              }}
            >
              ⚖️ {title}
            </h2>

            <p
              style={{
                color: COLORS.muted,
                margin: "8px 0 0",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              {isKreol
                ? "Modèle neutre pou demander in réexamen, san nom, san prénom, san promesse."
                : "Modèle neutre pour demander un réexamen, sans nom, sans prénom et sans promesse."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              width: 38,
              height: 38,
              borderRadius: 12,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <PanelCard title={isKreol ? "📌 Objet" : "📌 Objet"}>
          <div
            style={{
              color: COLORS.yellow,
              fontSize: 14,
              fontWeight: 900,
              lineHeight: 1.5,
            }}
          >
            {subject}
          </div>
        </PanelCard>

        <PanelCard title={isKreol ? "⚖️ Recours prêt à copier" : "⚖️ Recours prêt à copier"} style={{ marginTop: 14 }}>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              color: COLORS.text,
              fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            {appeal}
          </pre>
        </PanelCard>

        <div
          style={{
            marginTop: 14,
            background: "rgba(252,211,77,.10)",
            border: "1px solid rgba(252,211,77,.25)",
            borderRadius: 16,
            padding: 14,
            color: COLORS.yellow,
            fontSize: 13,
            lineHeight: 1.55,
            fontWeight: 800,
          }}
        >
          ⚠️ {isKreol
            ? "BudgetKazPei lé pa in conseil juridique. Le modèle aide seulement à demander un réexamen. Vérifiez toujours auprès de l’organisme."
            : "BudgetKazPei ne donne pas d’avis juridique. Ce modèle aide seulement à demander un réexamen. Vérifiez toujours auprès de l’organisme."}
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              borderRadius: 13,
              padding: "11px 14px",
              cursor: "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            {isKreol ? "Fermé" : "Fermer"}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: COLORS.text,
              borderRadius: 13,
              padding: "11px 14px",
              cursor: "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            🖨️ {isKreol ? "Imprimé" : "Imprimer"}
          </button>

          <button
            type="button"
            onClick={copyAppeal}
            style={{
              background: COLORS.purple,
              border: "none",
              color: "#fff",
              borderRadius: 13,
              padding: "11px 14px",
              cursor: "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            {copied ? "✅ Copié" : isKreol ? "📋 Kopi recours" : "📋 Copier le recours"}
          </button>
        </div>
      </div>
    </div>
  )
}


function getGeneratedAppealBody(demarche, isKreol) {
  const title = isKreol
    ? demarche.title_kr || demarche.title || "cette aide"
    : demarche.title || "cette aide"

  if (isKreol) {
    return [
      "[Vos coordonnées]",
      "[Adresse]",
      "[Code postal – Ville]",
      "",
      "[Organisme destinataire]",
      "[Adresse de l’organisme]",
      "[Code postal – Ville]",
      "",
      "À [Ville], le [Date]",
      "",
      `Objet : Demande réexamen concernant ${title}`,
      "",
      "Madame, Monsieur,",
      "",
      `Mi souhaite demander un réexamen concernant ${title}.`,
      "",
      "Suite au courrier reçu, mi souhaiterais obtenir des précisions complémentaires concernant ma situation et les éléments ayant conduit à cette décision.",
      "",
      "Mi reste disponible pou fournir tout document complémentaire qui pourrait être utile à l’étude du dossier.",
      "",
      "Mi remercie à zot par avance pou zot retour.",
      "",
      "Cordialement,",
      "",
      "[Signature à compléter]",
    ]
      .filter(Boolean)
      .join("\n")
  }

  return [
    "[Vos coordonnées]",
    "[Adresse]",
    "[Code postal – Ville]",
    "",
    "[Organisme destinataire]",
    "[Adresse de l’organisme]",
    "[Code postal – Ville]",
    "",
    "À [Ville], le [Date]",
    "",
    `Objet : Demande de réexamen concernant ${title}`,
    "",
    "Madame, Monsieur,",
    "",
    `Je souhaite solliciter un réexamen concernant ${title}.`,
    "",
    "Suite au courrier reçu, je souhaiterais obtenir des précisions complémentaires concernant ma situation et les éléments ayant conduit à cette décision.",
    "",
    "Je reste à votre disposition pour fournir tout document complémentaire qui pourrait être utile à l’étude du dossier.",
    "",
    "Je vous remercie par avance pour votre retour.",
    "",
    "Cordialement,",
    "",
    "[Signature à compléter]",
  ]
    .filter(Boolean)
    .join("\n")
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
