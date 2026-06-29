import { useState } from "react"
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { useStatisticsInsights } from "../hooks/useStatisticsInsights"
import { formatMontant } from "../utils/format"

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  green: "#22C55E",
  cyan: "#23D3D6",
  yellow: "#FCD34D",
  purple: "#A78BFA",
  muted: "#8EA4C5",
  text: "#F8FAFC",
}

const CHART_COLORS = ["#F97316", "#22C55E", "#38BDF8", "#FCD34D", "#A78BFA", "#FB7185"]

function card(extra = {}) {
  return {
    background: `linear-gradient(135deg, ${COLORS.card}, ${COLORS.cardLight})`,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 22,
    padding: 18,
    ...extra,
  }
}

export default function StatisticsPage({
  user,
  transactions = [],
  stats = {},
  byCategory = [],
  isMobile = false,
}) {
  const [period, setPeriod] = useState("month")
  const { loading, insights, advice } = useStatisticsInsights({
    userId: user?.id,
    transactions,
    stats,
    byCategory,
    period,
  })

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        {[0, 1, 2, 3].map(item => (
          <div key={item} style={{ height: 120, borderRadius: 22, background: "rgba(255,255,255,.07)" }} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={card({ padding: isMobile ? 18 : 24 })}>
        <div style={{ color: COLORS.cyan, fontSize: 13, fontWeight: 950, marginBottom: 8 }}>Stats</div>
        <h1 style={{ color: COLORS.text, margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: isMobile ? 32 : 40 }}>
          Mes statistiques
        </h1>
        <p style={{ color: COLORS.muted, margin: "10px 0 0", lineHeight: 1.55 }}>
          Comprends tes habitudes et repère les économies possibles.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["month", "Ce mois-ci"],
          ["lastMonth", "Mois dernier"],
          ["3months", "3 derniers mois"],
          ["6months", "6 derniers mois"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPeriod(id)}
            style={{
              minHeight: 44,
              border: period === id ? `1px solid ${COLORS.accent}` : `1px solid ${COLORS.border}`,
              borderRadius: 999,
              background: period === id ? "rgba(249,115,22,.18)" : "rgba(255,255,255,.05)",
              color: COLORS.text,
              padding: "0 14px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: 14 }}>
        <Metric title="Dépenses" value={formatMontant(insights.monthly.totalExpenses)} color={COLORS.accent} />
        <Metric title="Revenus" value={formatMontant(insights.monthly.revenus)} color={COLORS.green} />
        <Metric title="Reste estimé" value={formatMontant(insights.monthly.remaining)} color={COLORS.cyan} />
        <Metric title="Budget utilisé" value={`${insights.monthly.budgetUse} %`} color={COLORS.yellow} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <CategoriesChart data={insights.categories} />
        <EvolutionChart data={insights.weeklyEvolution} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <CoursesCard courses={insights.courses} />
        <StoresCard stores={insights.stores} />
      </div>

      <ProductsCard products={insights.topProducts} />
      <AdviceCard advice={advice} />
    </div>
  )
}

function Metric({ title, value, color }) {
  return (
    <div style={card()}>
      <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900 }}>{title}</div>
      <div style={{ color, fontSize: 24, fontWeight: 950, marginTop: 7, fontFamily: "'DM Serif Display', serif" }}>{value}</div>
    </div>
  )
}

function CategoriesChart({ data }) {
  return (
    <div style={card()}>
      <h2 style={{ color: COLORS.text, fontSize: 18, margin: "0 0 12px" }}>Catégories</h2>
      {data.length === 0 ? (
        <div style={{ color: COLORS.muted }}>Ajoute des dépenses pour voir la répartition.</div>
      ) : (
        <div>
          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.slice(0, 6)} dataKey="depense" nameKey="label" innerRadius={58} outerRadius={90}>
                  {data.slice(0, 6).map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value, name) => [formatMontant(value), name || "Catégorie"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {data.slice(0, 6).map((row, index) => (
              <div key={row.id || row.label || index} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center", color: COLORS.text, fontSize: 13 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: CHART_COLORS[index % CHART_COLORS.length] }} />
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label || row.id || "Catégorie"}</span>
                <span style={{ color: COLORS.muted, fontWeight: 900 }}>{formatMontant(row.depense)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EvolutionChart({ data }) {
  return (
    <div style={card()}>
      <h2 style={{ color: COLORS.text, fontSize: 18, margin: "0 0 12px" }}>Évolution</h2>
      <div style={{ height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="label" tick={{ fill: COLORS.muted, fontSize: 11 }} />
            <YAxis tick={{ fill: COLORS.muted, fontSize: 11 }} />
            <Tooltip formatter={value => [formatMontant(value), "Dépenses"]} />
            <Bar dataKey="amount" name="Dépenses" fill={COLORS.accent} radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function CoursesCard({ courses }) {
  return (
    <div style={card()}>
      <h2 style={{ color: COLORS.text, fontSize: 18, margin: "0 0 12px" }}>Courses</h2>
      <div style={{ display: "grid", gap: 10, color: COLORS.text, fontWeight: 900 }}>
        <span>{courses.receiptsCount} tickets</span>
        <span>{courses.productsCount} produits</span>
        <span>Panier moyen : {formatMontant(courses.basketAverage)}</span>
        <span>Produit fréquent : {courses.topProduct?.label || "Pas encore assez de données"}</span>
      </div>
    </div>
  )
}

function StoresCard({ stores }) {
  return (
    <div style={card()}>
      <h2 style={{ color: COLORS.text, fontSize: 18, margin: "0 0 12px" }}>Magasins</h2>
      {stores.length === 0 ? (
        <div style={{ color: COLORS.muted }}>Scanne un ticket pour voir tes magasins.</div>
      ) : (
        <div style={{ display: "grid", gap: 11 }}>
          {stores.slice(0, 5).map(row => (
            <div key={row.store}>
              <div style={{ display: "flex", justifyContent: "space-between", color: COLORS.text, fontWeight: 900, fontSize: 13 }}>
                <span>{row.store}</span>
                <span>{row.percent} %</span>
              </div>
              <div style={{ height: 8, background: "rgba(255,255,255,.12)", borderRadius: 99, marginTop: 6, overflow: "hidden" }}>
                <div style={{ width: `${row.percent}%`, height: "100%", background: COLORS.cyan, borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProductsCard({ products }) {
  return (
    <div style={card()}>
      <h2 style={{ color: COLORS.text, fontSize: 18, margin: "0 0 12px" }}>Produits fréquents</h2>
      {products.length === 0 ? (
        <div style={{ color: COLORS.muted }}>Les produits fréquents apparaîtront après quelques courses analysées.</div>
      ) : (
        <div style={{ display: "grid", gap: 9 }}>
          {products.map(product => (
            <div key={product.normalizedName} style={{ display: "flex", justifyContent: "space-between", color: COLORS.text, borderBottom: "1px solid rgba(255,255,255,.08)", paddingBottom: 8 }}>
              <strong>{product.label}</strong>
              <span>{product.purchaseCount} achats</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AdviceCard({ advice }) {
  return (
    <div style={card()}>
      <h2 style={{ color: COLORS.text, fontSize: 18, margin: "0 0 12px" }}>Conseils automatiques V1</h2>
      <div style={{ display: "grid", gap: 9 }}>
        {advice.map((item, index) => (
          <div key={`${item}-${index}`} style={{ color: COLORS.whiteSoft, lineHeight: 1.5 }}>
            • {item}
          </div>
        ))}
      </div>
    </div>
  )
}
