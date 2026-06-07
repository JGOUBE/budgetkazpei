import { useEffect, useMemo, useState } from "react"
import { supabase } from "../../services/supabase"
import DetailOpportunite from "./DetailOpportunite"

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  yellow: "#FCD34D",
  cyan: "#23D3D6",
  green: "#22C55E",
  muted: "#8EA4C5",
  text: "#F1F5F9",
}

const COMMUNE_TO_ZONE = {
  "Saint-Leu": "Ouest",
  "Les Avirons": "Ouest",
  "Saint-Paul": "Ouest",
  "Le Port": "Ouest",
  "La Possession": "Ouest",
  "Trois-Bassins": "Ouest",
  "Saint-Denis": "Nord",
  "Sainte-Marie": "Nord",
  "Sainte-Suzanne": "Nord",
  "Saint-Pierre": "Sud",
  "Le Tampon": "Sud",
  "Saint-Louis": "Sud",
  "Étang-Salé": "Sud",
  "Entre-Deux": "Sud",
  "Petite-Île": "Sud",
  "Saint-Joseph": "Sud",
  "Saint-Philippe": "Sud",
  "Saint-André": "Est",
  "Bras-Panon": "Est",
  "Saint-Benoît": "Est",
  "Plaine-des-Palmistes": "Est",
  "Sainte-Rose": "Est",
  "Salazie": "Est",
}

function getCategoryLabel(category, isKreol) {
  const fr = {
    nouvelles_aides: "🔔 Nouvelles aides",
    maison_bricolage: "🏠 Maison & bricolage",
    courses_alimentation: "🛒 Courses & alimentation",
    telephonie_internet: "📱 Téléphonie & internet",
    energie: "⚡ Énergie",
    mobilite: "🚗 Mobilité",
    loisirs: "🎉 Loisirs",
    famille: "👨‍👩‍👧‍👦 Famille",
    logement: "🏠 Logement",
    ccas: "🏛️ CCAS",
    emploi: "💼 Emploi",
    sante: "🩺 Santé",
    scolaire: "🎒 Scolaire",
    transport: "🚌 Transport",
    general: "💡 Général",
  }

  const kr = {
    nouvelles_aides: "🔔 Nouvo éd",
    maison_bricolage: "🏠 Kaz & bricolaz",
    courses_alimentation: "🛒 Kours & manzé",
    telephonie_internet: "📱 Téléfon & internet",
    energie: "⚡ Énerzi",
    mobilite: "🚗 Déplasman",
    loisirs: "🎉 Lozir",
    famille: "👨‍👩‍👧‍👦 Fami",
    logement: "🏠 Lozman",
    ccas: "🏛️ CCAS",
    emploi: "💼 Travay",
    sante: "🩺 Santé",
    scolaire: "🎒 Lékol",
    transport: "🚌 Transport",
    general: "💡 Bon plan",
  }

  return isKreol ? kr[category] || "💡 Bon plan" : fr[category] || "💡 Opportunité"
}

function getTypeLabel(type, isKreol) {
  const fr = {
    aide: "Aide",
    bon_plan: "Bon plan",
    actualite: "Actualité",
  }

  const kr = {
    aide: "Éd",
    bon_plan: "Bon plan",
    actualite: "Nouvèl",
  }

  return isKreol ? kr[type] || "Bon plan" : fr[type] || "Opportunité"
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase()
}

function getProfileTags(profile) {
  const tags = ["tous"]

  const enfants = Number(profile?.nombre_enfants || 0)
  const logement = normalizeText(profile?.logement || profile?.situation_logement)
  const situationFamiliale = normalizeText(profile?.situation_familiale)
  const situationPro = normalizeText(profile?.situation_professionnelle)

  if (enfants > 0) tags.push("famille", "enfants")
  if (situationFamiliale === "parent_isole") tags.push("parent_isole", "famille")
  if (profile?.allocataire_caf) tags.push("caf", "famille")
  if (logement) tags.push(logement)
  if (logement === "locataire") tags.push("logement")
  if (logement === "proprietaire") tags.push("energie")
  if (profile?.etudiant) tags.push("etudiant")
  if (profile?.retraite) tags.push("retraite", "senior")
  if (profile?.handicap) tags.push("handicap")
  if (situationPro) tags.push(situationPro)
  if (profile?.permis_conduire) tags.push("permis")
  if (profile?.vehicule_personnel) tags.push("vehicule", "mobilite")

  return [...new Set(tags.map(normalizeText).filter(Boolean))]
}

function getOpportunityTargets(item) {
  const raw = item?.target_profiles

  if (Array.isArray(raw)) {
    return raw.map(normalizeText).filter(Boolean)
  }

  if (typeof raw === "string") {
    return raw
      .replace(/[{}[\]"]/g, "")
      .split(",")
      .map(normalizeText)
      .filter(Boolean)
  }

  return []
}

function getRecommendationScore(item, profile) {
  const profileTags = getProfileTags(profile)
  const targets = getOpportunityTargets(item)
  const category = normalizeText(item?.category)
  const title = normalizeText(item?.title)
  const priority = Number(item?.priority || 50)

  let score = priority
  const reasons = []

  if (targets.includes("tous")) {
    score += 10
    reasons.push("Profil général")
  }

  targets.forEach(target => {
    if (profileTags.includes(target)) {
      score += 35
      reasons.push(target)
    }
  })

  if (category === "famille" && Number(profile?.nombre_enfants || 0) > 0) {
    score += 45
    reasons.push("enfants")
  }

  if ((category === "logement" || title.includes("logement")) && normalizeText(profile?.logement) === "locataire") {
    score += 40
    reasons.push("locataire")
  }

  if ((category === "energie" || title.includes("énergie")) && profile?.commune) {
    score += 25
    reasons.push("énergie")
  }

  if ((category === "ccas" || title.includes("ccas")) && profile?.commune) {
    score += 35
    reasons.push("commune")
  }

  if ((category === "mobilite" || category === "transport") && (profile?.permis_conduire || profile?.vehicule_personnel)) {
    score += 20
    reasons.push("mobilité")
  }

  if (profile?.allocataire_caf && (title.includes("caf") || category === "famille")) {
    score += 35
    reasons.push("CAF")
  }

  if (profile?.etudiant && targets.includes("etudiant")) score += 35
  if (profile?.retraite && (targets.includes("retraite") || targets.includes("senior"))) score += 35
  if (profile?.handicap && targets.includes("handicap")) score += 35

  return {
    score,
    reasons: [...new Set(reasons)].slice(0, 3),
  }
}

export default function OpportunitesPage({ isPremium, t, user }) {
  const [opportunities, setOpportunities] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedOpportunity, setSelectedOpportunity] = useState(null)

  const isKreol = t("nav", "dashboard") === "Tablo débor"

  const commune = profile?.commune || ""
  const zone = COMMUNE_TO_ZONE[commune] || ""

  const allowedTerritories = useMemo(() => {
    return ["toutes", "la réunion", normalizeText(commune), normalizeText(zone)].filter(Boolean)
  }, [commune, zone])

  const filteredOpportunities = useMemo(() => {
    return opportunities.filter(item => {
      const territory = normalizeText(item.territory || "Toutes")
      return allowedTerritories.includes(territory)
    })
  }, [opportunities, allowedTerritories])

  const recommendedOpportunities = useMemo(() => {
    return filteredOpportunities
      .map(item => ({
        ...item,
        recommendation: getRecommendationScore(item, profile),
      }))
      .filter(item => item.recommendation.score >= 80)
      .sort((a, b) => b.recommendation.score - a.recommendation.score)
      .slice(0, 3)
  }, [filteredOpportunities, profile])

  useEffect(() => {
    fetchData()
  }, [user?.id])

  async function fetchData() {
    setLoading(true)

    let userProfile = null

    if (user?.id) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()

      if (profileError) {
        console.error("Erreur chargement profil:", profileError)
      } else {
        userProfile = profileData
        setProfile(profileData)
      }
    }

    const { data, error } = await supabase
      .from("opportunities")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Erreur chargement opportunités:", error)
      setOpportunities([])
    } else {
      setOpportunities(data || [])
    }

    if (!userProfile) {
      setProfile(null)
    }

    setLoading(false)
  }

  if (selectedOpportunity) {
    return (
      <DetailOpportunite
        item={selectedOpportunity}
        profile={profile}
        isPremium={isPremium}
        isKreol={isKreol}
        onBack={() => setSelectedOpportunity(null)}
      />
    )
  }

  return (
    <div>
      <h1
        style={{
          marginBottom: 12,
          color: COLORS.text,
          fontFamily: "'DM Serif Display', serif",
          fontSize: 34,
        }}
      >
        {isKreol ? "💰 Larzan a récupéré" : "💰 Argent à récupérer"}
      </h1>

      <p
        style={{
          color: COLORS.muted,
          marginBottom: 18,
          fontSize: 16,
          lineHeight: 1.5,
        }}
      >
        {isKreol
          ? "Trouv bann éd, bon plan ek promos selon ou komin."
          : "Découvrez les aides, économies et bons plans adaptés à votre commune."}
      </p>

      {!loading && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 12,
            marginBottom: 22,
          }}
        >
          <SummaryCard
            color={COLORS.cyan}
            label={isKreol ? "Opportunités détectées" : "Opportunités détectées"}
            value={filteredOpportunities.length}
          />

          <SummaryCard
            color={COLORS.accent}
            label={isKreol ? "Komin" : "Commune"}
            value={commune || (isKreol ? "Non renseignée" : "Non renseignée")}
          />

          <SummaryCard
            color={COLORS.yellow}
            label="Zone"
            value={zone || (isKreol ? "Toute La Rényon" : "Toute La Réunion")}
          />
        </div>
      )}

      {!loading && recommendedOpportunities.length > 0 && (
        <div
          style={{
            background: `linear-gradient(135deg, rgba(252,211,77,.13), rgba(249,115,22,.08), ${COLORS.card})`,
            border: `1px solid ${COLORS.yellow}44`,
            borderRadius: 20,
            padding: 18,
            marginBottom: 22,
          }}
        >
          <div
            style={{
              color: COLORS.yellow,
              fontSize: 17,
              fontWeight: 900,
              marginBottom: 5,
            }}
          >
            {isKreol ? "🎯 Rekomandé pou ou" : "🎯 Recommandé pour vous"}
          </div>

          <p
            style={{
              margin: "0 0 14px",
              color: COLORS.muted,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {isKreol
              ? "Selon out profil, sa bann opportunités i pé être pli utiles pou ou."
              : "Selon votre profil, ces opportunités semblent les plus pertinentes."}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {recommendedOpportunities.map(item => {
              const title = isKreol ? item.title_kr || item.title : item.title
              const locked = item.is_premium && !isPremium

              return (
                <button
                  key={`recommended-${item.id}`}
                  type="button"
                  onClick={() => {
                    if (!locked) setSelectedOpportunity(item)
                  }}
                  style={{
                    background: "rgba(10,22,40,.55)",
                    border: `1px solid ${locked ? COLORS.yellow : COLORS.border}`,
                    borderRadius: 16,
                    padding: 14,
                    textAlign: "left",
                    cursor: locked ? "default" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      color: COLORS.cyan,
                      fontSize: 11,
                      fontWeight: 900,
                      marginBottom: 7,
                    }}
                  >
                    {getCategoryLabel(item.category, isKreol)}
                  </div>

                  <div
                    style={{
                      color: COLORS.text,
                      fontWeight: 900,
                      fontSize: 14,
                      lineHeight: 1.35,
                    }}
                  >
                    {locked ? "🔒 " : "⭐ "}
                    {title}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      color: COLORS.yellow,
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    Score : {Math.min(item.recommendation.score, 100)}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {loading && (
        <div
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: 20,
            color: COLORS.muted,
          }}
        >
          {isKreol ? "Chargement bann bon plan..." : "Chargement des opportunités..."}
        </div>
      )}

      {!loading && filteredOpportunities.length === 0 && (
        <div
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            padding: 20,
            color: COLORS.muted,
          }}
        >
          {isKreol
            ? "Aucun bon plan trouvé pou ou komin pou le moman."
            : "Aucune opportunité trouvée pour votre commune pour le moment."}
        </div>
      )}

      {!loading && filteredOpportunities.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {filteredOpportunities.map(item => {
            const locked = item.is_premium && !isPremium
            const title = isKreol ? item.title_kr || item.title : item.title
            const description = isKreol
              ? item.description_kr || item.description
              : item.description

            return (
              <div
                key={item.id}
                style={{
                  background: `linear-gradient(135deg, ${COLORS.cardLight}, ${COLORS.card})`,
                  border: `1px solid ${locked ? COLORS.yellow : COLORS.border}`,
                  borderRadius: 18,
                  padding: 20,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {locked && (
                  <div
                    style={{
                      position: "absolute",
                      top: 14,
                      right: 14,
                      background: "rgba(252,211,77,.15)",
                      border: `1px solid ${COLORS.yellow}55`,
                      color: COLORS.yellow,
                      borderRadius: 999,
                      padding: "5px 9px",
                      fontSize: 11,
                      fontWeight: 900,
                    }}
                  >
                    🔒 Premium
                  </div>
                )}

                <div
                  style={{
                    color: COLORS.cyan,
                    fontSize: 12,
                    fontWeight: 900,
                    marginBottom: 10,
                  }}
                >
                  {getCategoryLabel(item.category, isKreol)}
                </div>

                <h3
                  style={{
                    margin: "0 0 8px",
                    color: COLORS.text,
                    fontSize: 18,
                  }}
                >
                  {title}
                </h3>

                <div
                  style={{
                    display: "inline-flex",
                    background: "rgba(249,115,22,.12)",
                    color: COLORS.accent,
                    border: `1px solid ${COLORS.accent}44`,
                    borderRadius: 999,
                    padding: "4px 9px",
                    fontSize: 11,
                    fontWeight: 900,
                    marginBottom: 12,
                  }}
                >
                  {getTypeLabel(item.type, isKreol)}
                </div>

                {item.amount && (
                  <div
                    style={{
                      color: COLORS.yellow,
                      fontSize: 22,
                      fontWeight: 900,
                      marginBottom: 10,
                    }}
                  >
                    {item.amount}
                  </div>
                )}

                <p
                  style={{
                    color: COLORS.muted,
                    fontSize: 14,
                    lineHeight: 1.5,
                    marginBottom: 14,
                  }}
                >
                  {locked
                    ? isKreol
                      ? "Sa lé réservé pou bann membres Premium."
                      : "Cette opportunité est réservée aux membres Premium."
                    : description}
                </p>

                <div
                  style={{
                    color: COLORS.green,
                    fontSize: 12,
                    fontWeight: 800,
                    marginBottom: 12,
                  }}
                >
                  📍 {item.territory || item.commune || (isKreol ? "La Rényon" : "La Réunion")}
                </div>

                {locked ? (
                  <button
                    type="button"
                    style={{
                      width: "100%",
                      background: `linear-gradient(135deg, ${COLORS.yellow}, ${COLORS.accent})`,
                      color: COLORS.card,
                      border: "none",
                      borderRadius: 12,
                      padding: "11px 14px",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    {isKreol ? "Débloque Premium" : "Débloquer Premium"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectedOpportunity(item)}
                    style={{
                      width: "100%",
                      background: "rgba(35,211,214,.12)",
                      color: COLORS.cyan,
                      border: `1px solid ${COLORS.cyan}44`,
                      borderRadius: 12,
                      padding: "11px 14px",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    {isKreol ? "War détay" : "Voir le détail"}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ color, label, value }) {
  return (
    <div
      style={{
        background: `${color}14`,
        border: `1px solid ${color}44`,
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div style={{ color, fontSize: 12, fontWeight: 900 }}>
        {label}
      </div>

      <div
        style={{
          color: COLORS.text,
          fontSize: typeof value === "number" ? 28 : 18,
          fontWeight: 900,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  )
}
