import { useEffect, useMemo, useState } from "react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { formatMontant } from "../../../utils/format"
import { buildProductStats, buildStoreHabits, buildTopProducts } from "../services/priceHistory"
import { buildHabitSuggestions } from "../services/habitAdvice"
import HabitAdviceCard from "../components/HabitAdviceCard"
import FamilyHabitsCard from "../components/FamilyHabitsCard"
import { buildShoppingHabitFamilies } from "../services/shoppingHabitFamilies"
import { listShoppingItems } from "../services/shoppingEngine"
import { createColorAliases } from "../../../styles/designSystem"

const COLORS = createColorAliases()

const CHART_COLORS = ["#F97316", "#22C55E", "#38BDF8", "#FCD34D", "#A78BFA", "#FB7185"]

function getIsKreol(t) {
  const lang = String(t?.lang || "").toLowerCase()
  if (lang === "cr" || lang === "kreol") return true
  return String(t?.("nav", "dashboard") || "").toLowerCase().includes("tablo")
}

function cardStyle(extra = {}) {
  return {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 22,
    padding: 18,
    boxShadow: COLORS.shadow,
    ...extra,
  }
}

function formatPurchaseCount(count, isKreol = false) {
  const safeCount = Number(count || 0)
  if (isKreol) return `${safeCount} ${safeCount > 1 ? "achats" : "achat"}`
  return `${safeCount} ${safeCount > 1 ? "achats" : "achat"}`
}

function normalizeLabel(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const DEPARTMENT_PRODUCT_PATTERNS = [
  "boucherie coupe",
  "charcuterie ls",
  "cremerie",
  "epicerie sucree",
  "epicerie salee",
  "boissons sans alcool",
  "ultra frais",
  "fleurs plantes fruits legumes",
  "fruits legumes",
  "sous traitance",
  "ppi",
]

function isDepartmentLikeProduct(product = {}) {
  const label = normalizeLabel(product.label || product.name || product.normalizedName)
  if (!label) return false
  return DEPARTMENT_PRODUCT_PATTERNS.some(pattern => label === pattern || label.includes(pattern))
}

function splitProductRows(products = []) {
  return products.reduce(
    (acc, product) => {
      if (isDepartmentLikeProduct(product)) acc.departments.push(product)
      else acc.products.push(product)
      return acc
    },
    { products: [], departments: [] },
  )
}

function getHistoryDate(item = {}) {
  const raw = item.created_at || item.purchase_date || item.date || item.scanned_at || ""
  const date = raw ? new Date(raw) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function getHistoryDaysSpan(history = []) {
  const dates = history.map(getHistoryDate).filter(Boolean).map(date => date.getTime())
  if (dates.length < 2) return 0
  const min = Math.min(...dates)
  const max = Math.max(...dates)
  return Math.ceil((max - min) / 86400000)
}

function shouldShowMonthlyProjection(stats = {}) {
  const purchaseCount = Number(stats.purchaseCount || 0)
  const daysSpan = getHistoryDaysSpan(stats.history || [])
  const estimate = Number(stats.monthlySpendEstimate || 0)
  // A few purchases across a short period do not establish a monthly habit.
  return purchaseCount >= 5 && daysSpan >= 60 && estimate >= 1
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
        const rows = await listShoppingItems({ userId: user?.id })
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
  const topProducts = useMemo(() => buildTopProducts(items, items.length), [items])
  const familyHabits = useMemo(() => buildShoppingHabitFamilies(items), [items])
  const productRows = useMemo(() => splitProductRows(topProducts), [topProducts])
  const habitSuggestions = useMemo(() => buildHabitSuggestions(items), [items])
  const currentSelectedProduct = selectedProduct
    || productRows.products[0]?.normalizedName
    || ""
  const selectedStats = useMemo(() => {
    return currentSelectedProduct ? buildProductStats(items, currentSelectedProduct) : null
  }, [items, currentSelectedProduct])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={cardStyle({ padding: isMobile ? 18 : 24 })}>
        <div style={{ color: COLORS.cyan, fontSize: 13, fontWeight: 950, marginBottom: 8 }}>
          {isKreol ? "Mes labitid courses" : "Mes habitudes"}
        </div>
        <h2 style={{ margin: 0, color: COLORS.text, fontFamily: "'DM Serif Display', serif", fontSize: isMobile ? 30 : 38, fontWeight: 400 }}>
          {isKreol ? "Courses intelligentes" : "Courses intelligentes"}
        </h2>
        <p style={{ color: COLORS.muted, margin: "10px 0 0", lineHeight: 1.55 }}>
          {isKreol ? "BudgetKazPéi i analiz bann tiké validé pou montre out magazin ek bann produits ou achète souvent."
            : "BudgetKazPéi analyse les tickets validés pour suivre vos magasins et produits récurrents."}
        </p>
      </div>

      {loading ? (
        <SkeletonGrid />
      ) : items.length === 0 ? (
        <div style={cardStyle()}>
          <div style={{ color: COLORS.text, fontWeight: 950 }}>
            {isKreol ? "Nana poin donné courses pou linstan." : "Aucune donnée courses pour le moment."}
          </div>
          <div style={{ color: COLORS.muted, marginTop: 8, lineHeight: 1.5 }}>
            {isKreol ? "Eskane ek valide in tiké pou komans vwar out labitid."
              : "Scannez puis validez un ticket pour commencer à voir vos habitudes."}
          </div>
        </div>
      ) : (
        <>
          <HabitAdviceCard suggestions={habitSuggestions} isKreol={isKreol} />

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <StoreHabitsCard data={storeHabits} isKreol={isKreol} />
            <ProductStatsCard stats={selectedStats} isKreol={isKreol} />
          </div>

          <FamilyHabitsCard families={familyHabits} isKreol={isKreol} />

          <TopProductsCard
            products={productRows.products}
            selectedProduct={currentSelectedProduct}
            setSelectedProduct={setSelectedProduct}
            isKreol={isKreol}
          />
        </>
      )}
    </div>
  )
}

function StoreHabitsCard({ data, isKreol }) {
  return (
    <div style={cardStyle()}>
      <div style={{ color: COLORS.text, fontSize: 18, fontWeight: 950, marginBottom: 12 }}>
        {isKreol ? "Ousa ou achète le plis" : "Où j’achète le plus"}
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
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 999, background: CHART_COLORS[index % CHART_COLORS.length], display: "inline-block" }} />{row.store}</span>
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
      <div style={{ marginTop: 14, color: COLORS.text, lineHeight: 1.5 }}>
        <div style={{ fontSize: 14, fontWeight: 750 }}>
          {isKreol ? "Su out tickets" : "Sur vos tickets"} :{" "}
          {stats.purchaseCount} {isKreol ? "achats relevés" : "achats relevés"} ·{" "}
          <strong style={{ color: COLORS.accent }}>{formatMontant(stats.totalSpent)} {isKreol ? "au total" : "au total"}</strong>
        </div>
        {shouldShowMonthlyProjection(stats) ? (
          <>
            <p style={{ margin: "7px 0 0", fontSize: 13, fontWeight: 550, color: COLORS.text }}>
              {isKreol ? "À ce rythme, sa produit-la pourrait coûter environ" : "À ce rythme, ce produit pourrait représenter environ"}{" "}
              <strong style={{ color: COLORS.accent }}>{formatMontant(Math.round(stats.monthlySpendEstimate))}/mois</strong>.
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 11, fontWeight: 450, color: COLORS.muted }}>
              {isKreol ? "Estimasyon indicative selon out tickets, pa in dépense garantie." : "Estimation indicative à partir de vos tickets, pas une dépense certaine."}
            </p>
          </>
        ) : (
          <p style={{ margin: "5px 0 0", fontSize: 12, fontWeight: 450, color: COLORS.muted }}>
            {isKreol ? "Plus de tickets va aider à estimer in rythme par mois." : "Avec davantage de tickets, une estimation mensuelle pourra être proposée."}
          </p>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, color }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 12 }}>
      <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900 }}>{label}</div>
      <div style={{ color, fontSize: 20, fontWeight: 950, marginTop: 5 }}>{value}</div>
    </div>
  )
}

function TopProductsCard({ products, selectedProduct, setSelectedProduct, isKreol }) {
  const [expanded, setExpanded] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const total = products.length
  const visibleProducts = products.slice(
    0,
    expanded ? (showAll ? total : Math.min(20, total)) : 5,
  )

  if (total === 0) return null

  return (
    <section style={cardStyle({ padding: 16 })}>
      <h3 style={{ color: COLORS.text, fontSize: 18, fontWeight: 950, margin: 0 }}>
        {isKreol ? "Bann produits ou achète le plis" : "Mes produits les plus achetés"}
      </h3>
      <p style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.45, margin: "5px 0 12px" }}>
        {isKreol ? "Dapré out tickets · Pri moyen afiché"
          : "Selon vos tickets · Prix moyen affiché"}
      </p>

      <div style={{ display: "grid", gap: 0 }}>
        {visibleProducts.map((product, index) => {
          const active = selectedProduct === product.normalizedName
          return (
            <button
              key={product.normalizedName}
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedProduct(product.normalizedName)}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                alignItems: "center",
                gap: 10,
                minHeight: 48,
                border: "none",
                borderTop: index > 0 ? `1px solid ${COLORS.border}` : "none",
                borderRadius: 8,
                background: active ? COLORS.selected : "transparent",
                color: COLORS.text,
                boxShadow: "none",
                padding: "8px 9px",
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "inherit",
                width: "100%",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <strong style={{
                  display: "block",
                  fontSize: 14,
                  lineHeight: 1.35,
                  fontWeight: 850,
                  overflowWrap: "anywhere",
                }}>
                  {product.label}
                </strong>
                <span style={{ display: "block", color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
                  {formatPurchaseCount(product.purchaseCount, isKreol)}
                </span>
              </span>
              <strong style={{ color: COLORS.cyan, fontSize: 14, whiteSpace: "nowrap", alignSelf: "center" }}>
                {formatMontant(product.averagePrice)}
              </strong>
            </button>
          )
        })}
      </div>

      {total > 5 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(value => !value)
            setShowAll(false)
          }}
          style={{
            display: "block",
            margin: "10px auto 0",
            padding: "9px 14px",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 12,
            background: COLORS.surface,
            color: COLORS.cyan,
            boxShadow: "none",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          {expanded
            ? (isKreol ? "Réduire la liste" : "Réduire la liste")
            : (isKreol
              ? `War lé ${Math.min(20, total)} premiers produits`
              : `Voir les ${Math.min(20, total)} premiers produits`)}
        </button>
      )}
      {expanded && total > 20 && (
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll(value => !value)}
          style={{
            display: "block",
            margin: "8px auto 0",
            padding: "8px 13px",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 11,
            color: COLORS.cyan,
            background: COLORS.surface,
            boxShadow: "none",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {showAll
            ? (isKreol ? "Revenir aux 20 premiers" : "Revenir aux 20 premiers")
            : (isKreol ? `War tou lé ${total} produits` : `Voir tous les ${total} produits`)}
        </button>
      )}
    </section>
  )
}

function SkeletonGrid() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {[0, 1, 2].map(index => (
        <div key={index} style={{ height: 112, borderRadius: 22, background: `linear-gradient(90deg, ${COLORS.surface}, ${COLORS.card}, ${COLORS.surface})`, border: `1px solid ${COLORS.border}` }} />
      ))}
    </div>
  )
}
