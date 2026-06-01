import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { formatAmount } from "../../utils/format"

const COLORS = {
  card: "#0F1E38", cardLight: "#152444", border: "#1E3A5F",
  accent: "#F97316", accentSoft: "#FB923C",
  green: "#22C55E", red: "#EF4444", blue: "#38BDF8",
  muted: "#64748B", text: "#F1F5F9",
}

function StatCard({ label, value, sub, color, emoji }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
      border: `1px solid ${COLORS.border}`, borderRadius: 16,
      padding: "16px 18px", display: "flex", flexDirection: "column", gap: 4,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: -8, right: -8, fontSize: 48, opacity: 0.07, lineHeight: 1 }}>
        {emoji}
      </div>
      <span style={{ fontSize: 11, color: COLORS.muted, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "monospace" }}>
        {label}
      </span>
      <span style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'DM Serif Display', Georgia, serif", letterSpacing: "-0.5px" }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 11, color: COLORS.muted }}>{sub}</span>}
    </div>
  )
}

function ProgressBar({ value, max, color }) {
  const pct = Math.min((value / max) * 100, 100)
  const isOver = value > max
  return (
    <div style={{ background: "#1E3A5F", borderRadius: 99, height: 6, overflow: "hidden" }}>
      <div style={{
        width: `${pct}%`, height: "100%",
        background: isOver ? COLORS.red : color,
        borderRadius: 99, transition: "width 0.8s cubic-bezier(.4,0,.2,1)",
      }} />
    </div>
  )
}

export default function Dashboard({ stats, byCategory, pieData, transactions, t, isMobile }) {
  const { revenus, depenses, solde } = stats
  const ofIncome = revenus > 0 ? ((depenses / revenus) * 100).toFixed(0) : 0

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 22 }}>

      {/* Stat cards — 1 colonne sur mobile, 3 sur desktop */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
        gap: 12,
      }}>
        <StatCard
          label={t("dashboard", "solde")}
          value={`${solde.toFixed(0)} €`}
          emoji="💼"
          color={solde >= 0 ? COLORS.green : COLORS.red}
          sub={t("dashboard", "updatedToday")}
        />
        <StatCard
          label={t("dashboard", "revenus")}
          value={`${revenus.toFixed(0)} €`}
          emoji="💰"
          color={COLORS.blue}
          sub={t("dashboard", "salaryAndAids")}
        />
        <StatCard
          label={t("dashboard", "depenses")}
          value={`${depenses.toFixed(0)} €`}
          emoji="📉"
          color={COLORS.accentSoft}
          sub={`${ofIncome}% ${t("dashboard", "ofIncome")}`}
        />
      </div>

      {/* Pie + Transactions — colonne sur mobile */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1.4fr",
        gap: 14,
      }}>
        {/* Pie */}
        <div style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: isMobile ? 16 : 20,
        }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 13, color: COLORS.muted, fontWeight: 500 }}>
            {t("dashboard", "repartition")}
          </h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={isMobile ? 160 : 180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }}
                    formatter={val => [`${val.toFixed(0)} €`]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginTop: 8 }}>
                {pieData.slice(0, 4).map(d => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: COLORS.muted }}>
                    <div style={{ width: 7, height: 7, borderRadius: 99, background: d.color }} />
                    {t("categories", d.name)}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "20px 0", color: COLORS.muted, fontSize: 13 }}>
              Aucune dépense ce mois
            </div>
          )}
        </div>

        {/* Transactions récentes */}
        <div style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: isMobile ? 16 : 20,
        }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 13, color: COLORS.muted, fontWeight: 500 }}>
            {t("dashboard", "recentTransactions")}
          </h3>
          {transactions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: COLORS.muted, fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
              Aucune transaction
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {transactions.slice(0, 5).map(tx => (
                <div key={tx.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: COLORS.cardLight, display: "flex",
                      alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0,
                    }}>
                      {tx.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: COLORS.text }}>{tx.label}</div>
                      <div style={{ fontSize: 10, color: COLORS.muted }}>{tx.date}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: tx.amount >= 0 ? COLORS.green : COLORS.text, flexShrink: 0 }}>
                    {formatAmount(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Budgets par catégorie — 1 colonne sur mobile */}
      <div style={{
        background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
        border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: isMobile ? 16 : 20,
      }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 13, color: COLORS.muted, fontWeight: 500 }}>
          {t("dashboard", "budgetByCategory")}
        </h3>
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
          gap: isMobile ? "12px 0" : "14px 24px",
        }}>
          {byCategory.map(cat => (
            <div key={cat.id}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: COLORS.text }}>
                  {cat.emoji} {t("categories", cat.id)}
                </span>
                <span style={{ fontSize: 11, color: cat.depense > cat.budget ? COLORS.red : COLORS.muted }}>
                  {cat.depense.toFixed(0)} / {cat.budget} €
                </span>
              </div>
              <ProgressBar value={cat.depense} max={cat.budget} color={cat.color} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
