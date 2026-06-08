import { useState } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { formatAmount, formatMontant } from "../../utils/format"
import TropicalCard, { TROPICAL_VARIANTS } from "./TropicalCard"
import BudgetSettingsModal from "../budgets/BudgetSettingModal"
import { CATEGORIES } from "../../data/categories"

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  accentSoft: "#FB923C",
  green: "#22C55E",
  red: "#EF4444",
  blue: "#38BDF8",
  muted: "#8EA4C5",
  text: "#F8FAFC",
  whiteSoft: "rgba(248,250,252,.82)",
}

function tr(t, section, key, fallback) {
  const value = t?.(section, key)
  return value || fallback
}

function moneyValue(value) {
  return Number(String(value ?? 0).replace(",", ".")) || 0
}


function StatCard({ label, value, sub, color, emoji, actionLabel, onAction, variant, texture }) {
  const theme = TROPICAL_VARIANTS[variant] || TROPICAL_VARIANTS.lagoon

  return (
    <TropicalCard
      variant={variant}
      emoji={emoji}
      texture={texture}
      style={{ minHeight: 132, padding: "18px 20px" }}
      innerStyle={{ paddingLeft: 74 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            color: "rgba(248,250,252,.72)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: "monospace",
            fontWeight: 800,
          }}
        >
          {label}
        </span>
        {actionLabel && (
          <button
            type="button"
            onClick={onAction}
            style={{
              background: "rgba(255,255,255,.09)",
              border: `1px solid ${theme.border}`,
              borderRadius: 999,
              color: theme.accent,
              cursor: "pointer",
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 800,
              fontFamily: "inherit",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>

      <span
        style={{
          display: "block",
          marginTop: 12,
          fontSize: 34,
          fontWeight: 800,
          color: color || theme.accent,
          fontFamily: "'DM Serif Display', Georgia, serif",
          letterSpacing: "-0.8px",
          textShadow: "0 0 20px rgba(255,255,255,.12)",
        }}
      >
        {value}
      </span>
      {sub && <span style={{ display: "block", marginTop: 5, fontSize: 12, color: "rgba(248,250,252,.62)" }}>{sub}</span>}
    </TropicalCard>
  )
}

function DetailItem({ icon, label, value, color, onClick, info }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{
        width: "100%",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid rgba(255,255,255,.08)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        cursor: onClick ? "pointer" : "default",
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      <span style={{ color: COLORS.text, fontSize: 14 }}>
        <span style={{ marginRight: 8 }}>{icon}</span>
        {label}
        {info && <span style={{ marginLeft: 6, color: COLORS.blue, fontWeight: 900 }}>ⓘ</span>}
      </span>
      <strong style={{ color, fontSize: 15 }}>{value}</strong>
    </button>
  )
}

function DetailList({ title, items, emptyText, total, color }) {
  return (
    <div
      style={{
        marginTop: 12,
        background: "rgba(10,22,40,.42)",
        border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 14,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 900, color: COLORS.text, marginBottom: 8 }}>
        {title}
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: COLORS.muted }}>{emptyText}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item, index) => (
            <div
              key={`${item.label}-${index}`}
              style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}
            >
              <span
                style={{
                  color: COLORS.whiteSoft,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.icon ? `${item.icon} ` : ""}
                {item.label}
              </span>
              <strong style={{ color, flexShrink: 0 }}>{formatMontant(item.amount)}</strong>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid rgba(255,255,255,.08)",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13,
          fontWeight: 900,
        }}
      >
        <span style={{ color: COLORS.text }}>Total</span>
        <span style={{ color }}>{formatMontant(total)}</span>
      </div>
    </div>
  )
}

function SoldeDetails({ stats, onClose, t }) {
  return (
    <TropicalCard variant="lagoon" texture="🌴">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <h3 style={{ margin: 0, color: COLORS.text, fontSize: 16 }}>
          {tr(t, "dashboard", "soldeDetailsTitle", "Détail du solde disponible")}
        </h3>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,.07)",
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 999,
            color: COLORS.whiteSoft,
            cursor: "pointer",
            padding: "5px 10px",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          {tr(t, "common", "close", "Fermer")}
        </button>
      </div>

      <DetailItem icon="📊" label={tr(t, "dashboard", "fixedChargesMonth", "Charges fixes ce mois-ci")} value={formatMontant(stats.chargesFixes || 0)} color={COLORS.accentSoft} />
      <DetailItem icon="💰" label={tr(t, "dashboard", "variableExpenses", "Dépenses variables")} value={formatMontant(stats.depensesVariables || 0)} color={COLORS.blue} />
      <DetailItem icon="🎯" label={tr(t, "dashboard", "resteAVivre", "Reste à vivre")} value={formatMontant(stats.resteAVivre || 0)} color={(stats.resteAVivre || 0) >= 0 ? COLORS.green : COLORS.red} />

      <div
        style={{
          marginTop: 14,
          background: "rgba(56,189,248,.10)",
          border: "1px solid rgba(56,189,248,.25)",
          borderRadius: 14,
          padding: "12px 14px",
          color: COLORS.text,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {tr(t, "dashboard", "fixedChargesPercentText", "Vos charges fixes représentent")}{" "}
        <strong style={{ color: COLORS.blue }}>{stats.tauxChargesFixes || 0} %</strong>{" "}
        {tr(t, "dashboard", "ofYourIncome", "de vos revenus.")}
      </div>
    </TropicalCard>
  )
}

function RevenusDetails({ stats, transactions = [], abonnements = [], onClose, t }) {
  const [openedLine, setOpenedLine] = useState(null)

  const revenus = stats.revenus || 0
  const chargesFixes = stats.chargesFixes || 0
  const depensesVariables = stats.depensesVariables || 0
  const resteAVivre = stats.resteAVivre || 0
  const totalDepenses = chargesFixes + depensesVariables
  const tauxDisponible = revenus > 0 ? Math.max((resteAVivre / revenus) * 100, 0).toFixed(0) : 0

  const revenusItems = transactions
    .filter(tx => Number(tx.amount) > 0)
    .map(tx => ({
      label: tx.label || tx.nom || tr(t, "dashboard", "income", "Revenu"),
      icon: tx.icon || "💵",
      amount: Number(tx.amount) || 0,
    }))

  const chargesItems = abonnements.map(abonnement => ({
    label: abonnement.nom || tr(t, "dashboard", "fixedCharge", "Charge fixe"),
    icon: abonnement.emoji || "📌",
    amount: moneyValue(abonnement.montant),
  }))

  const depensesItems = transactions
    .filter(tx => Number(tx.amount) < 0)
    .map(tx => ({
      label: tx.label || tx.nom || tr(t, "dashboard", "expense", "Dépense"),
      icon: tx.icon || "🛒",
      amount: Math.abs(Number(tx.amount) || 0),
    }))

  return (
    <TropicalCard variant="green" texture="🍃">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <h3 style={{ margin: 0, color: COLORS.text, fontSize: 16 }}>
          {tr(t, "dashboard", "revenusDetailsTitle", "Détail des revenus du mois")}
        </h3>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,.07)",
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 999,
            color: COLORS.whiteSoft,
            cursor: "pointer",
            padding: "5px 10px",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          {tr(t, "common", "close", "Fermer")}
        </button>
      </div>

      <DetailItem
        icon="💵"
        label={tr(t, "dashboard", "revenusRegistered", "Revenus enregistrés")}
        value={formatMontant(revenus)}
        color="#BEF264"
        onClick={() => setOpenedLine(openedLine === "revenus" ? null : "revenus")}
        info
      />

      {openedLine === "revenus" && (
        <DetailList
          title={tr(t, "dashboard", "revenusListTitle", "Liste des revenus")}
          items={revenusItems}
          emptyText={tr(t, "dashboard", "noRevenus", "Aucun revenu enregistré ce mois-ci.")}
          total={revenus}
          color="#BEF264"
        />
      )}

      <DetailItem
        icon="📌"
        label={tr(t, "dashboard", "fixedCharges", "Charges fixes prévues")}
        value={formatMontant(chargesFixes)}
        color={COLORS.accentSoft}
        onClick={() => setOpenedLine(openedLine === "charges" ? null : "charges")}
        info
      />

      {openedLine === "charges" && (
        <>
          <DetailList
            title={tr(t, "dashboard", "fixedChargesListTitle", "Liste des charges fixes")}
            items={chargesItems}
            emptyText={tr(t, "dashboard", "noFixedCharges", "Aucune charge fixe enregistrée.")}
            total={chargesFixes}
            color={COLORS.accentSoft}
          />

          <div
            style={{
              marginTop: 10,
              background: "rgba(251,146,60,.10)",
              border: "1px solid rgba(251,146,60,.22)",
              borderRadius: 12,
              padding: "10px 12px",
              color: COLORS.text,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: COLORS.accentSoft }}>
              {tr(t, "dashboard", "fixedChargesInfoTitle", "À savoir :")}
            </strong>{" "}
            {tr(
              t,
              "dashboard",
              "fixedChargesInfo",
              "Les charges fixes regroupent les abonnements, le loyer, les crédits et toutes les dépenses récurrentes."
            )}
          </div>
        </>
      )}

      <DetailItem
        icon="🛒"
        label={tr(t, "dashboard", "variableExpenses", "Dépenses variables")}
        value={formatMontant(depensesVariables)}
        color={COLORS.blue}
        onClick={() => setOpenedLine(openedLine === "depenses" ? null : "depenses")}
        info
      />

      {openedLine === "depenses" && (
        <DetailList
          title={tr(t, "dashboard", "variableExpensesListTitle", "Liste des dépenses variables")}
          items={depensesItems}
          emptyText={tr(t, "dashboard", "noVariableExpenses", "Aucune dépense variable enregistrée ce mois-ci.")}
          total={depensesVariables}
          color={COLORS.blue}
        />
      )}

      <DetailItem icon="🎯" label={tr(t, "dashboard", "estimatedAvailable", "Reste disponible estimé")} value={formatMontant(resteAVivre)} color={resteAVivre >= 0 ? COLORS.green : COLORS.red} />

      <div
        style={{
          marginTop: 14,
          background: "rgba(132,204,22,.10)",
          border: "1px solid rgba(132,204,22,.25)",
          borderRadius: 14,
          padding: "12px 14px",
          color: COLORS.text,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {tr(t, "dashboard", "afterExpensesText", "Après dépenses et charges, il vous reste environ")}{" "}
        <strong style={{ color: "#BEF264" }}>{tauxDisponible} %</strong>{" "}
        {tr(t, "dashboard", "incomeAvailableText", "de vos revenus disponibles.")}
        {totalDepenses > 0 && (
          <span>
            {" "}
            {tr(t, "dashboard", "totalCommitted", "Total déjà engagé :")}{" "}
            <strong style={{ color: COLORS.accentSoft }}>{formatMontant(totalDepenses)}</strong>.
          </span>
        )}
      </div>
    </TropicalCard>
  )
}

function DepensesDetails({ stats, onClose, t }) {
  const revenus = stats.revenus || 0
  const depenses = stats.depenses || 0
  const chargesFixes = stats.chargesFixes || 0
  const depensesVariables = stats.depensesVariables || 0
  const tauxCharges = revenus > 0 ? ((chargesFixes / revenus) * 100).toFixed(0) : 0
  const tauxVariables = revenus > 0 ? ((depensesVariables / revenus) * 100).toFixed(0) : 0
  const tauxTotal = revenus > 0 ? (((chargesFixes + depensesVariables) / revenus) * 100).toFixed(0) : 0

  return (
    <TropicalCard variant="coral" texture="🌞">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <h3 style={{ margin: 0, color: COLORS.text, fontSize: 16 }}>
          {tr(t, "dashboard", "depensesDetailsTitle", "Détail des dépenses du mois")}
        </h3>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,.07)",
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 999,
            color: COLORS.whiteSoft,
            cursor: "pointer",
            padding: "5px 10px",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          {tr(t, "common", "close", "Fermer")}
        </button>
      </div>

      <DetailItem icon="📊" label={tr(t, "dashboard", "depenses", "Dépenses du mois")} value={formatMontant(depenses)} color="#FDBA74" />
      <DetailItem icon="📌" label={`${tr(t, "dashboard", "fixedCharges", "Charges fixes")} (${tauxCharges} % ${tr(t, "dashboard", "ofIncome", "des revenus")})`} value={formatMontant(chargesFixes)} color={COLORS.accentSoft} />
      <DetailItem icon="🛒" label={`${tr(t, "dashboard", "variableExpenses", "Dépenses variables")} (${tauxVariables} % ${tr(t, "dashboard", "ofIncome", "des revenus")})`} value={formatMontant(depensesVariables)} color={COLORS.blue} />
      <DetailItem icon="⚖️" label={tr(t, "dashboard", "totalChargesVariables", "Total charges + variables")} value={formatMontant(chargesFixes + depensesVariables)} color={(chargesFixes + depensesVariables) > revenus ? COLORS.red : COLORS.green} />

      <div
        style={{
          marginTop: 14,
          background: "rgba(251,146,60,.10)",
          border: "1px solid rgba(251,146,60,.25)",
          borderRadius: 14,
          padding: "12px 14px",
          color: COLORS.text,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {tr(t, "dashboard", "expensesRatioText", "Vos charges fixes et dépenses variables représentent")}{" "}
        <strong style={{ color: "#FDBA74" }}>{tauxTotal} %</strong>{" "}
        {tr(t, "dashboard", "ofYourMonthlyIncome", "de vos revenus du mois.")}
      </div>
    </TropicalCard>
  )
}

function ProgressBar({ value, max, color }) {
  const safeMax = max || 1
  const pct = Math.min((value / safeMax) * 100, 100)
  const isOver = value > safeMax

  return (
    <div style={{ background: "rgba(255,255,255,.14)", borderRadius: 99, height: 7, overflow: "hidden" }}>
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: isOver ? COLORS.red : color,
          borderRadius: 99,
          transition: "width 0.8s cubic-bezier(.4,0,.2,1)",
          boxShadow: `0 0 14px ${isOver ? COLORS.red : color}`,
        }}
      />
    </div>
  )
}


function MoneyDetectedCard({ t, isMobile, opportunitiesCount = 0, commune = "", onOpenOpportunities }) {
  const isKreol = t("nav", "dashboard") === "Tablo débor"

  return (
    <TropicalCard
      variant="gold"
      texture="💰"
      style={{ padding: isMobile ? 16 : 22 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: isMobile ? "flex-start" : "center",
          gap: 14,
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: "#FCD34D",
              fontWeight: 900,
              fontSize: 13,
              marginBottom: 5,
            }}
          >
            {isKreol
            ? "🎯 Bon plan détecté pou ou"
            : "🎯 Opportunités détectées pour vous"}
          </div>

          <div
            style={{
              color: COLORS.text,
              fontSize: isMobile ? 20 : 24,
              fontWeight: 900,
              lineHeight: 1.15,
            }}
          >
            {opportunitiesCount} {isKreol ? "bon plan pertinent(s)" : "opportunité(s) pertinente(s)"}
          </div>

          <div
            style={{
              color: COLORS.muted,
              fontSize: 13,
              marginTop: 6,
              lineHeight: 1.45,
            }}
          >
            📍 {commune || (isKreol ? "La Rényon" : "La Réunion")}
            <br />
            {isKreol
          ? "Bann éd, bon plan ek démarches susceptibles concerne aou."
          : "Aides, bons plans et démarches susceptibles de vous concerner."}
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenOpportunities}
          style={{
            width: isMobile ? "100%" : "auto",
            background:
              "linear-gradient(135deg, rgba(252,211,77,.25), rgba(249,115,22,.22))",
            border: "1px solid rgba(252,211,77,.35)",
            borderRadius: 14,
            color: "#FDE68A",
            padding: "11px 15px",
            cursor: "pointer",
            fontWeight: 900,
            fontFamily: "inherit",
            whiteSpace: "nowrap",
            boxShadow: "0 0 18px rgba(245,158,11,.10)",
          }}
        >
          {isKreol ? "War bann bon plan" : "Voir mes opportunités"}
        </button>
      </div>
    </TropicalCard>
  )
}

export default function Dashboard({
  stats,
  byCategory,
  pieData,
  transactions,
  abonnements = [],
  t,
  isMobile,
  isPremium = false,
  customBudgets = [],
  onSaveBudgets,
  onGoPremium,
  opportunitiesCount = 0,
  commune = "",
  onOpenOpportunities,
}) {
  const { revenus, depenses, solde } = stats
  const [openedDetails, setOpenedDetails] = useState(null)
  const [showBudgetModal, setShowBudgetModal] = useState(false)
  const ofIncome = revenus > 0 ? ((depenses / revenus) * 100).toFixed(0) : 0

  function toggleDetails(section) {
    setOpenedDetails(prev => (prev === section ? null : section))
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 22 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
          gap: 14,
        }}
      >
        <StatCard
          label={t("dashboard", "solde")}
          value={`${solde.toFixed(0)} €`}
          emoji="💼"
          variant="lagoon"
          texture="🌴"
          color={solde >= 0 ? "#5EEAD4" : COLORS.red}
          sub={t("dashboard", "updatedToday")}
          actionLabel={t("dashboard", "details")}
          onAction={() => toggleDetails("solde")}
        />
        <StatCard
          label={t("dashboard", "revenus")}
          value={`${revenus.toFixed(0)} €`}
          emoji="💰"
          variant="green"
          texture="🍃"
          color="#BEF264"
          sub={t("dashboard", "salaryAndAids")}
          actionLabel={t("dashboard", "details")}
          onAction={() => toggleDetails("revenus")}
        />
        <StatCard
          label={t("dashboard", "depenses")}
          value={`${depenses.toFixed(0)} €`}
          emoji="☀️"
          variant="coral"
          texture="🌞"
          color="#FDBA74"
          sub={`${ofIncome}% ${t("dashboard", "ofIncome")}`}
          actionLabel={t("dashboard", "details")}
          onAction={() => toggleDetails("depenses")}
        />
      </div>

      {openedDetails === "solde" && <SoldeDetails stats={stats} onClose={() => setOpenedDetails(null)} t={t} />}
      {openedDetails === "revenus" && <RevenusDetails stats={stats} transactions={transactions} abonnements={abonnements} onClose={() => setOpenedDetails(null)} t={t} />}
      {openedDetails === "depenses" && <DepensesDetails stats={stats} onClose={() => setOpenedDetails(null)} t={t} />}

      <MoneyDetectedCard
        t={t}
        isMobile={isMobile}
        opportunitiesCount={opportunitiesCount}
        commune={commune}
        onOpenOpportunities={onOpenOpportunities || onGoPremium}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1.4fr",
          gap: 14,
        }}
      >
        <TropicalCard variant="purple" texture="🌺" style={{ padding: isMobile ? 16 : 22, minHeight: isMobile ? 260 : 300 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, color: COLORS.whiteSoft, fontWeight: 700, textAlign: "center" }}>
            {t("dashboard", "repartition")}
          </h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={isMobile ? 170 : 190}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={3} dataKey="value">
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: COLORS.card, border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, fontSize: 12, color: COLORS.text }}
                    formatter={val => [`${Number(val).toFixed(0)} €`]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", marginTop: 8 }}>
                {pieData.slice(0, 4).map(d => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: COLORS.whiteSoft }}>
                    <div style={{ width: 8, height: 8, borderRadius: 99, background: d.color }} />
                    {t("categories", d.name)}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "20px 0", color: COLORS.whiteSoft, fontSize: 13 }}>Aucune dépense ce mois</div>
          )}
        </TropicalCard>

        <TropicalCard variant="ocean" texture="🌊" style={{ padding: isMobile ? 16 : 22, minHeight: isMobile ? 260 : 300 }}>
          <h3 style={{ margin: "0 0 18px", fontSize: 15, color: COLORS.whiteSoft, fontWeight: 700, textAlign: "center" }}>
            {t("dashboard", "recentTransactions")}
          </h3>
          {transactions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: COLORS.whiteSoft, fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
              Aucune transaction
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {transactions.slice(0, 5).map(tx => (
                <div key={tx.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        background: "rgba(15,30,56,.52)",
                        border: "1px solid rgba(255,255,255,.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 16,
                        flexShrink: 0,
                      }}
                    >
                      {tx.icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.label}</div>
                      <div style={{ fontSize: 11, color: "rgba(248,250,252,.56)" }}>{tx.date}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: tx.amount >= 0 ? COLORS.green : COLORS.text, flexShrink: 0 }}>{formatAmount(Number(tx.amount))}</span>
                </div>
              ))}
            </div>
          )}
        </TropicalCard>
      </div>

      {isPremium && byCategory.some(cat => cat.budget > 0 && cat.depense >= cat.budget) && (
        <TropicalCard variant="coral" texture="⚠️" style={{ padding: isMobile ? 16 : 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, color: COLORS.text, fontWeight: 900 }}>
            Alertes budget
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {byCategory
              .filter(cat => cat.budget > 0 && cat.depense >= cat.budget)
              .map(cat => (
                <div
                  key={`alert-${cat.id}`}
                  style={{
                    background: "rgba(239,68,68,.12)",
                    border: "1px solid rgba(239,68,68,.25)",
                    color: "#FCA5A5",
                    padding: "11px 13px",
                    borderRadius: 14,
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  ⚠️ Budget {t("categories", cat.id)} dépassé de{" "}
                  {(cat.depense - cat.budget).toFixed(0)} €
                </div>
              ))}
          </div>
        </TropicalCard>
      )}

      <TropicalCard variant="gold" texture="🌿" style={{ padding: isMobile ? 16 : 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "flex-start" : "center",
            gap: 12,
            marginBottom: 20,
            flexDirection: isMobile ? "column" : "row",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, color: COLORS.whiteSoft, fontWeight: 800 }}>
            {t("dashboard", "budgetByCategory")}
          </h3>

          <button
            type="button"
            onClick={() => {
              if (isPremium) {
                setShowBudgetModal(true)
              } else if (onGoPremium) {
                onGoPremium()
              }
            }}
            style={{
              background: isPremium
                ? "rgba(255,255,255,.09)"
                : "linear-gradient(135deg, rgba(252,211,77,.22), rgba(245,158,11,.14))",
              border: isPremium
                ? "1px solid rgba(255,255,255,.14)"
                : "1px solid rgba(252,211,77,.35)",
              borderRadius: 999,
              color: isPremium ? COLORS.whiteSoft : "#FDE68A",
              cursor: "pointer",
              padding: "7px 12px",
              fontSize: 12,
              fontWeight: 900,
              fontFamily: "inherit",
              boxShadow: isPremium ? "none" : "0 0 18px rgba(245,158,11,.10)",
            }}
          >
            {isPremium ? "⚙️ Modifier mes budgets" : "🔒 Budgets personnalisés"}
          </button>
        </div>
        {!isPremium && (
          <div
            style={{
              marginBottom: 16,
              background: "rgba(252,211,77,.10)",
              border: "1px solid rgba(252,211,77,.22)",
              borderRadius: 14,
              padding: "11px 13px",
              color: "#FDE68A",
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.5,
            }}
          >
            Fonction Premium : personnalisez vos budgets par catégorie et recevez des alertes de dépassement.
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
            gap: isMobile ? "14px 0" : "18px 34px",
          }}
        >
          {byCategory.map(cat => (
            <div key={cat.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                <span style={{ fontSize: 14, color: COLORS.text, fontWeight: 800 }}>
                  {cat.emoji} {t("categories", cat.id)}
                </span>
                <span style={{ fontSize: 12, color: cat.depense > cat.budget ? COLORS.red : COLORS.whiteSoft, flexShrink: 0 }}>
                  {cat.depense.toFixed(0)} / {cat.budget} €
                </span>
              </div>
              <ProgressBar value={cat.depense} max={cat.budget} color={cat.color} />
            </div>
          ))}
        </div>
      </TropicalCard>
      {showBudgetModal && (
        <BudgetSettingsModal
          categories={CATEGORIES}
          currentBudgets={customBudgets}
          onSave={onSaveBudgets}
          onClose={() => setShowBudgetModal(false)}
          t={t}
        />
      )}
    </div>
  )
}