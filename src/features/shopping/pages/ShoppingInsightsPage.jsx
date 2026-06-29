import { useEffect, useMemo, useState } from "react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { formatMontant } from "../../../utils/format"
import { buildProductStats, buildStoreHabits, buildTopProducts } from "../services/priceHistory"
import { listShoppingItems } from "../services/shoppingEngine"

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

function getIsKreol(t) {
  return String(t?.("nav", "dashboard") || "").toLowerCase().includes("tablo")
}

function cardStyle(extra = {}) {
  return {
    background: `linear-gradient(135deg, ${COLORS.card}, ${COLORS.cardLight})`,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 22,
    padding: 18,
    ...extra,
  }
}

export default function ShoppingInsightsPage({ user, t, isMobile = false }) {
  const isKreol = getIsKreol(t)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState("")

  useEffect(() => {
    let ignore = false

    async function load() {
      if (!user?.id) {
        setItems([])
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        const rows = await listShoppingItems({ userId: user.id })
        if (!ignore) setItems(rows)
      } catch (error) {
        console.error("Erreur habitudes courses:", error)
        if (!ignore) setItems([])
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    load()

    return () => {
      ignore = true
    }
  }, [user?.id])

  const storeHabits = useMemo(() => buildStoreHabits(items).slice(0, 6), [items])
  const topProducts = useMemo(() => buildTopProducts(items, 20), [items])
  const selectedStats = useMemo(() => {
    const name = selectedProduct || topProducts[0]?.normalizedName || ""
    return name ? buildProductStats(items, name) : null
  }, [items, selectedProduct, topProducts])

  useEffect(() => {
    if (!selectedProduct && topProducts[0]?.normalizedName) {
      setSelectedProduct(topProducts[0].normalizedName)
    }
  }, [selectedProduct, topProducts])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={cardStyle({ padding: isMobile ? 18 : 24 })}>
        <div style={{ color: COLORS.cyan, fontSize: 13, fontWeight: 950, marginBottom: 8 }}>
          {isKreol ? "🛒 Mes labitid courses" : "🛒 Mes habitudes"}
        </div>
        <h1 style={{ margin: 0, color: COLORS.text, fontFamily: "'DM Serif Display', serif", fontSize: isMobile ? 30 : 38 }}>
          {isKreol ? "Courses intelligentes" : "Courses intelligentes"}
        </h1>
        <p style={{ color: COLORS.muted, margin: "10px 0 0", lineHeight: 1.55 }}>
          {isKreol
            ? "BudgetKazPei i analiz bann tiké validé pou montre out magasin ek produits préférés."
            : "BudgetKazPei analyse les tickets validés pour suivre vos magasins et produits récurrents."}
        </p>
      </div>

      {loading ? (
        <SkeletonGrid />
      ) : items.length === 0 ? (
        <div style={cardStyle()}>
          <div style={{ color: COLORS.text, fontWeight: 950 }}>
            {isKreol ? "Nana poin données courses pou linstan." : "Aucune donnée courses pour le moment."}
          </div>
          <div style={{ color: COLORS.muted, marginTop: 8, lineHeight: 1.5 }}>
            {isKreol
              ? "Eskané ek valide in tiké pou komans voir out habitudes."
              : "Scannez puis validez un ticket pour commencer à voir vos habitudes."}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <StoreHabitsCard data={storeHabits} isKreol={isKreol} />
            <ProductStatsCard stats={selectedStats} isKreol={isKreol} />
          </div>

          <TopProductsCard
            products={topProducts}
            selectedProduct={selectedProduct}
            setSelectedProduct={setSelectedProduct}
            isKreol={isKreol}
          />

          {selectedStats && <ProductHistoryCard stats={selectedStats} isKreol={isKreol} />}
        </>
      )}
    </div>
  )
}

function StoreHabitsCard({ data, isKreol }) {
  return (
    <div style={cardStyle()}>
      <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 950, marginBottom: 12 }}>
        {isKreol ? "Ousa ou achète le plis ?" : "Où j'achète le plus ?"}
      </div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="store" innerRadius={58} outerRadius={86} paddingAngle={3}>
              {data.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(_, __, item) => `${item.payload.percent}%`} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {data.map((row, index) => (
          <div key={row.store} style={{ display: "flex", justifyContent: "space-between", color: COLORS.text, fontWeight: 900 }}>
            <span><span style={{ color: CHART_COLORS[index % CHART_COLORS.length] }}>●</span> {row.store}</span>
            <span>{row.percent} %</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProductStatsCard({ stats, isKreol }) {
  if (!stats) return null

  return (
    <div style={cardStyle()}>
      <div style={{ color: COLORS.yellow, fontSize: 13, fontWeight: 950, marginBottom: 8 }}>
        {isKreol ? "Produit suivi" : "Produit suivi"}
      </div>
      <h2 style={{ color: COLORS.text, margin: "0 0 14px", fontSize: 24 }}>{stats.label}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Metric label={isKreol ? "Prix moyen" : "Prix moyen"} value={formatMontant(stats.averagePrice)} color={COLORS.cyan} />
        <Metric label={isKreol ? "Dernier prix" : "Dernier prix"} value={formatMontant(stats.lastPrice)} color={COLORS.green} />
        <Metric label={isKreol ? "Plus bas" : "Plus bas"} value={formatMontant(stats.lowestPrice)} color={COLORS.yellow} />
        <Metric label={isKreol ? "Plus haut" : "Plus haut"} value={formatMontant(stats.highestPrice)} color={COLORS.accent} />
      </div>
      <div style={{ marginTop: 14, color: COLORS.text, fontWeight: 950, lineHeight: 1.45 }}>
        {isKreol
          ? `Ou achète produit-la ${stats.yearlyFrequency} fois par an.`
          : `Vous achetez ce produit ${stats.yearlyFrequency} fois par an.`}
        <br />
        <span style={{ color: COLORS.accent }}>
          {isKreol ? "Dépans estimée" : "Dépense estimée"} : {formatMontant(stats.yearlySpend)}/an
        </span>
      </div>
    </div>
  )
}

function Metric({ label, value, color }) {
  return (
    <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 14, padding: 12 }}>
      <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900 }}>{label}</div>
      <div style={{ color, fontSize: 20, fontWeight: 950, marginTop: 5 }}>{value}</div>
    </div>
  )
}

function TopProductsCard({ products, selectedProduct, setSelectedProduct, isKreol }) {
  return (
    <div style={cardStyle()}>
      <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 950, marginBottom: 12 }}>
        {isKreol ? "Top 20 produits" : "Top 20 produits"}
      </div>
      <div style={{ display: "grid", gap: 9 }}>
        {products.map(product => {
          const active = selectedProduct === product.normalizedName
          return (
            <button key={product.normalizedName} type="button" onClick={() => setSelectedProduct(product.normalizedName)} style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 12,
              minHeight: 56,
              border: active ? `1px solid ${COLORS.accent}` : "1px solid rgba(255,255,255,.09)",
              borderRadius: 14,
              background: active ? "rgba(249,115,22,.12)" : "rgba(255,255,255,.045)",
              color: COLORS.text,
              padding: "10px 12px",
              textAlign: "left",
              cursor: "pointer",
              fontFamily: "inherit",
            }}>
              <span>
                <strong>{product.label}</strong>
                <span style={{ display: "block", color: COLORS.muted, fontSize: 12, marginTop: 3 }}>
                  {product.purchaseCount} achat(s)
                </span>
              </span>
              <strong style={{ color: COLORS.cyan }}>{formatMontant(product.averagePrice)}</strong>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ProductHistoryCard({ stats, isKreol }) {
  return (
    <div style={cardStyle()}>
      <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 950, marginBottom: 12 }}>
        {isKreol ? "Istorik prix" : "Historique"}
      </div>
      <div style={{ display: "grid", gap: 9 }}>
        {stats.history.map(item => (
          <div key={item.id || `${item.store}-${item.created_at}`} style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 12,
            color: COLORS.text,
            borderBottom: "1px solid rgba(255,255,255,.08)",
            paddingBottom: 9,
          }}>
            <span>
              <strong>{item.store || "Magasin"}</strong>
              <span style={{ display: "block", color: COLORS.muted, fontSize: 12, marginTop: 3 }}>
                {item.created_at ? new Date(item.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}
              </span>
            </span>
            <strong style={{ color: COLORS.green }}>{formatMontant(item.priceValue)}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {[0, 1, 2].map(index => (
        <div key={index} style={{ height: 112, borderRadius: 22, background: "linear-gradient(90deg, rgba(255,255,255,.05), rgba(255,255,255,.10), rgba(255,255,255,.05))" }} />
      ))}
    </div>
  )
}
