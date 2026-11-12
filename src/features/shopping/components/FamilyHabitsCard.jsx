import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { formatMontant } from "../../../utils/format"
import { createColorAliases } from "../../../styles/designSystem"

const COLORS = createColorAliases()

function purchaseCount(count) {
  return String(count) + (count > 1 ? " achats" : " achat")
}

export default function FamilyHabitsCard({ families = [], isKreol = false }) {
  const [expandedKeys, setExpandedKeys] = useState([])
  const [showAll, setShowAll] = useState(false)
  if (!families.length) return null

  const visible = families.slice(0, showAll ? 8 : 3)
  return (
    <section style={{
      background: COLORS.card,
      border: "1px solid " + COLORS.border,
      borderRadius: 22,
      padding: 16,
      boxShadow: COLORS.shadow,
    }}>
      <h3 style={{ color: COLORS.text, fontSize: 18, fontWeight: 950, margin: 0 }}>
        {isKreol ? "Bann achats regroupés" : "Mes achats regroupés"}
      </h3>
      <p style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.5, margin: "5px 0 12px" }}>
        {isKreol
          ? "Des formats différents, in mem famille. Pa de comparaison de pri entre bann formats."
          : "Des formats différents, une même habitude. Les prix restent suivis séparément par article."}
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {visible.map(family => {
          const isExpanded = expandedKeys.includes(family.key)
          return (
            <div key={family.key} style={{
              border: "1px solid " + COLORS.border,
              borderRadius: 13,
              overflow: "hidden",
              background: COLORS.surface,
            }}>
              <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() => setExpandedKeys(current => current.includes(family.key)
                  ? current.filter(key => key !== family.key)
                  : [...current, family.key])}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  border: "none",
                  background: "transparent",
                  color: COLORS.text,
                  fontFamily: "inherit",
                  padding: "11px 12px",
                  textAlign: "left",
                  boxShadow: "none",
                  cursor: "pointer",
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: "block", fontSize: 14, lineHeight: 1.4, overflowWrap: "anywhere" }}>
                    {family.label}
                  </strong>
                  <span style={{ display: "block", color: COLORS.muted, marginTop: 2, fontSize: 12 }}>
                    {purchaseCount(family.purchaseCount)}
                    {family.receiptCount > 0 && " · " + family.receiptCount + " tickets"}
                    {" · " + family.variants.length + " références"}
                  </span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                  <strong style={{ fontSize: 13, color: COLORS.cyan }}>
                    {formatMontant(family.totalSpent)}
                  </strong>
                  <ChevronDown size={16} aria-hidden="true" style={{
                    color: COLORS.muted,
                    transform: isExpanded ? "rotate(180deg)" : "none",
                    transition: "transform .15s ease",
                  }}/>
                </span>
              </button>
              {isExpanded && (
                <div style={{
                  borderTop: "1px solid " + COLORS.border,
                  padding: "9px 12px 12px",
                  display: "grid",
                  gap: 6,
                }}>
                  {family.variants.map(variant => (
                    <div key={variant.label} style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      alignItems: "start",
                      gap: 8,
                      fontSize: 12,
                      lineHeight: 1.45,
                      color: COLORS.text,
                    }}>
                      <span style={{ overflowWrap: "anywhere" }}>
                        {variant.label}
                        <span style={{ color: COLORS.muted }}> · {purchaseCount(variant.purchaseCount)}</span>
                      </span>
                      <span style={{ whiteSpace: "nowrap", color: COLORS.muted }}>
                        {formatMontant(variant.totalSpent)}
                      </span>
                    </div>
                  ))}
                  <p style={{ color: COLORS.muted, fontSize: 11, lineHeight: 1.4, margin: "5px 0 0" }}>
                    {isKreol
                      ? "Totaux relevés sur les tickets, pa in pri moyen pou bann formats."
                      : "Dépenses relevées sur vos tickets, sans mélanger les prix unitaires des formats."}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {families.length > 3 && (
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll(value => !value)}
          style={{
            display: "block",
            margin: "12px auto 0",
            padding: "8px 13px",
            background: COLORS.surface,
            color: COLORS.cyan,
            border: "1px solid " + COLORS.border,
            borderRadius: 11,
            cursor: "pointer",
            boxShadow: "none",
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          {showAll ? "Afficher moins" : "Voir les autres familles"}
        </button>
      )}
    </section>
  )
}
