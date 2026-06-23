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
                      value={demarche.amountObtained ? `${demarche.amountObtained} €` : "—"}
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
                    isKreol={isKreol}
                    isPremiumPlus={isPremiumPlus}
                    onGoPremium={onGoPremium}
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

function DemarchePremiumTools({ isKreol, isPremiumPlus, onGoPremium }) {
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
            key={tool.label}
            type="button"
            onClick={() => {
              if (!isPremiumPlus && onGoPremium) onGoPremium()
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: isPremiumPlus ? "rgba(167,139,250,.12)" : "rgba(252,211,77,.08)",
              border: isPremiumPlus ? "1px solid rgba(167,139,250,.25)" : "1px solid rgba(252,211,77,.22)",
              color: isPremiumPlus ? "#DDD6FE" : COLORS.yellow,
              borderRadius: 999,
              padding: "7px 9px",
              cursor: isPremiumPlus ? "default" : "pointer",
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
