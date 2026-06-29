import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { formatMontant } from "../../utils/format"

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  green: "#22C55E",
  red: "#EF4444",
  blue: "#38BDF8",
  cyan: "#23D3D6",
  yellow: "#FCD34D",
  muted: "#8EA4C5",
  text: "#F8FAFC",
}

const CHART_COLORS = ["#F97316", "#22C55E", "#38BDF8", "#FCD34D", "#A78BFA", "#FB7185", "#23D3D6"]

function getIsKreol(t) {
  return String(t?.("nav", "dashboard") || "").toLowerCase().includes("tablo")
}

function moneyValue(value) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

export default function DepensesPage({
  stats = {},
  transactions = [],
  byCategory = [],
  pieData = [],
  isMobile = false,
  isPremium = false,
  isPremiumPlus = false,
  customBudgets = [],
  onSaveBudgets,
  onGoPremium,
  onOpenReceipts,
  t,
}) {
  const isKreol = getIsKreol(t)
  const depenses = moneyValue(stats.depenses)
  const revenus = moneyValue(stats.revenus)
  const ratio = revenus > 0 ? Math.round((depenses / revenus) * 100) : 0

  const recentExpenses = (transactions || [])
    .filter(tx => Number(tx.amount) < 0)
    .slice(0, 8)

  const chartData =
    pieData?.length > 0
      ? pieData
      : (byCategory || [])
          .filter(cat => moneyValue(cat.depense) > 0)
          .map(cat => ({
            name: cat.label || cat.id,
            value: moneyValue(cat.depense),
          }))

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
          {isKreol ? "💸 Dépans mwa-la" : "💸 Dépenses du mois"}
        </div>
        <div style={{ color: COLORS.muted, marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>
          {isKreol
            ? "Retrouv ici répartition, dernières dépenses ek suivi par katégori."
            : "Retrouvez ici la répartition, les dernières transactions et les budgets par catégorie."}
        </div>
        <div style={{ color: COLORS.accent, marginTop: 18, fontSize: 42, fontWeight: 900, fontFamily: "'DM Serif Display', serif" }}>
          {formatMontant(depenses)}
        </div>
        <div style={{ color: COLORS.muted, fontSize: 12 }}>
          {ratio} % {isKreol ? "des revenus" : "des revenus"}
        </div>
        {onOpenReceipts && (
          <button
            type="button"
            onClick={onOpenReceipts}
            style={{
              minHeight: 52,
              marginTop: 16,
              border: "none",
              borderRadius: 14,
              background: COLORS.accent,
              color: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 15,
              fontWeight: 950,
              padding: "0 16px",
            }}
          >
            🧾 {isKreol ? "Analiz in course" : "Analyser une course"}
          </button>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 18,
        }}
      >
        <ChartCard data={chartData} isKreol={isKreol} />

        <RecentExpensesCard
          transactions={recentExpenses}
          isKreol={isKreol}
        />
      </div>

      <BudgetsByCategoryCard
        byCategory={byCategory}
        isKreol={isKreol}
      />

      <LockedCard
        unlocked={isPremium}
        title={isKreol ? "🔔 Alertes budget" : "🔔 Alertes budget"}
        text={isKreol ? "Recevoir alertes à 80 %, 100 % ek dépassement." : "Recevoir des alertes à 80 %, 100 % et en cas de dépassement."}
        required="Premium"
        onGoPremium={onGoPremium}
      />

      <LockedCard
        unlocked={isPremium}
        title={isKreol ? "📄 Export PDF" : "📄 Export PDF"}
        text={isKreol ? "Exporter dépenses ou mois complet en PDF." : "Exporter vos dépenses ou le mois complet en PDF."}
        required="Premium"
        onGoPremium={onGoPremium}
      />

      <LockedCard
        unlocked={isPremiumPlus}
        title={isKreol ? "📈 Analyse budgétaire avancée" : "📈 Analyse budgétaire avancée"}
        text={isKreol ? "Détecter catégories problématiques, dépenses excessives ek potentiel d’économie." : "Détecter les catégories problématiques, dépenses excessives et potentiels d’économies."}
        required="Premium+"
        onGoPremium={onGoPremium}
      />

      <LockedCard
        unlocked={isPremiumPlus}
        title={isKreol ? "🛒 Courses intelligentes" : "🛒 Courses intelligentes"}
        text={isKreol ? "Analyse alimentaire, panier, budget recommandé ek conseils économies." : "Analyse alimentaire, panier, budget recommandé et conseils d’économies."}
        required="Premium+"
        onGoPremium={onGoPremium}
      />
    </div>
  )
}

function ChartCard({ data, isKreol }) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0)

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 20 }}>
      <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
        {isKreol ? "📊 Répartition dépenses" : "📊 Répartition des dépenses"}
      </div>

      {data.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>{isKreol ? "Aucune dépense enregistrée." : "Aucune dépense enregistrée."}</div>
      ) : (
        <div>
          <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                {data.map((_, index) => (
                  <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={value => formatMontant(value)} />
            </PieChart>
          </ResponsiveContainer>
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {data.map((item, index) => {
              const value = Number(item.value || 0)
              const percent = total > 0 ? Math.round((value / total) * 100) : 0

              return (
                <div
                  key={item.name || index}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    alignItems: "center",
                    gap: 8,
                    color: COLORS.text,
                    fontSize: 13,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: CHART_COLORS[index % CHART_COLORS.length],
                      boxShadow: "0 0 0 3px rgba(255,255,255,.05)",
                    }}
                  />
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.name}
                  </span>
                  <span style={{ color: COLORS.muted, fontWeight: 800 }}>
                    {formatMontant(value)} - {percent}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function RecentExpensesCard({ transactions, isKreol }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 20 }}>
      <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
        {isKreol ? "🧾 Dernières dépenses" : "🧾 Dernières transactions"}
      </div>

      {transactions.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>{isKreol ? "Aucune dépense récente." : "Aucune dépense récente."}</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {transactions.map(tx => (
            <div
              key={tx.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                background: "rgba(10,22,40,.45)",
                border: "1px solid rgba(255,255,255,.08)",
                borderRadius: 14,
                padding: "11px 12px",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ color: COLORS.text, fontWeight: 900, fontSize: 13 }}>
                  {tx.icon || "🛒"} {tx.label || tx.nom || "Dépense"}
                </div>
                <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 3 }}>
                  {tx.date || "—"}
                </div>
              </div>
              <strong style={{ color: COLORS.red, flexShrink: 0 }}>
                {formatMontant(Math.abs(Number(tx.amount) || 0))}
              </strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BudgetsByCategoryCard({ byCategory, isKreol }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 20 }}>
      <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
        {isKreol ? "🎯 Bidjé par katégori" : "🎯 Budgets par catégorie"}
      </div>

      {(byCategory || []).length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>{isKreol ? "Aucun budget par katégori." : "Aucun budget par catégorie."}</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {byCategory.map(cat => {
            const depense = moneyValue(cat.depense)
            const budget = moneyValue(cat.budget)
            const pct = budget > 0 ? Math.min((depense / budget) * 100, 100) : 0
            const over = budget > 0 && depense > budget

            return (
              <div key={cat.id || cat.label}>
                <div style={{ display: "flex", justifyContent: "space-between", color: COLORS.text, fontSize: 13, fontWeight: 900, gap: 10 }}>
                  <span>{cat.emoji || "📌"} {cat.label || cat.id}</span>
                  <span style={{ color: over ? COLORS.red : COLORS.muted }}>
                    {formatMontant(depense)} / {formatMontant(budget)}
                  </span>
                </div>
                <div style={{ height: 7, background: "rgba(255,255,255,.12)", borderRadius: 999, overflow: "hidden", marginTop: 7 }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: over ? COLORS.red : COLORS.cyan,
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LockedCard({ unlocked, title, text, required, onGoPremium }) {
  return (
    <div style={{ background: "rgba(15,30,56,.75)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 20, padding: 20 }}>
      <div style={{ color: unlocked ? COLORS.green : COLORS.yellow, fontSize: 17, fontWeight: 900 }}>
        {unlocked ? "✅" : "🔒"} {title}
      </div>
      <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.55, marginTop: 7 }}>
        {text}
      </div>
      {!unlocked && onGoPremium && (
        <button
          type="button"
          onClick={onGoPremium}
          style={{
            marginTop: 13,
            background: "rgba(252,211,77,.14)",
            border: "1px solid rgba(252,211,77,.28)",
            color: COLORS.yellow,
            borderRadius: 12,
            padding: "10px 13px",
            cursor: "pointer",
            fontWeight: 900,
            fontFamily: "inherit",
          }}
        >
          Débloquer avec {required}
        </button>
      )}
    </div>
  )
}
