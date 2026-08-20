import { useState } from "react"
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { useStatisticsInsights } from "../hooks/useStatisticsInsights"
import { formatMontant } from "../utils/format"
import { useTheme } from "../styles/ThemeProvider"

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

function getStatisticsColors(tokens) {
  return {
    bg: tokens.background,
    card: tokens.card,
    surface: tokens.surfaceSecondary,
    selected: tokens.selectedSurface,
    border: tokens.border,
    borderSubtle: tokens.borderSubtle,
    accent: tokens.primary,
    cyan: tokens.cyan,
    green: tokens.success,
    yellow: tokens.warning,
    text: tokens.textPrimary,
    muted: tokens.textSecondary,
    peachSoft: tokens.peachSoft || tokens.primarySoft,
    sageSoft: tokens.sageSoft || tokens.successSoft,
    creamSoft: tokens.creamSoft || tokens.warningSoft,
    pastelBlue: tokens.blueSoftPastel || tokens.infoSoft,
    progressTrack: tokens.progressTrack,
    shadow: tokens.shadow,
  }
}

function card(colors, extra = {}) {
  return {
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 22,
    padding: 18,
    boxShadow: colors.shadow,
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
  const { themeName, tokens } = useTheme()
  const colors = getStatisticsColors(tokens)
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
          <div key={item} style={{ height: 120, borderRadius: 22, background: colors.surface, border: `1px solid ${colors.border}` }} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={card(colors, {
        padding: isMobile ? 18 : 24,
        background: themeName === "dark"
          ? `linear-gradient(135deg, ${colors.bg} 0%, ${colors.card} 68%, ${colors.surface} 100%)`
          : `linear-gradient(135deg, ${colors.pastelBlue} 0%, ${colors.card} 78%)`,
        borderColor: `${colors.cyan}44`,
      })}>
        <div style={{ color: colors.cyan, fontSize: 13, fontWeight: 950, marginBottom: 8 }}>Stats</div>
        <h1 style={{ color: colors.text, margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: isMobile ? 32 : 40 }}>
          {txt.title}
        </h1>
        <p style={{ color: colors.muted, margin: "10px 0 0", lineHeight: 1.55 }}>
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
              border: period === id ? `1px solid ${colors.accent}` : `1px solid ${colors.border}`,
              borderRadius: 999,
              background: period === id ? colors.selected : colors.card,
              color: colors.text,
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
        <Metric colors={colors} title={txt.expenses} value={formatMontant(insights.monthly.totalExpenses)} color={colors.accent} background={colors.peachSoft} />
        <Metric colors={colors} title={txt.income} value={formatMontant(insights.monthly.revenus)} color={colors.green} background={colors.sageSoft} />
        <Metric colors={colors} title={txt.remaining} value={formatMontant(insights.monthly.remaining)} color={colors.cyan} background={colors.pastelBlue} />
        <Metric colors={colors} title={txt.budgetUse} value={`${insights.monthly.budgetUse} %`} color={colors.yellow} background={colors.creamSoft} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <CategoriesChart colors={colors} data={insights.categories} txt={txt} isKreol={isKreol} />
        <EvolutionChart colors={colors} data={insights.weeklyEvolution} txt={txt} isKreol={isKreol} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <CoursesCard colors={colors} courses={insights.courses} txt={txt} />
        <StoresCard colors={colors} stores={insights.stores} txt={txt} />
      </div>

      <ProductsCard colors={colors} products={insights.topProducts} txt={txt} />
      <AdviceCard colors={colors} advice={advice} txt={txt} />
    </div>
  )
}

function Metric({ colors, title, value, color, background }) {
  return (
    <div style={card(colors, { background: background || colors.card, borderColor: `${color}33` })}>
      <div style={{ color: colors.muted, fontSize: 12, fontWeight: 900 }}>{title}</div>
      <div style={{ color, fontSize: 24, fontWeight: 950, marginTop: 7, fontFamily: "'DM Serif Display', serif" }}>{value}</div>
    </div>
  )
}

function CategoriesChart({ colors, data, txt, isKreol }) {
  return (
    <div style={card(colors)}>
      <h2 style={{ color: colors.text, fontSize: 18, margin: "0 0 12px" }}>{txt.categories}</h2>
      {data.length === 0 ? (
        <div style={{ color: colors.muted }}>{txt.noCategories}</div>
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
              <div key={row.id || row.label || index} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center", color: colors.text, fontSize: 13 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: getCategoryColor(row.id || row.category || row.label, index) }} />
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getCategoryLabel(row.id || row.category || row.label, isKreol)}</span>
                <span style={{ color: colors.muted, fontWeight: 900 }}>{formatMontant(row.depense)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EvolutionChart({ colors, data, txt, isKreol }) {
  const categoryKeys = Array.from(new Set((data || []).flatMap(row => row.allCategoryKeys || row.categoryKeys || [])))
  const keys = categoryKeys.length ? categoryKeys : ["divers"]

  return (
    <div style={card(colors)}>
      <h2 style={{ color: colors.text, fontSize: 18, margin: "0 0 12px" }}>{txt.evolution}</h2>
      <div style={{ height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="label" tick={{ fill: colors.muted, fontSize: 11 }} />
            <YAxis tick={{ fill: colors.muted, fontSize: 11 }} />
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

function CoursesCard({ colors, courses, txt }) {
  return (
    <div style={card(colors)}>
      <h2 style={{ color: colors.text, fontSize: 18, margin: "0 0 12px" }}>{txt.courses}</h2>
      <div style={{ display: "grid", gap: 10, color: colors.text, fontWeight: 900 }}>
        <span>{pluralize(courses.receiptsCount, "ticket", "tickets")}</span>
        <span>{pluralize(courses.productsCount, "produit", "produits")}</span>
        <span>{txt.basketAverage} : {formatMontant(courses.basketAverage)}</span>
        <span>{txt.topProduct} : {courses.topProduct?.label || txt.notEnoughData}</span>
      </div>
    </div>
  )
}

function StoresCard({ colors, stores, txt }) {
  return (
    <div style={card(colors)}>
      <h2 style={{ color: colors.text, fontSize: 18, margin: "0 0 12px" }}>{txt.stores}</h2>
      {stores.length === 0 ? (
        <div style={{ color: colors.muted }}>{txt.noStores}</div>
      ) : (
        <div style={{ display: "grid", gap: 11 }}>
          {stores.slice(0, 5).map(row => (
            <div key={row.store}>
              <div style={{ display: "flex", justifyContent: "space-between", color: colors.text, fontWeight: 900, fontSize: 13 }}>
                <span>{row.store}</span>
                <span>{row.percent} %</span>
              </div>
              <div style={{ height: 8, background: colors.progressTrack, borderRadius: 99, marginTop: 6, overflow: "hidden" }}>
                <div style={{ width: `${row.percent}%`, height: "100%", background: colors.cyan, borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProductsCard({ colors, products, txt }) {
  const { products: preciseProducts, departments } = splitProductRows(products)

  return (
    <div style={card(colors)}>
      <h2 style={{ color: colors.text, fontSize: 18, margin: "0 0 12px" }}>{txt.frequentProducts}</h2>
      {preciseProducts.length === 0 ? (
        <div style={{ color: colors.muted }}>{txt.noProducts}</div>
      ) : (
        <div style={{ display: "grid", gap: 9 }}>
          {preciseProducts.map(product => (
            <div key={product.normalizedName} style={{ display: "flex", justifyContent: "space-between", color: colors.text, borderBottom: `1px solid ${colors.borderSubtle}`, paddingBottom: 8 }}>
              <strong>{product.label}</strong>
              <span>{pluralize(product.purchaseCount, "achat", "achats")}</span>
            </div>
          ))}
        </div>
      )}

      {departments.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3 style={{ color: colors.yellow, fontSize: 16, margin: "0 0 10px" }}>{txt.frequentDepartments || "Rayons fréquents"}</h3>
          <div style={{ display: "grid", gap: 9 }}>
            {departments.map(product => (
              <div key={product.normalizedName} style={{ display: "flex", justifyContent: "space-between", color: colors.text, borderBottom: `1px solid ${colors.borderSubtle}`, paddingBottom: 8 }}>
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

function AdviceCard({ colors, advice, txt }) {
  return (
    <div style={card(colors)}>
      <h2 style={{ color: colors.text, fontSize: 18, margin: "0 0 12px" }}>{txt.advice}</h2>
      <div style={{ display: "grid", gap: 9 }}>
        {advice.map((item, index) => (
          <div key={`${item}-${index}`} style={{ color: colors.text, lineHeight: 1.5 }}>
            - {item}
          </div>
        ))}
      </div>
    </div>
  )
}
