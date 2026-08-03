import {
  BadgeCheck,
  ChartNoAxesCombined,
  Crown,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react"
import { createColorAliases } from "../../styles/designSystem"
import { PLAN_IDS, PLAN_NAMES, PLAN_PRICES, PLAN_PUBLIC_SCAN_LABELS } from "../../config/plans"

const COLORS = createColorAliases()
const PREMIUM_URL = "https://budgetkazpei.vercel.app/premium"

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
  [PLAN_IDS.premiumPlus]: {
    icon: Crown,
    accent: COLORS.purple,
    border: "rgba(167,139,250,.30)",
    background: "linear-gradient(180deg, rgba(167,139,250,.12), rgba(255,255,255,0))",
  },
}

const CONTENT = {
  fr: {
    pageEyebrow: "Offres BudgetKazPei",
    pageTitle: "Choisissez la formule adaptee a votre rythme.",
    pageText:
      "Le serveur garde toujours l'autorite sur les quotas. L'application vous montre une lecture claire de votre formule, de vos scans inclus et des fonctions deja disponibles.",
    currentTitle: "Votre formule actuelle",
    currentLoading: "Chargement de votre formule...",
    currentFree: "Mode decouverte actif",
    currentActive: "Statut actif",
    currentManage: "Gerer mon offre",
    compareTitle: "Comparer les formules",
    compareText: "Des cartes plus courtes, avec les benefices immediats d'abord.",
    soonTitle: "Bientot disponibles",
    soonText: "Ces fonctions restent separees des avantages deja utilisables pour eviter toute confusion produit.",
    freeBadge: "Decouverte",
    premiumBadge: "Populaire",
    premiumPlusBadge: "Accompagnement complet",
    currentBadge: "Actuel",
    freeIntro: "Pour suivre l'essentiel de votre budget sans friction.",
    premiumIntro: "Pour analyser plus de courses et garder un historique solide.",
    premiumPlusIntro: "Pour un accompagnement plus complet, avec scans inclus et conseils renforces.",
    freeFeatures: [
      "Budget mensuel et categories",
      "Revenus, depenses et historique simple",
      PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.free],
      "Bons plans locaux",
    ],
    premiumFeatures: [
      "Tout le Gratuit",
      PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.premium],
      "Historique et statistiques avancees",
      "Export PDF et alertes budget",
    ],
    premiumPlusFeatures: [
      "Tout le Premium",
      PLAN_PUBLIC_SCAN_LABELS[PLAN_IDS.premiumPlus],
      "Conseiller renforce",
      "Suivi des demarches et conseils personnalises",
    ],
    soonFeatures: [
      "Comparaisons intelligentes de promotions",
      "Analyses plus poussees des courses",
      "Veille personnalisee sur les aides et droits",
    ],
    scanInfoTitle: "Contrat scanner",
    scanInfoFree: "Gratuit affiche la vraie allocation gratuite.",
    scanInfoPremium: "Premium suit son quota commercial en clair.",
    scanInfoPremiumPlus: "Premium+ garde un affichage commercial inclus. Le plafond interne de securite n'est pas presente comme une allocation.",
  },
  kr: {
    pageEyebrow: "Bann offres BudgetKazPei",
    pageTitle: "Swazi la formule ki korespond ek out fason servi.",
    pageText:
      "Serveur-la i gard l'autorite su bann quotas. L'aplikasyon i montre out formule, out scans inclus ek bann fonksyon deja disponib dan in fason pli kler.",
    currentTitle: "Out formule actuelle",
    currentLoading: "Nou pe charg out formule...",
    currentFree: "Mode dekouverte actif",
    currentActive: "Statut actif",
    currentManage: "Ger mon offre",
    compareTitle: "Konpar bann formules",
    compareText: "Bann kart plis kout, avek bann benefis imedyat an premier.",
    soonTitle: "Byento disponibles",
    soonText: "Sa bann fonksyon-la reste a part pou pa melanz keksoz deja utilisab ek keksoz an preparasyon.",
    freeBadge: "Dekouverte",
    premiumBadge: "Popiler",
    premiumPlusBadge: "Lakonpagnman complet",
    currentBadge: "Aktiel",
    freeIntro: "Pou swiv baz out bidze san komplike.",
    premiumIntro: "Pou analiz plis courses ek gard in bon listorik.",
    premiumPlusIntro: "Pou gagn plis lakonpagnman, avek scans inclus ek konsey renforce.",
    freeFeatures: [
      "Bidze mensiel ek kategori",
      "Revenus, depans ek istorik simple",
      "Aks scanner dekouverte",
      "Bon plan lokal",
    ],
    premiumFeatures: [
      "Tout le Gratuit",
      "10 scans par mwa",
      "Istorik ek statistik avanse",
      "Export PDF ek alertes bidze",
    ],
    premiumPlusFeatures: [
      "Tout le Premium",
      "Scans inclus",
      "Konseye renforce",
      "Suivi bann demars ek konsey personnalises",
    ],
    soonFeatures: [
      "Konparaz promos pli entelizan",
      "Analiz courses pli poussees",
      "Veille personnalisee su bann zed ek drwa",
    ],
    scanInfoTitle: "Kontra scanner",
    scanInfoFree: "Gratis i afis vre allocation dekouverte.",
    scanInfoPremium: "Premium i gard so quota komersial an kler.",
    scanInfoPremiumPlus: "Premium+ i gard in afisaz komersial inclus. Plafon sekirite intern-la pa afise kouma in ti allocation komersiale.",
  },
}

function planBadgeLabel(planId, currentPlanId, labels) {
  if (planId === currentPlanId) return labels.currentBadge
  if (planId === PLAN_IDS.premium) return labels.premiumBadge
  if (planId === PLAN_IDS.premiumPlus) return labels.premiumPlusBadge
  return labels.freeBadge
}

function planSummary(planId, labels) {
  if (planId === PLAN_IDS.free) return labels.freeIntro
  if (planId === PLAN_IDS.premium) return labels.premiumIntro
  return labels.premiumPlusIntro
}

function planFeatures(planId, labels) {
  if (planId === PLAN_IDS.free) return labels.freeFeatures
  if (planId === PLAN_IDS.premium) return labels.premiumFeatures
  return labels.premiumPlusFeatures
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

      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ color: COLORS.text, fontSize: 28, fontWeight: 950 }}>{PLAN_PRICES[planId]}</div>
      </div>

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

export default function PremiumPage({
  isPremium,
  isPremiumPlus = false,
  currentPlan = PLAN_IDS.free,
  subscriptionLoading = false,
  t,
}) {
  const isKreol = t("nav", "dashboard") === "Tablo débor"
  const labels = isKreol ? CONTENT.kr : CONTENT.fr
  const resolvedPlanId = isPremiumPlus
    ? PLAN_IDS.premiumPlus
    : isPremium
      ? PLAN_IDS.premium
      : currentPlan
  const hasPremiumAccess = resolvedPlanId !== PLAN_IDS.free
  const CurrentIcon = PLAN_META[resolvedPlanId]?.icon || Star

  function openPremiumOptions() {
    window.open(PREMIUM_URL, "_blank", "noopener,noreferrer")
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1120,
        margin: "0 auto",
        display: "grid",
        gap: 20,
      }}
    >
      <section
        style={{
          borderRadius: 26,
          border: `1px solid ${COLORS.border}`,
          background: `linear-gradient(135deg, ${COLORS.card}, rgba(35,211,214,.08), rgba(167,139,250,.10))`,
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

            <span
              style={{
                borderRadius: 999,
                padding: "7px 11px",
                fontSize: 11,
                fontWeight: 900,
                color: PLAN_META[resolvedPlanId].accent,
                background: `${PLAN_META[resolvedPlanId].accent}14`,
                border: `1px solid ${PLAN_META[resolvedPlanId].border}`,
                alignSelf: "start",
              }}
            >
              {subscriptionLoading ? labels.currentLoading : resolvedPlanId === PLAN_IDS.free ? labels.currentFree : labels.currentActive}
            </span>
          </div>

          {!subscriptionLoading && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <InfoTile
                icon={ScanLine}
                title={resolvedPlanId === PLAN_IDS.premiumPlus ? "Scans inclus" : PLAN_PUBLIC_SCAN_LABELS[resolvedPlanId]}
                text={resolvedPlanId === PLAN_IDS.premiumPlus ? labels.scanInfoPremiumPlus : resolvedPlanId === PLAN_IDS.premium ? labels.scanInfoPremium : labels.scanInfoFree}
              />
              <InfoTile
                icon={ChartNoAxesCombined}
                title={PLAN_PRICES[resolvedPlanId]}
                text={resolvedPlanId === PLAN_IDS.free ? labels.freeIntro : resolvedPlanId === PLAN_IDS.premium ? labels.premiumIntro : labels.premiumPlusIntro}
              />
              <InfoTile
                icon={Sparkles}
                title={resolvedPlanId === PLAN_IDS.premiumPlus ? "Premium+ actif" : resolvedPlanId === PLAN_IDS.premium ? "Premium actif" : "BudgetKazPei"}
                text={resolvedPlanId === PLAN_IDS.premiumPlus ? "Scans, conseils et suivi renforces." : resolvedPlanId === PLAN_IDS.premium ? "Plus d'analyses, plus d'historique." : "Decouverte simple, sans engagement."}
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
          <div style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.55 }}>
            {labels.compareText}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          <PlanCard planId={PLAN_IDS.free} currentPlanId={resolvedPlanId} labels={labels} />
          <PlanCard planId={PLAN_IDS.premium} currentPlanId={resolvedPlanId} labels={labels} />
          <PlanCard planId={PLAN_IDS.premiumPlus} currentPlanId={resolvedPlanId} labels={labels} />
        </div>
      </section>

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
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(35,211,214,.12)",
              color: COLORS.cyan,
            }}
          >
            <Sparkles size={20} strokeWidth={2.2} />
          </span>
          <div>
            <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 900 }}>{labels.soonTitle}</div>
            <div style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.5 }}>{labels.soonText}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {labels.soonFeatures.map(feature => (
            <div
              key={feature}
              style={{
                borderRadius: 18,
                border: `1px dashed ${COLORS.border}`,
                background: COLORS.card,
                padding: 14,
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(167,139,250,.12)",
                  color: COLORS.purple,
                  flexShrink: 0,
                }}
              >
                <Sparkles size={15} strokeWidth={2.2} />
              </span>
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
    <div
      style={{
        borderRadius: 18,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.card,
        padding: 14,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={16} strokeWidth={2.2} color={COLORS.cyan} />
        <span style={{ color: COLORS.text, fontSize: 14, fontWeight: 900 }}>{title}</span>
      </div>
      <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.5 }}>{text}</div>
    </div>
  )
}
