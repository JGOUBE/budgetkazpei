import { useEffect, useMemo, useState } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { formatMontant } from "../../utils/format"
import TropicalCard from "./TropicalCard"
import BudgetSettingsModal from "../budgets/BudgetSettingModal"
import { CATEGORIES } from "../../data/categories"
import { supabase } from "../../services/supabase"

// Dashboard V2 - Mobile First
// Règle UX : Carte = Action
// Le dashboard reste un résumé. Les détails doivent vivre dans des pages dédiées.

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  accentSoft: "#FB923C",
  green: "#22C55E",
  red: "#EF4444",
  blue: "#38BDF8",
  cyan: "#23D3D6",
  yellow: "#FCD34D",
  purple: "#A78BFA",
  muted: "#8EA4C5",
  text: "#F8FAFC",
  whiteSoft: "rgba(248,250,252,.82)",
}

function tr(t, section, key, fallback) {
  const value = t?.(section, key)
  return value || fallback
}

function getIsKreol(t) {
  return String(t?.("nav", "dashboard") || "").toLowerCase().includes("tablo")
}

function moneyValue(value) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function normalizeSubscriptionPlan({ plan, status, isPremium, isPremiumPlus } = {}) {
  const cleanStatus = String(status || "").toLowerCase().trim()
  const hasInactiveStatus = ["canceled", "cancelled", "inactive", "past_due", "unpaid", "expired"].includes(cleanStatus)

  if (hasInactiveStatus) return "free"

  const cleanPlan = String(plan || "")
    .toLowerCase()
    .trim()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_")

  if (cleanPlan.includes("premium_plus") || cleanPlan.includes("premium+")) return "premium_plus"
  if (cleanPlan.includes("premium")) return "premium"
  if (cleanPlan === "free" || cleanPlan === "gratuit") return "free"

  if (isPremiumPlus === true) return "premium_plus"
  if (isPremium === true) return "premium"

  return "free"
}

function getPremiumFlags({ plan, status, isPremium, isPremiumPlus } = {}) {
  const normalizedPlan = normalizeSubscriptionPlan({ plan, status, isPremium, isPremiumPlus })

  return {
    plan: normalizedPlan,
    hasPremiumAccess: normalizedPlan === "premium" || normalizedPlan === "premium_plus",
    hasPremiumPlusAccess: normalizedPlan === "premium_plus",
  }
}

function navigateTo(target, fallback) {
  if (typeof fallback === "function") {
    fallback()
    return
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("budgetkazpei:navigate", {
        detail: target,
      })
    )

    window.scrollTo({ top: 0, behavior: "smooth" })
  }
}

function getEmptyMoneyText(type, isKreol) {
  if (type === "revenus") {
    return isKreol ? "Aucun revenu anrezistré" : "Aucun revenu enregistré"
  }

  if (type === "depenses") {
    return isKreol ? "Aucune dépans anrezistré" : "Aucune dépense enregistrée"
  }

  if (type === "charges") {
    return isKreol ? "Aucune sarz fix anrezistré" : "Aucune charge fixe enregistrée"
  }

  return isKreol ? "À compléter" : "À compléter"
}

function formatSmartAmount(value, type, isKreol) {
  const amount = moneyValue(value)
  if (amount === 0) return getEmptyMoneyText(type, isKreol)
  return formatMontant(amount)
}

function buildBudgetScore({ stats = {}, byCategory = [], gainsAides = 0, nbAidesObtenues = 0, opportunitiesCount = 0 }) {
  const revenus = Number(stats.revenus || 0)
  const depenses = Number(stats.depenses || 0)
  const solde = Number(stats.solde || 0)
  const chargesFixes = Number(stats.chargesFixes || 0)
  let score = 72
  const positive = []
  const warnings = []

  if (revenus > 0) {
    const depRatio = depenses / revenus
    const chargesRatio = chargesFixes / revenus

    if (depRatio <= 0.75) {
      score += 10
      positive.push("budget_maitrise")
    } else if (depRatio > 1) {
      score -= 18
      warnings.push("depenses_hautes")
    } else {
      score -= 7
      warnings.push("depenses_a_surveille")
    }

    if (chargesRatio <= 0.45) {
      score += 8
      positive.push("charges_ok")
    } else if (chargesRatio > 0.65) {
      score -= 12
      warnings.push("charges_hautes")
    }
  } else {
    score -= 8
    warnings.push("revenus_manquants")
  }

  if (solde >= 0) {
    score += 7
    positive.push("solde_ok")
  } else {
    score -= 15
    warnings.push("solde_negatif")
  }

  const overBudget = byCategory.filter(cat => Number(cat.budget || 0) > 0 && Number(cat.depense || 0) > Number(cat.budget || 0))

  if (overBudget.length > 0) {
    score -= Math.min(18, overBudget.length * 6)
    warnings.push("budgets_depasses")
  } else if (byCategory.length > 0) {
    score += 6
    positive.push("categories_ok")
  }

  if (Number(gainsAides || 0) > 0 || Number(nbAidesObtenues || 0) > 0) {
    score += 8
    positive.push("aides_obtenues")
  } else if (Number(opportunitiesCount || 0) > 0) {
    score += 3
    warnings.push("aides_a_verifier")
  }

  score = Math.max(0, Math.min(100, Math.round(score)))

  const color = score >= 80 ? COLORS.green : score >= 60 ? COLORS.accentSoft : COLORS.red
  const level = score >= 80 ? "excellent" : score >= 60 ? "correct" : "attention"

  return {
    score,
    color,
    level,
    positive: positive.slice(0, 3),
    warnings: warnings.slice(0, 3),
    overBudget,
  }
}

function getScoreLabel(level, isKreol) {
  if (level === "excellent") return isKreol ? "Tré bien" : "Excellent"
  if (level === "correct") return isKreol ? "Correct" : "Correct"
  return isKreol ? "À surveyé" : "À surveiller"
}

function getSignalText(key, isKreol) {
  const fr = {
    budget_maitrise: "Budget global maîtrisé",
    charges_ok: "Charges fixes raisonnables",
    solde_ok: "Solde positif ce mois-ci",
    categories_ok: "Budgets par catégorie suivis",
    aides_obtenues: "Aides obtenues enregistrées",
    depenses_hautes: "Dépenses trop élevées ce mois-ci",
    depenses_a_surveille: "Dépenses à surveiller",
    charges_hautes: "Charges fixes importantes",
    revenus_manquants: "Revenus à compléter",
    solde_negatif: "Solde négatif ce mois-ci",
    budgets_depasses: "Une ou plusieurs catégories dépassées",
    aides_a_verifier: "Opportunités à vérifier",
  }

  const kr = {
    budget_maitrise: "Out bidjé lé anba kontrol",
    charges_ok: "Sarz fix lé rézonab",
    solde_ok: "Larzan i reste lé positif",
    categories_ok: "Bidjé par katégori lé suivi",
    aides_obtenues: "Éd gagné lé anrezistré",
    depenses_hautes: "Dépans lé tro haut pou mwa-la",
    depenses_a_surveille: "Dépans à surveillé",
    charges_hautes: "Sarz fix lé trop haut",
    revenus_manquants: "Larzan i rantre lé à compléter",
    solde_negatif: "Larzan i reste lé négatif",
    budgets_depasses: "Na katégori la dépassé out bidjé",
    aides_a_verifier: "Bon plan à vérifié",
  }

  return (isKreol ? kr : fr)[key] || key
}

function ClickableStatCard({ label, value, sub, color, emoji, variant, texture, onClick, isMobile }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        border: "none",
        background: "transparent",
        padding: 0,
        margin: 0,
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
      }}
      aria-label={label}
    >
      <TropicalCard
        variant={variant}
        emoji={emoji}
        texture={texture}
        style={{
          minHeight: isMobile ? 124 : 140,
          padding: "18px 20px",
          transition: "transform .18s ease, box-shadow .18s ease",
        }}
        innerStyle={{ paddingLeft: 74 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "rgba(248,250,252,.72)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontFamily: "monospace",
              fontWeight: 800,
            }}
          >
            {label}
          </span>

          <span
            style={{
              color: "rgba(248,250,252,.66)",
              fontSize: 18,
              fontWeight: 900,
            }}
          >
            ›
          </span>
        </div>

        <span
          style={{
            display: "block",
            marginTop: 12,
            fontSize: typeof value === "string" && value.includes("Aucun") ? 18 : 34,
            fontWeight: 800,
            color,
            fontFamily: "'DM Serif Display', Georgia, serif",
            letterSpacing: "-0.8px",
            lineHeight: 1.05,
            textShadow: "0 0 20px rgba(255,255,255,.12)",
          }}
        >
          {value}
        </span>

        {sub && (
          <span
            style={{
              display: "block",
              marginTop: 7,
              fontSize: 12,
              color: "rgba(248,250,252,.62)",
              lineHeight: 1.35,
            }}
          >
            {sub}
          </span>
        )}
      </TropicalCard>
    </button>
  )
}

function EmptyWelcomeCard({ t, isMobile, onGoProfile, onGoAides, onGoCharges }) {
  const isKreol = getIsKreol(t)

  return (
    <TropicalCard variant="lagoon" texture="🌴" style={{ padding: isMobile ? 18 : 24 }}>
      <div style={{ color: COLORS.text, fontWeight: 900, fontSize: isMobile ? 22 : 28, marginBottom: 8 }}>
        {isKreol ? "Bienvenue su BudgetKazPei 👋" : "Bienvenue sur BudgetKazPei 👋"}
      </div>

      <div style={{ color: COLORS.whiteSoft, fontSize: 14, lineHeight: 1.65, marginBottom: 16 }}>
        {isKreol
          ? "Pou komans, complète out profil, ajoute out sarz fix, ajoute out dépans épi rode bann éd possibles."
          : "Pour commencer, complétez votre profil, ajoutez vos charges fixes, vos dépenses, puis découvrez les aides possibles."}
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)" }}>
        <WelcomeActionButton
          label={isKreol ? "Complète mon profil" : "Compléter mon profil"}
          icon="👤"
          onClick={onGoProfile}
        />
        <WelcomeActionButton
          label={isKreol ? "Ajoute in sarz fix" : "Ajouter une charge fixe"}
          icon="📌"
          onClick={onGoCharges}
        />
        <WelcomeActionButton
          label={isKreol ? "Rod mon bann éd" : "Rechercher mes aides"}
          icon="🏛️"
          onClick={onGoAides}
        />
      </div>
    </TropicalCard>
  )
}

function WelcomeActionButton({ label, icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "rgba(255,255,255,.075)",
        border: "1px solid rgba(255,255,255,.12)",
        borderRadius: 14,
        color: COLORS.text,
        padding: "12px 13px",
        cursor: "pointer",
        fontFamily: "inherit",
        fontWeight: 900,
        textAlign: "left",
      }}
    >
      <span style={{ marginRight: 8 }}>{icon}</span>
      {label}
    </button>
  )
}

function SmartWelcomeCard({ t, isMobile, stats = {}, gainsAides = 0, nbAidesObtenues = 0, opportunitiesCount = 0, objectifGains = 1000, commune = "" }) {
  const isKreol = getIsKreol(t)
  const gains = Number(gainsAides || stats.gainsAides || 0)
  const restantObjectif = Math.max(Number(objectifGains || 1000) - gains, 0)
  const solde = Number(stats.solde || 0)

  return (
    <TropicalCard variant="lagoon" texture="🌴" style={{ padding: isMobile ? 16 : 22 }}>
      <div style={{ color: COLORS.text, fontWeight: 900, fontSize: isMobile ? 18 : 22, marginBottom: 8 }}>
        {isKreol ? "Bonzour 👋" : "Bonjour 👋"}
      </div>

      <div style={{ color: COLORS.whiteSoft, fontSize: 14, lineHeight: 1.65 }}>
        {gains > 0
          ? isKreol
            ? `Ou la déjà récupéré ${gains.toFixed(0)} € ek BudgetKazPei.`
            : `Vous avez déjà récupéré ${gains.toFixed(0)} € grâce à BudgetKazPei.`
          : isKreol
            ? "Komans par azout in démarche. Kan in éd lé aksepté, mark lo gain gagné."
            : "Commencez par ajouter une démarche, puis renseignez le gain quand l’aide est acceptée."}
        {" "}
        {restantObjectif > 0
          ? isKreol
            ? `I reste ${restantObjectif.toFixed(0)} € pou atenn lobzektif lanné.`
            : `Il reste ${restantObjectif.toFixed(0)} € pour atteindre l’objectif annuel.`
          : isKreol
            ? "Lobzektif lanné lé atteint. Bravo !"
            : "L’objectif annuel est atteint. Bravo !"}
        <br />
        {opportunitiesCount > 0
          ? isKreol
            ? `${opportunitiesCount} bon plan i mérite d'être vérifié${commune ? ` à ${commune}` : ""}.`
            : `${opportunitiesCount} opportunité(s) méritent d’être vérifiées${commune ? ` à ${commune}` : ""}.`
          : isKreol
            ? "Pa na okenn bon plan urgent détecté pou le moman."
            : "Aucune opportunité urgente détectée pour le moment."}
        {solde < 0 && (
          <span style={{ color: COLORS.red, fontWeight: 900 }}>
            {isKreol ? " Attention : out solde lé négatif." : " Attention : votre solde est négatif."}
          </span>
        )}
      </div>
    </TropicalCard>
  )
}

function BudgetScoreCard({ t, isMobile, stats = {}, byCategory = [], gainsAides = 0, nbAidesObtenues = 0, opportunitiesCount = 0 }) {
  const isKreol = getIsKreol(t)
  const result = buildBudgetScore({ stats, byCategory, gainsAides, nbAidesObtenues, opportunitiesCount })

  return (
    <TropicalCard variant="purple" texture="🏆" style={{ padding: isMobile ? 16 : 22 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 14,
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: result.color, fontSize: 13, fontWeight: 900, marginBottom: 6 }}>
            🏆 {isKreol ? "Score BudgetKazPei" : "Score BudgetKazPei"}
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                color: COLORS.text,
                fontSize: isMobile ? 34 : 42,
                fontWeight: 900,
                lineHeight: 1,
                fontFamily: "'DM Serif Display', Georgia, serif",
              }}
            >
              {result.score}
            </span>
            <span style={{ color: COLORS.muted, fontWeight: 900 }}>/ 100</span>
            <span style={{ color: result.color, fontWeight: 900, marginLeft: 6 }}>
              {getScoreLabel(result.level, isKreol)}
            </span>
          </div>

          <div style={{ height: 9, background: "rgba(255,255,255,.12)", borderRadius: 999, overflow: "hidden", marginTop: 12 }}>
            <div
              style={{
                width: `${result.score}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${result.color}, ${COLORS.cyan})`,
                borderRadius: 999,
              }}
            />
          </div>
        </div>

        <div style={{ width: isMobile ? "100%" : 360, display: "grid", gap: 7 }}>
          {result.positive.map(key => (
            <div key={key} style={{ color: COLORS.green, fontSize: 12, fontWeight: 800 }}>
              ✅ {getSignalText(key, isKreol)}
            </div>
          ))}
          {result.warnings.map(key => (
            <div key={key} style={{ color: COLORS.yellow, fontSize: 12, fontWeight: 800 }}>
              ⚠️ {getSignalText(key, isKreol)}
            </div>
          ))}
        </div>
      </div>
    </TropicalCard>
  )
}

function MoneyDetectedCard({ t, isMobile, opportunitiesCount = 0, commune = "", onOpenOpportunities }) {
  const isKreol = getIsKreol(t)

  return (
    <button
      type="button"
      onClick={onOpenOpportunities}
      style={{
        display: "block",
        width: "100%",
        border: "none",
        background: "transparent",
        padding: 0,
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      <TropicalCard variant="gold" texture="💰" style={{ padding: isMobile ? 16 : 22 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ color: COLORS.yellow, fontWeight: 900, fontSize: 13, marginBottom: 5 }}>
              {isKreol ? "🎯 Bon plan détèkté pou ou" : "🎯 Opportunités détectées pour vous"}
            </div>

            <div
              style={{
                color: COLORS.text,
                fontSize: isMobile ? 20 : 24,
                fontWeight: 900,
                lineHeight: 1.15,
              }}
            >
              {opportunitiesCount} {isKreol ? "bon plan pou vérifié" : "aides ou bons plans à vérifier"}
            </div>

            <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>
              📍 {commune || (isKreol ? "La Rényon" : "La Réunion")}
              <br />
              {isKreol
                ? "Bann éd, bon plan ek démarche i pé konsern aou."
                : "Aides, bons plans et démarches susceptibles de vous concerner."}
            </div>
          </div>

          <span style={{ color: COLORS.yellow, fontSize: 24, fontWeight: 900 }}>›</span>
        </div>
      </TropicalCard>
    </button>
  )
}

function RecoveredMoneyCard({
  t,
  isMobile,
  gainsAides = 0,
  nbAidesObtenues = 0,
  objectifGains = 1000,
  onOpenAides,
  gainsDetails = [],
}) {
  const isKreol = getIsKreol(t)
  const gains = Number(gainsAides || 0)
  const objectif = Number(objectifGains || 1000)
  const progress = objectif > 0 ? Math.min(Math.round((gains / objectif) * 100), 100) : 0
  const hasGains = gains > 0

  return (
    <button
      type="button"
      onClick={onOpenAides}
      style={{
        display: "block",
        width: "100%",
        border: "none",
        background: "transparent",
        padding: 0,
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      <TropicalCard variant="green" texture="💸" style={{ padding: isMobile ? 16 : 22 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "flex-start" : "center",
            gap: 16,
            flexDirection: isMobile ? "column" : "row",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: "#BEF264", fontWeight: 900, fontSize: 13, marginBottom: 6 }}>
              {isKreol ? "💰 Larzan ou la récupéré ek BudgetKazPei" : "💰 Argent récupéré grâce à BudgetKazPei"}
            </div>

            <div
              style={{
                color: COLORS.text,
                fontSize: isMobile ? 30 : 38,
                fontWeight: 900,
                lineHeight: 1,
                fontFamily: "'DM Serif Display', Georgia, serif",
              }}
            >
              {gains.toFixed(0)} €
            </div>

            <div style={{ marginTop: 8, color: COLORS.muted, fontSize: 13, lineHeight: 1.45 }}>
              ✅ {nbAidesObtenues} {isKreol ? "éd gagné" : "aide(s) obtenue(s)"}
              <br />
              {hasGains
                ? isKreol
                  ? "Out démarche i komans rapport aou pou vré."
                  : "Vos démarches commencent à rapporter concrètement."
                : isKreol
                  ? "Mèt in démarche an Gagné, épi mark lo montan gagné."
                  : "Passez une démarche en accepté puis renseignez le gain."}
            </div>

            {gainsDetails.length > 0 && (
              <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                <div style={{ color: COLORS.green, fontSize: 12, fontWeight: 900 }}>
                  {isKreol ? "Dernyé gains anrezistré" : "Derniers gains enregistrés"}
                </div>
                {gainsDetails.slice(0, 3).map((gain, index) => (
                  <div
                    key={`${gain.label}-${index}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      background: "rgba(255,255,255,.055)",
                      border: "1px solid rgba(255,255,255,.08)",
                      borderRadius: 10,
                      padding: "8px 10px",
                      color: COLORS.text,
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {gain.label}
                    </span>
                    <span style={{ color: COLORS.green, flexShrink: 0 }}>{Number(gain.amount || 0).toFixed(0)} €</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              width: isMobile ? "100%" : 260,
              background: "rgba(10,22,40,.40)",
              border: "1px solid rgba(255,255,255,.10)",
              borderRadius: 16,
              padding: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                color: COLORS.whiteSoft,
                fontSize: 12,
                fontWeight: 900,
                marginBottom: 8,
              }}
            >
              <span>{isKreol ? "Lobzektif lanné" : "Objectif annuel"}</span>
              <span style={{ color: "#BEF264" }}>{progress}%</span>
            </div>

            <div style={{ height: 9, background: "rgba(255,255,255,.12)", borderRadius: 999, overflow: "hidden", marginBottom: 9 }}>
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #22C55E, #BEF264)",
                  borderRadius: 999,
                  transition: "width .45s ease",
                }}
              />
            </div>

            <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.45 }}>
              {gains.toFixed(0)} € / {objectif.toFixed(0)} €
            </div>
          </div>
        </div>
      </TropicalCard>
    </button>
  )
}

function RecommendedActionsCard({
  t,
  isMobile,
  stats = {},
  byCategory = [],
  opportunitiesCount = 0,
  gainsAides = 0,
  nbAidesObtenues = 0,
  transactions = [],
  hasPremiumAccess = false,
  onOpenOpportunities,
  onOpenAides,
  onGoPremium,
}) {
  const isKreol = getIsKreol(t)
  const actions = []
  const solde = Number(stats.solde || 0)

  if (solde < 0) {
    actions.push({ icon: "🚨", text: isKreol ? "Rédui in dépans ou ajoute larzan i rantre pou repass solde positif." : "Réduire une dépense ou ajouter un revenu pour repasser en solde positif." })
  }

  const overBudget = byCategory.find(cat => Number(cat.budget || 0) > 0 && Number(cat.depense || 0) > Number(cat.budget || 0))
  if (overBudget) {
    actions.push({ icon: "⚠️", text: isKreol ? `Surveille katégori ${overBudget.emoji || ""} ${overBudget.id}.` : `Surveiller la catégorie ${overBudget.emoji || ""} ${overBudget.id}.` })
  }

  if (opportunitiesCount > 0) {
    actions.push({ icon: "🎯", text: isKreol ? `Vérifie ${opportunitiesCount} bon plan détèkté.` : `Vérifier ${opportunitiesCount} opportunité(s) détectée(s).` })
  }

  if (Number(gainsAides || 0) <= 0 && Number(nbAidesObtenues || 0) <= 0) {
    actions.push({ icon: "💰", text: isKreol ? "Passe in démarche an Aksepté épi rant lo montan gagné." : "Passer une démarche en Acceptée puis renseigner le gain." })
  }

  if (!transactions || transactions.length === 0) {
    actions.push({ icon: "➕", text: isKreol ? "Azout out premiers mouvman pou rann tablo-la pli précis." : "Ajouter vos premiers mouvements pour rendre le tableau plus précis." })
  }

  if (!hasPremiumAccess) {
    actions.push({ icon: "👑", text: isKreol ? "Déblok alertes bidjé ek PDF ek Premium." : "Débloquer les alertes budget et PDF avec Premium." })
  }

  const displayedActions = actions.slice(0, 4)

  if (displayedActions.length === 0) {
    displayedActions.push({ icon: "✅", text: isKreol ? "Out situation lé stable pou le moman." : "Votre situation semble stable pour le moment." })
  }

  return (
    <TropicalCard variant="ocean" texture="🎯" style={{ padding: isMobile ? 16 : 22 }}>
      <div style={{ color: COLORS.text, fontWeight: 900, fontSize: 16, marginBottom: 12 }}>
        🎯 {isKreol ? "Bann actions pou fé" : "Actions recommandées"}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {displayedActions.map((action, index) => (
          <div
            key={`${action.text}-${index}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              background: "rgba(255,255,255,.045)",
              border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 12,
              padding: "10px 11px",
              color: COLORS.text,
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            <span>{action.icon}</span>
            <span>{action.text}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {onOpenAides && (
          <ActionChip onClick={onOpenAides} color="#BEF264">
            {isKreol ? "Éd & démarches" : "Aides & démarches"}
          </ActionChip>
        )}
        {onOpenOpportunities && (
          <ActionChip onClick={onOpenOpportunities} color="#FDE68A">
            {isKreol ? "Bon plan" : "Opportunités"}
          </ActionChip>
        )}
        {!hasPremiumAccess && onGoPremium && (
          <ActionChip onClick={onGoPremium} color="#DDD6FE">
            Premium+
          </ActionChip>
        )}
      </div>
    </TropicalCard>
  )
}

function ActionChip({ children, onClick, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.12)",
        color,
        borderRadius: 999,
        padding: "8px 11px",
        fontWeight: 900,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  )
}

function PremiumLockedCard({ t, isMobile, hasPremiumAccess, hasPremiumPlusAccess, onGoPremium }) {
  const isKreol = getIsKreol(t)

  return (
    <TropicalCard variant="purple" texture="👑" style={{ padding: isMobile ? 16 : 22 }}>
      <div style={{ color: COLORS.purple, fontWeight: 900, fontSize: 13, marginBottom: 8 }}>
        👑 {isKreol ? "Fonksyon Premium" : "Fonctions Premium"}
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)" }}>
        <PremiumFeature
          locked={!hasPremiumAccess}
          title={isKreol ? "Alertes bidjé" : "Alertes budget"}
          text="80 % · 100 %"
        />
        <PremiumFeature
          locked={!hasPremiumAccess}
          title="Export PDF"
          text={isKreol ? "Mwa complet" : "Mois complet"}
        />
        <PremiumFeature
          locked={!hasPremiumPlusAccess}
          title={isKreol ? "Analyse avancée" : "Analyse avancée"}
          text="Premium+"
        />
      </div>

      {!hasPremiumAccess && onGoPremium && (
        <button
          type="button"
          onClick={onGoPremium}
          style={{
            marginTop: 14,
            background: "linear-gradient(135deg, rgba(167,139,250,.24), rgba(249,115,22,.12))",
            border: "1px solid rgba(167,139,250,.36)",
            borderRadius: 14,
            color: "#DDD6FE",
            padding: "10px 13px",
            cursor: "pointer",
            fontWeight: 900,
            fontFamily: "inherit",
          }}
        >
          {isKreol ? "Découvre Premium" : "Découvrir Premium"}
        </button>
      )}
    </TropicalCard>
  )
}

function PremiumFeature({ locked, title, text }) {
  return (
    <div
      style={{
        background: locked ? "rgba(10,22,40,.55)" : "rgba(34,197,94,.10)",
        border: locked ? "1px solid rgba(255,255,255,.10)" : "1px solid rgba(34,197,94,.25)",
        borderRadius: 14,
        padding: "12px 13px",
        color: COLORS.text,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 5 }}>
        {locked ? "🔒 " : "✅ "}
        {title}
      </div>
      <div style={{ color: COLORS.muted, fontSize: 12 }}>{text}</div>
    </div>
  )
}

function BudgetCategoriesCard({
  t,
  isMobile,
  byCategory = [],
  customBudgets = [],
  onSaveBudgets,
  hasPremiumAccess,
  onGoPremium,
}) {
  const [showBudgetModal, setShowBudgetModal] = useState(false)
  const isKreol = getIsKreol(t)

  if (!byCategory || byCategory.length === 0) return null

  return (
    <>
      <TropicalCard variant="lagoon" texture="📊" style={{ padding: isMobile ? 16 : 22 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "flex-start" : "center",
            gap: 12,
            flexDirection: isMobile ? "column" : "row",
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ color: COLORS.text, fontWeight: 900, fontSize: 16 }}>
              📊 {isKreol ? "Bidjé par katégori" : "Budgets par catégorie"}
            </div>
            <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>
              {isKreol ? "Résumé rapide. Lo détail i sera dann page Dépenses." : "Résumé rapide. Le détail sera dans la page Dépenses."}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (hasPremiumAccess) {
                setShowBudgetModal(true)
              } else if (onGoPremium) {
                onGoPremium()
              }
            }}
            style={{
              background: hasPremiumAccess
                ? "rgba(255,255,255,.09)"
                : "linear-gradient(135deg, rgba(252,211,77,.22), rgba(245,158,11,.14))",
              border: hasPremiumAccess
                ? "1px solid rgba(255,255,255,.14)"
                : "1px solid rgba(252,211,77,.35)",
              borderRadius: 999,
              color: hasPremiumAccess ? COLORS.whiteSoft : "#FDE68A",
              cursor: "pointer",
              padding: "7px 12px",
              fontSize: 12,
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            {hasPremiumAccess
              ? isKreol ? "⚙️ Modifie bidjé" : "⚙️ Modifier mes budgets"
              : isKreol ? "🔒 Bidjé personnalisés" : "🔒 Budgets personnalisés"}
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
            gap: isMobile ? "14px 0" : "18px 34px",
          }}
        >
          {byCategory.slice(0, 8).map(cat => {
            const depense = Number(cat.depense || 0)
            const budget = Number(cat.budget || 0)
            const max = budget || 1
            const pct = Math.min((depense / max) * 100, 100)
            const isOver = budget > 0 && depense > budget

            return (
              <div key={cat.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                  <span style={{ fontSize: 14, color: COLORS.text, fontWeight: 800 }}>
                    {cat.emoji} {t("categories", cat.id)}
                  </span>
                  <span style={{ fontSize: 12, color: isOver ? COLORS.red : COLORS.whiteSoft, flexShrink: 0 }}>
                    {depense.toFixed(0)} / {budget} €
                  </span>
                </div>
                <div style={{ background: "rgba(255,255,255,.14)", borderRadius: 99, height: 7, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: isOver ? COLORS.red : cat.color || COLORS.cyan,
                      borderRadius: 99,
                      transition: "width 0.8s cubic-bezier(.4,0,.2,1)",
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </TropicalCard>

      {showBudgetModal && (
        <BudgetSettingsModal
          categories={CATEGORIES}
          currentBudgets={customBudgets}
          onSave={onSaveBudgets}
          onClose={() => setShowBudgetModal(false)}
          t={t}
        />
      )}
    </>
  )
}

function PieSummaryCard({ t, isMobile, pieData = [], onOpenDepenses }) {
  const isKreol = getIsKreol(t)
  const filtered = (pieData || []).filter(item => Number(item.value || 0) > 0)

  if (filtered.length === 0) return null

  return (
    <button
      type="button"
      onClick={onOpenDepenses}
      style={{
        display: "block",
        width: "100%",
        border: "none",
        background: "transparent",
        padding: 0,
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      <TropicalCard variant="ocean" texture="🌊" style={{ padding: isMobile ? 16 : 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <div style={{ color: COLORS.text, fontWeight: 900, fontSize: 16 }}>
            {isKreol ? "Répartition dépans" : "Répartition des dépenses"}
          </div>
          <span style={{ color: COLORS.cyan, fontSize: 20, fontWeight: 900 }}>›</span>
        </div>

        <div style={{ height: isMobile ? 210 : 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={filtered}
                cx="50%"
                cy="50%"
                innerRadius={isMobile ? 52 : 68}
                outerRadius={isMobile ? 82 : 108}
                paddingAngle={3}
                dataKey="value"
              >
                {filtered.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || COLORS.cyan} />
                ))}
              </Pie>
              <Tooltip
                formatter={value => formatMontant(value)}
                contentStyle={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 12,
                  color: COLORS.text,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </TropicalCard>
    </button>
  )
}

function normalizeDashboardStatus(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function getDashboardGainAmount(item = {}) {
  return moneyValue(
    item.montant_obtenu ??
    item.gain_amount ??
    item.gain ??
    item.amount_obtenu ??
    item.montant ??
    0
  )
}

function isAcceptedDashboardDemarche(item = {}) {
  const status = normalizeDashboardStatus(item.status)
  return status.includes("accept") || status.includes("aksept") || status === "accepte"
}

export default function Dashboard({
  stats,
  byCategory = [],
  pieData = [],
  transactions = [],
  abonnements = [],
  t,
  isMobile,
  isPremium = false,
  isPremiumPlus = false,
  plan = "free",
  customBudgets = [],
  onSaveBudgets,
  onGoPremium,
  opportunitiesCount = 0,
  commune = "",
  onOpenOpportunities,
  gainsAides = 0,
  nbAidesObtenues = 0,
  objectifGains = 1000,
  onOpenAides,
  onOpenRevenus,
  onOpenDepenses,
  onOpenSolde,
}) {
  const safeStats = stats || {}
  const { revenus = 0, depenses = 0, solde = 0 } = safeStats
  const isKreol = getIsKreol(t)

  const realTransactions = (transactions || []).filter(tx => {
    const label = normalizeText(tx?.label || tx?.nom || "")
    const source = normalizeText(tx?.source || "")
    return source !== "profile_income" && label !== "revenus du foyer"
  })

  const isNewUser =
    Number(revenus || 0) === 0 &&
    Number(depenses || 0) === 0 &&
    realTransactions.length === 0 &&
    (abonnements?.length || 0) === 0

  const [dashboardAideGains, setDashboardAideGains] = useState({
    gainsAides: 0,
    nbAidesObtenues: 0,
    gainsDetails: [],
    loaded: false,
  })

  const [subscriptionFromDb, setSubscriptionFromDb] = useState({
    plan: "",
    status: "",
    loaded: false,
  })

  const effectivePlan = subscriptionFromDb.plan || plan
  const effectiveStatus = subscriptionFromDb.status || ""
  const premiumStatus = getPremiumFlags({
    plan: effectivePlan,
    status: effectiveStatus,
    isPremium,
    isPremiumPlus,
  })

  const hasPremiumAccess = premiumStatus.hasPremiumAccess
  const hasPremiumPlusAccess = premiumStatus.hasPremiumPlusAccess

  const effectiveGainsAides = Number(gainsAides || 0) || dashboardAideGains.gainsAides
  const effectiveNbAidesObtenues = Number(nbAidesObtenues || 0) || dashboardAideGains.nbAidesObtenues

  const revenusSub = Number(revenus || 0) === 0
    ? isKreol ? "Touchez pou compléter" : "Touchez pour compléter"
    : isKreol ? "Touchez pou voir détail" : "Touchez pour voir le détail"

  const depensesSub = Number(depenses || 0) === 0
    ? isKreol ? "Touchez pou ajouter" : "Touchez pour ajouter"
    : isKreol ? `${safeStats.tauxChargesFixes || 0} % des revenus en sarz fix` : `${safeStats.tauxChargesFixes || 0} % des revenus en charges fixes`

  const soldeSub = Number(solde || 0) === 0
    ? isKreol ? "Calcul revenus - dépans" : "Calcul revenus - dépenses"
    : isKreol ? "Touchez pou voir calcul" : "Touchez pour voir le calcul"

  useEffect(() => {
    let ignore = false

    async function fetchSubscription() {
      try {
        const { data: authData } = await supabase.auth.getUser()
        const user = authData?.user
        if (!user?.id) return

        const { data, error } = await supabase
          .from("profiles")
          .select("plan, subscription_type, stripe_subscription_status, premium, is_premium, premium_plus")
          .eq("id", user.id)
          .maybeSingle()

        if (error) throw error
        if (ignore || !data) return

        setSubscriptionFromDb({
          plan: data.plan || data.subscription_type || "",
          status: data.stripe_subscription_status || "",
          loaded: true,
        })
      } catch (error) {
        console.error("Erreur chargement abonnement dashboard:", error)
        if (!ignore) {
          setSubscriptionFromDb(prev => ({ ...prev, loaded: true }))
        }
      }
    }

    fetchSubscription()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false

    async function fetchAideGains() {
      try {
        const { data: authData } = await supabase.auth.getUser()
        const user = authData?.user
        if (!user?.id) return

        const { data, error } = await supabase
          .from("aide_demarches")
          .select("id, aide_nom, title, nom, status, montant_obtenu, gain_amount, gain, amount_obtenu, montant, updated_at, created_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })

        if (error) throw error
        if (ignore) return

        const accepted = (data || []).filter(item => isAcceptedDashboardDemarche(item))
        const gainsDetails = accepted
          .map(item => ({
            label: item.aide_nom || item.title || item.nom || "Aide",
            amount: getDashboardGainAmount(item),
          }))
          .filter(item => item.amount > 0)

        const total = gainsDetails.reduce((sum, item) => sum + item.amount, 0)

        setDashboardAideGains({
          gainsAides: total,
          nbAidesObtenues: accepted.length,
          gainsDetails,
          loaded: true,
        })
      } catch (error) {
        console.error("Erreur chargement gains aides dashboard:", error)
        if (!ignore) {
          setDashboardAideGains(prev => ({ ...prev, loaded: true }))
        }
      }
    }

    fetchAideGains()

    return () => {
      ignore = true
    }
  }, [])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {isNewUser ? (
        <EmptyWelcomeCard
          t={t}
          isMobile={isMobile}
          onGoProfile={() => navigateTo("profil")}
          onGoAides={() => navigateTo("aides", onOpenAides)}
          onGoCharges={() => navigateTo("abonnements")}
        />
      ) : (
        <SmartWelcomeCard
          t={t}
          isMobile={isMobile}
          stats={safeStats}
          gainsAides={effectiveGainsAides}
          nbAidesObtenues={effectiveNbAidesObtenues}
          opportunitiesCount={opportunitiesCount}
          objectifGains={objectifGains}
          commune={commune}
        />
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
          gap: 16,
        }}
      >
        <ClickableStatCard
          label={tr(t, "dashboard", "revenus", "Revenus du mois")}
          value={formatSmartAmount(revenus, "revenus", isKreol)}
          sub={revenusSub}
          color="#BEF264"
          emoji="💰"
          variant="green"
          texture="🍃"
          isMobile={isMobile}
          onClick={() => navigateTo("revenus", onOpenRevenus)}
        />

        <ClickableStatCard
          label={tr(t, "dashboard", "depenses", "Dépenses du mois")}
          value={formatSmartAmount(depenses, "depenses", isKreol)}
          sub={depensesSub}
          color="#FDBA74"
          emoji="💸"
          variant="coral"
          texture="🌞"
          isMobile={isMobile}
          onClick={() => navigateTo("depenses", onOpenDepenses)}
        />

        <ClickableStatCard
          label={tr(t, "dashboard", "solde", "Solde disponible")}
          value={formatMontant(solde)}
          sub={soldeSub}
          color={Number(solde || 0) >= 0 ? COLORS.green : COLORS.red}
          emoji="🏝️"
          variant="lagoon"
          texture="🌴"
          isMobile={isMobile}
          onClick={() => navigateTo("solde", onOpenSolde)}
        />
      </div>

      <BudgetScoreCard
        t={t}
        isMobile={isMobile}
        stats={safeStats}
        byCategory={byCategory}
        gainsAides={effectiveGainsAides}
        nbAidesObtenues={effectiveNbAidesObtenues}
        opportunitiesCount={opportunitiesCount}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 16,
        }}
      >
        <MoneyDetectedCard
          t={t}
          isMobile={isMobile}
          opportunitiesCount={opportunitiesCount}
          commune={commune}
          onOpenOpportunities={() => navigateTo("aides", onOpenOpportunities)}
        />

        <RecoveredMoneyCard
          t={t}
          isMobile={isMobile}
          gainsAides={effectiveGainsAides}
          nbAidesObtenues={effectiveNbAidesObtenues}
          objectifGains={objectifGains}
          gainsDetails={dashboardAideGains.gainsDetails}
          onOpenAides={() => navigateTo("demarches", onOpenAides)}
        />
      </div>

      <RecommendedActionsCard
        t={t}
        isMobile={isMobile}
        stats={safeStats}
        byCategory={byCategory}
        opportunitiesCount={opportunitiesCount}
        gainsAides={effectiveGainsAides}
        nbAidesObtenues={effectiveNbAidesObtenues}
        transactions={transactions}
        hasPremiumAccess={hasPremiumAccess}
        onOpenOpportunities={() => navigateTo("aides", onOpenOpportunities)}
        onOpenAides={() => navigateTo("demarches", onOpenAides)}
        onGoPremium={onGoPremium}
      />

      <PremiumLockedCard
        t={t}
        isMobile={isMobile}
        hasPremiumAccess={hasPremiumAccess}
        hasPremiumPlusAccess={hasPremiumPlusAccess}
        onGoPremium={onGoPremium}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 16,
        }}
      >
        <PieSummaryCard
          t={t}
          isMobile={isMobile}
          pieData={pieData}
          onOpenDepenses={() => navigateTo("depenses", onOpenDepenses)}
        />

        <BudgetCategoriesCard
          t={t}
          isMobile={isMobile}
          byCategory={byCategory}
          customBudgets={customBudgets}
          onSaveBudgets={onSaveBudgets}
          hasPremiumAccess={hasPremiumAccess}
          onGoPremium={onGoPremium}
        />
      </div>
    </div>
  )
}
