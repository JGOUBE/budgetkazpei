import { useEffect, useMemo, useState } from "react"
import { CalendarClock, PiggyBank, ScanLine, Store } from "lucide-react"
import { listShoppingItems } from "../features/shopping/services/shoppingEngine"
import { buildSavingsInsights } from "../services/savings/savingsEngine"
import { formatMontant } from "../utils/format"
import "../features/shopping/pages/shoppingHub.css"

const COPY = {
  fr: {
    eyebrow: "Comparaisons fiables",
    title: "Mes économies",
    intro: "Des pistes prudentes, calculées uniquement à partir de produits comparables dans vos achats enregistrés.",
    potential: "Économie potentielle repérée",
    potentialHint: "Somme des écarts fiables pour le dernier achat comparable de chaque produit.",
    suggestions: "Comparaisons disponibles",
    purchasePrice: "Prix observé lors de votre achat",
    lowerPrice: "Prix plus bas observé",
    saving: "Économie potentielle",
    normalized: "Comparaison sur un prix normalisé",
    lastSeen: "Dernière observation",
    observations: count => `${count} observation${count > 1 ? "s" : ""}`,
    emptyTitle: "Pas encore assez de données comparables",
    empty: "Continuez à scanner vos tickets pour enrichir vos comparaisons. BudgetKazPéi préfère ne rien afficher plutôt que proposer une économie incertaine.",
    error: "Les comparaisons ne peuvent pas être chargées pour le moment.",
    loading: "Vérification des produits comparables…",
  },
  kreol: {
    eyebrow: "Konparézon fiable",
    title: "Mon bann lékonomi",
    intro: "Bann piste prudente, kalkilé sèlman ek produits nou pé vréman konparé dann out achats enregistrés.",
    potential: "Lékonomi potentielle repérée",
    potentialHint: "Total bann écarts fiables pou dernier achat konparab de chaque produit.",
    suggestions: "Bann konparézon disponib",
    purchasePrice: "Prix observé kan ou la acheté",
    lowerPrice: "Prix pli ba observé",
    saving: "Lékonomi potentielle",
    normalized: "Konparézon su in prix normalisé",
    lastSeen: "Dernière observation",
    observations: count => `${count} observation${count > 1 ? "s" : ""}`,
    emptyTitle: "Nana pa ankor assez donné konparab",
    empty: "Kontinyé scan out bann tiké pou enrichi bann konparézon. BudgetKazPéi préfère affiche rien plutôt ke propose in lékonomi incertaine.",
    error: "Bann konparézon lé indisponib pou linstan.",
    loading: "Nou lé vérifie bann produits konparab…",
  },
}

function isKreolLanguage(language) {
  return ["cr", "kreol", "kr"].includes(String(language || "").toLowerCase())
}

function formatObservedPrice(value, suggestion) {
  const price = formatMontant(value)
  return suggestion.normalizedComparison && suggestion.unitLabel
    ? `${price.replace("€", "").trim()} ${suggestion.unitLabel}`
    : price
}

function formatDate(value) {
  if (!value) return "—"
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "—"
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

export default function SavingsPage({ user, language = "fr" }) {
  const txt = isKreolLanguage(language) ? COPY.kreol : COPY.fr
  const [shoppingItems, setShoppingItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let ignore = false

    listShoppingItems({ userId: user?.id })
      .then(rows => {
        if (!ignore) setShoppingItems(rows || [])
      })
      .catch(loadError => {
        console.error("Erreur chargement économies:", loadError)
        if (!ignore) {
          setShoppingItems([])
          setError("savings_unavailable")
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => { ignore = true }
  }, [user?.id])

  const insights = useMemo(
    () => buildSavingsInsights({ shoppingItems }),
    [shoppingItems],
  )

  return (
    <section className="bkp-savings-panel" aria-labelledby="shopping-savings-title">
      <header className="bkp-shopping-section-heading">
        <span><PiggyBank size={15} />{txt.eyebrow}</span>
        <h2 id="shopping-savings-title">{txt.title}</h2>
        <p>{txt.intro}</p>
      </header>

      {loading ? (
        <div className="bkp-shopping-empty" role="status">
          <ScanLine size={28} aria-hidden="true" />
          <p>{txt.loading}</p>
        </div>
      ) : error ? (
        <div className="bkp-shopping-empty" role="alert">
          <PiggyBank size={28} aria-hidden="true" />
          <p>{txt.error}</p>
        </div>
      ) : insights.suggestions.length === 0 ? (
        <div className="bkp-shopping-empty">
          <ScanLine size={30} aria-hidden="true" />
          <h3>{txt.emptyTitle}</h3>
          <p>{txt.empty}</p>
        </div>
      ) : (
        <>
          <div className="bkp-savings-total">
            <div>
              <span>{txt.potential}</span>
              <strong>{formatMontant(insights.totalPotential)}</strong>
            </div>
            <p>{txt.potentialHint}</p>
          </div>

          <div className="bkp-savings-list" aria-label={txt.suggestions}>
            {insights.suggestions.map(item => (
              <article className="bkp-savings-card" key={item.productKey}>
                <div className="bkp-savings-card-head">
                  <div>
                    <span>{txt.suggestions}</span>
                    <h3>{item.product}</h3>
                  </div>
                  <strong className="bkp-savings-amount">{formatMontant(item.potentialSaving)}</strong>
                </div>

                <div className="bkp-savings-prices">
                  <div>
                    <span>{txt.purchasePrice}</span>
                    <strong>{formatObservedPrice(item.referencePrice, item)}</strong>
                    <small>{item.referenceStore}</small>
                  </div>
                  <div>
                    <span>{txt.lowerPrice}</span>
                    <strong>{formatObservedPrice(item.alternativePrice, item)}</strong>
                    <small><Store size={13} aria-hidden="true" />{item.bestStore}</small>
                  </div>
                </div>

                <div className="bkp-savings-meta">
                  <span><PiggyBank size={14} aria-hidden="true" />{txt.saving} : {formatMontant(item.potentialSaving)}</span>
                  <span><CalendarClock size={14} aria-hidden="true" />{txt.lastSeen} : {formatDate(item.lastObservedAt)}</span>
                  <span>{txt.observations(item.observationsCount)}</span>
                  {item.normalizedComparison && <span>{txt.normalized} · {item.unitLabel}</span>}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
