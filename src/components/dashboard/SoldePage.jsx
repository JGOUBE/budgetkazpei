import { formatMontant } from "../../utils/format"
import { BkIcons } from "../icons-budgetkazpei"
import { createColorAliases } from "../../styles/designSystem"
import { useTheme } from "../../styles/ThemeProvider"

const COLORS = createColorAliases()

function getIsKreol(t) {
  const lang = String(t?.lang || "").toLowerCase()
  if (lang === "cr" || lang === "kreol") return true
  return String(t?.("nav", "dashboard") || "").toLowerCase().includes("tablo")
}

function moneyValue(value) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

export default function SoldePage({
  stats = {},
  isMobile = false,
  isPremiumPlus = false,
  onGoPremium,
  t,
}) {
  useTheme()
  const isKreol = getIsKreol(t)

  const revenus = moneyValue(stats.revenus)
  const depenses = moneyValue(stats.depenses)
  const solde = moneyValue(stats.solde)
  const chargesFixes = moneyValue(stats.chargesFixes)
  const depensesVariables = moneyValue(stats.depensesVariables)
  const resteAVivre = moneyValue(stats.resteAVivre)
  const tauxCharges = revenus > 0 ? Math.round((chargesFixes / revenus) * 100) : 0

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.card}, ${COLORS.cardLight})`,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 22,
          padding: 24,
        }}
      >
        <div style={{ color: COLORS.text, fontSize: 30, fontWeight: 900, fontFamily: "'DM Serif Display', serif" }}>
          {isKreol ? "Larzan disponible" : "Solde disponible"}
        </div>
        <div style={{ color: COLORS.muted, marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>
          {isKreol ? "Détail du calcul entre revenus, dépenses, sarz fix ek reste à vivre."
            : "Détail du calcul entre revenus, dépenses, charges fixes et reste à vivre."}
        </div>
        <div style={{ color: solde >= 0 ? COLORS.green : COLORS.red, marginTop: 18, fontSize: 42, fontWeight: 900, fontFamily: "'DM Serif Display', serif" }}>
          {formatMontant(solde)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 14 }}>
        <MiniCard label={isKreol ? "Revenus" : "Revenus"} value={revenus} color={COLORS.green} Icon={BkIcons.savings} />
        <MiniCard label={isKreol ? "Dépenses" : "Dépenses"} value={depenses} color={COLORS.red} Icon={BkIcons.depenses} />
        <MiniCard label={isKreol ? "Solde" : "Solde"} value={solde} color={solde >= 0 ? COLORS.green : COLORS.red} Icon={BkIcons.budget} />
      </div>

      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 20 }}>
        <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 900, marginBottom: 14 }}>
          {isKreol ? "Calcul détaillé" : "Calcul détaillé"}
        </div>

        <Line label={isKreol ? "Revenus du mois" : "Revenus du mois"} value={revenus} color={COLORS.green} />
        <Line label={isKreol ? "Charges fixes" : "Charges fixes"} value={chargesFixes} color={COLORS.yellow} />
        <Line label={isKreol ? "Dépenses variables" : "Dépenses variables"} value={depensesVariables} color={COLORS.blue} />
        <Line label={isKreol ? "Dépenses totales" : "Dépenses totales"} value={depenses} color={COLORS.red} />
        <Line label={isKreol ? "Reste à vivre" : "Reste à vivre"} value={resteAVivre} color={resteAVivre >= 0 ? COLORS.green : COLORS.red} strong />

        <div
          style={{
            marginTop: 14,
            background: "rgba(56,189,248,.10)",
            border: "1px solid rgba(56,189,248,.25)",
            borderRadius: 14,
            padding: "12px 14px",
            color: COLORS.text,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {isKreol ? `Out charges fixes i représente ${tauxCharges} % de out revenus.`
            : `Vos charges fixes représentent ${tauxCharges} % de vos revenus.`}
        </div>
      </div>

      <div
        style={{
          background: "rgba(167,139,250,.08)",
          border: "1px solid rgba(167,139,250,.28)",
          borderRadius: 20,
          padding: 20,
        }}
      >
        <div style={{ color: isPremiumPlus ? COLORS.green : "#DDD6FE", fontSize: 17, fontWeight: 900 }}>
          {isKreol ? "Projection fin de mois" : "Projection fin de mois"}
        </div>
        <p style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.55, marginBottom: 0 }}>
          {isKreol ? "BudgetKazPei pourra estimer lo solde probable à la fin du mois."
            : "BudgetKazPei pourra estimer le solde probable à la fin du mois."}
        </p>
        {!isPremiumPlus && onGoPremium && (
          <button
            type="button"
            onClick={onGoPremium}
            style={{
              marginTop: 14,
              background: "rgba(167,139,250,.18)",
              border: "1px solid rgba(167,139,250,.35)",
              color: "#DDD6FE",
              borderRadius: 12,
              padding: "10px 13px",
              cursor: "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            Découvrir Premium+
          </button>
        )}
      </div>
    </div>
  )
}

function MiniCard({ label, value, color, Icon }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 18 }}>
      <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900, marginBottom: 8 }}>
        {Icon && <Icon size={16} style={{ marginRight: 6, verticalAlign: "text-bottom", color }} />}{label}
      </div>
      <div style={{ color, fontSize: 25, fontWeight: 900, fontFamily: "'DM Serif Display', serif" }}>
        {formatMontant(value)}
      </div>
    </div>
  )
}

function Line({ label, value, color, strong = false }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "11px 0",
        borderBottom: "1px solid rgba(255,255,255,.08)",
        color: COLORS.text,
        fontSize: strong ? 15 : 14,
        fontWeight: strong ? 900 : 700,
      }}
    >
      <span>{label}</span>
      <strong style={{ color }}>{formatMontant(value)}</strong>
    </div>
  )
}


