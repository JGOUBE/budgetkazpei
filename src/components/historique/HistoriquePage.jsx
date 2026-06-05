import { useState } from "react"
import { Download, Lock, CalendarClock, FileText } from "lucide-react"
import { formatMontant } from "../../utils/format"
import { generateMonthlyBudgetPDF } from "../../services/pdfService"

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  yellow: "#FCD34D",
  cyan: "#23D3D6",
  muted: "#8EA4C5",
  text: "#F1F5F9",
}

function translate(t, section, key, fallback) {
  if (typeof t !== "function") return fallback

  const valueTwoArgs = t(section, key)
  if (valueTwoArgs && valueTwoArgs !== key && valueTwoArgs !== `${section}.${key}`) {
    return valueTwoArgs
  }

  const valueDotKey = t(`${section}.${key}`)
  if (valueDotKey && valueDotKey !== key && valueDotKey !== `${section}.${key}`) {
    return valueDotKey
  }

  return fallback
}

function detectPdfLanguage(t) {
  const translatedDashboard =
    typeof t === "function" ? t("nav", "dashboard") : ""

  const translatedHistory =
    typeof t === "function" ? t("historique", "title") : ""

  if (
    translatedDashboard === "Tablo débor" ||
    translatedHistory === "Istorik chak mwa" ||
    document.body.innerText.includes("FR Français") ||
    document.body.innerText.includes("Tablo débor") ||
    document.body.innerText.includes("Istorik chak mwa")
  ) {
    return "kreol"
  }

  return "fr"
}

function formatMonth(mois, annee) {
  const date = new Date(annee, mois - 1, 1)

  return date.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  })
}

export default function HistoriquePage({
  historiques = [],
  loading = false,
  isPremium = false,
  onGoPremium,
  t,
}) {
  const [generatingPdfId, setGeneratingPdfId] = useState(null)

  const txt = (key, fallback) => translate(t, "historique", key, fallback)

  async function handleGeneratePdf(item) {
    try {
      setGeneratingPdfId(item.id)

      const pdfLanguage = detectPdfLanguage(t)
      await generateMonthlyBudgetPDF(item, pdfLanguage)
    } catch (error) {
      console.error("Erreur génération PDF:", error)
      alert("Impossible de générer le PDF pour le moment.")
    } finally {
      setGeneratingPdfId(null)
    }
  }

  if (!isPremium) {
    return (
      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.yellow}55`,
          borderRadius: 22,
          padding: 28,
          color: COLORS.text,
          textAlign: "center",
        }}
      >
        <Lock size={36} color={COLORS.yellow} />

        <h2 style={{ margin: "14px 0 8px" }}>
          {txt("premiumTitle", "Historique mensuel Premium")}
        </h2>

        <p style={{ color: COLORS.muted, lineHeight: 1.5 }}>
          {txt(
            "premiumSubtitle",
            "Retrouvez chaque mois votre résumé budget et vos exports PDF."
          )}
        </p>

        <button
          type="button"
          onClick={onGoPremium}
          style={{
            marginTop: 14,
            background: `linear-gradient(135deg, ${COLORS.yellow}, #F59E0B)`,
            color: "#1E293B",
            border: "none",
            borderRadius: 14,
            padding: "13px 18px",
            cursor: "pointer",
            fontWeight: 900,
            fontFamily: "inherit",
          }}
        >
          {txt("unlockPremium", "Débloquer avec Premium")}
        </button>
      </div>
    )
  }

  if (loading && historiques.length === 0) {
    return (
      <div style={{ color: COLORS.muted }}>
        {txt("loading", "Chargement de l’historique mensuel...")}
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 22,
          padding: 22,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -18,
            top: -22,
            fontSize: 104,
            opacity: 0.05,
            transform: "rotate(-12deg)",
            pointerEvents: "none",
          }}
        >
          🌴
        </div>

        <h2
          style={{
            margin: 0,
            color: COLORS.text,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <CalendarClock size={24} color={COLORS.cyan} />
          {txt("title", "Historique mensuel")}
        </h2>

        <p style={{ margin: "8px 0 0", color: COLORS.muted, lineHeight: 1.5 }}>
          {txt(
            "subtitle",
            "Vos bilans mensuels seront disponibles ici avec leurs exports PDF."
          )}
        </p>
      </div>

      {historiques.length === 0 ? (
        <div
          style={{
            background: "rgba(255,255,255,.04)",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 18,
            padding: 22,
            color: COLORS.muted,
            textAlign: "center",
          }}
        >
          <FileText size={28} color={COLORS.cyan} />
          <div style={{ marginTop: 10 }}>
            {txt("empty", "Aucun historique mensuel pour le moment.")}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {historiques.map(item => {
            const isGenerating = generatingPdfId === item.id

            return (
              <div
                key={item.id}
                style={{
                  background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 18,
                  padding: 18,
                }}
              >
                <h3 style={{ margin: 0, color: COLORS.yellow }}>
                  {formatMonth(item.mois, item.annee)}
                </h3>

                <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                  <Line label={txt("revenus", "Revenus")} value={item.revenus} />
                  <Line label={txt("depenses", "Dépenses")} value={item.depenses} />
                  <Line label={txt("chargesFixes", "Charges fixes")} value={item.abonnements} />
                  <Line label={txt("solde", "Solde")} value={item.solde} highlight />
                </div>

                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleGeneratePdf(item)}
                  style={{
                    marginTop: 16,
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    background: isGenerating ? COLORS.muted : COLORS.accent,
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    padding: "11px 14px",
                    fontWeight: 900,
                    fontFamily: "inherit",
                    cursor: isGenerating ? "not-allowed" : "pointer",
                  }}
                >
                  <Download size={17} />
                  {isGenerating
                    ? txt("generatingPdf", "Génération du PDF...")
                    : txt("downloadPdf", "Télécharger PDF")}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Line({ label, value, highlight }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        color: highlight ? COLORS.cyan : COLORS.text,
        fontWeight: highlight ? 900 : 700,
      }}
    >
      <span>{label}</span>
      <span>{formatMontant(Number(value) || 0)}</span>
    </div>
  )
} 