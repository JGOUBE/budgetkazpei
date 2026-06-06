import {
  Landmark,
  Sparkles,
  SearchCheck,
  Wallet,
  Home,
  Zap,
  Sun,
  Baby,
  ShoppingBasket,
  Bus,
  Coins,
} from "lucide-react"

import { AIDES } from "../../data/categories"
import { AUTRES_AIDES } from "../../data/aides"
import AssistantAides from "./AssistantAides"

const COLORS = {
  text: "#F1F5F9",
  muted: "#8EA4C5",
}

const CARD_VARIANTS = [
  {
    bg: "linear-gradient(135deg, rgba(34,197,94,.30), rgba(15,30,56,.96))",
    border: "rgba(34,197,94,.40)",
    glow: "rgba(34,197,94,.16)",
    Icon: Wallet,
    labelKey: "monthlyPayment",
  },
  {
    bg: "linear-gradient(135deg, rgba(14,165,233,.30), rgba(15,30,56,.96))",
    border: "rgba(14,165,233,.40)",
    glow: "rgba(14,165,233,.16)",
    Icon: Home,
    labelKey: "housingAid",
  },
  {
    bg: "linear-gradient(135deg, rgba(250,204,21,.28), rgba(15,30,56,.96))",
    border: "rgba(250,204,21,.40)",
    glow: "rgba(250,204,21,.14)",
    Icon: Sun,
    labelKey: "energySupport",
  },
  {
    bg: "linear-gradient(135deg, rgba(249,115,22,.30), rgba(15,30,56,.96))",
    border: "rgba(249,115,22,.40)",
    glow: "rgba(249,115,22,.16)",
    Icon: Zap,
    labelKey: "aidToRequest",
  },
]

const OTHER_AIDES_ICONS = {
  gardeEnfants: Baby,
  bonsAlimentaires: ShoppingBasket,
  mobilite: Bus,
  microcredit: Coins,
}

const AIDE_LINKS = {
  rsa: "https://www.caf.fr/allocataires/aides-et-demarches/mes-demarches",
  apl: "https://wwwd.caf.fr/wps/portal/caffr/aidesetdemarches/mesdemarches/faireunedemandedeprestation?codeThematique=Logement",
  aideEnergie:
    "https://www.regionreunion.com/aides-services/article/energie-dispositifs-region-reunion-finances-par-l-union-europeenne",
  chequeEnergie: "https://chequeenergie.gouv.fr/",
}

const OTHER_AIDES_LINKS = {
  gardeEnfants:
    "https://www.caf.fr/allocataires/aides-et-demarches/droits-et-prestations/vie-personnelle/le-complement-de-libre-choix-du-mode-de-garde-cmg",
  bonsAlimentaires:
    "https://www.saintleu.re/les-dispositifs-daides-a-la-mairie-de-saint-leu",
  mobilite: "https://www.departement974.fr/aide/aide-r-mobilite",
  microcredit:
    "https://www.banque-france.fr/fr/a-votre-service/particuliers/annuaire-microcredit",
}

function getAideLink(aide) {
  const normalizedLabel = `${aide.id || ""} ${aide.label || ""}`.toLowerCase()

  if (normalizedLabel.includes("rsa")) return AIDE_LINKS.rsa
  if (normalizedLabel.includes("apl")) return AIDE_LINKS.apl

  if (
    normalizedLabel.includes("chèque") ||
    normalizedLabel.includes("cheque")
  ) {
    return AIDE_LINKS.chequeEnergie
  }

  if (
    normalizedLabel.includes("énergie") ||
    normalizedLabel.includes("energie")
  ) {
    return AIDE_LINKS.aideEnergie
  }

  return "https://www.caf.fr/allocataires/aides-et-demarches/mes-demarches"
}

function openExternalLink(url) {
  window.open(url, "_blank", "noopener,noreferrer")
}

function getLanguageKey(t) {
  if (typeof t !== "function") return "fr"
  return t("nav", "dashboard") || "fr"
}

export default function AidesPage({ isMobile, t, isPremium, user }) {
  const languageKey = getLanguageKey(t)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          background:
            "linear-gradient(135deg, rgba(249,115,22,.32), rgba(14,165,233,.20), rgba(15,30,56,.96))",
          border: "1px solid rgba(249,115,22,.35)",
          borderRadius: 24,
          padding: isMobile ? 20 : 30,
          boxShadow: "0 18px 40px rgba(0,0,0,.22)",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -20,
            top: -26,
            fontSize: 128,
            opacity: 0.055,
            transform: "rotate(-14deg)",
            pointerEvents: "none",
          }}
        >
          🌴
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(249,115,22,.15)",
              border: "1px solid rgba(249,115,22,.35)",
              borderRadius: 999,
              padding: "7px 13px",
              color: "#FDBA74",
              fontSize: 12,
              fontWeight: 800,
              marginBottom: 14,
            }}
          >
            <Sparkles size={15} />
            {t("aides", "bonPlanPei")}
          </div>

          <h3
            style={{
              margin: "0 0 8px",
              fontSize: isMobile ? 24 : 30,
              color: COLORS.text,
              fontFamily: "'Baloo 2', 'DM Serif Display', cursive",
              fontWeight: 800,
              letterSpacing: ".2px",
            }}
          >
            {t("aides", "title")}
          </h3>

          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: COLORS.muted,
              lineHeight: 1.7,
              maxWidth: 760,
            }}
          >
            {t("aides", "subtitle")}
          </p>
        </div>
      </section>

      <AssistantAides
        key={`assistant-aides-${languageKey}`}
        isPremium={isPremium}
        isMobile={isMobile}
        t={t}
        user={user}
      />

      <section
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
          gap: 16,
        }}
      >
        {AIDES.map((aide, index) => {
          const theme = CARD_VARIANTS[index % CARD_VARIANTS.length]
          const Icon = theme.Icon

          return (
            <article
              key={aide.id}
              style={{
                position: "relative",
                overflow: "hidden",
                background: theme.bg,
                border: `1px solid ${theme.border}`,
                borderRadius: 22,
                padding: 22,
                boxShadow: `0 14px 32px rgba(0,0,0,.18), 0 0 28px ${theme.glow}`,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  right: -18,
                  top: -16,
                  width: 96,
                  height: 96,
                  borderRadius: 999,
                  background: "rgba(255,255,255,.06)",
                  pointerEvents: "none",
                }}
              />

              <div
                style={{
                  position: "absolute",
                  right: 18,
                  top: 18,
                  opacity: 0.11,
                  pointerEvents: "none",
                }}
              >
                <Icon size={72} />
              </div>

              <div style={{ position: "relative", zIndex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    marginBottom: 14,
                  }}
                >
                  <h4
                    style={{
                      margin: 0,
                      fontSize: 18,
                      color: COLORS.text,
                      fontFamily: "'Baloo 2', sans-serif",
                      fontWeight: 800,
                    }}
                  >
                    {aide.label}
                  </h4>

                  <span
                    style={{
                      fontSize: 10,
                      padding: "5px 10px",
                      borderRadius: 999,
                      background: `${aide.color}22`,
                      color: aide.color,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t("aides", aide.statutKey)}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 900,
                    color: aide.color,
                    fontFamily: "'Baloo 2', 'DM Serif Display', cursive",
                    lineHeight: 1,
                  }}
                >
                  {aide.montant}
                </div>

                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 13,
                    color: "rgba(248,250,252,.68)",
                    fontWeight: 600,
                  }}
                >
                  {t("aides", theme.labelKey)}
                </p>

                {aide.statutKey !== "statutActif" && (
                  <button
                    type="button"
                    onClick={() => openExternalLink(getAideLink(aide))}
                    style={{
                      marginTop: 16,
                      background: aide.color,
                      border: "none",
                      borderRadius: 12,
                      padding: "9px 16px",
                      color: "#fff",
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontWeight: 800,
                      boxShadow: "0 10px 20px rgba(0,0,0,.20)",
                    }}
                  >
                    {t("aides", "cta")} →
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </section>

      <section
        style={{
          background:
            "linear-gradient(135deg, rgba(124,58,237,.22), rgba(14,165,233,.15), rgba(15,30,56,.96))",
          border: "1px solid rgba(56,189,248,.30)",
          borderRadius: 22,
          padding: isMobile ? 18 : 22,
          boxShadow: "0 14px 32px rgba(0,0,0,.16)",
        }}
      >
        <h3
          style={{
            margin: "0 0 16px",
            fontSize: 18,
            color: COLORS.text,
            fontFamily: "'Baloo 2', sans-serif",
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Landmark size={20} />
          {t("aides", "autresAides")}
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
            gap: 12,
          }}
        >
          {AUTRES_AIDES.map(aide => {
            const Icon = OTHER_AIDES_ICONS[aide.id] || SearchCheck

            return (
              <div
                key={aide.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 14px",
                  borderRadius: 16,
                  background: "rgba(255,255,255,.045)",
                  border: "1px solid rgba(255,255,255,.08)",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 14,
                    color: COLORS.text,
                    fontWeight: 700,
                  }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      background: "rgba(56,189,248,.11)",
                      border: "1px solid rgba(56,189,248,.20)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#7DD3FC",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={17} />
                  </span>

                  {t("aides", aide.key)}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    openExternalLink(
                      OTHER_AIDES_LINKS[aide.id] ||
                        "https://www.mesdroitssociaux.gouv.fr/"
                    )
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "rgba(56,189,248,.10)",
                    border: "1px solid rgba(56,189,248,.28)",
                    borderRadius: 10,
                    padding: "7px 12px",
                    color: "#7DD3FC",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  }}
                >
                  <SearchCheck size={14} />
                  {t("aides", "check")}
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}