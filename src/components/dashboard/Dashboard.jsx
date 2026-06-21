import { useEffect, useState } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { formatAmount, formatMontant } from "../../utils/format"
import TropicalCard, { TROPICAL_VARIANTS } from "./TropicalCard"
import BudgetSettingsModal from "../budgets/BudgetSettingModal"
import { CATEGORIES } from "../../data/categories"
import { supabase } from "../../services/supabase"

const SUPPORT_EMAIL = "contact.budgetkazpei@gmail.com"

// Dashboard V34 - Cohérence revenus : profil + entrées ponctuelles + résumé réel sans estimation

const COLORS = {
  card: "#0F1E38",
  cardLight: "#152444",
  border: "#1E3A5F",
  accent: "#F97316",
  accentSoft: "#FB923C",
  green: "#22C55E",
  red: "#EF4444",
  blue: "#38BDF8",
  cyan: "#23D3D6",
  yellow: "#FCD34D",
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
function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
        label={tr(t, "dashboard", "fixedChargesRegistered", "Charges fixes enregistrées")}
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

      <DetailItem icon="🎯" label={tr(t, "dashboard", "availableBalance", "Reste disponible")} value={formatMontant(resteAVivre)} color={resteAVivre >= 0 ? COLORS.green : COLORS.red} />

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
        <strong style={{ color: "#BEF264" }}>
          {tr(t, "dashboard", "realMonthSummaryTitle", "Résumé réel du mois :")}
        </strong>{" "}
        {tr(t, "dashboard", "monthlyIncomeLabel", "revenus du mois")} {" "}
        <strong style={{ color: "#BEF264" }}>{formatMontant(revenus)}</strong> · {" "}
        {tr(t, "dashboard", "registeredFixedChargesLabel", "charges fixes enregistrées")} {" "}
        <strong style={{ color: COLORS.accentSoft }}>{formatMontant(chargesFixes)}</strong> · {" "}
        {tr(t, "dashboard", "variableExpensesLabel", "dépenses variables")} {" "}
        <strong style={{ color: COLORS.blue }}>{formatMontant(depensesVariables)}</strong> · {" "}
        {tr(t, "dashboard", "availableBalanceLabel", "reste disponible")} {" "}
        <strong style={{ color: resteAVivre >= 0 ? COLORS.green : COLORS.red }}>
          {formatMontant(resteAVivre)}
        </strong>.
        {revenus > 0 && (
          <span>
            {" "}
            {tr(t, "dashboard", "availableShareLabel", "Part disponible")} : {" "}
            <strong style={{ color: "#BEF264" }}>{tauxDisponible} %</strong>.
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
  const isKreol = String(t("nav", "dashboard") || "").toLowerCase().includes("tablo")

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
            ? "🎯 Bon plan détèkté pou ou"
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
            {opportunitiesCount} {isKreol ? "bon plan pou vérifié" : "aides ou bons plans à vérifier"}
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
          ? "Bann éd, bon plan ek démarche i pé konsern aou."
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
          {isKreol ? "Voir bann bon plan" : "Voir mes opportunités"}
        </button>
      </div>
    </TropicalCard>
  )
}

function RecoveredMoneyCard({
  t,
  isMobile,
  gainsAides = 0,
  nbAidesObtenues = 0,
  objectifGains = 1000,
  onOpenAides,
  gainsDetails = [],
}) {
  const isKreol = String(t("nav", "dashboard") || "").toLowerCase().includes("tablo")
  const gains = Number(gainsAides || 0)
  const objectif = Number(objectifGains || 1000)
  const progress = objectif > 0 ? Math.min(Math.round((gains / objectif) * 100), 100) : 0
  const hasGains = gains > 0

  return (
    <TropicalCard
      variant="green"
      texture="💸"
      style={{ padding: isMobile ? 16 : 22 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: isMobile ? "flex-start" : "center",
          gap: 16,
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              color: "#BEF264",
              fontWeight: 900,
              fontSize: 13,
              marginBottom: 6,
            }}
          >
            {isKreol
              ? "💰 Larzan ou la récupéré ek BudgetKazPei"
              : "💰 Argent récupéré grâce à BudgetKazPei"}
          </div>

          <div
            style={{
              color: COLORS.text,
              fontSize: isMobile ? 30 : 38,
              fontWeight: 900,
              lineHeight: 1,
              fontFamily: "'DM Serif Display', Georgia, serif",
            }}
          >
            {gains.toFixed(0)} €
          </div>

          <div
            style={{
              marginTop: 8,
              color: COLORS.muted,
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            ✅ {nbAidesObtenues} {isKreol ? "éd gagné" : "aide(s) obtenue(s)"}
            <br />
            {hasGains
              ? isKreol
                ? "Out démarche i komans rapport aou pou vré."
                : "Vos démarches commencent à rapporter concrètement."
              : isKreol
                ? "Mèt in démarche an Gagné, épi mark lo montan gagné."
                : "Passez une démarche en accepté puis renseignez le gain."}
          </div>

          {gainsDetails.length > 0 && (
            <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
              <div style={{ color: COLORS.green, fontSize: 12, fontWeight: 900 }}>
                {isKreol ? "Dernyé gains anrezistré" : "Derniers gains enregistrés"}
              </div>
              {gainsDetails.slice(0, 3).map((gain, index) => (
                <div
                  key={`${gain.label}-${index}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    background: "rgba(255,255,255,.055)",
                    border: "1px solid rgba(255,255,255,.08)",
                    borderRadius: 10,
                    padding: "8px 10px",
                    color: COLORS.text,
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{gain.label}</span>
                  <span style={{ color: COLORS.green, flexShrink: 0 }}>{Number(gain.amount || 0).toFixed(0)} €</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            width: isMobile ? "100%" : 260,
            background: "rgba(10,22,40,.40)",
            border: "1px solid rgba(255,255,255,.10)",
            borderRadius: 16,
            padding: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              color: COLORS.whiteSoft,
              fontSize: 12,
              fontWeight: 900,
              marginBottom: 8,
            }}
          >
            <span>{isKreol ? "Lobzektif lanné" : "Objectif annuel"}</span>
            <span style={{ color: "#BEF264" }}>{progress}%</span>
          </div>

          <div
            style={{
              height: 9,
              background: "rgba(255,255,255,.12)",
              borderRadius: 999,
              overflow: "hidden",
              marginBottom: 9,
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                background: "linear-gradient(90deg, #22C55E, #BEF264)",
                borderRadius: 999,
                transition: "width .45s ease",
              }}
            />
          </div>

          <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.45 }}>
            {gains.toFixed(0)} € / {objectif.toFixed(0)} €
          </div>

          {onOpenAides && (
            <button
              type="button"
              onClick={onOpenAides}
              style={{
                width: "100%",
                marginTop: 12,
                background: "rgba(34,197,94,.14)",
                border: "1px solid rgba(34,197,94,.28)",
                borderRadius: 12,
                color: "#BEF264",
                padding: "9px 12px",
                cursor: "pointer",
                fontWeight: 900,
                fontFamily: "inherit",
              }}
            >
              {isKreol ? "Voir mon bann démarches" : "Voir mes démarches"}
            </button>
          )}
        </div>
      </div>
    </TropicalCard>
  )
}



function normalizeSubscriptionPlan({ plan, status, isPremium, isPremiumPlus } = {}) {
  const cleanStatus = String(status || "").toLowerCase().trim()
  const hasInactiveStatus = ["canceled", "cancelled", "inactive", "past_due", "unpaid", "expired"].includes(cleanStatus)

  if (hasInactiveStatus) return "free"

  const cleanPlan = String(plan || "")
    .toLowerCase()
    .trim()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_")

  if (cleanPlan.includes("premium_plus") || cleanPlan.includes("premium+")) return "premium_plus"
  if (cleanPlan.includes("premium")) return "premium"
  if (cleanPlan === "free" || cleanPlan === "gratuit") return "free"

  if (isPremiumPlus === true) return "premium_plus"
  if (isPremium === true) return "premium"

  return "free"
}

function getPremiumFlags({ plan, status, isPremium, isPremiumPlus } = {}) {
  const normalizedPlan = normalizeSubscriptionPlan({ plan, status, isPremium, isPremiumPlus })

  return {
    plan: normalizedPlan,
    hasPremiumAccess: normalizedPlan === "premium" || normalizedPlan === "premium_plus",
    hasPremiumPlusAccess: normalizedPlan === "premium_plus",
  }
}

function getIsKreol(t) {
  return String(t?.("nav", "dashboard") || "").toLowerCase().includes("tablo")
}

function buildBudgetScore({ stats = {}, byCategory = [], gainsAides = 0, nbAidesObtenues = 0, opportunitiesCount = 0 }) {
  const revenus = Number(stats.revenus || 0)
  const depenses = Number(stats.depenses || 0)
  const solde = Number(stats.solde || 0)
  const chargesFixes = Number(stats.chargesFixes || 0)
  let score = 72
  const positive = []
  const warnings = []

  if (revenus > 0) {
    const depRatio = depenses / revenus
    const chargesRatio = chargesFixes / revenus

    if (depRatio <= 0.75) {
      score += 10
      positive.push("budget_maitrise")
    } else if (depRatio > 1) {
      score -= 18
      warnings.push("depenses_hautes")
    } else {
      score -= 7
      warnings.push("depenses_a_surveille")
    }

    if (chargesRatio <= 0.45) {
      score += 8
      positive.push("charges_ok")
    } else if (chargesRatio > 0.65) {
      score -= 12
      warnings.push("charges_hautes")
    }
  } else {
    score -= 8
    warnings.push("revenus_manquants")
  }

  if (solde >= 0) {
    score += 7
    positive.push("solde_ok")
  } else {
    score -= 15
    warnings.push("solde_negatif")
  }

  const overBudget = byCategory.filter(cat => Number(cat.budget || 0) > 0 && Number(cat.depense || 0) > Number(cat.budget || 0))
  if (overBudget.length > 0) {
    score -= Math.min(18, overBudget.length * 6)
    warnings.push("budgets_depasses")
  } else if (byCategory.length > 0) {
    score += 6
    positive.push("categories_ok")
  }

  if (Number(gainsAides || 0) > 0 || Number(nbAidesObtenues || 0) > 0) {
    score += 8
    positive.push("aides_obtenues")
  } else if (Number(opportunitiesCount || 0) > 0) {
    score += 3
    warnings.push("aides_a_verifier")
  }

  score = Math.max(0, Math.min(100, Math.round(score)))

  const color = score >= 80 ? COLORS.green : score >= 60 ? COLORS.accentSoft : COLORS.red
  const level = score >= 80 ? "excellent" : score >= 60 ? "correct" : "attention"
  return { score, color, level, positive: positive.slice(0, 3), warnings: warnings.slice(0, 3), overBudget }
}

function getScoreLabel(level, isKreol) {
  if (level === "excellent") return isKreol ? "Tré bien" : "Excellent"
  if (level === "correct") return isKreol ? "Correct" : "Correct"
  return isKreol ? "À surveyé" : "À surveiller"
}

function getSignalText(key, isKreol) {
  const fr = {
    budget_maitrise: "Budget global maîtrisé",
    charges_ok: "Charges fixes raisonnables",
    solde_ok: "Solde positif ce mois-ci",
    categories_ok: "Budgets par catégorie suivis",
    aides_obtenues: "Aides obtenues enregistrées",
    depenses_hautes: "Dépenses trop élevées ce mois-ci",
    depenses_a_surveille: "Dépenses à surveiller",
    charges_hautes: "Charges fixes importantes",
    revenus_manquants: "Revenus à compléter",
    solde_negatif: "Solde négatif ce mois-ci",
    budgets_depasses: "Une ou plusieurs catégories dépassées",
    aides_a_verifier: "Opportunités à vérifier",
  }

  const kr = {
    budget_maitrise: "Out bidjé lé anba kontrol",
    charges_ok: "Sarz fix lé rézonab",
    solde_ok: "Larzan i reste lé positif",
    categories_ok: "Bidjé par katégori lé suivi",
    aides_obtenues: "Éd gagné lé anrezistré",
    depenses_hautes: "Dépans lé tro haut pou mwa-la",
    depenses_a_surveille: "Dépans à surveillé",
    charges_hautes: "Sarz fix lé trop haut",
    revenus_manquants: "Larzan i rantre lé à compléter",
    solde_negatif: "Larzan i reste lé négatif",
    budgets_depasses: "Na katégori la dépassé out bidjé",
    aides_a_verifier: "Bon plan à vérifié",
  }

  return (isKreol ? kr : fr)[key] || key
}

function SmartWelcomeCard({ t, isMobile, stats = {}, gainsAides = 0, nbAidesObtenues = 0, opportunitiesCount = 0, objectifGains = 1000, commune = "" }) {
  const isKreol = getIsKreol(t)
  const gains = Number(gainsAides || stats.gainsAides || 0)
  const restantObjectif = Math.max(Number(objectifGains || 1000) - gains, 0)
  const solde = Number(stats.solde || 0)

  return (
    <TropicalCard variant="lagoon" texture="🌴" style={{ padding: isMobile ? 16 : 22 }}>
      <div style={{ color: COLORS.text, fontWeight: 900, fontSize: isMobile ? 18 : 22, marginBottom: 8 }}>
        {isKreol ? "Bonzour Jacques 👋" : "Bonjour Jacques 👋"}
      </div>
      <div style={{ color: COLORS.whiteSoft, fontSize: 14, lineHeight: 1.65 }}>
        {gains > 0
          ? isKreol
            ? `Ou la déjà récupéré ${gains.toFixed(0)} € ek BudgetKazPei.`
            : `Vous avez déjà récupéré ${gains.toFixed(0)} € grâce à BudgetKazPei.`
          : isKreol
            ? "Komans par azout in démarche. Kan in éd lé aksepté, mark lo gain gagné."
            : "Commencez par ajouter une démarche, puis renseignez le gain quand l’aide est acceptée."}
        {" "}
        {restantObjectif > 0
          ? isKreol
            ? `I reste ${restantObjectif.toFixed(0)} € pou atenn lobzektif lanné.`
            : `Il reste ${restantObjectif.toFixed(0)} € pour atteindre l’objectif annuel.`
          : isKreol
            ? "Lobzektif lanné lé atteint. Bravo !"
            : "L’objectif annuel est atteint. Bravo !"}
        <br />
        {opportunitiesCount > 0
          ? isKreol
            ? `${opportunitiesCount} bon plan i mérite d'être vérifié${commune ? ` à ${commune}` : ""}.`
            : `${opportunitiesCount} opportunité(s) méritent d’être vérifiées${commune ? ` à ${commune}` : ""}.`
          : isKreol
            ? "Pa na okenn bon plan urgent détecté pou le moman."
            : "Aucune opportunité urgente détectée pour le moment."}
        {solde < 0 && (
          <span style={{ color: COLORS.red, fontWeight: 900 }}>
            {isKreol ? " Attention : out solde lé négatif." : " Attention : votre solde est négatif."}
          </span>
        )}
      </div>
    </TropicalCard>
  )
}

function BudgetScoreCard({ t, isMobile, stats = {}, byCategory = [], gainsAides = 0, nbAidesObtenues = 0, opportunitiesCount = 0 }) {
  const isKreol = getIsKreol(t)
  const result = buildBudgetScore({ stats, byCategory, gainsAides, nbAidesObtenues, opportunitiesCount })

  return (
    <TropicalCard variant="purple" texture="🏆" style={{ padding: isMobile ? 16 : 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexDirection: isMobile ? "column" : "row" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: result.color, fontSize: 13, fontWeight: 900, marginBottom: 6 }}>
            🏆 {isKreol ? "Score BudgetKazPei" : "Score BudgetKazPei"}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ color: COLORS.text, fontSize: isMobile ? 34 : 42, fontWeight: 900, lineHeight: 1, fontFamily: "'DM Serif Display', Georgia, serif" }}>
              {result.score}
            </span>
            <span style={{ color: COLORS.muted, fontWeight: 900 }}>/ 100</span>
            <span style={{ color: result.color, fontWeight: 900, marginLeft: 6 }}>{getScoreLabel(result.level, isKreol)}</span>
          </div>
          <div style={{ height: 9, background: "rgba(255,255,255,.12)", borderRadius: 999, overflow: "hidden", marginTop: 12 }}>
            <div style={{ width: `${result.score}%`, height: "100%", background: `linear-gradient(90deg, ${result.color}, ${COLORS.cyan})`, borderRadius: 999 }} />
          </div>
        </div>

        <div style={{ width: isMobile ? "100%" : 360, display: "grid", gap: 7 }}>
          {result.positive.map(key => (
            <div key={key} style={{ color: COLORS.green, fontSize: 12, fontWeight: 800 }}>✅ {getSignalText(key, isKreol)}</div>
          ))}
          {result.warnings.map(key => (
            <div key={key} style={{ color: COLORS.yellow, fontSize: 12, fontWeight: 800 }}>⚠️ {getSignalText(key, isKreol)}</div>
          ))}
        </div>
      </div>
    </TropicalCard>
  )
}

function buildRecommendedActions({ stats = {}, byCategory = [], opportunitiesCount = 0, gainsAides = 0, nbAidesObtenues = 0, transactions = [], isPremium = false, isKreol = false }) {
  const actions = []
  const solde = Number(stats.solde || 0)

  if (solde < 0) {
    actions.push({ done: false, icon: "🚨", text: isKreol ? "Rédui in dépans ou ajoute larzan i rantre pou repass solde positif." : "Réduire une dépense ou ajouter un revenu pour repasser en solde positif." })
  }

  const overBudget = byCategory.find(cat => Number(cat.budget || 0) > 0 && Number(cat.depense || 0) > Number(cat.budget || 0))
  if (overBudget) {
    actions.push({ done: false, icon: "⚠️", text: isKreol ? `Surveille katégori ${overBudget.emoji || ""} ${overBudget.id}.` : `Surveiller la catégorie ${overBudget.emoji || ""} ${overBudget.id}.` })
  }

  if (opportunitiesCount > 0) {
    actions.push({ done: false, icon: "🎯", text: isKreol ? `Vérifie ${opportunitiesCount} bon plan détèkté.` : `Vérifier ${opportunitiesCount} opportunité(s) détectée(s).` })
  }

  if (Number(gainsAides || 0) <= 0 && Number(nbAidesObtenues || 0) <= 0) {
    actions.push({ done: false, icon: "💰", text: isKreol ? "Passe in démarche an Aksepté épi rant lo montan gagné." : "Passer une démarche en Acceptée puis renseigner le gain." })
  } else {
    actions.push({ done: true, icon: "💰", text: isKreol ? "Gain d’éd anrezistré." : "Gain d’aide enregistré." })
  }

  if (!transactions || transactions.length === 0) {
    actions.push({ done: false, icon: "➕", text: isKreol ? "Azout out premiers mouvman pou rann tablo-la pli précis." : "Ajouter vos premiers mouvements pour rendre le tableau plus précis." })
  }

  if (!isPremium) {
    actions.push({ done: false, icon: "👑", text: isKreol ? "Déblok alertes bidjé ek PDF ek Premium." : "Débloquer les alertes budget et PDF avec Premium." })
  }

  return actions.slice(0, 4)
}

function RecommendedActionsCard({ t, isMobile, stats = {}, byCategory = [], opportunitiesCount = 0, gainsAides = 0, nbAidesObtenues = 0, transactions = [], isPremium = false, onOpenOpportunities, onOpenAides, onGoPremium }) {
  const isKreol = getIsKreol(t)
  const actions = buildRecommendedActions({ stats, byCategory, opportunitiesCount, gainsAides, nbAidesObtenues, transactions, isPremium, isKreol })
  const done = actions.filter(action => action.done).length

  return (
    <TropicalCard variant="ocean" texture="🎯" style={{ padding: isMobile ? 16 : 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <div style={{ color: COLORS.text, fontWeight: 900, fontSize: 16 }}>
          🎯 {isKreol ? "Bann actions pou fé" : "Actions recommandées"}
        </div>
        <div style={{ color: COLORS.cyan, fontSize: 12, fontWeight: 900 }}>
          {done} / {actions.length}
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {actions.map((action, index) => (
          <div key={`${action.text}-${index}`} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "10px 11px", color: COLORS.text, fontSize: 13, lineHeight: 1.45 }}>
            <span>{action.done ? "✅" : "☐"}</span>
            <span><strong style={{ marginRight: 4 }}>{action.icon}</strong>{action.text}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {onOpenAides && (
          <button type="button" onClick={onOpenAides} style={{ background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.28)", color: "#BEF264", borderRadius: 999, padding: "8px 11px", fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
            {isKreol ? "Éd & démarches" : "Aides & démarches"}
          </button>
        )}
        {onOpenOpportunities && (
          <button type="button" onClick={onOpenOpportunities} style={{ background: "rgba(252,211,77,.12)", border: "1px solid rgba(252,211,77,.28)", color: "#FDE68A", borderRadius: 999, padding: "8px 11px", fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
            {isKreol ? "Bon plan" : "Opportunités"}
          </button>
        )}
        {!isPremium && onGoPremium && (
          <button type="button" onClick={onGoPremium} style={{ background: "rgba(167,139,250,.12)", border: "1px solid rgba(167,139,250,.28)", color: "#DDD6FE", borderRadius: 999, padding: "8px 11px", fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
            Premium+
          </button>
        )}
      </div>
    </TropicalCard>
  )
}

function SavingsDetectedCard({ t, isMobile, abonnements = [], onOpenOpportunities }) {
  const isKreol = getIsKreol(t)
  const totalCharges = abonnements.reduce((sum, item) => sum + moneyValue(item.montant), 0)
  const estimatedSavings = totalCharges > 0 ? Math.max(8, Math.round(totalCharges * 0.08)) : 0

  if (estimatedSavings <= 0) return null

  return (
    <TropicalCard variant="gold" texture="💡" style={{ padding: isMobile ? 16 : 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", gap: 14, flexDirection: isMobile ? "column" : "row" }}>
        <div>
          <div style={{ color: COLORS.yellow, fontWeight: 900, fontSize: 13, marginBottom: 6 }}>
            💡 {isKreol ? "Lékonomi posib" : "Économies possibles"}
          </div>
          <div style={{ color: COLORS.text, fontSize: isMobile ? 26 : 34, fontWeight: 900, lineHeight: 1, fontFamily: "'DM Serif Display', Georgia, serif" }}>
            {estimatedSavings} € / {isKreol ? "mwa" : "mois"}
          </div>
          <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 8, lineHeight: 1.45 }}>
            {isKreol
              ? "Estimation su abonman ek sarz fix. Bann bon plan i pé aide aou économiz plis."
              : "Estimation sur vos abonnements et charges fixes. Les bons plans peuvent vous aider à économiser plus."}
          </div>
        </div>

        <button type="button" onClick={onOpenOpportunities} style={{ width: isMobile ? "100%" : "auto", background: "linear-gradient(135deg, rgba(252,211,77,.25), rgba(249,115,22,.22))", border: "1px solid rgba(252,211,77,.35)", borderRadius: 14, color: "#FDE68A", padding: "11px 15px", cursor: "pointer", fontWeight: 900, fontFamily: "inherit" }}>
          {isKreol ? "Voir bann bon plan" : "Voir les bons plans"}
        </button>
      </div>
    </TropicalCard>
  )
}




function getCategoryLabelForSavings(cat = {}, t, isKreol = false) {
  const id = cat.id || cat.category || cat.name || "categorie"
  const translated = typeof t === "function" ? t("categories", id) : ""
  if (translated && translated !== id) return translated
  return String(id || (isKreol ? "Katégori" : "Catégorie"))
}

function buildSavingsAnalysisV72({ stats = {}, byCategory = [], transactions = [], t, isKreol = false }) {
  const solde = Number(stats.solde || 0)
  const hasTransactions = (transactions || []).length > 0 || Number(stats.depenses || 0) > 0
  const categoriesWithBudget = (byCategory || []).filter(cat => Number(cat.budget || 0) > 0)

  const overBudget = categoriesWithBudget
    .map(cat => {
      const depense = Number(cat.depense || 0)
      const budget = Number(cat.budget || 0)
      const depassement = Math.max(depense - budget, 0)

      return {
        ...cat,
        depense,
        budget,
        depassement,
        label: getCategoryLabelForSavings(cat, t, isKreol),
      }
    })
    .filter(cat => cat.depassement > 0)
    .sort((a, b) => b.depassement - a.depassement)

  const totalDepassement = overBudget.reduce((sum, cat) => sum + cat.depassement, 0)
  const projectionAnnuelle = totalDepassement * 12

  const hasEnoughData = hasTransactions && categoriesWithBudget.length > 0

  let alert = {
    level: "ok",
    color: COLORS.green,
    emoji: "🟢",
    title: isKreol ? "Out bidjé lé anba kontrol" : "Budget maîtrisé",
    text: isKreol
      ? "Pa na okenn dépasman réél détèkté pou le moman."
      : "Aucun dépassement réel détecté pour le moment.",
  }

  if (!hasEnoughData) {
    alert = {
      level: "info",
      color: COLORS.cyan,
      emoji: "🔵",
      title: isKreol ? "Donné lé pa suffisante" : "Données insuffisantes",
      text: isKreol
        ? "BudgetKazPei na pa ankor assez d’info pou kalkil in dépasman réél."
        : "BudgetKazPei ne dispose pas encore d'assez d'informations pour calculer un dépassement réel.",
    }
  } else if (solde < 0 || overBudget.length >= 3) {
    alert = {
      level: "danger",
      color: COLORS.red,
      emoji: "🔴",
      title: isKreol ? "Action pou fé" : "Action recommandée",
      text: isKreol
        ? solde < 0
          ? "Out solde lé négatif. I fo agir su bann dépans les plus hautes."
          : "Plusieurs katégori la dépassé out bidjé ce mois-ci."
        : solde < 0
          ? "Votre solde est négatif. Il faut agir sur les dépenses les plus élevées."
          : "Plusieurs catégories ont dépassé votre budget ce mois-ci.",
    }
  } else if (overBudget.length > 0) {
    alert = {
      level: "warning",
      color: COLORS.yellow,
      emoji: "🟠",
      title: isKreol ? "À surveillé" : "À surveiller",
      text: isKreol
        ? `${overBudget.length} katégori la dépassé out bidjé mwa-la.`
        : `${overBudget.length} catégorie(s) ont dépassé votre budget ce mois-ci.`,
    }
  }

  return {
    hasEnoughData,
    alert,
    overBudget,
    totalDepassement,
    projectionAnnuelle,
    categoriesWithBudgetCount: categoriesWithBudget.length,
    hasTransactions,
  }
}

function SavingsV7Card({ t, isMobile, stats = {}, byCategory = [], abonnements = [], transactions = [], onOpenOpportunities }) {
  const isKreol = getIsKreol(t)
  const analysis = buildSavingsAnalysisV72({ stats, byCategory, transactions, t, isKreol })
  const displayedCategories = analysis.overBudget.slice(0, 4)

  return (
    <TropicalCard variant="gold" texture="💡" style={{ padding: isMobile ? 16 : 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", marginBottom: 14 }}>
        <div>
          <div style={{ color: COLORS.yellow, fontWeight: 900, fontSize: 13, marginBottom: 6 }}>
            💡 {isKreol ? "Analiz réél" : "V7.2 · Analyse réelle"}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ color: analysis.alert.color, fontSize: isMobile ? 22 : 28, fontWeight: 900, lineHeight: 1.1, fontFamily: "'DM Serif Display', Georgia, serif" }}>
              {analysis.alert.emoji} {analysis.alert.title}
            </div>
          </div>

          <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 8, lineHeight: 1.45 }}>
            {analysis.alert.text}
          </div>
        </div>
      </div>

      {!analysis.hasEnoughData ? (
        <div style={{ background: "rgba(10,22,40,.42)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 14, padding: "13px 14px", color: COLORS.whiteSoft, fontSize: 13, lineHeight: 1.55 }}>
          {isKreol
            ? "Azout dé dépans, larzan i rantre ek bidjé par katégori. Apré sa, BudgetKazPei va afis sèlman bann dépasman réél."
            : "Ajoutez quelques dépenses, revenus et budgets par catégorie. Ensuite BudgetKazPei affichera uniquement les dépassements réellement constatés."}
        </div>
      ) : analysis.totalDepassement > 0 ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div style={{ background: "rgba(10,22,40,.42)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 14, padding: "13px 14px" }}>
              <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
                {isKreol ? "Dépasman réél mwa-la" : "Dépassement réel ce mois-ci"}
              </div>
              <div style={{ color: COLORS.red, fontSize: 28, fontWeight: 900, lineHeight: 1, fontFamily: "'DM Serif Display', Georgia, serif" }}>
                {formatMontant(analysis.totalDepassement)}
              </div>
            </div>

            <div style={{ background: "rgba(10,22,40,.42)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 14, padding: "13px 14px" }}>
              <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
                {isKreol ? "Si tendance-la i kontinyé" : "Si cette tendance continue"}
              </div>
              <div style={{ color: COLORS.yellow, fontSize: 28, fontWeight: 900, lineHeight: 1, fontFamily: "'DM Serif Display', Georgia, serif" }}>
                {formatMontant(analysis.projectionAnnuelle)} / {isKreol ? "an" : "an"}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 9 }}>
            {displayedCategories.map((cat, index) => (
              <div key={`${cat.id || cat.label}-${index}`} style={{ background: "rgba(10,22,40,.42)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 14, padding: "12px 13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 7 }}>
                  <strong style={{ color: COLORS.text, fontSize: 13 }}>
                    {cat.emoji || "⚠️"} {cat.label}
                  </strong>
                  <span style={{ color: COLORS.red, fontWeight: 900, fontSize: 12 }}>
                    + {formatMontant(cat.depassement)}
                  </span>
                </div>
                <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.45 }}>
                  {isKreol
                    ? `Dépansé : ${formatMontant(cat.depense)} · Bidjé prévu : ${formatMontant(cat.budget)}`
                    : `Dépansé : ${formatMontant(cat.depense)} · Bidjé prévu : ${formatMontant(cat.budget)}`}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ background: "rgba(34,197,94,.10)", border: "1px solid rgba(34,197,94,.22)", borderRadius: 14, padding: "13px 14px", color: COLORS.whiteSoft, fontSize: 13, lineHeight: 1.55 }}>
          {isKreol
            ? "Pa na okenn dépasman réél dann bann katégori suivies. Pa na okenn montan lékonomi afisé san donné konkrèt."
            : "Aucun dépassement réel détecté dans les catégories suivies. Aucun montant d'économie n'est affiché sans donnée concrète."}
        </div>
      )}

      <div style={{ marginTop: 12, color: COLORS.muted, fontSize: 11.5, lineHeight: 1.45 }}>
        {isKreol
          ? "Kalkil lé fé sèlman avèk bann dépans ek bidjé anrezistré. Pa na montan estimé ni invanté."
          : "Calcul basé uniquement sur vos dépenses et budgets enregistrés. Aucun montant estimé ou inventé."}
      </div>
    </TropicalCard>
  )
}


function ContactSupportCard({ t, isMobile }) {
  const isKreol = getIsKreol(t)
  const [email, setEmail] = useState("")
  const [typeDemande, setTypeDemande] = useState("question")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  async function handleSupportSubmit(e) {
    e.preventDefault()
    setError("")
    setSuccess(false)

    const cleanEmail = email.trim()
    const cleanMessage = message.trim()

    if (!cleanEmail || !cleanMessage) {
      setError(isKreol ? "Renseigne out email ek out message." : "Renseignez votre email et votre message.")
      return
    }

    setSending(true)

    try {
      const { data: authData } = await supabase.auth.getUser()
      const authUser = authData?.user

      const subjectByType = {
        question: "Question / besoin d’aide",
        bug: "Signalement de bug",
        suggestion: "Suggestion d’amélioration",
        premium: "Question Premium / Premium+",
      }

      const supportPayload = {
        user_id: authUser?.id || null,
        user_email: cleanEmail || authUser?.email || null,
        user_name: authUser?.user_metadata?.name || authUser?.user_metadata?.full_name || "Utilisateur BudgetKazPei",
        type: typeDemande,
        subject: subjectByType[typeDemande] || "Message utilisateur",
        message: cleanMessage,
        source: "dashboard",
        status: "new",
      }

      const { error: insertError } = await supabase
        .from("support_messages")
        .insert(supportPayload)

      if (insertError) throw insertError

      const { error: emailError } = await supabase.functions.invoke("clever-service", {
        body: {
          user_email: supportPayload.user_email,
          user_name: supportPayload.user_name,
          type: supportPayload.type,
          subject: supportPayload.subject,
          message: supportPayload.message,
          source: supportPayload.source,
        },
      })

      if (emailError) throw emailError

      setSuccess(true)
      setMessage("")
      setTimeout(() => setSuccess(false), 4500)
    } catch (err) {
      console.error("Erreur envoi message support:", err)
      setError(
        isKreol
          ? "Lo message la pa pu être envoyé. Réessay in kou."
          : "Le message n’a pas pu être envoyé. Réessayez dans un instant."
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <TropicalCard variant="ocean" texture="📧" style={{ padding: isMobile ? 16 : 22 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <div style={{ color: COLORS.cyan, fontWeight: 900, fontSize: 13, marginBottom: 6 }}>
            {isKreol ? "📧 Bezoin in kou d’min ?" : "📧 Besoin d’aide ?"}
          </div>

          <div style={{ color: COLORS.text, fontSize: isMobile ? 20 : 24, fontWeight: 900, lineHeight: 1.15 }}>
            {isKreol ? "Kontakte BudgetKazPei" : "Contacter BudgetKazPei"}
          </div>

          <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 7, lineHeight: 1.5 }}>
            {isKreol
              ? "In bug, in kestion ou in idée ? Écris out message, nou va recevoir ali é gard ali dann lespas support."
              : "Un bug, une question ou une idée ? Écrivez votre message, il sera envoyé à BudgetKazPei et conservé dans votre espace support."}
          </div>

          <div
            style={{
              marginTop: 10,
              background: "rgba(10,22,40,.45)",
              border: "1px solid rgba(255,255,255,.10)",
              borderRadius: 12,
              padding: "10px 12px",
              color: COLORS.text,
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {isKreol ? "Support" : "Support"} : <span style={{ color: COLORS.cyan }}>{SUPPORT_EMAIL}</span>
          </div>
        </div>

        <form onSubmit={handleSupportSubmit} style={{ display: "grid", gap: 10 }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder={isKreol ? "Out email" : "Votre email"}
            style={{
              background: "rgba(10,22,40,.55)",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 12,
              padding: "12px 13px",
              color: COLORS.text,
              outline: "none",
              fontFamily: "inherit",
              fontSize: 13,
            }}
          />

          <select
            value={typeDemande}
            onChange={e => setTypeDemande(e.target.value)}
            style={{
              background: "rgba(10,22,40,.55)",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 12,
              padding: "12px 13px",
              color: COLORS.text,
              outline: "none",
              fontFamily: "inherit",
              fontSize: 13,
            }}
          >
            <option value="question">{isKreol ? "Kestion / bezoin in kou d’min" : "Question / besoin d’aide"}</option>
            <option value="bug">{isKreol ? "Signale in bug" : "Signaler un bug"}</option>
            <option value="suggestion">{isKreol ? "Propoz in amélioration" : "Suggérer une amélioration"}</option>
            <option value="premium">Premium / Premium+</option>
          </select>

          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            required
            rows={4}
            placeholder={isKreol ? "Écris out message ici..." : "Écrivez votre message ici..."}
            style={{
              background: "rgba(10,22,40,.55)",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 12,
              padding: "12px 13px",
              color: COLORS.text,
              outline: "none",
              fontFamily: "inherit",
              fontSize: 13,
              resize: "vertical",
              minHeight: 105,
            }}
          />

          {error && (
            <div style={{ background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.28)", borderRadius: 12, padding: "10px 12px", color: "#FCA5A5", fontSize: 12, fontWeight: 800 }}>
              ⚠️ {error}
            </div>
          )}

          {success && (
            <div style={{ background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.28)", borderRadius: 12, padding: "10px 12px", color: "#BEF264", fontSize: 12, fontWeight: 800 }}>
              ✅ {isKreol ? "Out message lé bien envoyé. Nou répond aou dès que possible." : "Votre message a bien été envoyé. Nous vous répondrons dès que possible."}
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            style={{
              width: "100%",
              background: sending ? "rgba(142,164,197,.25)" : "rgba(35,211,214,.18)",
              border: "1px solid rgba(35,211,214,.35)",
              borderRadius: 14,
              color: sending ? COLORS.muted : COLORS.cyan,
              padding: "12px 14px",
              cursor: sending ? "not-allowed" : "pointer",
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            {sending ? (isKreol ? "Envoi..." : "Envoi...") : `📩 ${isKreol ? "Envoy lo message" : "Envoyer le message"}`}
          </button>

          <div style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: 1.45 }}>
            {isKreol
              ? "Lo message lé gardé dann Supabase ek envoyé par email à BudgetKazPei."
              : "Le message est stocké dans Supabase et envoyé par email à BudgetKazPei."}
          </div>
        </form>
      </div>
    </TropicalCard>
  )
}

function normalizeDashboardStatus(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function getDashboardGainAmount(item = {}) {
  return moneyValue(
    item.montant_obtenu ??
    item.gain_amount ??
    item.gain ??
    item.amount_obtenu ??
    item.montant ??
    0
  )
}

function isAcceptedDashboardDemarche(item = {}) {
  const status = normalizeDashboardStatus(item.status)
  return status.includes("accept") || status.includes("aksept") || status === "accepte"
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
  isPremiumPlus = false,
  plan = "free",
  customBudgets = [],
  onSaveBudgets,
  onGoPremium,
  opportunitiesCount = 0,
  commune = "",
  onOpenOpportunities,
  gainsAides = 0,
  nbAidesObtenues = 0,
  objectifGains = 1000,
  onOpenAides,
}) {
  const { revenus, depenses, solde } = stats
  const [openedDetails, setOpenedDetails] = useState(null)
  const [showBudgetModal, setShowBudgetModal] = useState(false)
  const ofIncome = revenus > 0 ? ((depenses / revenus) * 100).toFixed(0) : 0
  const [dashboardAideGains, setDashboardAideGains] = useState({
    gainsAides: 0,
    nbAidesObtenues: 0,
    gainsDetails: [],
    loaded: false,
  })
  const [subscriptionFromDb, setSubscriptionFromDb] = useState({
    plan: "",
    status: "",
    loaded: false,
  })

  const effectivePlan = subscriptionFromDb.plan || plan
  const effectiveStatus = subscriptionFromDb.status || ""
  const premiumStatus = getPremiumFlags({
    plan: effectivePlan,
    status: effectiveStatus,
    isPremium,
    isPremiumPlus,
  })
  const hasPremiumAccess = premiumStatus.hasPremiumAccess
  const hasPremiumPlusAccess = premiumStatus.hasPremiumPlusAccess

  useEffect(() => {
    let cancelled = false

    async function fetchSubscriptionForDashboard() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        const authUser = authData?.user

        if (authError || !authUser?.id) {
          if (!cancelled) {
            setSubscriptionFromDb({ plan: "", status: "", loaded: true })
          }
          return
        }

        let query = supabase
          .from("user_subscriptions")
          .select("plan,status,updated_at,created_at")
          .eq("user_id", authUser.id)
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false, nullsFirst: false })
          .limit(1)

        let { data, error } = await query.maybeSingle()

        if ((!data || error) && authUser.email) {
          const fallback = await supabase
            .from("user_subscriptions")
            .select("plan,status,updated_at,created_at")
            .eq("email", authUser.email)
            .order("updated_at", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle()

          data = fallback.data
          error = fallback.error
        }

        if (error) {
          console.error("Erreur chargement abonnement dashboard:", error)
          if (!cancelled) {
            setSubscriptionFromDb({ plan: "", status: "", loaded: true })
          }
          return
        }

        if (!cancelled) {
          setSubscriptionFromDb({
            plan: data?.plan || "",
            status: data?.status || "",
            loaded: true,
          })
        }
      } catch (err) {
        console.error("Erreur abonnement dashboard:", err)
        if (!cancelled) {
          setSubscriptionFromDb({ plan: "", status: "", loaded: true })
        }
      }
    }

    fetchSubscriptionForDashboard()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function fetchAideGainsForDashboard() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData?.user?.id) return

        const { data, error } = await supabase
          .from("aide_demarches")
          .select("*")
          .eq("user_id", authData.user.id)

        if (error) {
          console.error("Erreur chargement gains dashboard:", error)
          return
        }

        const acceptedWithGain = (data || [])
          .filter(item => isAcceptedDashboardDemarche(item))
          .map(item => ({
            ...item,
            dashboardGainAmount: getDashboardGainAmount(item),
          }))
          .filter(item => item.dashboardGainAmount > 0)

        const total = acceptedWithGain.reduce((sum, item) => sum + item.dashboardGainAmount, 0)
        const details = acceptedWithGain
          .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
          .map(item => ({
            label: item.aide_nom || item.nom || "Aide obtenue",
            amount: item.dashboardGainAmount,
          }))

        if (!cancelled) {
          setDashboardAideGains({
            gainsAides: total,
            nbAidesObtenues: acceptedWithGain.length,
            gainsDetails: details,
            loaded: true,
          })
        }
      } catch (error) {
        console.error("Erreur inattendue gains dashboard:", error)
      }
    }

    fetchAideGainsForDashboard()

    return () => {
      cancelled = true
    }
  }, [])

  const effectiveGainsAides = dashboardAideGains.loaded
    ? dashboardAideGains.gainsAides
    : Number(gainsAides || stats.gainsAides || 0)

  const effectiveNbAidesObtenues = dashboardAideGains.loaded
    ? dashboardAideGains.nbAidesObtenues
    : Number(nbAidesObtenues || stats.nbAidesObtenues || 0)

  const effectiveGainsDetails = dashboardAideGains.gainsDetails || []

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
          sub={getIsKreol(t) ? "Profil + larzan an plis" : "Profil + entrées ponctuelles"}
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

      <SmartWelcomeCard
        t={t}
        isMobile={isMobile}
        stats={stats}
        gainsAides={effectiveGainsAides}
        nbAidesObtenues={effectiveNbAidesObtenues}
        opportunitiesCount={opportunitiesCount}
        objectifGains={objectifGains}
        commune={commune}
      />

      <BudgetScoreCard
        t={t}
        isMobile={isMobile}
        stats={stats}
        byCategory={byCategory}
        gainsAides={effectiveGainsAides}
        nbAidesObtenues={effectiveNbAidesObtenues}
        opportunitiesCount={opportunitiesCount}
      />

      <SavingsV7Card
        t={t}
        isMobile={isMobile}
        stats={stats}
        byCategory={byCategory}
        abonnements={abonnements}
        transactions={transactions}
        onOpenOpportunities={onOpenOpportunities || onGoPremium}
      />

      <ContactSupportCard t={t} isMobile={isMobile} />

      <MoneyDetectedCard
        t={t}
        isMobile={isMobile}
        opportunitiesCount={opportunitiesCount}
        commune={commune}
        onOpenOpportunities={onOpenOpportunities || onGoPremium}
      />

      <RecoveredMoneyCard
        t={t}
        isMobile={isMobile}
        gainsAides={effectiveGainsAides}
        nbAidesObtenues={effectiveNbAidesObtenues}
        objectifGains={objectifGains}
        onOpenAides={onOpenAides}
        gainsDetails={effectiveGainsDetails}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 14,
        }}
      >
        <RecommendedActionsCard
          t={t}
          isMobile={isMobile}
          stats={stats}
          byCategory={byCategory}
          opportunitiesCount={opportunitiesCount}
          gainsAides={effectiveGainsAides}
          nbAidesObtenues={effectiveNbAidesObtenues}
          transactions={transactions}
          isPremium={hasPremiumAccess}
          onOpenOpportunities={onOpenOpportunities || onGoPremium}
          onOpenAides={onOpenAides}
          onGoPremium={onGoPremium}
        />

        <SavingsDetectedCard
          t={t}
          isMobile={isMobile}
          abonnements={abonnements}
          onOpenOpportunities={onOpenOpportunities || onGoPremium}
        />
      </div>

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
            <div style={{ textAlign: "center", padding: "20px 0", color: COLORS.whiteSoft, fontSize: 13 }}>{getIsKreol(t) ? "Nana pa dépans pou mwa-la" : "Aucune dépense ce mois"}</div>
          )}
        </TropicalCard>

        <TropicalCard variant="ocean" texture="🌊" style={{ padding: isMobile ? 16 : 22, minHeight: isMobile ? 260 : 300 }}>
          <h3 style={{ margin: "0 0 18px", fontSize: 15, color: COLORS.whiteSoft, fontWeight: 700, textAlign: "center" }}>
            {t("dashboard", "recentTransactions")}
          </h3>
          {transactions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: COLORS.whiteSoft, fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
              {getIsKreol(t) ? "Nana pa mouvman" : "Aucune transaction"}
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

      {hasPremiumAccess && byCategory.some(cat => cat.budget > 0 && cat.depense >= cat.budget) && (
        <TropicalCard variant="coral" texture="⚠️" style={{ padding: isMobile ? 16 : 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, color: COLORS.text, fontWeight: 900 }}>
            {getIsKreol(t) ? "Alèrt bidjé" : "Alertes budget"}
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
              if (hasPremiumAccess) {
                setShowBudgetModal(true)
              } else if (onGoPremium) {
                onGoPremium()
              }
            }}
            style={{
              background: hasPremiumAccess
                ? "rgba(255,255,255,.09)"
                : "linear-gradient(135deg, rgba(252,211,77,.22), rgba(245,158,11,.14))",
              border: hasPremiumAccess
                ? "1px solid rgba(255,255,255,.14)"
                : "1px solid rgba(252,211,77,.35)",
              borderRadius: 999,
              color: hasPremiumAccess ? COLORS.whiteSoft : "#FDE68A",
              cursor: "pointer",
              padding: "7px 12px",
              fontSize: 12,
              fontWeight: 900,
              fontFamily: "inherit",
              boxShadow: hasPremiumAccess ? "none" : "0 0 18px rgba(245,158,11,.10)",
            }}
          >
            {hasPremiumAccess ? "⚙️ Modifier mes budgets" : "🔒 Budgets personnalisés"}
          </button>
        </div>
        {!hasPremiumAccess && (
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
            {getIsKreol(t) ? "Fonksyon Premium : personnaliz out bidjé par katégori é gagn alèrt si ou dépassé." : "Fonction Premium : personnalisez vos budgets par catégorie et recevez des alertes de dépassement."}
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