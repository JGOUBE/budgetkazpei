import { formatMontant } from "../../utils/format"

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  green: "#22C55E",
  red: "#EF4444",
  cyan: "#23D3D6",
  yellow: "#FCD34D",
  muted: "#8EA4C5",
  text: "#F8FAFC",
}

function getIsKreol(t) {
  return String(t?.("nav", "dashboard") || "").toLowerCase().includes("tablo")
}

function moneyValue(value) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

export default function RevenusPage({
  stats = {},
  transactions = [],
  isMobile = false,
  isPremiumPlus = false,
  onGoPremium,
  t,
}) {
  const isKreol = getIsKreol(t)
  const revenus = moneyValue(stats.revenus)

  const revenusItems = (transactions || [])
    .filter(tx => Number(tx.amount) > 0)
    .map(tx => ({
      id: tx.id,
      label: tx.label || tx.nom || (isKreol ? "Larzan i rantre" : "Revenu"),
      icon: tx.icon || "💵",
      amount: moneyValue(tx.amount),
      date: tx.date || "",
      category: tx.category || "",
      source: tx.source || "",
    }))

  const revenusRecurrents = revenusItems.filter(item => item.source === "profile_income")
  const revenusPonctuels = revenusItems.filter(item => item.source !== "profile_income")

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <HeaderCard
        title={isKreol ? "💰 Larzan i rantre mwa-la" : "💰 Revenus du mois"}
        subtitle={
          isKreol
            ? "Retrouv ici tout larzan la rantre pou mwa-la."
            : "Retrouvez ici les revenus enregistrés pour le mois en cours."
        }
        total={revenus}
        color={COLORS.green}
      />

      <SectionCard
        title={isKreol ? "📌 Revenus réguliers" : "📌 Revenus récurrents"}
        emptyText={isKreol ? "Aucun revenu régulier enregistré." : "Aucun revenu récurrent enregistré."}
        items={revenusRecurrents}
        color={COLORS.green}
      />

      <SectionCard
        title={isKreol ? "➕ Revenus ponctuels" : "➕ Revenus ponctuels"}
        emptyText={isKreol ? "Aucun revenu ponctuel enregistré." : "Aucun revenu ponctuel enregistré."}
        items={revenusPonctuels}
        color={COLORS.cyan}
      />

      <LockedPremiumPlusCard
        isUnlocked={isPremiumPlus}
        onGoPremium={onGoPremium}
        title={isKreol ? "📈 Analyse évolution revenus" : "📈 Analyse évolution revenus"}
        text={
          isKreol
            ? "BudgetKazPei pourra analyser l’évolution de out revenus ek préparer des prévisions."
            : "BudgetKazPei pourra analyser l’évolution de vos revenus et préparer des prévisions."
        }
      />
    </div>
  )
}

function HeaderCard({ title, subtitle, total, color }) {
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${COLORS.card}, ${COLORS.cardLight})`,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 22,
        padding: 24,
      }}
    >
      <div style={{ color: COLORS.text, fontSize: 30, fontWeight: 900, fontFamily: "'DM Serif Display', serif" }}>
        {title}
      </div>
      <div style={{ color: COLORS.muted, marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>
        {subtitle}
      </div>
      <div style={{ color, marginTop: 18, fontSize: 42, fontWeight: 900, fontFamily: "'DM Serif Display', serif" }}>
        {formatMontant(total)}
      </div>
    </div>
  )
}

function SectionCard({ title, emptyText, items, color }) {
  const total = items.reduce((sum, item) => sum + moneyValue(item.amount), 0)

  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 20,
        padding: 20,
      }}
    >
      <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
        {title}
      </div>

      {items.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>{emptyText}</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item, index) => (
            <div
              key={item.id || `${item.label}-${index}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                background: "rgba(10,22,40,.45)",
                border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 14,
                padding: "12px 13px",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ color: COLORS.text, fontWeight: 900, fontSize: 14 }}>
                  {item.icon} {item.label}
                </div>
                <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 3 }}>
                  {item.date || "—"}
                </div>
              </div>
              <strong style={{ color, flexShrink: 0 }}>{formatMontant(item.amount)}</strong>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,.08)",
          display: "flex",
          justifyContent: "space-between",
          color: COLORS.text,
          fontWeight: 900,
        }}
      >
        <span>Total</span>
        <span style={{ color }}>{formatMontant(total)}</span>
      </div>
    </div>
  )
}

function LockedPremiumPlusCard({ isUnlocked, title, text, onGoPremium }) {
  return (
    <div
      style={{
        background: "rgba(167,139,250,.08)",
        border: "1px solid rgba(167,139,250,.28)",
        borderRadius: 20,
        padding: 20,
      }}
    >
      <div style={{ color: "#DDD6FE", fontSize: 17, fontWeight: 900 }}>
        {isUnlocked ? "👑" : "🔒"} {title}
      </div>
      <p style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.55, marginBottom: 0 }}>
        {text}
      </p>
      {!isUnlocked && onGoPremium && (
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
  )
}
