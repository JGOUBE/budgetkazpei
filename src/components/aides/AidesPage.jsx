import { useEffect, useState } from "react"
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
  ClipboardCheck,
  Trash2,
} from "lucide-react"

import { supabase } from "../../services/supabase"
import { AIDES } from "../../data/categories"
import { AUTRES_AIDES } from "../../data/aides"
import AssistantAides from "./AssistantAides"

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

const STATUS_OPTIONS = [
  { value: "a_faire", fr: "À faire", kr: "Pou fé", color: COLORS.yellow },
  { value: "commence", fr: "Dossier commencé", kr: "Dossier commencé", color: COLORS.cyan },
  { value: "documents_envoyes", fr: "Documents envoyés", kr: "Dokiman envoyés", color: COLORS.green },
  { value: "en_attente", fr: "En attente", kr: "En attente", color: COLORS.accent },
  { value: "accepte", fr: "Accepté", kr: "Accepté", color: COLORS.green },
  { value: "refuse", fr: "Refusé", kr: "Refusé", color: COLORS.red },
]

function getAideLink(aide) {
  const normalizedLabel = `${aide.id || ""} ${aide.label || ""}`.toLowerCase()

  if (normalizedLabel.includes("rsa")) return AIDE_LINKS.rsa
  if (normalizedLabel.includes("apl")) return AIDE_LINKS.apl

  if (normalizedLabel.includes("chèque") || normalizedLabel.includes("cheque")) {
    return AIDE_LINKS.chequeEnergie
  }

  if (normalizedLabel.includes("énergie") || normalizedLabel.includes("energie")) {
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

function isKreolLang(t) {
  return t?.("nav", "dashboard") === "Tablo débor"
}

function getStatus(status, isKreol) {
  const found = STATUS_OPTIONS.find(item => item.value === status)
  if (!found) return STATUS_OPTIONS[0]
  return {
    ...found,
    label: isKreol ? found.kr : found.fr,
  }
}

export default function AidesPage({ isMobile, t, isPremium, user }) {
  const languageKey = getLanguageKey(t)
  const isKreol = isKreolLang(t)

  const [demarches, setDemarches] = useState([])
  const [loadingDemarches, setLoadingDemarches] = useState(true)

  useEffect(() => {
    fetchDemarches()
  }, [user?.id])

  async function fetchDemarches() {
    if (!user?.id) {
      setDemarches([])
      setLoadingDemarches(false)
      return
    }

    setLoadingDemarches(true)

    const { data, error } = await supabase
      .from("aide_demarches")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Erreur chargement démarches:", error)
      setDemarches([])
    } else {
      setDemarches(data || [])
    }

    setLoadingDemarches(false)
  }

  async function updateDemarcheStatus(id, status) {
    const { error } = await supabase
      .from("aide_demarches")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (error) {
      console.error("Erreur mise à jour démarche:", error)
      return
    }

    setDemarches(prev =>
      prev.map(item => (item.id === id ? { ...item, status } : item))
    )
  }

  async function deleteDemarche(id) {
    const confirmText = isKreol
      ? "Supprim cette démarche ?"
      : "Supprimer cette démarche ?"

    if (!window.confirm(confirmText)) return

    const { error } = await supabase
      .from("aide_demarches")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("Erreur suppression démarche:", error)
      return
    }

    setDemarches(prev => prev.filter(item => item.id !== id))
  }

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
            {isKreol ? "Suivi bann démarches" : "Suivi des démarches"}
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
            {isKreol ? "🏛️ Mes éd & démarches" : "🏛️ Mes aides & démarches"}
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
            {isKreol
              ? "Suiv bann aides ajouté depuis les opportunités, prépare out dokiman et pose out question à l’assistant."
              : "Suivez les aides ajoutées depuis vos opportunités, préparez vos documents et posez vos questions à l’assistant."}
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
          background:
            "linear-gradient(135deg, rgba(35,211,214,.16), rgba(15,30,56,.96))",
          border: "1px solid rgba(35,211,214,.28)",
          borderRadius: 22,
          padding: isMobile ? 18 : 22,
          boxShadow: "0 14px 32px rgba(0,0,0,.16)",
        }}
      >
        <h3
          style={{
            margin: "0 0 14px",
            fontSize: 18,
            color: COLORS.text,
            fontFamily: "'Baloo 2', sans-serif",
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <ClipboardCheck size={20} />
          {isKreol ? "Mes démarches en cours" : "Mes démarches en cours"}
        </h3>

        {loadingDemarches ? (
          <div style={{ color: COLORS.muted, fontSize: 13 }}>
            {isKreol ? "Chargement..." : "Chargement..."}
          </div>
        ) : demarches.length === 0 ? (
          <div
            style={{
              background: "rgba(255,255,255,.045)",
              border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 16,
              padding: 16,
              color: COLORS.muted,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {isKreol
              ? "Aucune démarche pou le moman. Alé dann Bon plan détecté, ouvre une aide, puis clique su “Azout dann mes démarches”."
              : "Aucune démarche pour le moment. Allez dans Opportunités détectées, ouvrez une aide, puis cliquez sur “Ajouter à mes démarches”."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {demarches.map(demarche => {
              const status = getStatus(demarche.status, isKreol)
              const title = isKreol
                ? demarche.title_kr || demarche.title
                : demarche.title

              return (
                <div
                  key={demarche.id}
                  style={{
                    background: "rgba(255,255,255,.045)",
                    border: "1px solid rgba(255,255,255,.08)",
                    borderRadius: 16,
                    padding: 16,
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr auto auto",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: COLORS.text,
                        fontWeight: 900,
                        fontSize: 15,
                        marginBottom: 6,
                      }}
                    >
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
                      }}
                    >
                      ● {status.label}
                    </div>
                  </div>

                  <select
                    value={demarche.status || "a_faire"}
                    onChange={e => updateDemarcheStatus(demarche.id, e.target.value)}
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
                    {STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {isKreol ? option.kr : option.fr}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => deleteDemarche(demarche.id)}
                    style={{
                      background: "rgba(251,113,133,.10)",
                      border: "1px solid rgba(251,113,133,.28)",
                      borderRadius: 10,
                      color: COLORS.red,
                      padding: "9px 11px",
                      cursor: "pointer",
                      fontWeight: 900,
                      fontFamily: "inherit",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
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
      </section>

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