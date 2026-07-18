import { useEffect, useMemo, useState } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { formatMontant } from "../../utils/format"
import TropicalCard from "./TropicalCard"
import BudgetSettingsModal from "../budgets/BudgetSettingModal"
import { CATEGORIES } from "../../data/categories"
import { supabase } from "../../services/supabase"
import { buildStoreHabits } from "../../features/shopping/services/priceHistory"
import { useDashboardInsights } from "../../hooks/useDashboardInsights"
import { BkIcons } from "../icons-budgetkazpei"
import { createColorAliases } from "../../styles/designSystem"
import { useTheme } from "../../styles/ThemeProvider"
import { getPlanFlags } from "../../config/plans"

// Dashboard V2 - Mobile First
// Regle UX : Carte = Action
// Le dashboard reste un resume. Les details doivent vivre dans des pages dediees.

const COLORS = createColorAliases()

function tr(t, section, key, fallback) {
  const value = t?.(section, key)
  return value || fallback
}

function getIsKreol(t) {
  const lang = String(t?.lang || "").toLowerCase()
  if (lang === "cr" || lang === "kreol") return true
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

function getDashboardPlanFlags({ plan, status, isPremium, isPremiumPlus } = {}) {
  const cleanStatus = String(status || "").toLowerCase().trim()
  const hasInactiveStatus = ["canceled", "cancelled", "inactive", "past_due", "unpaid", "expired"].includes(cleanStatus)

  const flags = hasInactiveStatus
    ? getPlanFlags("free")
    : getPlanFlags(plan, { isPremium, isPremiumPlus })

  return {
    plan: flags.plan,
    hasPremiumAccess: flags.isPremium,
    hasPremiumPlusAccess: flags.isPremiumPlus,
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
    return isKreol ? "Aucune dépans anrezistrée" : "Aucune dépense enregistrée"
  }

  if (type === "charges") {
    return isKreol ? "Aucune sarz fix anrezistrée" : "Aucune charge fixe enregistrée"
  }

  return isKreol ? "A completer" : "A completer"
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

  const color = score >= 80 ? COLORS.green : score >= 60 ? COLORS.accent : COLORS.red
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
  if (level === "excellent") return isKreol ? "Tre bien" : "Excellent"
  if (level === "correct") return isKreol ? "Correct" : "Correct"
  return isKreol ? "A surveye" : "A surveiller"
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
    revenus_manquants: "Revenus a completer",
    solde_negatif: "Solde negatif ce mois-ci",
    budgets_depasses: "Une ou plusieurs catégories dépassées",
    aides_a_verifier: "Opportunités à vérifier",
  }

  const kr = {
    budget_maitrise: "Out bidje le anba kontrol",
    charges_ok: "Sarz fix le rezonab",
    solde_ok: "Larzan i reste le positif",
    categories_ok: "Bidje par kategori le suivi",
    aides_obtenues: "Ed gagne le anrezistre",
    depenses_hautes: "Dépans lé tro haut pou mwa-la",
    depenses_a_surveille: "Dépans à surveillé",
    charges_hautes: "Sarz fix le trop haut",
    revenus_manquants: "Larzan i rantre le a completer",
    solde_negatif: "Larzan i reste le negatif",
    budgets_depasses: "Na kategori la depasse out bidje",
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
            {">"}
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
    <TropicalCard variant="lagoon" texture="" style={{ padding: isMobile ? 18 : 24 }}>
      <div style={{ color: COLORS.text, fontWeight: 900, fontSize: isMobile ? 22 : 28, marginBottom: 8 }}>
        {isKreol ? "Bienvenue su BudgetKazPei" : "Bienvenue sur BudgetKazPei"}
      </div>

      <div style={{ color: COLORS.whiteSoft, fontSize: 14, lineHeight: 1.65, marginBottom: 16 }}>
        {isKreol ? "Pou komans, complete out profil, ajoute out sarz fix, ajoute out depans epi rode bann ed possibles."
          : "Pour commencer, complétez votre profil, ajoutez vos charges fixes, vos dépenses, puis découvrez les aides possibles."}
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)" }}>
        <WelcomeActionButton
          label={isKreol ? "Complète mon profil" : "Compléter mon profil"}
          icon=""
          onClick={onGoProfile}
        />
        <WelcomeActionButton
          label={isKreol ? "Ajoute in sarz fix" : "Ajouter une charge fixe"}
          icon=""
          onClick={onGoCharges}
        />
        <WelcomeActionButton
          label={isKreol ? "Rod mon bann éd" : "Rechercher mes aides"}
          icon=""
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
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
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
    <TropicalCard variant="lagoon" texture="" style={{ padding: isMobile ? 16 : 22 }}>
      <div style={{ color: COLORS.text, fontWeight: 900, fontSize: isMobile ? 18 : 22, marginBottom: 8 }}>
        {isKreol ? "Bonzour" : "Bonjour"}
      </div>

      <div style={{ color: COLORS.whiteSoft, fontSize: 14, lineHeight: 1.65 }}>
        {gains > 0
          ? isKreol ? `Ou la déjà récupéré ${gains.toFixed(0)} EUR ek BudgetKazPei.`
            : `Vous avez déjà récupéré ${gains.toFixed(0)} EUR grâce à BudgetKazPei.`
          : isKreol ? "Komans par azout in démarche. Kan in éd lé aksepté, mark lo gain gagné."
            : "Commencez par ajouter une démarche, puis renseignez le gain quand l'aide est acceptée."}
        {" "}
        {restantObjectif > 0
          ? isKreol ? `I reste ${restantObjectif.toFixed(0)} EUR pou atenn lobzektif lanne.`
            : `Il reste ${restantObjectif.toFixed(0)} EUR pour atteindre l'objectif annuel.`
          : isKreol ? "Lobzektif lanne le atteint. Bravo !"
            : "L'objectif annuel est atteint. Bravo !"}
        <br />
        {opportunitiesCount > 0
          ? isKreol ? `${opportunitiesCount} bon plan i mérite d'être vérifié${commune ? ` à ${commune}` : ""}.`
            : `${opportunitiesCount} opportunité(s) méritent d'être vérifiées${commune ? ` à ${commune}` : ""}.`
          : isKreol ? "Pa na okenn bon plan urgent détecté pou le moman."
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
    <TropicalCard variant="purple" emoji={BkIcons.stats} style={{ padding: isMobile ? 16 : 22 }} innerStyle={{ paddingLeft: isMobile ? 0 : 64 }}>
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
            {isKreol ? "Score BudgetKazPei" : "Score BudgetKazPei"}
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

          <div style={{ height: 9, background: COLORS.progressTrack, borderRadius: 999, overflow: "hidden", marginTop: 12 }}>
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
              {getSignalText(key, isKreol)}
            </div>
          ))}
          {result.warnings.map(key => (
            <div key={key} style={{ color: COLORS.yellow, fontSize: 12, fontWeight: 800 }}>
              {getSignalText(key, isKreol)}
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
      <TropicalCard variant="gold" texture="" style={{ padding: isMobile ? 16 : 22 }}>
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
              {isKreol ? "Bon plan détecté pou ou" : "Opportunités détectées pour vous"}
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
              {commune || (isKreol ? "La Rényon" : "La Réunion")}
              <br />
              {isKreol ? "Bann éd, bon plan ek démarche i pé konsern aou."
                : "Aides, bons plans et démarches susceptibles de vous concerner."}
            </div>
          </div>

          <span style={{ color: COLORS.yellow, fontSize: 24, fontWeight: 900 }}>{">"}</span>
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
  const rawProgress = objectif > 0 ? Math.round((gains / objectif) * 100) : 0
  const progress = Math.min(rawProgress, 100)
  const hasGains = gains > 0
  const objectifAtteint = objectif > 0 && gains >= objectif

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
      <TropicalCard variant="green" texture="" style={{ padding: isMobile ? 16 : 22 }}>
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
              {isKreol ? "Larzan ou la récupéré ek BudgetKazPei" : "Argent récupéré grâce à BudgetKazPei"}
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
              {gains.toFixed(0)} EUR
            </div>

            <div style={{ marginTop: 8, color: COLORS.muted, fontSize: 13, lineHeight: 1.45 }}>
              {nbAidesObtenues} {isKreol ? "éd gagnée(s)" : "aide(s) obtenue(s)"}
              <br />
              {hasGains
                ? isKreol ? "Out démarche i komans rapport aou pou vré."
                  : "Vos démarches commencent à rapporter concrètement."
                : isKreol ? "Met in démarche an Gagné, epi mark lo montan gagné."
                  : "Passez une démarche en acceptée puis renseignez le gain."}
            </div>

            {gainsDetails.length > 0 && (
              <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                <div style={{ color: COLORS.green, fontSize: 12, fontWeight: 900 }}>
                  {isKreol ? "Derniers gains anrezistrés" : "Derniers gains enregistrés"}
                </div>
                {gainsDetails.slice(0, 3).map((gain, index) => (
                  <div
                    key={`${gain.label}-${index}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      background: COLORS.row,
                      border: `1px solid ${COLORS.border}`,
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
                    <span style={{ color: COLORS.green, flexShrink: 0 }}>{Number(gain.amount || 0).toFixed(0)} EUR</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              width: isMobile ? "100%" : 260,
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
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
              <span>{isKreol ? "Lobzektif lanne" : "Objectif annuel"}</span>
              <span style={{ color: "#BEF264" }}>{rawProgress}%</span>
            </div>

            <div style={{ height: 9, background: COLORS.progressTrack, borderRadius: 999, overflow: "hidden", marginBottom: 9 }}>
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
              {gains.toFixed(0)} EUR / {objectif.toFixed(0)} EUR
              {objectifAtteint && (
                <div style={{ color: "#BEF264", fontWeight: 900, marginTop: 4 }}>
                  {isKreol ? "Lobzektif dépassé" : "Objectif dépassé"}
                </div>
              )}
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
    actions.push({ icon: "", text: isKreol ? "Rédui in dépans ou ajoute larzan i rantre pou repass solde positif." : "Réduire une dépense ou ajouter un revenu pour repasser en solde positif." })
  }

  const overBudget = byCategory.find(cat => Number(cat.budget || 0) > 0 && Number(cat.depense || 0) > Number(cat.budget || 0))
  if (overBudget) {
    actions.push({ icon: "", text: isKreol ? `Surveille kategori ${overBudget.emoji || ""} ${overBudget.id}.` : `Surveiller la catégorie ${overBudget.emoji || ""} ${overBudget.id}.` })
  }

  if (opportunitiesCount > 0) {
    actions.push({ icon: "", text: isKreol ? `Vérifie ${opportunitiesCount} bon plan détecté.` : `Vérifier ${opportunitiesCount} opportunité(s) détectée(s).` })
  }

  if (Number(gainsAides || 0) <= 0 && Number(nbAidesObtenues || 0) <= 0) {
    actions.push({ icon: "", text: isKreol ? "Passe in démarche an Aksepté epi rant lo montan gagné." : "Passer une démarche en Acceptée puis renseigner le gain." })
  }

  if (!transactions || transactions.length === 0) {
    actions.push({ icon: "", text: isKreol ? "Azout out premiers mouvman pou rann tablo-la pli précis." : "Ajouter vos premiers mouvements pour rendre le tableau plus précis." })
  }

  if (!hasPremiumAccess) {
    actions.push({ icon: "", text: isKreol ? "Déblok alertes bidzé ek PDF ek Premium." : "Débloquer les alertes budget et PDF avec Premium." })
  }

  const displayedActions = actions.slice(0, 4)

  if (displayedActions.length === 0) {
    displayedActions.push({ icon: "", text: isKreol ? "Out situation lé stable pou le moman." : "Votre situation semble stable pour le moment." })
  }

  return (
    <TropicalCard variant="ocean" texture="" style={{ padding: isMobile ? 16 : 22 }}>
      <div style={{ color: COLORS.text, fontWeight: 900, fontSize: 16, marginBottom: 12 }}>
        {isKreol ? "Bann actions pou fé" : "Actions recommandées"}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {displayedActions.map((action, index) => (
          <div
            key={`${action.text}-${index}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              background: COLORS.row,
              border: `1px solid ${COLORS.border}`,
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
            {isKreol ? "Ed & demarches" : "Aides & demarches"}
          </ActionChip>
        )}
        {onOpenOpportunities && (
          <ActionChip onClick={onOpenOpportunities} color="#FDE68A">
            {isKreol ? "Bon plan" : "Opportunites"}
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
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        color: COLORS.text,
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
    <TropicalCard variant="purple" texture="" style={{ padding: isMobile ? 16 : 22 }}>
      <div style={{ color: COLORS.purple, fontWeight: 900, fontSize: 13, marginBottom: 8 }}>
        {isKreol ? "Fonksyon Premium" : "Fonctions Premium"}
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)" }}>
        <PremiumFeature
          locked={!hasPremiumAccess}
          title={isKreol ? "Alertes bidje" : "Alertes budget"}
          text="80 % - 100 %"
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
            background: COLORS.selected,
            border: `1px solid ${COLORS.accent}44`,
            borderRadius: 14,
            color: COLORS.text,
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
        background: locked ? COLORS.surface : COLORS.greenSoft,
        border: locked ? `1px solid ${COLORS.border}` : `1px solid ${COLORS.green}33`,
        borderRadius: 14,
        padding: "12px 13px",
        color: COLORS.text,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 5 }}>
        {locked ? "Verrouillé - " : "Inclus - "}
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
      <TropicalCard variant="lagoon" emoji={BkIcons.budget} style={{ padding: isMobile ? 16 : 22 }} innerStyle={{ paddingLeft: isMobile ? 0 : 62 }}>
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
              {isKreol ? "Bidjé par kategori" : "Budgets par catégorie"}
            </div>
            <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>
              {isKreol ? "Résumé rapide. Lo détail i sera dann page Dépans." : "Résumé rapide. Le détail sera dans la page Dépenses."}
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
              background: hasPremiumAccess ? COLORS.card : COLORS.yellowSoft,
              border: hasPremiumAccess ? `1px solid ${COLORS.border}`
                : `1px solid ${COLORS.yellow}44`,
              borderRadius: 999,
              color: hasPremiumAccess ? COLORS.text : COLORS.text,
              cursor: "pointer",
              padding: "7px 12px",
              fontSize: 12,
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            {hasPremiumAccess
              ? isKreol ? "Modifie bidje" : "Modifier mes budgets"
              : isKreol ? "Bidje personnalises" : "Budgets personnalises"}
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
                    <span style={{ width: 9, height: 9, borderRadius: 999, background: cat.color || COLORS.cyan, display: "inline-block", marginRight: 8 }} />
                    {t("categories", cat.id)}
                  </span>
                  <span style={{ fontSize: 12, color: isOver ? COLORS.red : COLORS.whiteSoft, flexShrink: 0 }}>
                    {depense.toFixed(0)} / {budget} EUR
                  </span>
                </div>
                <div style={{ background: COLORS.progressTrack, borderRadius: 99, height: 7, overflow: "hidden" }}>
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
  const [activeIndex, setActiveIndex] = useState(0)
  const filtered = (pieData || []).filter(item => Number(item.value || 0) > 0)
  const total = filtered.reduce((sum, item) => sum + Number(item.value || 0), 0)

  if (filtered.length === 0) return null

  return (
    <TropicalCard variant="ocean" emoji={BkIcons.stats} style={{ padding: isMobile ? 18 : 24, borderRadius: 22 }} innerStyle={{ paddingLeft: isMobile ? 0 : 62 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ color: COLORS.text, fontWeight: 900, fontSize: 16 }}>
            {isKreol ? "Répartition dépans" : "Répartition des dépenses"}
          </div>
          <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>
            {isKreol ? "Tape in kategori pou voir détail." : "Touchez une catégorie pour la mettre en avant."}
          </div>
        </div>
        {onOpenDepenses && (
          <button
            type="button"
            onClick={onOpenDepenses}
            style={{
              border: `1px solid ${COLORS.border}`,
              background: COLORS.card,
              color: COLORS.cyan,
              borderRadius: 999,
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 900,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {isKreol ? "Voir dépans" : "Voir dépenses"}
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(220px, .9fr) 1fr", gap: 16, alignItems: "center" }}>
        <div style={{ height: isMobile ? 220 : 270 }}>
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
                onClick={(_, index) => setActiveIndex(index)}
              >
                {filtered.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color || COLORS.cyan}
                    opacity={index === activeIndex ? 1 : 0.48}
                    stroke={index === activeIndex ? "#fff" : "transparent"}
                    strokeWidth={index === activeIndex ? 3 : 0}
                  />
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

        <div style={{ display: "grid", gap: 8 }}>
          {filtered.map((item, index) => {
            const amount = Number(item.value || 0)
            const percent = total > 0 ? Math.round((amount / total) * 100) : 0
            const active = index === activeIndex

            return (
              <button
                key={`${item.name || item.label}-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  minHeight: 48,
                  border: active ? `1px solid ${item.color || COLORS.cyan}` : `1px solid ${COLORS.border}`,
                  borderRadius: 14,
                  background: active ? COLORS.selected : COLORS.row,
                  color: COLORS.text,
                  padding: "9px 11px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <span style={{ width: 12, height: 12, borderRadius: 999, background: item.color || COLORS.cyan, boxShadow: active ? `0 0 12px ${item.color || COLORS.cyan}` : "none" }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.name || item.label || (isKreol ? "Kategori" : "Catégorie")}
                  </span>
                  <span style={{ display: "block", color: COLORS.muted, fontSize: 11, marginTop: 2 }}>
                    {percent} %
                  </span>
                </span>
                <span style={{ color: COLORS.whiteSoft, fontSize: 12, fontWeight: 900 }}>
                  {formatMontant(amount)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </TropicalCard>
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
  const status = normalizeDashboardStatus(item.status || item.statut)
  return (
    status.includes("accept") ||
    status.includes("aksept") ||
    status === "accepte" ||
    status === "obtenue" ||
    status === "obtenu"
  )
}

function formatReminderDate(value) {
  if (!value) return "-"

  try {
    const [year, month, day] = String(value).split("-")
    if (year && month && day) {
      return `${day}/${month}/${year}`
    }

    return new Date(value).toLocaleDateString("fr-FR")
  } catch {
    return String(value)
  }
}

function getReminderState(reminderDate, isKreol) {
  if (!reminderDate) {
    return {
      color: COLORS.yellow,
      icon: "",
      label: isKreol ? "Rappel sans date" : "Rappel sans date",
      sortValue: 999999999,
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const target = new Date(`${reminderDate}T00:00:00`)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000)

  if (diffDays < 0) {
    return {
      color: COLORS.red,
      icon: "",
      label: isKreol ? `An retard depuis ${Math.abs(diffDays)} jour(s)`
        : `En retard depuis ${Math.abs(diffDays)} jour(s)`,
      sortValue: diffDays,
    }
  }

  if (diffDays === 0) {
    return {
      color: COLORS.orange,
      icon: "",
      label: isKreol ? "A fe aujourd'hui" : "A faire aujourd'hui",
      sortValue: 0,
    }
  }

  return {
    color: COLORS.green,
    icon: "",
    label: isKreol ? `Dann ${diffDays} jour(s)` : `Dans ${diffDays} jour(s)`,
    sortValue: diffDays,
  }
}

function DashboardRemindersCard({ t, isMobile, reminders = [], onOpenDemarches }) {
  const isKreol = getIsKreol(t)

  if (!reminders || reminders.length === 0) return null

  const prepared = reminders
    .map(reminder => ({
      ...reminder,
      state: getReminderState(reminder.reminder_date, isKreol),
    }))
    .sort((a, b) => a.state.sortValue - b.state.sortValue)
    .slice(0, 3)

  return (
    <button
      type="button"
      onClick={onOpenDemarches}
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
      <TropicalCard variant="ocean" texture="" style={{ padding: isMobile ? 16 : 22 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <div style={{ color: COLORS.yellow, fontWeight: 900, fontSize: 13, marginBottom: 4 }}>
              {isKreol ? "Rappels administratifs" : "Rappels administratifs"}
            </div>
            <div style={{ color: COLORS.muted, fontSize: 12 }}>
              {isKreol ? "Bann démarches à suivre" : "Vos prochaines relances à suivre"}
            </div>
          </div>

          <span style={{ color: COLORS.yellow, fontSize: 24, fontWeight: 900 }}>{">"}</span>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {prepared.map(reminder => (
            <div
              key={reminder.id}
              style={{
                background: COLORS.row,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 13,
                padding: "10px 11px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: COLORS.text,
                      fontSize: 13,
                      fontWeight: 900,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {reminder.aideLabel || (isKreol ? "Démarche" : "Démarche")}
                  </div>

                  <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
                    {formatReminderDate(reminder.reminder_date)}
                    {reminder.note ? ` - ${reminder.note}` : ""}
                  </div>
                </div>

                <span
                  style={{
                    color: reminder.state.color,
                    fontSize: 11,
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {reminder.state.icon} {reminder.state.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </TropicalCard>
    </button>
  )
}

function computeProfileCompletion(profile = {}) {
  const fields = [
    "nom",
    "commune",
    "age",
    "situation_familiale",
    "nombre_enfants",
    "revenus_foyer",
    "logement",
    "situation_professionnelle",
    "allocataire_caf",
    "permis_conduire",
    "vehicule_personnel",
  ]

  const completed = fields.filter(field => {
    const value = profile?.[field]
    return value !== undefined && value !== null && value !== ""
  }).length

  return Math.round((completed / fields.length) * 100)
}

function getUserFirstName(profile = {}) {
  const name = String(profile.nom || "").trim()
  if (!name) return ""
  return name.split(/\s+/)[0]
}

function getNextCopilotAction({
  profileCompletion,
  commune,
  realTransactions = [],
  abonnements = [],
  reminders = [],
  isKreol,
}) {
  if (profileCompletion < 65) {
    return {
      text: isKreol ? "Complete out profil pou ameliore bann conseils."
        : "Completer votre profil pour ameliorer les conseils.",
      target: "profil",
    }
  }

  if (!commune) {
    return {
      text: isKreol ? "Ajoute out kominn pou gagne bann pistes lokal."
        : "Ajouter votre commune pour obtenir des pistes locales.",
      target: "profil",
    }
  }

  if (!realTransactions || realTransactions.length === 0) {
    return {
      text: isKreol ? "Ajoute out premieres depans."
        : "Ajouter vos premieres depenses.",
      target: "depenses",
    }
  }

  if (!abonnements || abonnements.length === 0) {
    return {
      text: isKreol ? "Ajoute out premieres sarz fix."
        : "Ajouter vos premieres charges fixes.",
      target: "abonnements",
    }
  }

  if (reminders && reminders.length > 0) {
    return {
      text: isKreol ? "Regarde out prochaine demarche a suivre."
        : "Verifier votre prochaine demarche en attente.",
      target: "demarches",
    }
  }

  return {
    text: isKreol ? "Pose in kestion au Konseye."
      : "Poser une question au Conseiller.",
    target: "conseiller",
  }
}

function CopilotHero({ profile, isKreol, isMobile, profileCompletion, attentionCount }) {
  const firstName = getUserFirstName(profile)
  const hour = new Date().getHours()
  const isEvening = hour >= 18 || hour < 5
  const greeting = firstName
    ? isKreol ? `${isEvening ? "Bonswar" : "Bonzour"} ${firstName}`
      : `${isEvening ? "Bonsoir" : "Bonjour"} ${firstName}`
    : isKreol ? `${isEvening ? "Bonswar" : "Bonzour"}`
      : `${isEvening ? "Bonsoir" : "Bonjour"}`

  const rotatingLines = isKreol
    ? [
      "Out bidzé lé sous contrôle zordi.",
      `${attentionCount} piste${attentionCount > 1 ? "s" : ""} i mérite out attention.`,
      "Chaque ti decision i aide out budget avance.",
    ]
    : [
      "Votre budget est sous contrôle aujourd'hui.",
      `${attentionCount} piste${attentionCount > 1 ? "s" : ""} mérite${attentionCount > 1 ? "nt" : ""} votre attention.`,
      "Chaque euro compte pour avancer sereinement.",
    ]
  const rotatingLine = rotatingLines[new Date().getMinutes() % rotatingLines.length]

  const subtitle = profileCompletion < 65
    ? isKreol ? "Complète out profil pou gagne bann conseils pli précis."
      : "Complétez votre profil pour obtenir des conseils plus précis."
    : attentionCount > 0
      ? isKreol ? `Out bidzé lé sous contrôle. ${attentionCount} piste${attentionCount > 1 ? "s" : ""} i mérite out attention.`
        : `Budget sous contrôle. ${attentionCount} piste${attentionCount > 1 ? "s" : ""} mérite${attentionCount > 1 ? "nt" : ""} votre attention.`
      : rotatingLine

  return (
    <TropicalCard
      variant="lagoon"
      texture=""
      style={{
        padding: isMobile ? 20 : 30,
        borderRadius: isMobile ? 24 : 28,
        boxShadow: COLORS.shadow,
      }}
    >
      <div style={{ color: COLORS.cyan, fontSize: 12, fontWeight: 900, marginBottom: 8, textTransform: "uppercase" }}>
        {isKreol ? "Copilote BudgetKazPei" : "Copilote BudgetKazPei"}
      </div>
      <div style={{ color: COLORS.text, fontWeight: 950, fontSize: isMobile ? 28 : 38, lineHeight: 1.02, marginBottom: 10 }}>
        {greeting}
      </div>
      <div style={{ color: COLORS.whiteSoft, fontSize: isMobile ? 15 : 17, fontWeight: 800, marginBottom: 6 }}>
        {isKreol ? "Voilà out situation zordi." : "Voici votre situation aujourd'hui."}
      </div>
      <div style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.6 }}>
        {subtitle}
      </div>
    </TropicalCard>
  )
}

function PremiumBudgetCard({ stats = {}, realTransactions = [], isKreol, isMobile }) {
  const revenus = Number(stats.revenus || 0)
  const depenses = Number(stats.depenses || 0)
  const solde = Number(stats.solde || 0)
  const usedPercent = revenus > 0 ? Math.min(100, Math.round((depenses / revenus) * 100)) : 0
  const hasBudgetData = revenus > 0 || depenses > 0 || realTransactions.length > 0

  return (
    <TropicalCard variant="green" texture="" style={{ padding: isMobile ? 18 : 22, borderRadius: 22 }}>
      <div style={{ color: COLORS.text, fontWeight: 950, fontSize: 18, marginBottom: 14 }}>
        {isKreol ? "Bidzé du mwa" : "Budget du mois"}
      </div>

      {!hasBudgetData ? (
        <div style={{ color: COLORS.whiteSoft, fontSize: 14, lineHeight: 1.55 }}>
          {isKreol ? "Ajoute out premières dépans pou suivre out bidzé."
            : "Ajoutez vos premières dépenses pour suivre votre budget."}
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 10 }}>
            <BudgetMetric label={isKreol ? "Revenus" : "Revenus"} value={formatMontant(revenus)} color={COLORS.green} background={COLORS.sageSoft} borderColor={`${COLORS.green}33`} />
            <BudgetMetric label={isKreol ? "Dépans" : "Dépenses"} value={formatMontant(depenses)} color={COLORS.accent} background={COLORS.peachSoft} borderColor={`${COLORS.accent}33`} />
            <BudgetMetric label={isKreol ? "Reste" : "Reste disponible"} value={formatMontant(solde)} color={solde >= 0 ? COLORS.cyan : COLORS.red} background={solde >= 0 ? COLORS.pastelBlue : COLORS.redSoft} borderColor={solde >= 0 ? `${COLORS.cyan}33` : `${COLORS.red}33`} />
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: COLORS.whiteSoft, fontSize: 12, fontWeight: 900, marginBottom: 8 }}>
              <span>{isKreol ? "Budget utilisé" : "Budget utilisé"}</span>
              <span>{usedPercent} %</span>
            </div>
            <div style={{ height: 12, borderRadius: 99, background: COLORS.progressTrack, overflow: "hidden", border: `1px solid ${COLORS.borderSubtle}` }}>
              <div
                style={{
                  width: `${usedPercent}%`,
                  height: "100%",
                  borderRadius: 99,
                  background: usedPercent > 90
                    ? `linear-gradient(90deg, ${COLORS.red}, ${COLORS.accent})`
                    : `linear-gradient(90deg, ${COLORS.green}, ${COLORS.cyan})`,
                  transition: "width .45s ease",
                }}
              />
            </div>
          </div>
        </>
      )}
    </TropicalCard>
  )
}

function BudgetMetric({ label, value, color, background = COLORS.surface, borderColor = COLORS.border }) {
  return (
    <div style={{
      background,
      border: `1px solid ${borderColor}`,
      borderRadius: 16,
      padding: "12px 13px",
      minHeight: 76,
    }}>
      <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900, marginBottom: 6 }}>{label}</div>
      <div style={{ color, fontSize: 19, fontWeight: 950, lineHeight: 1.1 }}>{value}</div>
    </div>
  )
}

function MotivationCard({ isKreol, isMobile }) {
  const lines = isKreol
    ? [
      "Chaque euro i compte.",
      "Ti pa ti pa, ou avance.",
      "Chaque effort i rapproche aou de out objectif.",
    ]
    : [
      "Chaque euro compte.",
      "Petit à petit, vous avancez.",
      "Chaque effort rapproche de vos objectifs.",
    ]
  const line = lines[new Date().getDate() % lines.length]

  return (
    <TropicalCard variant="gold" texture="" style={{ padding: isMobile ? 18 : 22, borderRadius: 22 }}>
      <div style={{ color: COLORS.yellow, fontSize: 13, fontWeight: 950, marginBottom: 8 }}>
        {isKreol ? "Motivation du jour" : "Motivation du jour"}
      </div>
      <div style={{ color: COLORS.text, fontSize: isMobile ? 20 : 24, fontWeight: 950, lineHeight: 1.2 }}>
        {line}
      </div>
    </TropicalCard>
  )
}

function BalanceHeroCard({ insights, stats = {}, isKreol, isMobile, onOpenRevenus }) {
  const revenus = Number(stats.revenus || 0)
  const balance = Number(insights.monthlyBalance || 0)

  return (
    <TropicalCard variant="lagoon" emoji={BkIcons.savings} style={{ padding: isMobile ? 22 : 30, borderRadius: 28 }} innerStyle={{ paddingLeft: isMobile ? 0 : 64 }}>
      <div style={{ color: COLORS.cyan, fontSize: 13, fontWeight: 950, marginBottom: 8 }}>
        {isKreol ? "Larzan i rantre" : "Revenus du mois"}
      </div>
      <div style={{ color: revenus >= 0 ? COLORS.green : COLORS.red, fontSize: isMobile ? 48 : 62, fontWeight: 950, lineHeight: 1, fontFamily: "'DM Serif Display', Georgia, serif", margin: "8px 0" }}>
        {formatMontant(revenus)}
      </div>
      <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 10 }}>
        {isKreol ? "Larzan disponible estimé" : "Solde disponible estimé"} <strong style={{ color: balance >= 0 ? COLORS.green : COLORS.red }}>{formatMontant(balance)}</strong>
      </div>
      <button type="button" onClick={onOpenRevenus} style={{ marginTop: 16, minHeight: 44, border: `1px solid ${COLORS.green}66`, borderRadius: 14, background: COLORS.sageSoft, color: COLORS.text, cursor: "pointer", fontWeight: 950, padding: "0 16px" }}>
        {isKreol ? "Voir / modifier revenus" : "Voir / modifier mes revenus"}
      </button>
    </TropicalCard>
  )
}

function ExpensesSnapshotCard({ stats, isKreol, isMobile }) {
  const revenus = Number(stats.revenus || 0)
  const depenses = Number(stats.depenses || 0)
  const pct = revenus > 0 ? Math.min(100, Math.round((depenses / revenus) * 100)) : 0

  return (
    <TropicalCard variant="coral" emoji={BkIcons.depenses} style={{ padding: isMobile ? 18 : 22, borderRadius: 22 }} innerStyle={{ paddingLeft: isMobile ? 0 : 62 }}>
      <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 950 }}>
        {isKreol ? "Dépans du mwa" : "Dépenses du mois"}
      </div>
      <div style={{ color: COLORS.accent, fontSize: 36, fontWeight: 950, marginTop: 8, fontFamily: "'DM Serif Display', Georgia, serif" }}>
        {formatMontant(depenses)}
      </div>
      <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 5, fontWeight: 850 }}>
        {pct} % {isKreol ? "des revenus" : "des revenus"}
      </div>
      <div style={{ height: 9, background: COLORS.progressTrack, borderRadius: 99, overflow: "hidden", marginTop: 12 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.yellow})`, borderRadius: 99, transition: "width .45s ease" }} />
      </div>
    </TropicalCard>
  )
}

function BudgetAlertCard({ alert, isKreol }) {
  const color = alert.level === "ok" ? COLORS.green : alert.level === "warning" ? COLORS.yellow : alert.level === "alert" ? COLORS.accent : COLORS.red
  const alertText =
    alert.level === "ok"
      ? isKreol ? "Tout i sava bien, out depans i reste maitrisees mwa-la."
        : "Tout va bien, tes depenses restent maitrisees ce mois-ci."
      : alert.level === "danger"
        ? isKreol ? `Bidze alimentaire depasse : ${alert.percent || 0} % utilise.`
          : `Budget alimentaire depasse : ${alert.percent || 0} % utilise.`
        : isKreol ? `Vigilance, out budget i arrive a ${alert.percent || 0} %.`
          : `Vigilance, ton budget atteint ${alert.percent || 0} %.`

  return (
    <TropicalCard variant={alert.level === "ok" ? "green" : "gold"} emoji={BkIcons.alert} style={{ padding: 18, borderRadius: 22 }} innerStyle={{ paddingLeft: 62 }}>
      <div style={{ color, fontSize: 13, fontWeight: 950, marginBottom: 8 }}>
        {isKreol ? "Alèrte bidjé" : "Alerte budget"}
      </div>
      <div style={{ color: COLORS.text, fontSize: 18, lineHeight: 1.35, fontWeight: 950 }}>
        {alertText}
      </div>
    </TropicalCard>
  )
}

function TopCategoriesV2Card({ categories = [], t, isKreol }) {
  if (!categories.length) {
    return (
      <TropicalCard variant="ocean" emoji={BkIcons.stats} style={{ padding: 18, borderRadius: 22 }} innerStyle={{ paddingLeft: 62 }}>
        <div style={{ color: COLORS.text, fontWeight: 950 }}>{isKreol ? "Top kategori" : "Top catégories"}</div>
        <div style={{ color: COLORS.muted, marginTop: 8 }}>{isKreol ? "Azout quelques dépans pou voir ousa larzan i sava." : "Ajoute quelques dépenses pour voir où part ton argent."}</div>
      </TropicalCard>
    )
  }

  const max = Math.max(...categories.map(cat => Number(cat.depense || 0)), 1)

  return (
    <TropicalCard variant="ocean" emoji={BkIcons.stats} style={{ padding: 18, borderRadius: 22 }} innerStyle={{ paddingLeft: 62 }}>
      <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 950, marginBottom: 12 }}>
        {isKreol ? "Top kategori" : "Top catégories"}
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {categories.map(cat => {
          const amount = Number(cat.depense || 0)
          const pct = Math.round((amount / max) * 100)
          return (
            <div key={cat.id}>
              <div style={{ display: "flex", justifyContent: "space-between", color: COLORS.text, fontWeight: 900, fontSize: 13 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: cat.color || COLORS.cyan, display: "inline-block", flexShrink: 0 }} />
                  {t?.("categories", cat.id) || cat.label || cat.id}
                </span>
                <span>{formatMontant(amount)}</span>
              </div>
              <div style={{ height: 8, borderRadius: 99, background: COLORS.progressTrack, overflow: "hidden", marginTop: 7 }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: cat.color || COLORS.cyan }} />
              </div>
            </div>
          )
        })}
      </div>
    </TropicalCard>
  )
}

function SavingsOpportunitiesCard({ hints = [], isKreol, onOpenConseiller }) {
  return (
    <TropicalCard variant="gold" emoji={BkIcons.savings} style={{ padding: 18, borderRadius: 22 }} innerStyle={{ paddingLeft: 62 }}>
      <div style={{ color: COLORS.yellow, fontSize: 13, fontWeight: 950, marginBottom: 8 }}>
        {isKreol ? "Pistes lékonomi" : "Opportunités d'économies"}
      </div>
      <div style={{ color: COLORS.text, fontSize: 20, fontWeight: 950, marginBottom: 10 }}>
        {hints.length} {isKreol ? "pistes détectées" : "pistes d'économies détectées"}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {hints.map((hint, index) => (
          <div key={`${hint}-${index}`} style={{ color: COLORS.whiteSoft, fontSize: 13, lineHeight: 1.45 }}>
            • {hint}
          </div>
        ))}
      </div>
      {onOpenConseiller && (
        <button type="button" onClick={onOpenConseiller} style={{ marginTop: 14, minHeight: 46, border: "none", borderRadius: 14, background: COLORS.accent, color: "#fff", fontWeight: 950, padding: "0 14px", cursor: "pointer" }}>
          {isKreol ? "Voir conseils" : "Voir mes conseils"}
        </button>
      )}
    </TropicalCard>
  )
}

function QuickActionsV2({ isKreol, isLightTheme, onAddExpense, onOpenReceipts, onOpenAides, onOpenStats }) {
  const actions = [
    { label: isKreol ? "Azout dépans" : "Ajouter dépense", onClick: onAddExpense, color: COLORS.accent, background: COLORS.peachSoft, hover: isLightTheme ? "#F8D6C4" : COLORS.hover, Icon: BkIcons.add },
    { label: isKreol ? "Scanner tike" : "Scanner ticket", onClick: onOpenReceipts, color: COLORS.cyan, background: COLORS.pastelBlue, hover: isLightTheme ? "#C8E4FA" : COLORS.hover, Icon: BkIcons.scan },
    { label: isKreol ? "Voir mon bann aides" : "Voir mes aides", onClick: onOpenAides, color: COLORS.yellow, background: COLORS.lavenderSoft, hover: isLightTheme ? "#E2D7F8" : COLORS.hover, Icon: BkIcons.aides },
    { label: isKreol ? "Voir mon bann stats" : "Voir mes stats", onClick: onOpenStats, color: COLORS.green, background: COLORS.sageSoft, hover: isLightTheme ? "#D3E9DA" : COLORS.hover, Icon: BkIcons.stats },
  ].filter(action => action.onClick)

  return (
    <TropicalCard variant="purple" emoji={BkIcons.budget} style={{ padding: 18, borderRadius: 22 }} innerStyle={{ paddingLeft: 62 }}>
      <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 950, marginBottom: 12 }}>
        {isKreol ? "Aksyon rapid" : "Actions rapides"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {actions.map(action => {
          const Icon = action.Icon
          return (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            onMouseEnter={event => { event.currentTarget.style.background = action.hover }}
            onMouseLeave={event => { event.currentTarget.style.background = action.background }}
            style={{ minHeight: 52, border: `1px solid ${action.color}44`, borderRadius: 14, background: action.background, color: COLORS.text, fontWeight: 950, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit", padding: "0 12px", boxShadow: "0 8px 18px rgba(20,32,51,.05)", transition: "background .18s ease, transform .18s ease, border-color .18s ease" }}
          >
            <Icon size={18} color={action.color} />
            {action.label}
          </button>
          )
        })}
      </div>
    </TropicalCard>
  )
}

function ShoppingHabitsDashboardCard({ items = [], isKreol, isMobile, onOpenShopping }) {
  const habits = buildStoreHabits(items).slice(0, 4)
  if (habits.length === 0) return null

  const colors = [COLORS.accent, COLORS.green, COLORS.cyan, COLORS.yellow]

  return (
    <TropicalCard variant="ocean" emoji={BkIcons.shopping} style={{ padding: isMobile ? 18 : 22, borderRadius: 22 }} innerStyle={{ paddingLeft: isMobile ? 0 : 62 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 950 }}>
            {isKreol ? "Ousa ou achète le plis ?" : "Où j'achète le plus ?"}
          </div>
          <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>
            {isKreol ? "Dapré bann tike validés." : "D'après vos tickets validés."}
          </div>
        </div>
        {onOpenShopping && (
          <button
            type="button"
            onClick={onOpenShopping}
            style={{
              minHeight: 42,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 999,
              background: COLORS.card,
              color: COLORS.cyan,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 950,
              padding: "0 12px",
            }}
          >
            {isKreol ? "Voir" : "Voir"}
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "170px 1fr", gap: 12, alignItems: "center" }}>
        <div style={{ height: 165 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={habits} dataKey="count" nameKey="store" innerRadius={45} outerRadius={66} paddingAngle={3}>
                {habits.map((_, index) => (
                  <Cell key={index} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(_, __, item) => `${item.payload.percent} %`} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {habits.map((row, index) => (
            <div key={row.store} style={{ display: "flex", justifyContent: "space-between", gap: 10, color: COLORS.text, fontWeight: 900 }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: colors[index % colors.length], display: "inline-block", marginRight: 8 }} />
                {row.store}
              </span>
              <span>{row.percent} %</span>
            </div>
          ))}
        </div>
      </div>
    </TropicalCard>
  )
}

function CopilotInfoCard({ title, value, detail, buttonLabel, onClick, isMobile, accent = COLORS.cyan }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        minHeight: isMobile ? 142 : 164,
        textAlign: "left",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 18,
        background: COLORS.card,
        boxShadow: COLORS.shadow,
        padding: 18,
        color: COLORS.text,
        cursor: onClick ? "pointer" : "default",
        fontFamily: "inherit",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div>
        <div style={{ color: accent, fontSize: 13, fontWeight: 950, marginBottom: 8 }}>{title}</div>
        <div style={{ color: COLORS.text, fontSize: 20, fontWeight: 950, lineHeight: 1.15, marginBottom: 8 }}>{value}</div>
        <div style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: 1.45 }}>{detail}</div>
      </div>
      {buttonLabel && (
        <span style={{ color: COLORS.accent, fontSize: 12, fontWeight: 950 }}>
          {buttonLabel} ›
        </span>
      )}
    </button>
  )
}

function CopilotCards({
  isKreol,
  isMobile,
  stats,
  commune,
  profileCompletion,
  opportunitiesCount,
  reminders = [],
  abonnements = [],
  realTransactions = [],
  onGoProfile,
  onOpenOpportunities,
  onOpenDemarches,
  onOpenConseiller,
}) {
  const demarchesInProgress = reminders.length
  const completedDemarches = 0

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 14 }}>
      <CopilotInfoCard
        title={isKreol ? "Opportunités" : "Opportunités"}
        value={opportunitiesCount > 0
          ? isKreol ? `${opportunitiesCount} pistes pou vérifié` : `${opportunitiesCount} pistes à vérifier`
          : isKreol ? "Profil à compléter" : "Profil à compléter"}
        detail={opportunitiesCount > 0
          ? isKreol ? "Opportunité possible. Pou confirmé ek l'organisme concerné." : "Opportunité possible. À confirmer avec l'organisme concerné."
          : isKreol ? "Complète out profil pou détecté plis opportunités." : "Complétez votre profil pour détecter plus d'opportunités."}
        buttonLabel={isKreol ? "Vérifie" : "Vérifier"}
        onClick={onOpenOpportunities}
        isMobile={isMobile}
        accent={COLORS.yellow}
      />

      <CopilotInfoCard
        title={commune ? isKreol ? "Kominn" : "Commune" : isKreol ? "Kominn pa renseignée" : "Commune non renseignée"}
        value={commune || (isKreol ? "Pa renseignée" : "Non renseignée")}
        detail={commune ? isKreol ? "Bann conseils adapté pou out kominn." : "Conseils adaptés à votre commune."
          : isKreol ? "Ajoute out kominn pou amélioré bann conseils." : "Ajoutez votre commune pour améliorer vos conseils."}
        buttonLabel={!commune ? isKreol ? "Renseigne" : "Renseigner" : isKreol ? "Modifier" : "Modifier"}
        onClick={onGoProfile}
        isMobile={isMobile}
        accent={COLORS.cyan}
      />

      <CopilotInfoCard
        title={isKreol ? "Démarches" : "Démarches"}
        value={demarchesInProgress > 0
          ? isKreol ? `${demarchesInProgress} en cours` : `${demarchesInProgress} en cours`
          : isKreol ? "Okenn démarche" : "Aucune démarche"}
        detail={demarchesInProgress > 0
          ? `${completedDemarches} ${isKreol ? "terminées" : "terminées"}`
          : isKreol ? "Okenn démarche suivie pou le moment." : "Aucune démarche suivie pour le moment."}
        buttonLabel={isKreol ? "Ouvrir" : "Ouvrir"}
        onClick={onOpenDemarches}
        isMobile={isMobile}
        accent={COLORS.purple}
      />

      <CopilotInfoCard
        title={isKreol ? "Profil" : "Profil"}
        value={`${profileCompletion} %`}
        detail={isKreol ? "Profil complété : plus li lé complet, plus bann conseils lé précis." : "Profil complété : plus il est complet, plus les conseils sont précis."}
        buttonLabel={profileCompletion < 100 ? isKreol ? "Complète" : "Compléter" : isKreol ? "Voir" : "Voir"}
        onClick={onGoProfile}
        isMobile={isMobile}
        accent={COLORS.green}
      />

      <CopilotInfoCard
        title={isKreol ? "Konseye BudgetKazPei" : "Conseiller BudgetKazPei"}
        value={isKreol ? "Koz ek mon konseye" : "Poser une question"}
        detail={isKreol ? "Mi pé aide aou comprend in éd, prépar in démarche ou vérifie out situation."
          : "Je peux vous aider à comprendre une aide, préparer une démarche ou vérifier votre situation."}
        buttonLabel={isKreol ? "Koz ek li" : "Poser une question"}
        onClick={onOpenConseiller}
        isMobile={isMobile}
        accent={COLORS.accent}
      />
    </div>
  )
}

function NextCopilotAction({ action, isKreol, isMobile }) {
  return (
    <TropicalCard variant="ocean" texture="" style={{ padding: isMobile ? 18 : 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 14, flexDirection: isMobile ? "column" : "row" }}>
        <div>
          <div style={{ color: COLORS.accent, fontSize: 13, fontWeight: 950, marginBottom: 8 }}>
            {isKreol ? "Mon proshenn aksyon" : "Ma prochaine action"}
          </div>
          <div style={{ color: COLORS.text, fontSize: isMobile ? 18 : 21, fontWeight: 950, lineHeight: 1.25 }}>
            {action.text}
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigateTo(action.target)}
          style={{
            width: isMobile ? "100%" : "auto",
            background: COLORS.accent,
            border: "none",
            borderRadius: 12,
            color: "#fff",
            padding: "12px 16px",
            fontSize: 14,
            fontWeight: 950,
            cursor: "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          {isKreol ? "Fe sa maintenant" : "Agir maintenant"}
        </button>
      </div>
    </TropicalCard>
  )
}

export default function Dashboard({
  userId,
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
  profile = {},
  onOpenOpportunities,
  gainsAides = 0,
  nbAidesObtenues = 0,
  objectifGains = 1000,
  onOpenAides,
  onOpenRevenus,
  onOpenDepenses,
  onOpenSolde,
  onOpenReceipts,
  onOpenShopping,
  onOpenStats,
  onAddExpense,
}) {
  const { themeName } = useTheme()
  const safeStats = stats || {}
  const { revenus = 0, depenses = 0, solde = 0 } = safeStats
  const isKreol = getIsKreol(t)
  const dashboardInsights = useDashboardInsights({
    userId,
    stats: safeStats,
    byCategory,
  })

  const realTransactions = (transactions || []).filter(tx => {
    const label = normalizeText(tx.label || tx.nom || "")
    const source = normalizeText(tx.source || "")
    return source !== "profile_income" && label !== "revenus du foyer"
  })

  const isNewUser =
    Number(revenus || 0) === 0 &&
    Number(depenses || 0) === 0 &&
    realTransactions.length === 0 &&
    (abonnements.length || 0) === 0

  const [dashboardAideGains, setDashboardAideGains] = useState({
    gainsAides: 0,
    nbAidesObtenues: 0,
    gainsDetails: [],
    loaded: false,
  })

  const [dashboardReminders, setDashboardReminders] = useState({
    items: [],
    loaded: false,
  })

  const [subscriptionFromDb, setSubscriptionFromDb] = useState({
    plan: "",
    status: "",
    loaded: false,
  })

  const effectivePlan = subscriptionFromDb.plan || plan
  const effectiveStatus = subscriptionFromDb.status || ""
  const premiumStatus = getDashboardPlanFlags({
    plan: effectivePlan,
    status: effectiveStatus,
    isPremium,
    isPremiumPlus,
  })

  const hasPremiumAccess = premiumStatus.hasPremiumAccess
  const hasPremiumPlusAccess = premiumStatus.hasPremiumPlusAccess

  const effectiveGainsAides = Number(gainsAides || 0) || dashboardAideGains.gainsAides
  const effectiveNbAidesObtenues = Number(nbAidesObtenues || 0) || dashboardAideGains.nbAidesObtenues
  const profileCompletion = computeProfileCompletion(profile)
  const attentionCount = [
    profileCompletion < 65,
    !commune,
    realTransactions.length === 0,
    (abonnements.length || 0) === 0,
    dashboardReminders.items.length > 0,
    Number(opportunitiesCount || 0) > 0,
  ].filter(Boolean).length
  const nextCopilotAction = getNextCopilotAction({
    profileCompletion,
    commune,
    realTransactions,
    abonnements,
    reminders: dashboardReminders.items,
    isKreol,
  })

  const revenusSub = Number(revenus || 0) === 0
    ? isKreol ? "Touchez pou completer" : "Touchez pour completer"
    : isKreol ? "Touchez pou voir detail" : "Touchez pour voir le detail"

  const depensesSub = Number(depenses || 0) === 0
    ? isKreol ? "Touchez pou ajouter" : "Touchez pour ajouter"
    : isKreol ? `${safeStats.tauxChargesFixes || 0} % des revenus en sarz fix` : `${safeStats.tauxChargesFixes || 0} % des revenus en charges fixes`

  const soldeSub = Number(solde || 0) === 0
    ? isKreol ? "Calcul revenus - depans" : "Calcul revenus - depenses"
    : isKreol ? "Touchez pou voir calcul" : "Touchez pour voir le calcul"

  useEffect(() => {
    let ignore = false

    async function fetchSubscription() {
      try {
        const { data: authData } = await supabase.auth.getUser()
        const user = authData.user
        if (!user?.id) return

        const { data, error } = await supabase
          .from("profiles")
          .select("plan, subscription_type, stripe_subscription_status, premium, is_premium, premium_plus")
          .eq("id", user?.id)
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
        const user = authData.user
        if (!user?.id) return

        const { data, error } = await supabase
          .from("user_aide_demarche")
          .select(`
            id,
            user_id,
            aide_id,
            statut,
            montant_obtenu,
            date_obtention,
            updated_at,
            created_at,
            aides_reunion (
              id,
              nom,
              nom_kreol
            )
          `)
          .eq("user_id", user?.id)
          .order("updated_at", { ascending: false })

        if (error) throw error
        if (ignore) return

        const accepted = (data || []).filter(item => isAcceptedDashboardDemarche(item))
        const gainsDetails = accepted
          .map(item => ({
            label: item.aides_reunion.nom || item.aide_nom || item.title || item.nom || "Aide",
            amount: getDashboardGainAmount(item),
            date: item.date_obtention || item.updated_at || item.created_at || "",
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

  useEffect(() => {
    let ignore = false

    async function fetchDashboardReminders() {
      try {
        const { data: authData } = await supabase.auth.getUser()
        const user = authData.user
        if (!user?.id) return

        const { data, error } = await supabase
          .from("user_reminders")
          .select(`
            id,
            user_id,
            demarche_id,
            reminder_date,
            note,
            updated_at,
            user_aide_demarche (
              id,
              aide_id,
              statut,
              aides_reunion (
                id,
                nom,
                nom_kreol
              )
            )
          `)
          .eq("user_id", user?.id)
          .order("reminder_date", { ascending: true, nullsFirst: false })
          .limit(8)

        if (error) throw error
        if (ignore) return

        const items = (data || []).map(item => ({
          ...item,
          aideLabel:
            item.user_aide_demarche.aides_reunion.nom ||
            item.user_aide_demarche.aides_reunion.nom_kreol ||
            "Demarche",
        }))

        setDashboardReminders({
          items,
          loaded: true,
        })
      } catch (error) {
        console.error("Erreur chargement rappels dashboard:", error)
        if (!ignore) {
          setDashboardReminders(prev => ({ ...prev, loaded: true }))
        }
      }
    }

    fetchDashboardReminders()

    return () => {
      ignore = true
    }
  }, [])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.35fr .85fr", gap: 16 }}>
        <BalanceHeroCard
          insights={dashboardInsights}
          stats={safeStats}
          isKreol={isKreol}
          isMobile={isMobile}
          onOpenRevenus={() => navigateTo("revenus", onOpenRevenus)}
        />
        <ExpensesSnapshotCard
          stats={safeStats}
          isKreol={isKreol}
          isMobile={isMobile}
        />
      </div>

      <QuickActionsV2
        isKreol={isKreol}
        isLightTheme={themeName === "light"}
        onAddExpense={onAddExpense}
        onOpenReceipts={() => navigateTo("receipts", onOpenReceipts)}
        onOpenAides={() => navigateTo("aides", onOpenAides)}
        onOpenStats={() => navigateTo("statistics", onOpenStats)}
      />

      <BudgetAlertCard
        alert={dashboardInsights.budgetAlert}
        isKreol={isKreol}
      />

      <TopCategoriesV2Card
        categories={dashboardInsights.topCategories}
        t={t}
        isKreol={isKreol}
      />

      <ShoppingHabitsDashboardCard
        items={dashboardInsights.shoppingItems}
        isKreol={isKreol}
        isMobile={isMobile}
        onOpenShopping={() => navigateTo("shopping", onOpenShopping)}
      />

      <SavingsOpportunitiesCard
        hints={dashboardInsights.savingsHints}
        isKreol={isKreol}
        onOpenConseiller={() => navigateTo("conseiller")}
      />

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

