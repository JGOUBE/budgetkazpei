import { useState } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { formatAmount, formatMontant } from "../../utils/format"
import TropicalCard, { TROPICAL_VARIANTS } from "./TropicalCard"

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

function DetailItem({ icon, label, value, color }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid rgba(255,255,255,.08)",
      }}
    >
      <span style={{ color: COLORS.text, fontSize: 14 }}>
        <span style={{ marginRight: 8 }}>{icon}</span>
        {label}
      </span>
      <strong style={{ color, fontSize: 15 }}>{value}</strong>
    </div>
  )
}

function SoldeDetails({ stats, onClose }) {
  return (
    <TropicalCard variant="lagoon" texture="🌴">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <h3 style={{ margin: 0, color: COLORS.text, fontSize: 16 }}>Détail du solde disponible</h3>
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
          Fermer
        </button>
      </div>

      <DetailItem icon="📊" label="Charges fixes ce mois-ci" value={formatMontant(stats.chargesFixes || 0)} color={COLORS.accentSoft} />
      <DetailItem icon="💰" label="Dépenses variables" value={formatMontant(stats.depensesVariables || 0)} color={COLORS.blue} />
      <DetailItem icon="🎯" label="Reste à vivre" value={formatMontant(stats.resteAVivre || 0)} color={(stats.resteAVivre || 0) >= 0 ? COLORS.green : COLORS.red} />

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
        Vos charges fixes représentent <strong style={{ color: COLORS.blue }}>{stats.tauxChargesFixes || 0} %</strong> de vos revenus.
      </div>
    </TropicalCard>
  )
}

function RevenusDetails({ stats, onClose }) {
  const revenus = stats.revenus || 0
  const chargesFixes = stats.chargesFixes || 0
  const depensesVariables = stats.depensesVariables || 0
  const resteAVivre = stats.resteAVivre || 0
  const totalDepenses = chargesFixes + depensesVariables
  const tauxDisponible = revenus > 0 ? Math.max((resteAVivre / revenus) * 100, 0).toFixed(0) : 0

  return (
    <TropicalCard variant="green" texture="🍃">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <h3 style={{ margin: 0, color: COLORS.text, fontSize: 16 }}>Détail des revenus du mois</h3>
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
          Fermer
        </button>
      </div>

      <DetailItem icon="💵" label="Revenus enregistrés" value={formatMontant(revenus)} color="#BEF264" />
      <DetailItem icon="📌" label="Charges fixes prévues" value={formatMontant(chargesFixes)} color={COLORS.accentSoft} />
      <DetailItem icon="🛒" label="Dépenses variables" value={formatMontant(depensesVariables)} color={COLORS.blue} />
      <DetailItem icon="🎯" label="Reste disponible estimé" value={formatMontant(resteAVivre)} color={resteAVivre >= 0 ? COLORS.green : COLORS.red} />

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
        Après dépenses et charges, il vous reste environ <strong style={{ color: "#BEF264" }}>{tauxDisponible} %</strong> de vos revenus disponibles.
        {totalDepenses > 0 && (
          <span> Total déjà engagé : <strong style={{ color: COLORS.accentSoft }}>{formatMontant(totalDepenses)}</strong>.</span>
        )}
      </div>
    </TropicalCard>
  )
}

function DepensesDetails({ stats, onClose }) {
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
        <h3 style={{ margin: 0, color: COLORS.text, fontSize: 16 }}>Détail des dépenses du mois</h3>
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
          Fermer
        </button>
      </div>

      <DetailItem icon="📊" label="Dépenses du mois" value={formatMontant(depenses)} color="#FDBA74" />
      <DetailItem icon="📌" label={`Charges fixes (${tauxCharges} % des revenus)`} value={formatMontant(chargesFixes)} color={COLORS.accentSoft} />
      <DetailItem icon="🛒" label={`Dépenses variables (${tauxVariables} % des revenus)`} value={formatMontant(depensesVariables)} color={COLORS.blue} />
      <DetailItem icon="⚖️" label="Total charges + variables" value={formatMontant(chargesFixes + depensesVariables)} color={(chargesFixes + depensesVariables) > revenus ? COLORS.red : COLORS.green} />

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
        Vos charges fixes et dépenses variables représentent <strong style={{ color: "#FDBA74" }}>{tauxTotal} %</strong> de vos revenus du mois.
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

export default function Dashboard({ stats, byCategory, pieData, transactions, t, isMobile }) {
  const { revenus, depenses, solde } = stats
  const [openedDetails, setOpenedDetails] = useState(null)
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
          actionLabel="Détails"
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
          actionLabel="Détails"
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
          actionLabel="Détails"
          onAction={() => toggleDetails("depenses")}
        />
      </div>

      {openedDetails === "solde" && <SoldeDetails stats={stats} onClose={() => setOpenedDetails(null)} />}
      {openedDetails === "revenus" && <RevenusDetails stats={stats} onClose={() => setOpenedDetails(null)} />}
      {openedDetails === "depenses" && <DepensesDetails stats={stats} onClose={() => setOpenedDetails(null)} />}

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

      <TropicalCard variant="gold" texture="🌿" style={{ padding: isMobile ? 16 : 24 }}>
        <h3 style={{ margin: "0 0 20px", fontSize: 16, color: COLORS.whiteSoft, fontWeight: 800, textAlign: "center" }}>
          {t("dashboard", "budgetByCategory")}
        </h3>
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
    </div>
  )
}
