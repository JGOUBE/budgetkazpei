import { useEffect, useMemo, useState } from "react"
import { CalendarClock, PiggyBank, ScanLine, Store } from "lucide-react"
import { listShoppingItems } from "../features/shopping/services/shoppingEngine"
import { buildSavingsInsights } from "../services/savings/savingsEngine"
import { supabase } from "../services/supabase"
import { formatSharedPriceRetailer } from "../services/shoppingList/sharedPricePresentation"
import { buildHabitSuggestions } from "../features/shopping/services/habitAdvice"
import HabitAdviceCard from "../features/shopping/components/HabitAdviceCard"
import { formatMontant } from "../utils/format"
import "../features/shopping/pages/shoppingHub.css"

const COPY = {
  fr: {
    eyebrow: "Comparaisons fiables",
    title: "Mes économies",
    intro: "Comparaisons prudentes de vos achats et de prix relevés, uniquement pour des produits précisément identifiés.",
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
    empty: "Aucun prix inférieur suffisamment fiable pour le même produit dans une autre enseigne. Les observations datées de vos prochains achats permettront d'améliorer ces comparaisons.",
    error: "Les comparaisons ne peuvent pas être chargées pour le moment.",
    loading: "Vérification des produits comparables…",
    catalogLoading: "Recherche des prix relevés dans les autres enseignes…",
    catalogUnavailable: "La recherche des prix dans les autres enseignes n’a pas abouti. Les comparaisons disponibles restent affichées.",
    retry: "Réessayer",
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
    catalogLoading: "Nou lé rod bann pri dann lezot magasins…",
    catalogUnavailable: "Nou la pa réussi charge bann pri lezot magasins. Bann konparézon disponib i reste affiché.",
    retry: "Réesaye",
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

export default function SavingsPage({ user, language = "fr", standalone = false }) {
  const txt = isKreolLanguage(language) ? COPY.kreol : COPY.fr
  const [shoppingItems, setShoppingItems] = useState([])
  const [catalogComparisons, setCatalogComparisons] = useState([])
  const [unreconciledReceiptIds, setUnreconciledReceiptIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [catalogStatus, setCatalogStatus] = useState("loading")
  const [retryVersion, setRetryVersion] = useState(0)
  const retry = () => setRetryVersion(n => n + 1)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError("")
    setCatalogStatus("loading")
    setShoppingItems([])
    setCatalogComparisons([])
    setUnreconciledReceiptIds([])

    if (!user?.id) {
      setShoppingItems([])
      setCatalogComparisons([])
      setUnreconciledReceiptIds([])
      setLoading(false)
      setCatalogStatus("ready")
      return () => { ignore = true }
    }

    const controller = new AbortController()
    // Bound slow connections; never start automatic retry loops.
    const timeout = setTimeout(() => controller.abort(), 20000)
    // The server checks ownership and only returns lower, dated prices for
    // the SAME verified commercial SKU at a different retailer.
    supabase.rpc("shopping_verified_catalog_savings", { p_max_age_days: 180 }).abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (error) throw error
        if (!ignore) setCatalogComparisons((data || []).map(entry => ({
          ...entry,
          alternative_store_name: formatSharedPriceRetailer({
            retailer_slug: entry.alternative_retailer_slug,
            commune: entry.alternative_commune,
            locality: entry.alternative_locality,
          }),
        })))
        if (!ignore) setCatalogStatus("ready")
      })
      .catch(() => { if (!ignore) { setCatalogComparisons([]); setCatalogStatus("unavailable") } })

    Promise.all([
      listShoppingItems({ userId: user?.id, includeProductIdentity: true, signal: controller.signal }),
      supabase.from("receipts")
        .select("id,total_amount")
        .eq("user_id",user.id)
        .eq("validation_status","validated")
        .is("removed_from_history_at",null)
        .is("duplicate_of_receipt_id",null)
        .abortSignal(controller.signal),
    ])
      .then(([rows, receiptsResult]) => {
        if (receiptsResult.error) throw receiptsResult.error
        if (ignore) return
        const receiptTotals = new Map((receiptsResult.data || []).map(receipt =>
          [receipt.id, Number(receipt.total_amount) || 0]))
        const lineTotals = new Map()
        for (const row of rows || []) {
          if (!row.receipt_id) continue
          lineTotals.set(row.receipt_id, (lineTotals.get(row.receipt_id) || 0) + (Number(row.price) || 0))
        }
        // Discounts that cannot be attributed to a product must never be
        // turned into claimed per-product savings. Purchases stay in habits.
        const unreconciled = [...lineTotals.entries()].filter(([id, amount]) =>
          receiptTotals.has(id) && Math.abs(amount - receiptTotals.get(id)) > 0.05,
        ).map(([id]) => id)
        setUnreconciledReceiptIds(unreconciled)
        setShoppingItems(rows || [])
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

    return () => { ignore = true; clearTimeout(timeout); controller.abort() }
  }, [user?.id, retryVersion])

  const comparableItems = useMemo(() => {
    const excluded = new Set(unreconciledReceiptIds)
    return shoppingItems.filter(row => !excluded.has(row.receipt_id))
  }, [shoppingItems, unreconciledReceiptIds])
  const insights = useMemo(
    () => buildSavingsInsights({ shoppingItems: comparableItems, catalogComparisons }),
    [comparableItems, catalogComparisons],
  )
  const habitSuggestions = useMemo(() => buildHabitSuggestions(comparableItems), [comparableItems])

  return (
    <section className="bkp-savings-panel" aria-labelledby="shopping-savings-title">
      <header className="bkp-shopping-section-heading">
        <span><PiggyBank size={15} />{txt.eyebrow}</span>
        {standalone ? <h1 id="shopping-savings-title">{txt.title}</h1> : <h2 id="shopping-savings-title">{txt.title}</h2>}
        <p>{txt.intro}</p>
      </header>

      {!loading && !error && shoppingItems.length > 0 && (
        <HabitAdviceCard suggestions={habitSuggestions} isKreol={isKreolLanguage(language)} />
      )}

      {loading ? (
        <div className="bkp-shopping-empty" role="status">
          <ScanLine size={28} aria-hidden="true" />
          <p>{txt.loading}</p>
        </div>
      ) : error ? (
        <div className="bkp-shopping-empty" role="alert">
          <PiggyBank size={28} aria-hidden="true" />
          <p>{txt.error}</p>
          <button type="button" onClick={retry} style={{background:"#E4E4CE",color:"#4B6332",border:"1px solid #C5C9A9",borderRadius:9,padding:"10px 16px",fontWeight:600}}>{txt.retry}</button>
        </div>
      ) : insights.suggestions.length === 0 && catalogStatus === "loading" ? (
        <div className="bkp-shopping-empty" role="status"><ScanLine size={26} aria-hidden="true" /><p>{txt.catalogLoading}</p></div>
      ) : insights.suggestions.length === 0 && catalogStatus === "unavailable" ? (
        <div className="bkp-shopping-empty" role="status"><PiggyBank size={26} aria-hidden="true" /><p>{txt.catalogUnavailable}</p><button type="button" onClick={retry} style={{background:"#E4E4CE",color:"#4B6332",border:"1px solid #C5C9A9",borderRadius:9,padding:"10px 16px",fontWeight:600}}>{txt.retry}</button></div>
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

          {catalogStatus === "loading" && <p role="status" style={{fontSize:13}}>{txt.catalogLoading}</p>}
          {catalogStatus === "unavailable" && <p role="status" style={{fontSize:13}}>{txt.catalogUnavailable} <button type="button" onClick={retry} style={{background:"#E4E4CE",color:"#4B6332",border:"1px solid #C5C9A9",borderRadius:9,padding:"7px 12px",fontWeight:600}}>{txt.retry}</button></p>}
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
