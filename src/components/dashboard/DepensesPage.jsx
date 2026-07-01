import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { formatMontant } from "../../utils/format"
import { BkIcons } from "../icons-budgetkazpei"
import { ds } from "../../styles/designSystem"

const COLORS = {
  card: ds.card,
  cardLight: ds.cardHover,
  border: ds.border,
  accent: ds.primary,
  green: ds.success,
  red: ds.danger,
  cyan: ds.cyan,
  yellow: ds.warning,
  muted: ds.textSecondary,
  text: ds.textPrimary,
}

const CHART_COLORS = ["#22C55E", "#38BDF8", "#FCD34D", "#A78BFA", "#FB7185", "#23D3D6", "#F97316"]

function getIsKreol(t) {
  const lang = String(t?.lang || "").toLowerCase()
  if (lang === "cr" || lang === "kreol") return true
  return String(t?.("nav", "dashboard") || "").toLowerCase().includes("tablo")
}

function moneyValue(value) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

function iconBubble(Icon, color = COLORS.cyan) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 38,
        height: 38,
        borderRadius: 12,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: `${color}22`,
        border: `1px solid ${color}55`,
        color,
        flexShrink: 0,
      }}
    >
      <Icon size={19} />
    </span>
  )
}

export default function DepensesPage({
  stats = {},
  transactions = [],
  byCategory = [],
  pieData = [],
  isMobile = false,
  isPremium = false,
  isPremiumPlus = false,
  onSaveBudgets,
  onGoPremium,
  t,
}) {
  const isKreol = getIsKreol(t)
  const depenses = moneyValue(stats.depenses)
  const revenus = moneyValue(stats.revenus)
  const ratio = revenus > 0 ? Math.round((depenses / revenus) * 100) : 0

  const safeTransactions = Array.isArray(transactions) ? transactions : []
  const safeByCategory = Array.isArray(byCategory) ? byCategory : []
  const safePieData = Array.isArray(pieData) ? pieData : []

  const recentExpenses = safeTransactions
    .filter(tx => Number(tx.amount) < 0)
    .slice(0, 8)

  const chartData =
    safePieData.length > 0
      ? safePieData
      : safeByCategory
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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {iconBubble(BkIcons.depenses, COLORS.accent)}
          <div>
            <div style={{ color: COLORS.text, fontSize: 30, fontWeight: 900, fontFamily: "'DM Serif Display', serif" }}>
              {isKreol ? "Depans mwa-la" : "Depenses du mois"}
            </div>
            <div style={{ color: COLORS.muted, marginTop: 6, fontSize: 14, lineHeight: 1.5 }}>
              {isKreol ? "Retrouv ici repartition, dernieres depans ek suivi par kategori."
                : "Retrouvez ici la repartition, les dernieres transactions et les budgets par categorie."}
            </div>
          </div>
        </div>

        <div style={{ color: COLORS.accent, marginTop: 18, fontSize: 42, fontWeight: 900, fontFamily: "'DM Serif Display', serif" }}>
          {formatMontant(depenses)}
        </div>
        <div style={{ color: COLORS.muted, fontSize: 12 }}>
          {ratio} % {isKreol ? "des revenus" : "des revenus"}
        </div>
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
        title={isKreol ? "Alertes budget" : "Alertes budget"}
        text={isKreol ? "Recevoir alertes a 80 %, 100 % ek depassement." : "Recevoir des alertes a 80 %, 100 % et en cas de depassement."}
        required="Premium"
        onGoPremium={onGoPremium}
        Icon={BkIcons.alert}
      />

      <LockedCard
        unlocked={isPremium}
        title="Export PDF"
        text={isKreol ? "Exporter depenses ou mois complet en PDF." : "Exporter vos depenses ou le mois complet en PDF."}
        required="Premium"
        onGoPremium={onGoPremium}
        Icon={BkIcons.receipts}
      />

      <LockedCard
        unlocked={isPremiumPlus}
        title={isKreol ? "Analyse budgetaire avancee" : "Analyse budgetaire avancee"}
        text={isKreol ? "Detecter categories problematiques, depenses excessives ek potentiel d'economie." : "Detecter les categories problematiques, depenses excessives et potentiels d'economies."}
        required="Premium+"
        onGoPremium={onGoPremium}
        Icon={BkIcons.stats}
      />

      <LockedCard
        unlocked={isPremiumPlus}
        title={isKreol ? "Courses intelligentes" : "Courses intelligentes"}
        text={isKreol ? "Analyse alimentaire, panier, budget recommande ek conseils economies." : "Analyse alimentaire, panier, budget recommande et conseils d'economies."}
        required="Premium+"
        onGoPremium={onGoPremium}
        Icon={BkIcons.shopping}
      />
    </div>
  )
}

function ChartCard({ data, isKreol }) {
  const safeData = Array.isArray(data) ? data : []
  const total = safeData.reduce((sum, item) => sum + Number(item.value || 0), 0)

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: COLORS.text, fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
        {iconBubble(BkIcons.stats, COLORS.cyan)}
        {isKreol ? "Repartition depans" : "Repartition des depenses"}
      </div>

      {safeData.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>{isKreol ? "Aucune depense enregistree." : "Aucune depense enregistree."}</div>
      ) : (
        <div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={safeData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                  {safeData.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={value => formatMontant(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {safeData.map((item, index) => {
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
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: COLORS.text, fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
        {iconBubble(BkIcons.receipts, COLORS.cyan)}
        {isKreol ? "Dernieres depenses" : "Dernieres transactions"}
      </div>

      {transactions.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>{isKreol ? "Aucune depense recente." : "Aucune depense recente."}</div>
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
                  {tx.label || tx.nom || "Depense"}
                </div>
                <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 3 }}>
                  {tx.date || "-"}
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
  const safeByCategory = Array.isArray(byCategory) ? byCategory : []

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: COLORS.text, fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
        {iconBubble(BkIcons.budget, COLORS.green)}
        {isKreol ? "Bidje par kategori" : "Budgets par categorie"}
      </div>

      {safeByCategory.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>{isKreol ? "Aucun budget par kategori." : "Aucun budget par categorie."}</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {safeByCategory.map(cat => {
            const depense = moneyValue(cat.depense)
            const budget = moneyValue(cat.budget)
            const pct = budget > 0 ? Math.min((depense / budget) * 100, 100) : 0
            const over = budget > 0 && depense > budget
            const color = cat.color || COLORS.cyan

            return (
              <div key={cat.id || cat.label}>
                <div style={{ display: "flex", justifyContent: "space-between", color: COLORS.text, fontSize: 13, fontWeight: 900, gap: 10 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 999, background: color, flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.label || cat.id}</span>
                  </span>
                  <span style={{ color: over ? COLORS.red : COLORS.muted, flexShrink: 0 }}>
                    {formatMontant(depense)} / {formatMontant(budget)}
                  </span>
                </div>
                <div style={{ height: 7, background: "rgba(255,255,255,.12)", borderRadius: 999, overflow: "hidden", marginTop: 7 }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: over ? COLORS.red : color,
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

function LockedCard({ unlocked, title, text, required, onGoPremium, Icon }) {
  return (
    <div style={{ background: "rgba(15,30,56,.75)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 20, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: unlocked ? COLORS.green : COLORS.yellow, fontSize: 17, fontWeight: 900 }}>
        {iconBubble(Icon || BkIcons.premium, unlocked ? COLORS.green : COLORS.yellow)}
        {title}
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
          Debloquer avec {required}
        </button>
      )}
    </div>
  )
}
