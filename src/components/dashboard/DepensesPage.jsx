import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { formatMontant } from "../../utils/format"
import { BkIcons } from "../icons-budgetkazpei"
import { createColorAliases } from "../../styles/designSystem"
import { useTheme } from "../../styles/ThemeProvider"

const COLORS = createColorAliases()

const CHART_COLORS = ["#22C55E", "#38BDF8", "#FCD34D", "#A78BFA", "#FB7185", "#23D3D6", "#F97316"]

const CATEGORY_LABELS = {
  fr: {
    alimentaire: "Alimentaire",
    logement: "Logement",
    transport: "Transport",
    energie: "Energie",
    telecom: "Telecom",
    assurances: "Assurances",
    sante: "Sante",
    loisirs: "Loisirs",
    divers: "Divers",
  },
  kreol: {
    alimentaire: "Manze",
    logement: "Kaz",
    transport: "Transport",
    energie: "Kouran / Dilo",
    telecom: "Telefon / Internet",
    assurances: "Lasirans",
    sante: "Lasante",
    loisirs: "Amizman",
    divers: "Lot depans",
  },
}

function getIsKreol(t) {
  const lang = String(t?.lang || "").toLowerCase()
  if (lang === "cr" || lang === "kreol") return true
  return String(t?.("nav", "dashboard") || "").toLowerCase().includes("tablo")
}

function moneyValue(value) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}

function normalizeCategoryId(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function categoryLabel(value = "", isKreol = false) {
  const key = normalizeCategoryId(value)
  return (isKreol ? CATEGORY_LABELS.kreol : CATEGORY_LABELS.fr)[key] || String(value || (isKreol ? "Kategori" : "Categorie"))
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
  useTheme()
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
            name: categoryLabel(cat.id || cat.category || cat.label, isKreol),
            value: moneyValue(cat.depense),
          }))

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          background: `linear-gradient(135deg, rgba(249,115,22,.10) 0%, rgba(249,115,22,.03) 42%, transparent 72%), ${COLORS.card}`,
          border: `1px solid ${COLORS.accent}33`,
          borderRadius: 22,
          padding: 24,
          boxShadow: COLORS.shadow,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {iconBubble(BkIcons.depenses, COLORS.accent)}
          <div>
            <div style={{ color: COLORS.text, fontSize: 30, fontWeight: 900, fontFamily: "'DM Serif Display', serif" }}>
              {isKreol ? "Depans mwa-la" : "Depenses du mois"}
            </div>
            <div style={{ color: COLORS.muted, marginTop: 6, fontSize: 14, lineHeight: 1.5, fontWeight: 750 }}>
              {isKreol ? "Retrouv ici koman out larzan i sorte, dernieres depans ek suivi par kategori."
                : "Retrouvez ici la repartition, les dernieres transactions et les budgets par categorie."}
            </div>
          </div>
        </div>

        <div style={{ color: COLORS.accent, marginTop: 18, fontSize: 44, fontWeight: 950, fontFamily: "'DM Serif Display', serif" }}>
          {formatMontant(depenses)}
        </div>
        <div style={{ color: COLORS.muted, fontSize: 13, fontWeight: 850 }}>
          {ratio} % {isKreol ? "out revenus" : "des revenus"}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 18,
          alignItems: "start",
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
        title={isKreol ? "Alert bidze" : "Alertes budget"}
        text={isKreol ? "Recevoir alert kan ou arrive a 80 %, 100 % ek kan ou depasse." : "Recevoir des alertes a 80 %, 100 % et en cas de depassement."}
        required="Premium"
        onGoPremium={onGoPremium}
        Icon={BkIcons.alert}
      />

      <LockedCard
        unlocked={isPremium}
        title={isKreol ? "Export PDF" : "Export PDF"}
        text={isKreol ? "Exporter out depans ou out mwa complet en PDF." : "Exporter vos depenses ou le mois complet en PDF."}
        required="Premium"
        onGoPremium={onGoPremium}
        Icon={BkIcons.receipts}
      />

      <LockedCard
        unlocked={isPremiumPlus}
        title={isKreol ? "Analiz bidze avance" : "Analyse budgetaire avancee"}
        text={isKreol ? "Detecte bann kategori problematik, depans trop for ek potentiel lekonomi." : "Detecter les categories problematiques, depenses excessives et potentiels d'economies."}
        required="Premium+"
        onGoPremium={onGoPremium}
        Icon={BkIcons.stats}
      />

      <LockedCard
        unlocked={isPremiumPlus}
        title={isKreol ? "Courses intelligentes" : "Courses intelligentes"}
        text={isKreol ? "Analiz manze, panier, bidze conseille ek konsey pou fer lekonomi." : "Analyse alimentaire, panier, budget recommande et conseils d'economies."}
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
        {isKreol ? "Koman depans i reparti" : "Repartition des depenses"}
      </div>

      {safeData.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>{isKreol ? "Nana pa depans anrezistree." : "Aucune depense enregistree."}</div>
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
                <Tooltip
                  formatter={value => formatMontant(value)}
                  contentStyle={{
                    background: COLORS.card,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 12,
                    color: COLORS.text,
                    boxShadow: COLORS.shadow,
                  }}
                />
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
                      boxShadow: `0 0 0 3px ${COLORS.surface}`,
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
        {isKreol ? "Dernieres depans" : "Dernieres transactions"}
      </div>

      {transactions.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>{isKreol ? "Nana pa depans resan." : "Aucune depense recente."}</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {transactions.map(tx => (
            <div
              key={tx.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                background: COLORS.row,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 14,
                padding: "11px 12px",
                boxShadow: "0 6px 16px rgba(15,23,42,.035)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ color: COLORS.text, fontWeight: 900, fontSize: 13 }}>
                  {tx.label || tx.nom || (isKreol ? "Depans" : "Depense")}
                </div>
                <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 3 }}>
                  {tx.date || "-"}
                </div>
              </div>
              <strong style={{ color: COLORS.red, flexShrink: 0, fontSize: 14 }}>
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
        {isKreol ? "Bidze par kategori" : "Budgets par categorie"}
      </div>

      {safeByCategory.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 13 }}>{isKreol ? "Nana pa bidze par kategori." : "Aucun budget par categorie."}</div>
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
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{categoryLabel(cat.id || cat.category || cat.label, isKreol)}</span>
                  </span>
                  <span style={{ color: over ? COLORS.red : COLORS.muted, flexShrink: 0 }}>
                    {formatMontant(depense)} / {formatMontant(budget)}
                  </span>
                </div>
                <div style={{ height: 8, background: COLORS.progressTrack, borderRadius: 999, overflow: "hidden", marginTop: 7 }}>
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
    <div
      style={{
        background: unlocked ? COLORS.greenSoft : COLORS.card,
        border: `1px solid ${unlocked ? `${COLORS.green}33` : COLORS.border}`,
        borderRadius: 20,
        padding: 20,
        boxShadow: "0 8px 22px rgba(15,23,42,.04)",
      }}
    >
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
            background: COLORS.yellowSoft,
            border: `1px solid ${COLORS.yellow}44`,
            color: COLORS.text,
            borderRadius: 12,
            padding: "10px 13px",
            cursor: "pointer",
            fontWeight: 900,
            fontFamily: "inherit",
          }}
        >
          {required === "Premium+" ? "Premium+" : required}
        </button>
      )}
    </div>
  )
}
