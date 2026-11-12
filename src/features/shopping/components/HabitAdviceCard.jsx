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

function formatAdvicePrice(value, suggestion) {
  const formatted = formatMontant(value)
  return suggestion.normalizedComparison && suggestion.unitLabel
    ? `${formatted.replace("€", "").trim()} ${suggestion.unitLabel}`
    : formatted
}

export default function HabitAdviceCard({ suggestions = [], isKreol = false }) {
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
        {suggestions.map(suggestion => (
          <article key={suggestion.key} style={{
            border: `1px solid ${COLORS.border}`,
            background: COLORS.surface,
            borderRadius: 12,
            padding: "12px 13px",
            color: COLORS.text,
          }}>
            {suggestion.type === "habit" ? (
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
            ) : (
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
                  {new Date(suggestion.observedAt).toLocaleDateString("fr-FR")}
                </p>
              </>
            )}
          </article>
        ))}
      </div>
      )}
    </section>
  )
}
