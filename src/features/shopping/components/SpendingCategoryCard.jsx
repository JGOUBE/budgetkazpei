import { useState } from "react"
import {
  Apple, Cookie, Milk, Fish, ShoppingBasket, Wheat, GlassWater,
  House, Droplets, PawPrint, CircleHelp, ChevronDown, Lightbulb,
} from "lucide-react"
import { formatMontant } from "../../../utils/format"
import { createColorAliases } from "../../../styles/designSystem"

const COLORS = createColorAliases()
const ICONS = {
  apple: Apple, cookie: Cookie, milk: Milk, fish: Fish,
  "shopping-basket": ShoppingBasket, wheat: Wheat,
  "glass-water": GlassWater, house: House,
  droplets: Droplets, "paw-print": PawPrint,
  "circle-help": CircleHelp,
}

function FamilyRow({ group, shareTotal, expanded, onToggle, sortMode }) {
  const Icon = ICONS[group.icon] || CircleHelp
  const isUnknown = group.key === "other"
  const visualShare = sortMode === "spend"
    ? (shareTotal > 0 ? (100 * group.spent / shareTotal) : 0)
    : (shareTotal > 0 ? (100 * group.purchaseCount / shareTotal) : 0)
  return (
    <div style={{
      border: "1px solid " + COLORS.border,
      borderRadius: 13,
      overflow: "hidden",
      background: COLORS.surface,
    }}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "34px minmax(0, 1fr) auto",
          alignItems: "center",
          gap: 10,
          padding: "11px 12px",
          border: "none",
          background: "transparent",
          boxShadow: "none",
          color: COLORS.text,
          fontFamily: "inherit",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span aria-hidden="true" style={{
          width: 34,
          height: 34,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 11,
          background: isUnknown ? COLORS.card : COLORS.selected,
          color: isUnknown ? COLORS.muted : COLORS.cyan,
        }}>
          <Icon size={18}/>
        </span>
        <span style={{ display: "grid", gap: 4, minWidth: 0 }}>
          <strong style={{ fontSize: 13, lineHeight: 1.35, overflowWrap: "anywhere" }}>
            {group.label}
          </strong>
          <span style={{ fontSize: 11, color: COLORS.muted }}>
            {group.purchaseCount} lignes d'achat · {group.receiptCount} tickets
          </span>
          <span style={{
            width: "100%",
            maxWidth: 205,
            height: 4,
            borderRadius: 99,
            overflow: "hidden",
            background: COLORS.border,
          }}>
            <span style={{
              display: "block",
              height: "100%",
              width: Math.max(2, visualShare) + "%",
              borderRadius: 99,
              background: isUnknown ? COLORS.muted : COLORS.cyan,
            }}/>
          </span>
        </span>
        <span style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
          <span style={{ display: "grid", textAlign: "right", gap: 2 }}>
            <strong style={{ fontSize: 14, color: COLORS.text, whiteSpace: "nowrap" }}>
              {sortMode === "spend"
                ? formatMontant(group.spent)
                : group.purchaseCount + " achats"}
            </strong>
            <span style={{ color: COLORS.muted, fontSize: 11, whiteSpace: "nowrap" }}>
              {sortMode === "spend" ? group.sharePercent + " % du total" : formatMontant(group.spent)}
            </span>
          </span>
          <ChevronDown size={15} color={COLORS.muted} aria-hidden="true" style={{
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform .15s ease",
          }}/>
        </span>
      </button>
      {expanded && (
        <div style={{
          borderTop: "1px solid " + COLORS.border,
          padding: "10px 12px 12px",
          display: "grid",
          gap: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.text }}>
            Articles les plus présents dans ce poste
          </div>
          {group.products.slice(0, 5).map((product, index) => (
            <div key={index} style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) auto",
              alignItems: "start",
              gap: 10,
              fontSize: 12,
              lineHeight: 1.4,
              color: COLORS.text,
            }}>
              <span style={{ overflowWrap: "anywhere" }}>
                {product.label}
                <span style={{ color: COLORS.muted }}>
                  {" · " + product.purchaseCount + (product.purchaseCount > 1 ? " lignes" : " ligne")}
                </span>
              </span>
              <span style={{ whiteSpace: "nowrap", fontWeight: 700 }}>{formatMontant(product.spent)}</span>
            </div>
          ))}
          {group.products.length > 5 && (
            <span style={{ fontSize: 11, color: COLORS.muted }}>
              {"Et " + (group.products.length - 5) + " autres références dans les tickets."}
            </span>
          )}
          {group.suggestedAction && (
            <div style={{
              display: "flex", gap: 9, alignItems: "flex-start",
              borderTop: "1px solid " + COLORS.border,
              paddingTop: 10,
              color: COLORS.muted,
            }}>
              <Lightbulb size={15} color={COLORS.cyan} style={{ flexShrink: 0, marginTop: 2 }}/>
              <span style={{ fontSize: 12, lineHeight: 1.5 }}>{group.suggestedAction}</span>
            </div>
          )}
          {isUnknown && (
            <p style={{ margin: 0, color: COLORS.muted, fontSize: 11, lineHeight: 1.45 }}>
              Ces articles restent visibles, sans classement forcé. Leurs désignations pourront être améliorées au fil des tickets.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function SpendingCategoryCard({ summary, isKreol = false }) {
  const [sortMode, setSortMode] = useState("spend")
  const [showAll, setShowAll] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState("")
  const groups = summary?.categories || []
  if (!summary?.purchaseCount || !groups.length) return null

  const sorted = [...groups].sort((a, b) =>
    (a.key === "other" ? 1 : 0) - (b.key === "other" ? 1 : 0) ||
    (sortMode === "spend"
      ? b.spent - a.spent
      : b.purchaseCount - a.purchaseCount) ||
    a.label.localeCompare(b.label, "fr"),
  )
  const visible = showAll ? sorted : sorted.slice(0, 4)
  const top = [...groups].filter(row => row.key !== "other").sort((a, b) => b.spent - a.spent)[0]
  const hasUnknown = groups.some(row => row.key === "other")

  return (
    <section style={{
      background: COLORS.card,
      border: "1px solid " + COLORS.border,
      borderRadius: 22,
      padding: 16,
      boxShadow: COLORS.shadow,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", gap: 10, flexWrap: "wrap",
      }}>
        <div style={{ flex: "1 1 160px" }}>
          <h3 style={{ color: COLORS.text, fontSize: 18, fontWeight: 950, margin: 0 }}>
            {isKreol ? "Mon budget par famille" : "Mon budget par famille"}
          </h3>
          <p style={{ color: COLORS.muted, margin: "4px 0 0", fontSize: 12, lineHeight: 1.5 }}>
            Répartition indicative des lignes de vos tickets, sans extrapolation.
          </p>
        </div>
        <div style={{ background: COLORS.surface, borderRadius: 11, padding: "8px 10px", textAlign: "right" }}>
          <strong style={{ display: "block", color: COLORS.cyan, fontSize: 19, lineHeight: 1.25 }}>
            {formatMontant(summary.totalSpent)}
          </strong>
          <span style={{ color: COLORS.muted, fontSize: 10 }}>Dépenses relevées</span>
        </div>
      </div>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        margin: "14px 0 10px",
      }}>
        <span style={{ color: COLORS.muted, fontSize: 11, lineHeight: 1.35 }}>
          {summary.purchaseCount} lignes · {summary.receiptCount} tickets
          {hasUnknown && " · " + summary.classificationPercent + " % classés"}
        </span>
        <div role="group" aria-label="Classer les familles par" style={{
          background: COLORS.surface, border: "1px solid " + COLORS.border,
          borderRadius: 10, display: "flex", gap: 2, padding: 3,
        }}>
          {[
            { value: "spend", label: "Dépenses" },
            { value: "count", label: "Fréquence" },
          ].map(option => (
            <button
              key={option.value}
              type="button"
              aria-pressed={sortMode === option.value}
              onClick={() => setSortMode(option.value)}
              style={{
                border: "none",
                borderRadius: 7,
                background: sortMode === option.value ? COLORS.selected : "transparent",
                color: sortMode === option.value ? COLORS.text : COLORS.muted,
                boxShadow: "none",
                padding: "6px 9px",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: sortMode === option.value ? 800 : 600,
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 7 }}>
        {visible.map(group => (
          <FamilyRow
            key={group.key}
            group={group}
            shareTotal={sortMode === "spend" ? summary.totalSpent : summary.purchaseCount}
            sortMode={sortMode}
            expanded={expandedCategory === group.key}
            onToggle={() => setExpandedCategory(current => current === group.key ? "" : group.key)}
          />
        ))}
      </div>
      {groups.length > 4 && (
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => {
            setShowAll(value => !value)
            setExpandedCategory("")
          }}
          style={{
            display: "block",
            margin: "11px auto 0",
            padding: "9px 14px",
            border: "1px solid " + COLORS.border,
            borderRadius: 11,
            background: COLORS.surface,
            color: COLORS.cyan,
            boxShadow: "none",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {showAll ? "Afficher les principales familles" : "Voir toutes les " + groups.length + " familles"}
        </button>
      )}
      {top && (
        <p style={{ margin: "11px 1px 0", color: COLORS.muted, fontSize: 11, lineHeight: 1.5 }}>
          Premier poste reconnu : <strong style={{ color: COLORS.text }}>{top.label}</strong>.
          Les économies proposées nécessitent une comparaison fiable des mêmes articles et formats.
        </p>
      )}
    </section>
  )
}
