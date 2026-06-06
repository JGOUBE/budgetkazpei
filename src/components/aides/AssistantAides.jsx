import { useMemo, useState } from "react"
import {
  Lock,
  Send,
  Sparkles,
  Star,
  SearchCheck,
  ExternalLink,
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
}

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

function getLevel(score, isKreol = false) {
  if (score >= 80) {
    return {
      label: isKreol ? "Tré probab" : "Très probable",
      emoji: "🟢",
      color: COLORS.green,
    }
  }

  if (score >= 50) {
    return {
      label: isKreol ? "Probab" : "Probable",
      emoji: "🟡",
      color: COLORS.yellow,
    }
  }

  return {
    label: isKreol ? "A vérifié" : "À vérifier",
    emoji: "🔵",
    color: COLORS.cyan,
  }
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
      addExcluded(
        excluded,
        `Revenus du foyer supérieurs au plafond indiqué (${revenusMax} € / mois).`,
        `Revenu la kaz lé plis o ke plafon indiké (${revenusMax} € / mwa).`,
        isKreol
      )
    }

    if (Number.isFinite(revenusMin) && revenusMin > 0 && income < revenusMin) {
      addExcluded(
        excluded,
        `Revenus du foyer inférieurs au minimum indiqué (${revenusMin} € / mois).`,
        `Revenu la kaz lé pli ba ke minimum indiké (${revenusMin} € / mwa).`,
        isKreol
      )
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

function scoreAide(aide = {}, profile = {}, isKreol = false) {
  const excludedReasons = shouldExcludeAide(aide, profile, isKreol)

  if (excludedReasons.length > 0) {
    return {
      ...aide,
      score: 0,
      excluded: true,
      excludedReasons,
      reasons: [],
      missing: [],
    }
  }

  let score = Number(aide.score_priorite || 0)
  if (score > 40) score = Math.round(score * 0.45)

  const reasons = []
  const missing = []

  const aideText = normalizeText(`${aide.nom || ""} ${aide.categorie || ""} ${aide.description || ""} ${aide.description_fr || ""}`)

  const enfants = Number(profile.nombre_enfants || 0)
  const revenus = Number(profile.revenus_foyer || 0)
  const age = Number(profile.age || 0)

  if (isTrue(aide.besoin_enfant) && enfants > 0) {
    score += 30
    addReason(reasons, "Vous avez des enfants à charge.", "Ou na marmay a chaj.", isKreol)
  } else if (enfants > 0 && (aideText.includes("famille") || aideText.includes("enfant") || aideText.includes("scolaire"))) {
    score += 15
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
  }
}

function getRecommendedAides(aides = [], profile = {}, isKreol = false) {
  return aides
    .map(aide => scoreAide(aide, profile, isKreol))
    .filter(aide => !aide.excluded && aide.score >= 35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)
}

function getExcludedAides(aides = [], profile = {}, isKreol = false) {
  return aides
    .map(aide => scoreAide(aide, profile, isKreol))
    .filter(aide => aide.excluded)
    .slice(0, 5)
}

function openExternalLink(url) {
  if (!url) return
  window.open(url, "_blank", "noopener,noreferrer")
}

export default function AssistantAides({ isPremium, isMobile, t, user }) {
  const [question, setQuestion] = useState("")
  const [responseData, setResponseData] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)

  const txt = (key, fallback) => safeT(t, "aides", key, fallback)
  const isKreol = isKreolLanguage(t)

  const recommendedAides = useMemo(() => {
    if (!responseData?.profile || !responseData?.aides) return []
    return getRecommendedAides(responseData.aides, responseData.profile, isKreol)
  }, [responseData, isKreol])

  const excludedAides = useMemo(() => {
    if (!responseData?.profile || !responseData?.aides) return []
    return getExcludedAides(responseData.aides, responseData.profile, isKreol)
  }, [responseData, isKreol])

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

      {responseData?.type === "error" && (
        <div
          style={{
            marginTop: 16,
            background: "rgba(251,113,133,.10)",
            border: "1px solid rgba(251,113,133,.35)",
            borderRadius: 16,
            padding: 16,
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
            marginTop: 16,
            display: "grid",
            gap: 16,
          }}
        >
          <div
            style={{
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

            {responseData.type === "question" && (
              <p style={{ margin: "0 0 12px", color: COLORS.muted }}>
                {isKreol ? "Kestion analizé :" : "Question analysée :"}{" "}
                <strong style={{ color: COLORS.text }}>
                  {responseData.question || (isKreol ? "Ou la pa mark kestion" : "Aucune question précisée")}
                </strong>
              </p>
            )}

            <strong style={{ color: COLORS.green }}>
              {isKreol ? "Profil analizé avèk siksé." : "Profil analysé avec succès."}
            </strong>

            <div style={{ marginTop: 10 }}>
              {buildProfileSummary(responseData.profile, isKreol)}
            </div>
          </div>

          <div>
            <h4 style={{ margin: "0 0 10px", color: COLORS.text, fontSize: 18 }}>
              🎯 {isKreol ? "Bann zéd rekomandé" : "Aides recommandées"}
            </h4>

            <p style={{ margin: "0 0 14px", color: COLORS.muted }}>
              {isKreol
                ? `${responseData.aides.length} zéd analizé. Bann zéd pa adapté lé ékarté.`
                : `${responseData.aides.length} aides analysées. Les aides non adaptées sont écartées.`}
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
                  ? "Nana pa zéd assez probab pou linstan. Ranpli out profil pou gagn bann rekomandasyon pli présiz."
                  : "Aucune aide suffisamment probable pour le moment. Complétez votre profil pour obtenir des recommandations plus précises."}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {recommendedAides.map(aide => {
                  const level = getLevel(aide.score, isKreol)
                  const officialLink = getOfficialLink(aide)

                  return (
                    <article
                      key={aide.id || aide.nom}
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