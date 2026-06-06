import { useState } from "react"

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  green: "#22C55E",
  red: "#EF4444",
  muted: "#8EA4C5",
  text: "#F1F5F9",
  yellow: "#FCD34D",
  cyan: "#23D3D6",
  purple: "#A78BFA",
}

const WATERMARK = "/icons-creole/palmier.png"
const PREMIUM_URL = "https://budgetkazpei.vercel.app/premium"

const FREE_FEATURES_FR = [
  "Tableau de bord budget",
  "Ajout des dépenses et revenus",
  "Charges fixes",
  "Historique simple",
  "Profil utilisateur",
  "Aides & droits en version simple",
  "Interface français / créole",
]

const PREMIUM_FEATURES_FR = [
  "Tout le gratuit inclus",
  "Assistant Aides Réunion 🇷🇪",
  "Réponses en français ou créole réunionnais",
  "Analyse personnalisée des aides",
  "Classement : très probable, probable, à vérifier",
  "Suivi des démarches administratives",
  "Documents à préparer avec checklist",
  "Alertes budget intelligentes",
  "Bons plans intelligents",
  "Historique avancé",
  "Export PDF mensuel",
]

const PREMIUM_PLUS_FEATURES_FR = [
  "Tout Premium inclus",
  "Conseiller IA BudgetKazPei",
  "Conversation libre en français ou créole",
  "Analyse budgétaire avancée",
  "Génération de courriers administratifs",
  "Préparation de dossiers complets",
  "Conseils personnalisés selon le profil",
  "Veille automatique des droits et nouvelles aides",
  "Futures automatisations Premium+",
]

const FREE_FEATURES_KR = [
  "Tablo débor bidjé",
  "Azout dépans é larzan rantre",
  "Sarz fix",
  "Istorik simpl",
  "Profil itilizatèr",
  "Zéd & drwa an version simpl",
  "Interface fransé / kréol",
]

const PREMIUM_FEATURES_KR = [
  "Tout sa lé gratis déza inclus",
  "Asistan Zéd Rényon 🇷🇪",
  "Répons an fransé ou kréol rényoné",
  "Analiz personnalisée bann zéd",
  "Klasman : tré probab, probab, pou vérifié",
  "Suivi bann démarches administratives",
  "Dokiman pou préparé ek checklist",
  "Alèrt bidjé entèlizan",
  "Bon plan entèlizan",
  "Istorik avansé",
  "Export PDF chak mwa",
]

const PREMIUM_PLUS_FEATURES_KR = [
  "Tout Premium inclus",
  "Konseye IA BudgetKazPei",
  "Diskision libre an fransé ou kréol",
  "Analiz bidjé pli avansé",
  "Kréation courrier administratif",
  "Préparasyon dosyé konplé",
  "Konsey personnalisés selon out profil",
  "Veille otomatik bann drwa é nouvo zéd",
  "Futures otomatisations Premium+",
]

const DESCRIPTIONS_FR = {
  "Assistant Aides Réunion 🇷🇪": "Un assistant spécialisé sur les aides utiles à La Réunion : CAF, Région, Département, CCAS et dispositifs locaux.",
  "Réponses en français ou créole réunionnais": "L’utilisateur peut comprendre les aides plus facilement, dans la langue qui lui parle le mieux.",
  "Analyse personnalisée des aides": "L’app utilise le profil : commune, revenus, enfants, logement, CAF, situation professionnelle et autres critères.",
  "Suivi des démarches administratives": "Chaque aide peut passer par les étapes : à vérifier, dossier à préparer, demande envoyée, en attente, acceptée ou refusée.",
  "Documents à préparer avec checklist": "L’utilisateur sait quels justificatifs préparer et peut cocher les documents déjà prêts.",
  "Bons plans intelligents": "Une rubrique pensée pour afficher des bons plans utiles selon le profil et les besoins.",
  "Conseiller IA BudgetKazPei": "Un conseiller plus avancé, capable d’échanger librement et d’aider sur le budget, les aides et les démarches.",
  "Génération de courriers administratifs": "Premium+ pourra aider à rédiger des courriers pour la CAF, le CCAS, la Région, le Département ou d’autres organismes.",
  "Veille automatique des droits et nouvelles aides": "Premium+ préparera les futures alertes personnalisées quand une nouvelle aide peut concerner l’utilisateur.",
}

const DESCRIPTIONS_KR = {
  "Asistan Zéd Rényon 🇷🇪": "In asistan spécial pou bann zéd itil La Rényon : CAF, Région, Département, CCAS é dispositifs lokal.",
  "Répons an fransé ou kréol rényoné": "Lutilizatèr i pé konprann bann zéd pli fasilman, dan langaz i koz ek li.",
  "Analiz personnalisée bann zéd": "L’app i utiliz profil : komin, revenu, marmay, kaz, CAF, sitiasyon travay é lezot kritèr.",
  "Suivi bann démarches administratives": "Sak zéd i pé pas par bann etap : pou vérifié, dosyé pou préparé, domann envoyée, an atant, aksepté ou refizé.",
  "Dokiman pou préparé ek checklist": "Lutilizatèr i koné ki papye pou préparé é i pé coché sak dokiman déza prêt.",
  "Bon plan entèlizan": "In rubrique pou afficher bann bon plan itil selon profil é besoin.",
  "Konseye IA BudgetKazPei": "In konseye pli avansé, kapab diskité libreman é aide su bidjé, zéd é démarches.",
  "Kréation courrier administratif": "Premium+ va aide rédiz courrier pou CAF, CCAS, Région, Département ou lezot organismes.",
  "Veille otomatik bann drwa é nouvo zéd": "Premium+ va prépar bann alertes personnalisées kan in nouvo zéd i pé konsern lutilizatèr.",
}

function Watermark({ size = 210, right = -45, bottom = -55 }) {
  return (
    <img
      src={WATERMARK}
      alt=""
      style={{
        position: "absolute",
        width: size,
        right,
        bottom,
        opacity: 0.06,
        pointerEvents: "none",
        userSelect: "none",
        transform: "rotate(-8deg)",
        filter: "grayscale(1) brightness(1.8)",
      }}
    />
  )
}

function FeatureItem({ feature, description, color = COLORS.green }) {
  const [open, setOpen] = useState(false)

  return (
    <div
      style={{
        padding: "10px 0",
        borderBottom: `1px solid ${COLORS.border}`,
        position: "relative",
        zIndex: 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ color, fontSize: 15, fontWeight: 900 }}>✓</span>

        <span
          style={{
            flex: 1,
            fontSize: 13,
            color: COLORS.text,
            fontWeight: 800,
            lineHeight: 1.35,
          }}
        >
          {feature}
        </span>

        {description && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            title={description}
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              border: "1px solid rgba(142,164,197,.35)",
              background: open ? `${color}22` : "rgba(15,30,56,.55)",
              color: open ? color : COLORS.muted,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 900,
              flexShrink: 0,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            i
          </button>
        )}
      </div>

      {open && description && (
        <div
          style={{
            marginTop: 8,
            marginLeft: 24,
            background: "rgba(10,22,40,.75)",
            border: `1px solid ${color}33`,
            borderRadius: 12,
            padding: "9px 11px",
            color: COLORS.muted,
            fontSize: 11,
            lineHeight: 1.45,
          }}
        >
          {description}
        </div>
      )}
    </div>
  )
}

function PlanCard({ icon, title, subtitle, features, color, badge, descriptions }) {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(135deg, ${color}14, ${COLORS.card})`,
        border: `2px solid ${color}55`,
        borderRadius: 18,
        padding: 22,
        boxShadow: `0 0 30px ${color}10`,
        minHeight: "100%",
      }}
    >
      <Watermark size={190} right={-45} bottom={-60} />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 31, marginBottom: 6 }}>{icon}</div>
          <div
            style={{
              color,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontSize: 13,
            }}
          >
            {title}
          </div>
          <p style={{ margin: "8px 0 0", color: COLORS.muted, fontSize: 12.5, lineHeight: 1.45 }}>
            {subtitle}
          </p>
        </div>

        {badge && (
          <span
            style={{
              background: `${color}22`,
              border: `1px solid ${color}55`,
              color,
              fontSize: 10,
              fontWeight: 900,
              padding: "4px 10px",
              borderRadius: 999,
              whiteSpace: "nowrap",
            }}
          >
            {badge}
          </span>
        )}
      </div>

      {features.map((feature, index) => (
        <FeatureItem key={`${title}-${index}`} feature={feature} description={descriptions?.[feature]} color={color} />
      ))}
    </div>
  )
}

export default function PremiumPage({ user, isPremium, isPremiumPlus = false, t }) {
  const isKreol = t("nav", "dashboard") === "Tablo débor"
  const descriptions = isKreol ? DESCRIPTIONS_KR : DESCRIPTIONS_FR

  const hasPremiumAccess = isPremium || isPremiumPlus
  const accountLabel = isPremiumPlus
    ? isKreol
      ? "Ou lé Premium+"
      : "Vous êtes Premium+"
    : isPremium
      ? isKreol
        ? "Ou lé Premium"
        : "Vous êtes Premium"
      : isKreol
        ? "Découv bann options Premium"
        : "Découvrez les options Premium"

  const headline = isKreol
    ? "Débloque plis pouvwar pou out bidjé"
    : "Débloquez plus de puissance pour votre budget"

  const subline = isKreol
    ? "BudgetKazPei propose in version gratuite, in offre Premium pou zéd, démarches é bon plan, é in offre Premium+ pou in vrai konseye IA."
    : "BudgetKazPei propose une version gratuite, une offre Premium pour les aides, démarches et bons plans, et une offre Premium+ pour un vrai conseiller IA."

  const freeFeatures = isKreol ? FREE_FEATURES_KR : FREE_FEATURES_FR
  const premiumFeatures = isKreol ? PREMIUM_FEATURES_KR : PREMIUM_FEATURES_FR
  const premiumPlusFeatures = isKreol ? PREMIUM_PLUS_FEATURES_KR : PREMIUM_PLUS_FEATURES_FR

  function openPremiumOptions() {
    window.open(PREMIUM_URL, "_blank", "noopener,noreferrer")
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1040,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: `linear-gradient(135deg, ${COLORS.yellow}22, ${COLORS.purple}16, ${COLORS.card})`,
          border: `1px solid ${COLORS.yellow}44`,
          borderRadius: 24,
          padding: "34px 28px",
          textAlign: "center",
        }}
      >
        <Watermark size={280} right={-60} bottom={-85} />

        <div style={{ fontSize: 46, marginBottom: 10, position: "relative", zIndex: 1 }}>🌴⭐👑</div>

        <h2
          style={{
            margin: "0 0 10px",
            fontSize: 31,
            color: COLORS.yellow,
            fontFamily: "'DM Serif Display', serif",
            position: "relative",
            zIndex: 1,
          }}
        >
          {accountLabel}
        </h2>

        <p
          style={{
            color: COLORS.muted,
            fontSize: 15,
            margin: "0 auto",
            lineHeight: 1.65,
            maxWidth: 720,
            position: "relative",
            zIndex: 1,
          }}
        >
          {hasPremiumAccess ? headline : subline}
        </p>

        {hasPremiumAccess && (
          <div
            style={{
              margin: "18px auto 0",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: isPremiumPlus ? `${COLORS.purple}22` : `${COLORS.yellow}22`,
              border: `1px solid ${isPremiumPlus ? COLORS.purple : COLORS.yellow}55`,
              borderRadius: 999,
              padding: "8px 14px",
              color: isPremiumPlus ? COLORS.purple : COLORS.yellow,
              fontWeight: 900,
              fontSize: 13,
              position: "relative",
              zIndex: 1,
            }}
          >
            {isPremiumPlus ? "👑 Premium+ actif" : "⭐ Premium actif"}
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          alignItems: "stretch",
        }}
      >
        <PlanCard
          icon="🆓"
          title={isKreol ? "Gratuit" : "Gratuit"}
          subtitle={isKreol ? "Pou démarré ek out bidjé." : "Pour démarrer avec la gestion de votre budget."}
          features={freeFeatures}
          color={COLORS.green}
          descriptions={{}}
        />

        <PlanCard
          icon="⭐"
          title="Premium"
          subtitle={
            isKreol
              ? "Pou bann zéd, démarches, dokiman é bon plan an fransé ou kréol."
              : "Pour les aides, démarches, documents et bons plans en français ou créole."
          }
          features={premiumFeatures}
          color={COLORS.yellow}
          badge={isPremium && !isPremiumPlus ? (isKreol ? "Actif" : "Actif") : null}
          descriptions={descriptions}
        />

        <PlanCard
          icon="👑"
          title="Premium+"
          subtitle={
            isKreol
              ? "Pou in vrai konseye IA BudgetKazPei, pli avansé é pli personnalisée."
              : "Pour un vrai conseiller IA BudgetKazPei, plus avancé et plus personnalisé."
          }
          features={premiumPlusFeatures}
          color={COLORS.purple}
          badge={isPremiumPlus ? (isKreol ? "Actif" : "Actif") : isKreol ? "IA" : "IA"}
          descriptions={descriptions}
        />
      </div>

      <button
        type="button"
        onClick={openPremiumOptions}
        style={{
          width: "100%",
          background: `linear-gradient(135deg, ${COLORS.yellow}, ${COLORS.accent})`,
          border: "none",
          borderRadius: 16,
          padding: "17px 0",
          color: COLORS.card,
          fontSize: 17,
          fontWeight: 900,
          fontFamily: "inherit",
          cursor: "pointer",
          boxShadow: `0 8px 28px ${COLORS.yellow}33`,
        }}
      >
        {isPremiumPlus
          ? (isKreol ? "Gèr mon offre Premium+" : "Gérer mon offre Premium+")
          : isPremium
            ? (isKreol ? "Pass Premium+" : "Passer à Premium+")
            : (isKreol ? "Voir bann options Premium" : "Voir les options Premium")
        }
      </button>

      <p style={{ textAlign: "center", fontSize: 11.5, color: COLORS.muted, margin: 0, lineHeight: 1.5 }}>
        {isKreol
          ? "Bann détails des offres i affichent su site BudgetKazPei. L’application i garde in bouton neutre pou respecter bann règles stores."
          : "Les détails des offres sont présentés sur le site BudgetKazPei. L’application garde un bouton neutre pour respecter les règles des stores."}
      </p>
    </div>
  )
}
