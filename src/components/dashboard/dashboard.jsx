import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatAmount, formatMontant } from "../../utils/format";

const COLORS = {
  card: "#0F1E38", cardLight: "#152444", border: "#1E3A5F",
  accent: "#F97316", accentSoft: "#FB923C",
  green: "#22C55E", red: "#EF4444", blue: "#38BDF8",
  muted: "#64748B", text: "#F1F5F9",
};

function StatCard({ label, value, sub, color, emoji }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
      border: `1px solid ${COLORS.border}`, borderRadius: 16,
      padding: "20px 22px", display: "flex", flexDirection: "column", gap: 6,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: -10, right: -10, fontSize: 64, opacity: 0.07, lineHeight: 1 }}>
        {emoji}
      </div>
      <span style={{ fontSize: 12, color: COLORS.muted, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "monospace" }}>
        {label}
      </span>
      <span style={{ fontSize: 26, fontWeight: 700, color, fontFamily: "'DM Serif Display', Georgia, serif", letterSpacing: "-0.5px" }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 12, color: COLORS.muted }}>{sub}</span>}
    </div>
  );
}

function ProgressBar({ value, max, color }) {
  const pct = Math.min((value / max) * 100, 100);
  const isOver = value > max;
  return (
    <div style={{ background: "#1E3A5F", borderRadius: 99, height: 6, overflow: "hidden" }}>
      <div style={{
        width: `${pct}%`, height: "100%",
        background: isOver ? COLORS.red : color,
        borderRadius: 99, transition: "width 0.8s cubic-bezier(.4,0,.2,1)",
      }} />
    </div>
  );
}

export default function Dashboard({ stats, byCategory, pieData, transactions, t }) {
  const { revenus, depenses, solde } = stats;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
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
          sub={`${((depenses / revenus) * 100).toFixed(0)}% ${t("dashboard", "ofIncome") || "des revenus"}`}
        />
      </div>

      {/* Pie + Transactions récentes */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 14 }}>

        {/* Pie */}
        <div style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20,
        }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, color: COLORS.muted, fontWeight: 500 }}>
            {t("dashboard", "repartition")}
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", marginTop: 8 }}>
            {pieData.slice(0, 4).map(d => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: COLORS.muted }}>
                <div style={{ width: 8, height: 8, borderRadius: 99, background: d.color }} />
                {t("categories", d.name)}
              </div>
            ))}
          </div>
        </div>

        {/* Transactions récentes */}
        <div style={{
          background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
          border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20,
        }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, color: COLORS.muted, fontWeight: 500 }}>
            {t("dashboard", "recentTransactions")}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {transactions.slice(0, 5).map(tx => (
              <div key={tx.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 10,
                    background: COLORS.cardLight, display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 16,
                  }}>
                    {tx.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.text }}>{tx.label}</div>
                    <div style={{ fontSize: 11, color: COLORS.muted }}>{tx.date}</div>
                  </div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: tx.amount >= 0 ? COLORS.green : COLORS.text }}>
                  {formatAmount(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Budgets par catégorie */}
      <div style={{
        background: `linear-gradient(135deg, ${COLORS.card} 0%, ${COLORS.cardLight} 100%)`,
        border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 20,
      }}>
        <h3 style={{ margin: "0 0 18px", fontSize: 14, color: COLORS.muted, fontWeight: 500 }}>
          {t("dashboard", "budgetByCategory")}
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px 24px" }}>
          {byCategory.map(cat => (
            <div key={cat.id}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: COLORS.text }}>
                  {cat.emoji} {t("categories", cat.id)}
                </span>
                <span style={{ fontSize: 12, color: cat.depense > cat.budget ? COLORS.red : COLORS.muted }}>
                  {cat.depense.toFixed(0)} / {cat.budget} €
                </span>
              </div>
              <ProgressBar value={cat.depense} max={cat.budget} color={cat.color} />
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
