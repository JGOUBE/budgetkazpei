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

const CATEGORY_COLORS = {
  logement: "#F97316",
  alimentaire: "#22C55E",
  energie: "#38BDF8",
  loisirs: "#FCD34D",
  transport: "#A78BFA",
  divers: "#FB7185",
  sante: "#23D3D6",
}

const CHART_COLORS = ["#22C55E", "#F97316", "#38BDF8", "#FCD34D", "#A78BFA", "#FB7185"]

const TEXT = {
  fr: {
    title: "Mes statistiques",
    subtitle: "Comprends tes habitudes et repère les économies possibles.",
    periods: {
      month: "Ce mois-ci",
      lastMonth: "Mois dernier",
      "3months": "3 derniers mois",
      "6months": "6 derniers mois",
    },
    expenses: "Dépenses",
    income: "Revenus",
    remaining: "Reste estimé",
    budgetUse: "Budget utilisé",
    categories: "Catégories",
    noCategories: "Ajoute des dépenses pour voir la répartition.",
    evolution: "Évolution",
    courses: "Courses",
    tickets: "tickets",
    products: "produits",
    basketAverage: "Panier moyen",
    topProduct: "Produit fréquent",
    notEnoughData: "Pas encore assez de données",
    stores: "Magasins",
    noStores: "Scanne un ticket pour voir tes magasins.",
    frequentProducts: "Produits fréquents",
    noProducts: "Les produits fréquents apparaîtront après quelques courses analysées.",
    purchases: "achats",
    advice: "Conseils automatiques V1",
    categoryFallback: "Catégorie",
  },
  kreol: {
    title: "Mes stats",
    subtitle: "Comprann out labitid ek trouvé kot ou pé fé lékonomi.",
    periods: {
      month: "Mwa-la",
      lastMonth: "Mwa dernier",
      "3months": "3 derniers mwa",
      "6months": "6 derniers mwa",
    },
    expenses: "Dépans",
    income: "Revenus",
    remaining: "Larzan i reste",
    budgetUse: "Bidzé utilisé",
    categories: "Kategori",
    noCategories: "Azout dépans pou vwar répartition.",
    evolution: "Évolisyon",
    courses: "Courses",
    tickets: "tike",
    products: "produits",
    basketAverage: "Panier moyen",
    topProduct: "Produit i revient souvent",
    notEnoughData: "Pankor assez donné",
    stores: "Magasins",
    noStores: "Scanne in tiké pou vwar out magasins.",
    frequentProducts: "Produits i revient souvent",
    frequentDepartments: "Rayons i revient souvent",
    noProducts: "Bann produits i revient souvent va apparèt apré quelques courses analysées.",
    purchases: "achats",
    advice: "Konsey otomatik V1",
    categoryFallback: "Kategori",
  },
}

const CATEGORY_LABELS = {
  fr: {
    alimentaire: "Alimentaire",
    logement: "Logement",
    energie: "Énergie",
    loisirs: "Loisirs",
    transport: "Transport",
    divers: "Divers",
    sante: "Santé",
  },
  kreol: {
    alimentaire: "Manzé",
    logement: "Kaz",
    energie: "Kouran / Dilo",
    loisirs: "Amizman",
    transport: "Transport",
    divers: "Lot dépans",
    sante: "Lasante",
  },
}

function isKreolLanguage(language = "fr") {
  return ["cr", "kreol", "kr"].includes(String(language || "").toLowerCase())
}

function normalizeCategoryId(value = "") {
  const clean = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (clean.includes("aliment") || clean.includes("course")) return "alimentaire"
  if (clean.includes("logement") || clean.includes("loyer")) return "logement"
  if (clean.includes("energie") || clean.includes("electricite") || clean.includes("eau")) return "energie"
  if (clean.includes("loisir")) return "loisirs"
  if (clean.includes("transport") || clean.includes("essence")) return "transport"
  if (clean.includes("sante")) return "sante"
  return clean || "divers"
}

function getCategoryColor(category, index = 0) {
  return CATEGORY_COLORS[normalizeCategoryId(category)] || CHART_COLORS[index % CHART_COLORS.length]
}

function getCategoryLabel(category = "", isKreol = false) {
  const key = normalizeCategoryId(category)
  return (isKreol ? CATEGORY_LABELS.kreol : CATEGORY_LABELS.fr)[key] || String(category || (isKreol ? TEXT.kreol.categoryFallback : TEXT.fr.categoryFallback))
}

function card(extra = {}) {
  return {
    background: `linear-gradient(135deg, ${COLORS.card}, ${COLORS.cardLight})`,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 22,
    padding: 18,
    ...extra,
  }
}

function pluralize(count, singular, plural) {
  return `${Number(count || 0)} ${Number(count || 0) > 1 ? plural : singular}`
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

export default function StatisticsPage({
  user,
  transactions = [],
  stats = {},
  byCategory = [],
  isMobile = false,
  language = "fr",
}) {
  const isKreol = isKreolLanguage(language)
  const txt = isKreol ? TEXT.kreol : TEXT.fr
  const [period, setPeriod] = useState("month")
  const { loading, insights, advice } = useStatisticsInsights({
    userId: user?.id,
    transactions,
    stats,
    byCategory,
    period,
    language,
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
          {txt.title}
        </h1>
        <p style={{ color: COLORS.muted, margin: "10px 0 0", lineHeight: 1.55 }}>
          {txt.subtitle}
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {Object.entries(txt.periods).map(([id, label]) => (
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
        <Metric title={txt.expenses} value={formatMontant(insights.monthly.totalExpenses)} color={COLORS.accent} />
        <Metric title={txt.income} value={formatMontant(insights.monthly.revenus)} color={COLORS.green} />
        <Metric title={txt.remaining} value={formatMontant(insights.monthly.remaining)} color={COLORS.cyan} />
        <Metric title={txt.budgetUse} value={`${insights.monthly.budgetUse} %`} color={COLORS.yellow} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <CategoriesChart data={insights.categories} txt={txt} isKreol={isKreol} />
        <EvolutionChart data={insights.weeklyEvolution} txt={txt} isKreol={isKreol} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <CoursesCard courses={insights.courses} txt={txt} />
        <StoresCard stores={insights.stores} txt={txt} />
      </div>

      <ProductsCard products={insights.topProducts} txt={txt} />
      <AdviceCard advice={advice} txt={txt} />
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

function CategoriesChart({ data, txt, isKreol }) {
  return (
    <div style={card()}>
      <h2 style={{ color: COLORS.text, fontSize: 18, margin: "0 0 12px" }}>{txt.categories}</h2>
      {data.length === 0 ? (
        <div style={{ color: COLORS.muted }}>{txt.noCategories}</div>
      ) : (
        <div>
          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.slice(0, 6)} dataKey="depense" nameKey="id" innerRadius={58} outerRadius={90}>
                  {data.slice(0, 6).map((row, index) => <Cell key={index} fill={getCategoryColor(row.id || row.category || row.label, index)} />)}
                </Pie>
                <Tooltip formatter={(value, name) => [formatMontant(value), getCategoryLabel(name, isKreol)]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {data.slice(0, 6).map((row, index) => (
              <div key={row.id || row.label || index} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center", color: COLORS.text, fontSize: 13 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: getCategoryColor(row.id || row.category || row.label, index) }} />
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getCategoryLabel(row.id || row.category || row.label, isKreol)}</span>
                <span style={{ color: COLORS.muted, fontWeight: 900 }}>{formatMontant(row.depense)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EvolutionChart({ data, txt, isKreol }) {
  const categoryKeys = Array.from(new Set((data || []).flatMap(row => row.allCategoryKeys || row.categoryKeys || [])))
  const keys = categoryKeys.length ? categoryKeys : ["divers"]

  return (
    <div style={card()}>
      <h2 style={{ color: COLORS.text, fontSize: 18, margin: "0 0 12px" }}>{txt.evolution}</h2>
      <div style={{ height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="label" tick={{ fill: COLORS.muted, fontSize: 11 }} />
            <YAxis tick={{ fill: COLORS.muted, fontSize: 11 }} />
            <Tooltip formatter={(value, name) => [formatMontant(value), getCategoryLabel(name, isKreol)]} />
            {keys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                name={getCategoryLabel(key, isKreol)}
                stackId="categories"
                fill={getCategoryColor(key, index)}
                radius={index === keys.length - 1 ? [8, 8, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function CoursesCard({ courses, txt }) {
  return (
    <div style={card()}>
      <h2 style={{ color: COLORS.text, fontSize: 18, margin: "0 0 12px" }}>{txt.courses}</h2>
      <div style={{ display: "grid", gap: 10, color: COLORS.text, fontWeight: 900 }}>
        <span>{pluralize(courses.receiptsCount, "ticket", "tickets")}</span>
        <span>{pluralize(courses.productsCount, "produit", "produits")}</span>
        <span>{txt.basketAverage} : {formatMontant(courses.basketAverage)}</span>
        <span>{txt.topProduct} : {courses.topProduct?.label || txt.notEnoughData}</span>
      </div>
    </div>
  )
}

function StoresCard({ stores, txt }) {
  return (
    <div style={card()}>
      <h2 style={{ color: COLORS.text, fontSize: 18, margin: "0 0 12px" }}>{txt.stores}</h2>
      {stores.length === 0 ? (
        <div style={{ color: COLORS.muted }}>{txt.noStores}</div>
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

function ProductsCard({ products, txt }) {
  const { products: preciseProducts, departments } = splitProductRows(products)

  return (
    <div style={card()}>
      <h2 style={{ color: COLORS.text, fontSize: 18, margin: "0 0 12px" }}>{txt.frequentProducts}</h2>
      {preciseProducts.length === 0 ? (
        <div style={{ color: COLORS.muted }}>{txt.noProducts}</div>
      ) : (
        <div style={{ display: "grid", gap: 9 }}>
          {preciseProducts.map(product => (
            <div key={product.normalizedName} style={{ display: "flex", justifyContent: "space-between", color: COLORS.text, borderBottom: "1px solid rgba(255,255,255,.08)", paddingBottom: 8 }}>
              <strong>{product.label}</strong>
              <span>{pluralize(product.purchaseCount, "achat", "achats")}</span>
            </div>
          ))}
        </div>
      )}

      {departments.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3 style={{ color: COLORS.yellow, fontSize: 16, margin: "0 0 10px" }}>{txt.frequentDepartments || "Rayons fréquents"}</h3>
          <div style={{ display: "grid", gap: 9 }}>
            {departments.map(product => (
              <div key={product.normalizedName} style={{ display: "flex", justifyContent: "space-between", color: COLORS.text, borderBottom: "1px solid rgba(255,255,255,.08)", paddingBottom: 8 }}>
                <strong>{product.label}</strong>
                <span>{pluralize(product.purchaseCount, "achat", "achats")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AdviceCard({ advice, txt }) {
  return (
    <div style={card()}>
      <h2 style={{ color: COLORS.text, fontSize: 18, margin: "0 0 12px" }}>{txt.advice}</h2>
      <div style={{ display: "grid", gap: 9 }}>
        {advice.map((item, index) => (
          <div key={`${item}-${index}`} style={{ color: COLORS.text, lineHeight: 1.5 }}>
            - {item}
          </div>
        ))}
      </div>
    </div>
  )
}
