import { useState } from "react"
import { formatMontant } from "../../../utils/format"
import { createColorAliases } from "../../../styles/designSystem"

const COLORS = createColorAliases()
const cardStyle = extra => ({
  background: COLORS.card,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 22,
  boxShadow: COLORS.shadow,
  ...extra,
})

function formatShortDate(value) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("fr-FR") : "—"
}

function formatAdvicePrice(value, suggestion) {
  const formatted = formatMontant(value)
  return suggestion.normalizedComparison && suggestion.unitLabel
    ? `${formatted.replace("€", "").trim()} ${suggestion.unitLabel}`
    : formatted
}

export default function HabitAdviceCard({ suggestions = [], isKreol = false }) {
  const [expanded, setExpanded] = useState(false)
  const visibleSuggestions = expanded ? suggestions : suggestions.slice(0, 2)

  return (
    <section style={cardStyle({ padding: 16 })} aria-label={isKreol ? "Bann conseil lékonomi" : "Mes pistes d'économies"}>
      <h3 style={{ color: COLORS.text, fontSize: 18, fontWeight: 950, margin: "0 0 5px" }}>
        {isKreol ? "Bann ti conseil pou économizé" : "Des idées pour économiser"}
      </h3>
      <p style={{ color: COLORS.muted, fontSize: 12, margin: "0 0 12px", lineHeight: 1.45 }}>
        {isKreol ? "Bann propositions dapré out achats, sans jugement."
          : "Quelques pistes selon vos achats, sans jugement."}
      </p>
      {suggestions.length === 0 ? (
        <p style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          {isKreol
            ? "Pas encore de piste précise. Out tickets y servira pou proposer bann conseils plus utiles."
            : "Aucune piste suffisamment précise pour le moment. Vos tickets permettent de préparer de futurs conseils sans inventer d'économies."}
        </p>
      ) : (
      <div style={{ display: "grid", gap: 10 }}>
        {visibleSuggestions.map(suggestion => (
          <article key={suggestion.key} style={{
            border: `1px solid ${COLORS.border}`,
            background: COLORS.surface,
            borderRadius: 12,
            padding: "12px 13px",
            color: COLORS.text,
          }}>
            {suggestion.type === "regionalPrice" ? (
              <>
                <strong style={{ display: "block", fontSize: 14, lineHeight: 1.35 }}>
                  {isKreol ? "In prix pli ba relevé pou mem produit" : "Un prix plus bas relevé pour le même produit"}
                </strong>
                <p style={{ margin: "5px 0 0", fontSize: 13, fontWeight: 750, overflowWrap: "anywhere" }}>
                  {suggestion.product}
                </p>
                <p style={{ margin: "6px 0 0", color: COLORS.muted, fontSize: 12, lineHeight: 1.45 }}>
                  {isKreol ? "Out dernier achat" : "Votre dernier achat"} : {formatMontant(suggestion.referencePrice)}
                  {" · "}{suggestion.referenceStore} ({formatShortDate(suggestion.referenceDate)})
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.45 }}>
                  {isKreol ? "Prix relevé koté" : "Prix relevé chez"}{" "}
                  <strong>{suggestion.alternativeStore}</strong> :{" "}
                  <strong style={{ color: COLORS.cyan }}>{formatMontant(suggestion.alternativePrice)}</strong>
                  {" · "}{formatShortDate(suggestion.observedAt)}
                </p>
                <p style={{ margin: "5px 0 0", color: COLORS.muted, fontSize: 12, lineHeight: 1.45 }}>
                  {isKreol ? "Différence relevée par paquet" : "Écart observé par article"} :{" "}
                  <strong>{formatMontant(suggestion.saving)}</strong>.{" "}
                  {isKreol ? "Disponibilité pou vérifier dan magasin." : "Disponibilité et prix actuel à vérifier en magasin."}
                </p>
              </>
            ) : suggestion.type === "habit" ? (
              <>
                <strong style={{ display: "block", fontSize: 14, lineHeight: 1.35 }}>
                  {isKreol ? "Et si ou fé in gâteau maison de temps en temps ?" : "Et si vous faisiez un gâteau maison de temps en temps ?"}
                </strong>
                <p style={{ margin: "5px 0 0", fontSize: 13, lineHeight: 1.45, color: COLORS.muted }}>
                  {isKreol
                    ? "Biscuit ek goûter i revient dann out tickets. Préparer un gâteau de temps en temps peut être intéressant : compare le coût bann ingrédients."
                    : "Les biscuits et goûters reviennent régulièrement dans vos tickets. Une préparation maison peut être une alternative : comparez le coût des ingrédients."}
                </p>
              </>
            ) : suggestion.type === "spending" ? (
              <>
                <strong style={{ display: "block", fontSize: 14, lineHeight: 1.35 }}>
                  {isKreol ? "In achat ki revient souvent" : "Un achat qui revient souvent"}
                </strong>
                <p style={{ margin: "5px 0 0", fontSize: 13, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                  <strong>{suggestion.product}</strong> : {isKreol ? "relevé su" : "relevé sur"}{" "}
                  <strong>{suggestion.receiptCount} tickets</strong> ·{" "}
                  <strong>{formatMontant(suggestion.totalSpent)}</strong>{" "}
                  {isKreol ? "au total su bann lignes d'achat" : "cumulés sur les lignes d'achat"}.
                </p>
                <p style={{ margin: "5px 0 0", fontSize: 12, lineHeight: 1.45, color: COLORS.muted }}>
                  {isKreol ? "In ti réflexe : compare le pri par unité ou le format avan rachète."
                    : "Au prochain achat, comparer le prix à l'unité ou les formats pourrait être utile."}
                </p>
              </>
            ) : suggestion.type === "priceRise" ? (
              <>
                <strong style={{ display: "block", fontSize: 14, lineHeight: 1.35 }}>
                  {isKreol ? "Pri plus haut su out tickets" : "Un prix en hausse sur vos tickets"}
                </strong>
                <p style={{ margin: "5px 0 0", fontSize: 13, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                  <strong>{suggestion.product}</strong> · {suggestion.store}
                </p>
                <p style={{ margin: "5px 0 0", fontSize: 13, lineHeight: 1.45 }}>
                  {formatMontant(suggestion.previousPrice)} ({formatShortDate(suggestion.previousDate)}){" "}
                  → <strong style={{ color: COLORS.cyan }}>{formatMontant(suggestion.latestPrice)}</strong>{" "}
                  ({formatShortDate(suggestion.latestDate)})
                </p>
                <p style={{ margin: "5px 0 0", fontSize: 12, lineHeight: 1.45, color: COLORS.muted }}>
                  {isKreol
                    ? "In promo avant pé explique la différence. Vérifie le pri avan le prochain achat."
                    : "Une promotion précédente peut expliquer l'écart. Vérifiez le prix avant votre prochain achat."}
                </p>
              </>
            ) : suggestion.type === "price" ? (
              <>
                <strong style={{ display: "block", fontSize: 14, lineHeight: 1.35, overflowWrap: "anywhere" }}>
                  {suggestion.product}
                </strong>
                <p style={{ margin: "5px 0 0", fontSize: 13, lineHeight: 1.45 }}>
                  {isKreol ? "Pri out achat koté" : "Votre achat chez"}{" "}
                  <strong>{suggestion.referenceStore}</strong> :{" "}
                  {formatAdvicePrice(suggestion.referencePrice, suggestion)}
                </p>
                <p style={{ margin: "5px 0 0", fontSize: 13, lineHeight: 1.45 }}>
                  {isKreol ? "Pri pli ba relevé koté" : "Prix plus bas relevé chez"}{" "}
                  <strong>{suggestion.store}</strong> :{" "}
                  <strong style={{ color: COLORS.cyan }}>
                    {formatAdvicePrice(suggestion.alternativePrice, suggestion)}
                  </strong>
                </p>
                <p style={{ margin: "5px 0 0", fontSize: 12, lineHeight: 1.4, color: COLORS.muted }}>
                  {isKreol ? "Écart relevé" : "Écart observé"} : {formatMontant(suggestion.saving)} ·{" "}
                  {isKreol ? "Pri relevé le" : "Prix relevé le"}{" "}
                  {formatShortDate(suggestion.observedAt)}
                </p>
              </>
            ) : null}
          </article>
        ))}
        {suggestions.length > 2 && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(current => !current)}
            style={{
              margin: "0 auto",
              padding: "8px 13px",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 11,
              background: COLORS.surface,
              color: COLORS.cyan,
              fontSize: 12,
              fontWeight: 800,
              boxShadow: "none",
              cursor: "pointer",
            }}
          >
            {expanded
              ? (isKreol ? "Réduire" : "Afficher moins")
              : (isKreol ? "War in nout conseil" : "Voir une autre idée")}
          </button>
        )}
      </div>
      )}
    </section>
  )
}
