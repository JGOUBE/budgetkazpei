import { useState } from "react"
import { Lock, Send, Sparkles, Star, SearchCheck } from "lucide-react"
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
}

function safeT(t, section, key, fallback) {
  if (typeof t !== "function") return fallback
  return t(section, key) || fallback
}

function formatValue(value, fallback = "Non renseigné") {
  if (value === null || value === undefined || value === "") return fallback
  return value
}

function formatMoney(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return "Non renseigné"
  return `${number.toFixed(0).replace(".", ",")} € / mois`
}

function formatSituation(value) {
  const map = {
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

  return map[value] || formatValue(value)
}

function buildProfileSummary(profile = {}) {
  return `📍 Commune : ${formatValue(profile.commune)}
👨‍👩‍👧‍👦 Situation familiale : ${formatSituation(profile.situation_familiale)}
👶 Nombre d’enfants : ${formatValue(profile.nombre_enfants)}
🏠 Logement : ${formatSituation(profile.logement)}
💼 Situation professionnelle : ${formatSituation(profile.situation_professionnelle)}
💰 Revenus du foyer : ${formatMoney(profile.revenus_foyer)}`
}

export default function AssistantAides({ isPremium, isMobile, t, user }) {
  const [question, setQuestion] = useState("")
  const [response, setResponse] = useState("")
  const [profile, setProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)

  const txt = (key, fallback) => safeT(t, "aides", key, fallback)

  async function fetchProfile() {
    if (!user?.id) return null

    setLoadingProfile(true)

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "commune,situation_familiale,nombre_enfants,logement,revenus_foyer,situation_professionnelle"
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
  const { data, error } = await supabase
    .from("aides_reunion")
    .select("*")

  console.log("AIDES =", data)
  console.log("ERREUR =", error)

    if (error) {
      console.error("Erreur chargement aides:", error)
      return []
    }

    return data || []
  }

  async function handleScanProfile() {
    const currentProfile = profile || (await fetchProfile())

    if (!currentProfile) {
      setResponse(
        "Impossible de charger votre profil pour le moment. Vérifiez que votre profil est bien complété."
      )
      return
    }

    const aides = await fetchAides()

    console.log("PROFIL :", currentProfile)
    console.log("AIDES :", aides)

    const topAides = aides.slice(0, 5)

setResponse(
`Profil analysé avec succès.

${buildProfileSummary(currentProfile)}

🎯 Aides recommandées pour votre profil :

${topAides
  .map(
    aide => `
✅ ${aide.nom}
💰 Montant estimé : ${aide.montant || "Variable"} €/mois
📄 ${aide.description || ""}
`
  )
  .join("\n")}

📊 ${aides.length} aides, droits et dispositifs analysés.

BudgetKazPei continuera d'améliorer ses recommandations en fonction de votre profil, de votre commune et de votre situation familiale.`
)
  }

  async function handleAnalyze() {
    const currentProfile = profile || (await fetchProfile())

    if (!currentProfile) {
      setResponse(
        "Impossible de charger votre profil pour le moment. Vérifiez que votre profil est bien complété."
      )
      return
    }

    const aides = await fetchAides()

    console.log("QUESTION :", question)
    console.log("PROFIL :", currentProfile)
    console.log("AIDES :", aides)

    setResponse(
      `Question enregistrée :

"${question || "Aucune question précisée"}"

${buildProfileSummary(currentProfile)}

📊 ${aides.length} aides disponibles ont été analysées.

L’assistant BudgetKazPei va ensuite croiser votre profil avec ces aides pour afficher les dispositifs les plus pertinents.`
    )
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
          onClick={() => alert("Disponible avec Premium")}
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
          {txt("assistantTitle", "Mon assistant personnel")}
        </h3>
      </div>

      <p style={{ color: COLORS.muted, lineHeight: 1.6 }}>
        {txt(
          "assistantSubtitle",
          "Posez une question sur vos aides, vos droits, vos démarches ou votre situation à La Réunion."
        )}
      </p>

      <p style={{ color: COLORS.cyan, lineHeight: 1.6, marginTop: -6, fontWeight: 800 }}>
        {txt("assistantLanguages", "💬 Réponses possibles en français et en créole réunionnais.")}
      </p>

      <button
        type="button"
        onClick={handleScanProfile}
        disabled={loadingProfile}
        style={{
          marginBottom: 12,
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
        {loadingProfile
          ? txt("assistantScanning", "Analyse en cours...")
          : txt("assistantScan", "Scanner mon profil")}
      </button>

      <textarea
        value={question}
        onChange={e => setQuestion(e.target.value)}
        placeholder={txt(
          "assistantPlaceholder",
          "Ex : Je suis parent isolé avec 2 enfants à Saint-Leu, quelles aides puis-je vérifier ?"
        )}
        style={{
          width: "100%",
          minHeight: 100,
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

      <button
        type="button"
        onClick={handleAnalyze}
        disabled={loadingProfile}
        style={{
          marginTop: 12,
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
        {txt("assistantAnalyze", "Analyser ma situation")}
      </button>

      {response && (
        <div
          style={{
            marginTop: 16,
            background: "rgba(255,255,255,.05)",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: 16,
            color: COLORS.text,
            lineHeight: 1.6,
            whiteSpace: "pre-line",
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
            {txt("assistantResponseTitle", "Réponse de l’assistant")}
          </div>

          {response}
        </div>
      )}
    </section>
  )
}