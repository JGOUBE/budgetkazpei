import { useState } from "react"
import {
  BadgeCheck,
  ChartNoAxesCombined,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react"
import { createColorAliases } from "../../styles/designSystem"
import {
  GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID,
  GOOGLE_PLAY_YEARLY_BASE_PLAN_ID,
  isGooglePlayBillingAvailable,
  purchaseGooglePlayPremium,
  restoreGooglePlayPremium,
} from "../../services/billing/googlePlayBilling"
import {
  PLAN_ANNUAL_PRICES,
  PLAN_IDS,
  PLAN_NAMES,
  PLAN_PRICES,
  PLAN_PUBLIC_SCAN_LABELS,
  normalizePlan,
} from "../../config/plans"

const COLORS = createColorAliases()
const PREMIUM_URL = "/decouvrir"

const PLAN_META = {
  [PLAN_IDS.free]: {
    icon: Star,
    accent: COLORS.green,
    border: "rgba(34,197,94,.28)",
    background: "linear-gradient(180deg, rgba(34,197,94,.08), rgba(255,255,255,0))",
  },
  [PLAN_IDS.premium]: {
    icon: BadgeCheck,
    accent: COLORS.yellow,
    border: "rgba(250,204,21,.30)",
    background: "linear-gradient(180deg, rgba(250,204,21,.10), rgba(255,255,255,0))",
  },
}

// Exported for the plan regression suite as well as the component below.
// eslint-disable-next-line react-refresh/only-export-components
export const PREMIUM_PAGE_COPY = {
  fr: {
    pageEyebrow: "Offres BudgetKazPéi",
    pageTitle: "Deux formules. Pas de niveau intermédiaire.",
    pageText:
      "Commencez gratuitement, puis passez à Premium pour débloquer toutes les fonctions avancées de BudgetKazPéi.",
    currentTitle: "Votre formule actuelle",
    currentLoading: "Chargement de votre formule...",
    currentFree: "Mode découverte actif",
    currentActive: "Statut actif",
    currentManage: "Gérer mon offre",
    compareTitle: "Comparer les formules",
    compareText: "Gratuit pour commencer. Premium pour tout débloquer.",
    soonTitle: "Bientôt disponibles",
    soonText: "Ces fonctions seront ajoutées progressivement sans créer une nouvelle formule.",
    freeBadge: "Découverte",
    premiumBadge: "Tout débloqué",
    currentBadge: "Actuel",
    freeIntro: "Pour suivre l'essentiel de votre budget sans friction.",
    premiumIntro: "Toutes les fonctions avancées réunies dans une seule offre.",
    freeFeatures: [
      "Sans publicité",
      "Budget mensuel et catégories",
      "Revenus, dépenses et historique simple",
      PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.free],
      "Bons plans locaux",
      "🔒 Conseiller BudgetKazPéi à découvrir avec Premium",
    ],
    premiumFeatures: [
      "Tout le Gratuit",
      PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.premium],
      "Historique et statistiques avancées",
      "Export PDF et alertes budget",
      "Conseiller BudgetKazPéi",
      "Accompagnement avancé des démarches",
      "Dossiers, courriers, emails, relances, rendez-vous et recours",
    ],
    soonFeatures: [
      "Comparaisons intelligentes de promotions",
      "Analyses plus poussées des courses",
      "Veille personnalisée sur les aides et droits",
    ],
    scanCardTitles: {
      [PLAN_IDS.free]: PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.free],
      [PLAN_IDS.premium]: PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.premium],
    },
    statusCardTitles: {
      [PLAN_IDS.free]: "BudgetKazPéi",
      [PLAN_IDS.premium]: "Premium actif",
    },
    statusCardTexts: {
      [PLAN_IDS.free]: "Découverte simple, sans engagement.",
      [PLAN_IDS.premium]: "Toutes les fonctions avancées sont débloquées.",
    },
    scanInfoFree: "Le scanner reste disponible en mode découverte avec une allocation limitée.",
    scanInfoPremium: "Les scans sont inclus ; une limite technique invisible protège uniquement contre les usages anormaux.",
    monthlyLabel: "Mensuel",
    annualLabel: "Annuel",
    annualSaving: "Environ 2 mois offerts",
  },
  kr: {
    pageEyebrow: "Bann offres BudgetKazPéi",
    pageTitle: "Dé formule. Pa bezoin in nivo an milyé.",
    pageText:
      "Koumans gratis, épi pas Premium pou débloque tout bann fonksyon avansé BudgetKazPéi.",
    currentTitle: "Out formule aktiel",
    currentLoading: "Nou pe charz out formule...",
    currentFree: "Mode dékouvèrt aktif",
    currentActive: "Aktif",
    currentManage: "Gèr mon lof",
    compareTitle: "Konpar bann offres",
    compareText: "Gratis pou koumansé. Premium pou débloque tout.",
    soonTitle: "An préparasyon",
    soonText: "Sa bann fonksyon-la va ariv piti a piti san kré in lot formule.",
    freeBadge: "Pou dékouv",
    premiumBadge: "Tout débloqué",
    currentBadge: "Aktiel",
    freeIntro: "Pou dékouv BudgetKazPéi ek swiv sak lé esansyèl.",
    premiumIntro: "Tout bann fonksyon avansé ansanm dann in sèl offre.",
    freeFeatures: [
      "San piblisité",
      "Bidjé esansyèl",
      "Larzan i rantre, dépans ek istorik senp",
      PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.free],
      "Bann Bon Plan lokal",
      "🔒 Konseyé BudgetKazPéi pou dékouv dann Premium",
    ],
    premiumFeatures: [
      "Tout sak lé dann Gratis",
      PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.premium],
      "Istorik ek statistik avansé",
      "Èksport PDF ek alèrt bidjé",
      "Konseyé BudgetKazPéi",
      "Lakonpagnman avansé bann demars",
      "Dosyé, kourrié, email, relans, randévou ek rekour",
    ],
    soonFeatures: [
      "Konparézon entélizan pou bann promos",
      "Analiz pli poussé su out courses",
      "Veille pèsonalizé su bann èd ek drwa",
    ],
    scanCardTitles: {
      [PLAN_IDS.free]: PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.free],
      [PLAN_IDS.premium]: PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.premium],
    },
    statusCardTitles: {
      [PLAN_IDS.free]: "BudgetKazPéi",
      [PLAN_IDS.premium]: "Premium aktif",
    },
    statusCardTexts: {
      [PLAN_IDS.free]: "Pou dékouv sinp, san langazman.",
      [PLAN_IDS.premium]: "Tout bann fonksyon avansé lé débloqué.",
    },
    scanInfoFree: "Scanner-la i reste disponib pou dékouv avèk in kantite limité.",
    scanInfoPremium: "Bann scans lé inkliz ; in limit teknik kaché i protéz zis kont bann lizaz pa normal.",
    monthlyLabel: "Chak mwa",
    annualLabel: "Par an",
    annualSaving: "Apepré 2 mwa offert",
  },
}

function planBadgeLabel(planId, currentPlanId, labels) {
  if (planId === currentPlanId) return labels.currentBadge
  if (planId === PLAN_IDS.premium) return labels.premiumBadge
  return labels.freeBadge
}

function planSummary(planId, labels) {
  return planId === PLAN_IDS.premium ? labels.premiumIntro : labels.freeIntro
}

function planFeatures(planId, labels) {
  return planId === PLAN_IDS.premium ? labels.premiumFeatures : labels.freeFeatures
}

function CheckIcon({ accent }) {
  return (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: `${accent}16`,
        color: accent,
        flexShrink: 0,
        marginTop: 1,
      }}
    >
      <ShieldCheck size={14} strokeWidth={2.3} />
    </span>
  )
}

function PlanCard({ planId, currentPlanId, labels }) {
  const meta = PLAN_META[planId]
  const Icon = meta.icon
  const badge = planBadgeLabel(planId, currentPlanId, labels)

  return (
    <article
      style={{
        minHeight: "100%",
        borderRadius: 22,
        border: `1px solid ${meta.border}`,
        background: `${meta.background}, ${COLORS.card}`,
        padding: 20,
        display: "grid",
        gap: 16,
        alignContent: "start",
        boxShadow: "0 18px 36px rgba(15,23,42,.08)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <span
            style={{
              width: 46,
              height: 46,
              borderRadius: 16,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: `${meta.accent}18`,
              border: `1px solid ${meta.border}`,
              color: meta.accent,
            }}
          >
            <Icon size={22} strokeWidth={2.2} />
          </span>
          <div>
            <div style={{ color: COLORS.text, fontSize: 22, fontWeight: 900 }}>{PLAN_NAMES[planId]}</div>
            <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>
              {planSummary(planId, labels)}
            </div>
          </div>
        </div>

        <span
          style={{
            whiteSpace: "nowrap",
            borderRadius: 999,
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 900,
            color: meta.accent,
            background: `${meta.accent}16`,
            border: `1px solid ${meta.border}`,
          }}
        >
          {badge}
        </span>
      </div>

      {planId === PLAN_IDS.premium ? (
        <div style={{ display: "grid", gap: 5 }}>
          <div style={{ color: COLORS.text, fontSize: 28, fontWeight: 950 }}>{PLAN_PRICES[planId]}</div>
          <div style={{ color: COLORS.muted, fontSize: 13 }}>
            {PLAN_ANNUAL_PRICES[PLAN_IDS.premium]} · {labels.annualSaving}
          </div>
        </div>
      ) : (
        <div style={{ color: COLORS.text, fontSize: 28, fontWeight: 950 }}>{PLAN_PRICES[planId]}</div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {planFeatures(planId, labels).map(feature => (
          <div key={`${planId}-${feature}`} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <CheckIcon accent={meta.accent} />
            <span style={{ color: COLORS.text, fontSize: 14, lineHeight: 1.45 }}>{feature}</span>
          </div>
        ))}
      </div>
    </article>
  )
}

export default function PremiumPage({
  user,
  isPremium,
  isPremiumPlus = false,
  currentPlan = PLAN_IDS.free,
  subscriptionLoading = false,
  t,
}) {
  const isKreol = t("nav", "dashboard") === "Tablo débor"
  const labels = isKreol ? PREMIUM_PAGE_COPY.kr : PREMIUM_PAGE_COPY.fr
  const resolvedPlanId = (isPremium || isPremiumPlus)
    ? PLAN_IDS.premium
    : normalizePlan(currentPlan)
  const hasPremiumAccess = resolvedPlanId === PLAN_IDS.premium
  const CurrentIcon = PLAN_META[resolvedPlanId]?.icon || Star
  const googlePlayBilling = isGooglePlayBillingAvailable()
  const [billingBusy, setBillingBusy] = useState(false)
  const [billingMessage, setBillingMessage] = useState("")

  function openPremiumOptions() {
    if (googlePlayBilling && !hasPremiumAccess) {
      document.getElementById("android-premium-purchase")?.scrollIntoView({ behavior: "smooth", block: "center" })
      return
    }

    if (googlePlayBilling && hasPremiumAccess) {
      window.open(
        "https://play.google.com/store/account/subscriptions?package=com.budgetkazpei.app",
        "_blank",
        "noopener,noreferrer",
      )
      return
    }

    window.open(PREMIUM_URL, "_blank", "noopener,noreferrer")
  }

  async function buyWithGooglePlay(basePlanId) {
    if (!user?.id || billingBusy) return

    setBillingBusy(true)
    setBillingMessage("")
    try {
      const result = await purchaseGooglePlayPremium({ basePlanId, userId: user.id })
      if (result.pending) {
        setBillingMessage(isKreol ? "Payman an atant konfirmasion Google Play." : "Paiement en attente de confirmation Google Play.")
        return
      }

      window.dispatchEvent(new CustomEvent("budgetkazpei:profile-updated", {
        detail: {
          premium: true,
          is_premium: true,
          premium_plus: false,
          plan: "premium",
          billing_source: "google_play",
          subscription_type: basePlanId === GOOGLE_PLAY_YEARLY_BASE_PLAN_ID ? "yearly" : "monthly",
          premium_until: result.verification?.expiresAt || null,
        },
      }))
      setBillingMessage(isKreol ? "Premium lé aktif." : "Premium est activé.")
    } catch (error) {
      const message = String(error?.message || error || "")
      if (!/annul/i.test(message)) {
        setBillingMessage(
          isKreol
            ? "Nou la pa réussi valide payman Google Play. Rééséye."
            : "Le paiement Google Play n’a pas pu être validé. Réessayez.",
        )
      }
    } finally {
      setBillingBusy(false)
    }
  }

  async function restoreGooglePlay() {
    if (billingBusy) return

    setBillingBusy(true)
    setBillingMessage("")
    try {
      const result = await restoreGooglePlayPremium()
      if (!result.restored) {
        setBillingMessage(isKreol ? "Nana pa abonman Premium pou restaure." : "Aucun abonnement Premium actif à restaurer.")
        return
      }

      window.dispatchEvent(new CustomEvent("budgetkazpei:profile-updated", {
        detail: {
          premium: true,
          is_premium: true,
          premium_plus: false,
          plan: "premium",
          billing_source: "google_play",
          premium_until: result.verification?.expiresAt || null,
        },
      }))
      setBillingMessage(isKreol ? "Abonman Premium restauré." : "Abonnement Premium restauré.")
    } catch {
      setBillingMessage(isKreol ? "Restaurasion impossible pou linstan." : "Restauration impossible pour le moment.")
    } finally {
      setBillingBusy(false)
    }
  }

  return (
    <div style={{ width: "100%", maxWidth: 1120, margin: "0 auto", display: "grid", gap: 20 }}>
      <section
        style={{
          borderRadius: 26,
          border: `1px solid ${COLORS.border}`,
          background: `linear-gradient(135deg, ${COLORS.card}, rgba(35,211,214,.08), rgba(250,204,21,.10))`,
          padding: 24,
          display: "grid",
          gap: 18,
          boxShadow: "0 20px 40px rgba(15,23,42,.10)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 18 }}>
          <div style={{ display: "grid", gap: 10, maxWidth: 680 }}>
            <div style={{ color: COLORS.cyan, fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>
              {labels.pageEyebrow}
            </div>
            <h1 style={{ margin: 0, color: COLORS.text, fontSize: 34, lineHeight: 1.02, fontWeight: 950, fontFamily: "'DM Serif Display', serif" }}>
              {labels.pageTitle}
            </h1>
            <p style={{ margin: 0, color: COLORS.muted, fontSize: 15, lineHeight: 1.65 }}>
              {labels.pageText}
            </p>
          </div>

          <button
            type="button"
            onClick={openPremiumOptions}
            style={{
              minHeight: 48,
              borderRadius: 16,
              border: "none",
              background: `linear-gradient(135deg, ${COLORS.yellow}, ${COLORS.accent})`,
              color: "#07111F",
              fontWeight: 950,
              padding: "0 18px",
              cursor: "pointer",
              alignSelf: "start",
              fontFamily: "inherit",
            }}
          >
            {hasPremiumAccess ? labels.currentManage : labels.compareTitle}
          </button>
        </div>

        <div
          style={{
            borderRadius: 22,
            border: `1px solid ${PLAN_META[resolvedPlanId].border}`,
            background: `${PLAN_META[resolvedPlanId].background}, ${COLORS.cardLight}`,
            padding: 18,
            display: "grid",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 16,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: `${PLAN_META[resolvedPlanId].accent}16`,
                  color: PLAN_META[resolvedPlanId].accent,
                }}
              >
                <CurrentIcon size={22} strokeWidth={2.2} />
              </span>
              <div>
                <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 800 }}>{labels.currentTitle}</div>
                <div style={{ color: COLORS.text, fontSize: 22, fontWeight: 950, marginTop: 2 }}>
                  {subscriptionLoading ? labels.currentLoading : PLAN_NAMES[resolvedPlanId]}
                </div>
              </div>
            </div>
          </div>

          {!subscriptionLoading && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <InfoTile
                icon={ScanLine}
                title={labels.scanCardTitles[resolvedPlanId]}
                text={resolvedPlanId === PLAN_IDS.premium ? labels.scanInfoPremium : labels.scanInfoFree}
              />
              <InfoTile
                icon={ChartNoAxesCombined}
                title={PLAN_PRICES[resolvedPlanId]}
                text={resolvedPlanId === PLAN_IDS.premium ? labels.premiumIntro : labels.freeIntro}
              />
              <InfoTile
                icon={Sparkles}
                title={labels.statusCardTitles[resolvedPlanId]}
                text={labels.statusCardTexts[resolvedPlanId]}
              />
            </div>
          )}
        </div>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <div>
          <div style={{ color: COLORS.cyan, fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>
            {labels.compareTitle}
          </div>
          <div style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.55 }}>{labels.compareText}</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <PlanCard planId={PLAN_IDS.free} currentPlanId={resolvedPlanId} labels={labels} />
          <PlanCard planId={PLAN_IDS.premium} currentPlanId={resolvedPlanId} labels={labels} />
        </div>
      </section>

      {googlePlayBilling && !hasPremiumAccess && (
        <section
          id="android-premium-purchase"
          style={{
            borderRadius: 22,
            border: `1px solid ${COLORS.yellow}55`,
            background: `linear-gradient(135deg, ${COLORS.card}, rgba(250,204,21,.08))`,
            padding: 20,
            display: "grid",
            gap: 14,
          }}
        >
          <div>
            <div style={{ color: COLORS.text, fontSize: 20, fontWeight: 950 }}>
              {isKreol ? "Pas Premium avèk Google Play" : "Passer Premium avec Google Play"}
            </div>
            <div style={{ color: COLORS.muted, marginTop: 6, fontSize: 14, lineHeight: 1.5 }}>
              {isKreol
                ? "Swazi chak mwa ousa par an. Payman ek renovelman lé géré par Google Play."
                : "Choisissez le mensuel ou l’annuel. Le paiement et le renouvellement sont gérés par Google Play."}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <button
              type="button"
              disabled={billingBusy || !user?.id}
              onClick={() => buyWithGooglePlay(GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID)}
              style={{
                minHeight: 52,
                borderRadius: 15,
                border: `1px solid ${COLORS.yellow}66`,
                background: COLORS.yellow,
                color: "#07111F",
                fontWeight: 950,
                cursor: billingBusy ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {billingBusy ? "…" : `Premium · ${PLAN_PRICES[PLAN_IDS.premium]}`}
            </button>

            <button
              type="button"
              disabled={billingBusy || !user?.id}
              onClick={() => buyWithGooglePlay(GOOGLE_PLAY_YEARLY_BASE_PLAN_ID)}
              style={{
                minHeight: 52,
                borderRadius: 15,
                border: `1px solid ${COLORS.cyan}66`,
                background: "rgba(35,211,214,.12)",
                color: COLORS.text,
                fontWeight: 950,
                cursor: billingBusy ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {billingBusy ? "…" : `Premium · ${PLAN_ANNUAL_PRICES[PLAN_IDS.premium]}`}
            </button>
          </div>

          <button
            type="button"
            disabled={billingBusy}
            onClick={restoreGooglePlay}
            style={{
              justifySelf: "start",
              border: 0,
              background: "transparent",
              color: COLORS.cyan,
              cursor: billingBusy ? "wait" : "pointer",
              padding: 0,
              fontWeight: 850,
              fontFamily: "inherit",
            }}
          >
            {isKreol ? "Restaure mon abonman" : "Restaurer mon abonnement"}
          </button>

          {billingMessage && (
            <div role="status" style={{ color: COLORS.text, fontSize: 13, lineHeight: 1.5 }}>
              {billingMessage}
            </div>
          )}
        </section>
      )}

      <section
        style={{
          borderRadius: 22,
          border: `1px solid ${COLORS.border}`,
          background: COLORS.cardLight,
          padding: 20,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Sparkles size={20} strokeWidth={2.2} color={COLORS.cyan} />
          <div>
            <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 900 }}>{labels.soonTitle}</div>
            <div style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.5 }}>{labels.soonText}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {labels.soonFeatures.map(feature => (
            <div key={feature} style={{ borderRadius: 18, border: `1px dashed ${COLORS.border}`, background: COLORS.card, padding: 14 }}>
              <span style={{ color: COLORS.text, fontSize: 14, lineHeight: 1.45 }}>{feature}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function InfoTile({ icon: Icon, title, text }) {
  return (
    <div style={{ borderRadius: 18, border: `1px solid ${COLORS.border}`, background: COLORS.card, padding: 14, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={16} strokeWidth={2.2} color={COLORS.cyan} />
        <span style={{ color: COLORS.text, fontSize: 14, fontWeight: 900 }}>{title}</span>
      </div>
      <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.5 }}>{text}</div>
    </div>
  )
}
