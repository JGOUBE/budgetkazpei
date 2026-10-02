import { useEffect, useMemo, useRef, useState } from "react"
import { Copy, ExternalLink, Eye, Mail, MessageCircle, Minus, Plus, Save, Send, Share2, Tag, Trash2 } from "lucide-react"
import { listShoppingItems } from "../features/shopping/services/shoppingEngine"
import { supabase } from "../services/supabase"
import { createAppSectionTarget } from "../services/appSectionNavigation"
import { loadActiveRetailPromotions, resolveRetailPromotionDestination } from "../services/retail/retailPromotionService"
import {
  loadPublishedRetailObservedPriceOffers,
  loadPublishedRetailObservedPrices,
} from "../services/retail/retailObservedPriceService"
import {
  buildShoppingListItemFromSuggestion,
  buildShoppingListShareText,
  estimateShoppingList,
  getShoppingAutocompleteSuggestions,
  getPairingSuggestion,
  getSmartPromotionPriceReference,
  isRetailPromotionUsableForSmartShopping,
} from "../services/shoppingList/shoppingListEngine"
import {
  buildShoppingPromotionDiagnostics,
  buildShoppingBasketSnapshotItems,
  enrichShoppingBasketWithPromotions,
  resolveActiveRetailPromotionIdentity,
} from "../services/shoppingList/shoppingPromotionEnrichment"
import {
  listShoppingListSnapshots,
  markShoppingListSnapshotDeleted,
  saveShoppingListSnapshot,
} from "../services/shoppingList/shoppingListSnapshots"
import { MANUAL_SAVE_METHOD } from "../services/shoppingList/shoppingListSnapshotModel"
import { buildMultiRetailBasketOptimization } from "../services/shoppingList/shoppingBasketOptimizer"
import { loadShoppingListDraft, saveShoppingListDraft } from "../services/shoppingList/shoppingListDraft"
import {
  findExactShoppingListDuplicate,
  getShoppingListQuantity,
} from "../services/shoppingList/shoppingListItemModel"
import { formatMontant } from "../utils/format"
import { createColorAliases } from "../styles/designSystem"
import { languages } from "../i18n"

const COLORS = createColorAliases({ danger: () => COLORS.red })
const card = extra => ({ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 22, padding: 18, boxShadow: COLORS.shadow, ...extra })

function daysUntil(dateValue) {
  const time = new Date(dateValue).getTime()
  if (!time) return 0
  return Math.max(0, Math.ceil((time - Date.now()) / 86400000))
}

function formatSmartPrice(value, unitLabel = "") {
  const formatted = formatMontant(value)
  if (unitLabel === "€/kg") return formatted.replace(/\s*€$/, " €/kg")
  if (unitLabel === "€/l") return formatted.replace(/\s*€$/, " €/l")
  return formatted
}

const COPY = {
  fr: {
    snapshotTitle: "Liste de courses",
    smartLabel: "Liste intelligente",
    title: "Ma liste de courses",
    learningTitle: "Nous apprenons encore vos habitudes.",
    learningText: "Scannez quelques tickets alimentaires pour activer les Courses intelligentes.",
    moreDataTitle: "Encore un peu de données nécessaires.",
    moreDataText: "Après quelques tickets, nous pourrons estimer vos prix habituels et vous aider à préparer vos courses.",
    estimate: "Estimation",
    basketRange: (min, max) => `Ce panier coûte généralement ${min} à ${max}.`,
    priceInfo: "Les prix affichés viennent d’abord de vos tickets scannés. Sans historique personnel, BudgetKazPéi peut utiliser un prix retail validé récemment.",
    mixedBasketInfo: "Estimation basée sur vos derniers prix connus et les promos fiables actuellement repérées.",
    mixedPriceInfo: "Les produits sans prix habituel ni promo fiable restent à estimer.",
    learningCardTitle: "Vos Courses intelligentes s'améliorent avec le temps",
    learningCardText: "Plus vous scannez de tickets alimentaires, plus BudgetKazPéi reconnaît vos produits, retrouve vos derniers prix et estime votre panier avec précision.",
    scan: "Scanner",
    addPlaceholder: "Ajouter : pain, lait, beurre...",
    add: "Ajouter",
    share: "Partager",
    habitualSuggestions: "Mes produits habituels",
    currentPromotionSuggestions: "Promos actuelles",
    observedPriceSuggestions: "Prix observés",
    lastKnownPrice: amount => `Dernier prix connu : ${amount}`,
    observedSuggestion: "Prix observé récemment",
    observedLinePrice: retailer => retailer ? `Prix observé chez ${retailer}` : "Prix observé retail",
    promotionSuggestion: "Promo actuelle",
    noProduct: "Aucun produit trouvé. Appuyez sur Ajouter pour créer ce produit.",
    empty: "Ajoute un produit pour commencer.",
    priceMissing: "prix à estimer",
    historicalBudget: "Budget habituel estimé",
    reliablePromotions: "Promos fiables repérées",
    optimizedBudget: "Budget optimisé estimé",
    optimizedInfo: "Calculé uniquement avec les offres dont le produit et le format correspondent de façon fiable.",
    multiRetailTitle: "Panier optimisé multi-enseignes",
    multiRetailCoverage: (covered, total) => `${covered}/${total} produit(s) avec une offre retail fiable`,
    multiRetailSaving: amount => `Écart potentiel : ${amount}`,
    multiRetailNoSaving: "Les meilleurs prix repérés sont déjà intégrés à votre estimation.",
    multiRetailSplit: "Ce total peut répartir les achats entre plusieurs enseignes.",
    multiRetailFallback: count => `${count} produit(s) restent basés sur votre estimation actuelle faute d'offre retail plus avantageuse.`,
    retailerItems: count => `${count} article(s)`,
    currentPromotion: "Promo actuelle repérée",
    usualPriceLearning: "Prix habituel à apprendre",
    nearbyOffer: "Offre proche trouvée",
    verifyOffer: "Vérifiez le produit et le format avant d'en tenir compte.",
    potentialSaving: amount => `Économie potentielle : ${amount}`,
    seeDeal: "Voir le bon plan",
    seeOffer: "Voir l’offre",
    seeCatalog: "Voir le catalogue",
    savedLists: "Mes listes sauvegardées",
    savedListsText: "Les listes partagées ou copiées restent disponibles 7 jours.",
    noSavedLists: "Aucune liste sauvegardée pour le moment.",
    expiresIn: days => `expire dans ${days} jour(s)`,
    products: count => `${count} produit(s)`,
    missingPrices: count => `${count} prix à estimer`,
    incompleteEstimate: count => `${count} produit(s) sans prix : ce montant n'est pas le coût complet du panier.`,
    knownSubtotal: "Sous-total connu",
    multiRetailKnownSubtotal: "Sous-total connu optimisé",
    compareDetails: "Voir la répartition par enseigne",
    showMoreSuggestions: count => `Voir ${count} résultat(s) de plus`,
    showFewerSuggestions: "Réduire les résultats",
    removeItem: name => `Supprimer ${name}`,
    decreaseQuantity: name => `Réduire la quantité de ${name}`,
    increaseQuantity: name => `Augmenter la quantité de ${name}`,
    quantity: count => `Quantité ${count}`,
    duplicateTitle: name => `${name} est déjà dans la liste.`,
    duplicateText: "Voulez-vous augmenter sa quantité ?",
    increaseDuplicate: "Augmenter la quantité",
    cancelDuplicate: "Annuler",
    view: "Voir",
    delete: "Supprimer",
    deleting: "Suppression…",
    deleteConfirm: "Supprimer cette liste sauvegardée ?",
    deleted: "Liste supprimée.",
    deleteError: "Impossible de supprimer cette liste.",
    shareTitle: "Partager la liste",
    copy: "Copier",
    close: "Fermer",
    addBeforeShare: "Ajoutez au moins un produit avant de partager la liste.",
    unknownPricesConfirm: count => `${count} produit(s) n'ont pas encore de prix connu. Partager quand même ?`,
    sharedNative: "Liste partagée et sauvegardée pendant 7 jours.",
    copied: "Liste copiée et sauvegardée pendant 7 jours.",
    emailReady: "Email préparé. La liste est sauvegardée pendant 7 jours.",
    smsReady: "SMS préparé. La liste est sauvegardée pendant 7 jours.",
    whatsappReady: "WhatsApp ouvert. La liste est sauvegardée pendant 7 jours.",
  },
  kreol: {
    snapshotTitle: "Lis courses",
    smartLabel: "Lis intelligente",
    title: "Ma lis courses",
    learningTitle: "Nou lé ankor pe aprann out labitid.",
    learningText: "Eskane dé-trwa tiké manzé pou aktiv Courses intelligentes.",
    moreDataTitle: "I fo ankor in pé donné.",
    moreDataText: "Apré dé-trwa tiké, nou va estim out prix labitid ek éd aou prépar out courses.",
    estimate: "Estimasyon",
    basketRange: (min, max) => `Sa panié-la i kout généralement ${min} à ${max}.`,
    priceInfo: "Bann prix i vien dabor de out tiké scanné. Si nana poin historique perso, BudgetKazPéi pé sèvi in prix retail validé récemment.",
    mixedBasketInfo: "Estimasyon i sèvi out derniers prix connus ek bann promo fiables nou la trouvé.",
    mixedPriceInfo: "Bann produits san prix habituel ni promo fiable i reste pou estimer.",
    learningCardTitle: "Out Courses intelligentes i améliore ek le temps",
    learningCardText: "Plus ou scan bann tiké manzé, plus BudgetKazPéi i rekonèt out produits, retrouv out derniers prix ek estim out panié correctement.",
    scan: "Scanner",
    addPlaceholder: "Azout : pain, lait, beurre...",
    add: "Azouté",
    share: "Partaze",
    habitualSuggestions: "Mes produits habituels",
    currentPromotionSuggestions: "Bann promo actuelles",
    observedPriceSuggestions: "Bann prix observés",
    lastKnownPrice: amount => `Dernier prix connu : ${amount}`,
    observedSuggestion: "Prix observé récemment",
    observedLinePrice: retailer => retailer ? `Prix observé kot ${retailer}` : "Prix observé retail",
    promotionSuggestion: "Promo actuelle",
    noProduct: "Nana poin produit trouvé. Appuie su Azouté pou créer produit-la.",
    empty: "Azout in produit pou komansé.",
    priceMissing: "prix pou estimer",
    historicalBudget: "Bidjé habituel estimé",
    reliablePromotions: "Bann promo fiables trouvées",
    optimizedBudget: "Bidjé courses optimisé estimé",
    optimizedInfo: "Kalkilé sèlman ek bann offres kot produit ek format lé reconnèt de fason fiable.",
    multiRetailTitle: "Panié optimisé plusieurs enseignes",
    multiRetailCoverage: (covered, total) => `${covered}/${total} produit(s) ek in offre retail fiable`,
    multiRetailSaving: amount => `Écart possible : ${amount}`,
    multiRetailNoSaving: "Bann meilleurs prix trouvés lé déjà dan out estimasyon.",
    multiRetailSplit: "Sa total-la pé réparti bann achats entre plusieurs enseignes.",
    multiRetailFallback: count => `${count} produit(s) i reste su out estimasyon actuelle faute d'offre retail pli intéressante.`,
    retailerItems: count => `${count} article(s)`,
    currentPromotion: "Promo actuelle trouvée",
    usualPriceLearning: "Prix habituel pou aprann",
    nearbyOffer: "In offre proche lé trouvée",
    verifyOffer: "Vérifie produit-la ek son format avan pran li en compte.",
    potentialSaving: amount => `Lékonomi possible : ${amount}`,
    seeDeal: "Voir le bon plan",
    seeOffer: "Voir l’offre",
    seeCatalog: "Voir le catalogue",
    savedLists: "Mes lis sauvegardées",
    savedListsText: "Bann lis partagées ou copiées i reste disponible 7 jours.",
    noSavedLists: "Nana poin lis sauvegardée pou linstan.",
    expiresIn: days => `expire dan ${days} jour(s)`,
    products: count => `${count} produit(s)`,
    missingPrices: count => `${count} prix pou estimer`,
    incompleteEstimate: count => `${count} produit(s) san prix : montant-la lé pa coût complet panié-la.`,
    knownSubtotal: "Sous-total connu",
    multiRetailKnownSubtotal: "Sous-total connu optimisé",
    compareDetails: "Gad répartition par enseigne",
    showMoreSuggestions: count => `Gad ${count} résultat(s) an plis`,
    showFewerSuggestions: "Rédui bann résultats",
    removeItem: name => `Supprim ${name}`,
    decreaseQuantity: name => `Diminu quantité ${name}`,
    increaseQuantity: name => `Ogmant quantité ${name}`,
    quantity: count => `Quantité ${count}`,
    duplicateTitle: name => `${name} lé déjà dan la lis.`,
    duplicateText: "Ou vé ogmant son quantité ?",
    increaseDuplicate: "Ogmant quantité",
    cancelDuplicate: "Anilé",
    view: "Voir",
    delete: "Supprimé",
    deleting: "Suppression…",
    deleteConfirm: "Supprim sa lis sauvegardée-la ?",
    deleted: "Lis-la lé supprimée.",
    deleteError: "Nou la pa réussi supprim sa lis-la.",
    shareTitle: "Partaz la lis",
    copy: "Copie",
    close: "Fèrmé",
    addBeforeShare: "Azout au moins in produit avan partaz la lis.",
    unknownPricesConfirm: count => `${count} produit(s) na poin prix connu encore. Partaz kan même ?`,
    sharedNative: "Lis partagée ek sauvegardée pendant 7 jours.",
    copied: "Lis copiée ek sauvegardée pendant 7 jours.",
    emailReady: "Email préparé. La lis lé sauvegardée pendant 7 jours.",
    smsReady: "SMS préparé. La lis lé sauvegardée pendant 7 jours.",
    whatsappReady: "WhatsApp ouvert. La lis lé sauvegardée pendant 7 jours.",
  },
}

function isKreolLanguage(language) {
  return ["cr", "kreol", "kr"].includes(String(language || "").toLowerCase())
}

function snapshotTitle(txt) {
  return `${txt.snapshotTitle} - ${new Date().toLocaleDateString("fr-FR")}`
}

function AutocompleteSuggestion({ suggestion, txt, onSelect }) {
  const promotion = suggestion.activePromotion || suggestion.promotion
  const lastPrice = Number(suggestion.lastPrice || 0)
  const promoPrice = Number(suggestion.promoPrice || 0)
  const observedPrice = Number(suggestion.observedPrice || 0)
  const retailer = String(promotion?.retailerName || suggestion.retailerName || "").trim()

  return (
    <button
      data-shopping-suggestion-source={suggestion.source}
      type="button"
      onClick={onSelect}
      style={{ minHeight: 54, borderRadius: 14, border: `1px solid ${COLORS.cyan}55`, background: "rgba(35,211,214,.12)", color: COLORS.text, padding: "8px 12px", textAlign: "left" }}
    >
      <span style={{ display: "block", fontWeight: 900 }}>{suggestion.label}</span>
      {lastPrice > 0 && <span style={{ display: "block", color: COLORS.muted, fontSize: 12, marginTop: 2 }}>{txt.lastKnownPrice(formatSmartPrice(lastPrice, suggestion.priceUnitLabel))}</span>}
      {!promotion && observedPrice > 0 && (
        <>
          <span style={{ display: "block", color: COLORS.green, fontSize: 12, fontWeight: 850, marginTop: 2 }}>{retailer ? `${retailer} · ` : ""}{formatSmartPrice(observedPrice, suggestion.observedPriceUnitLabel)}</span>
          <span style={{ display: "block", color: COLORS.cyan, fontSize: 11, fontWeight: 900, marginTop: 2 }}>{txt.observedSuggestion}</span>
        </>
      )}
      {promotion && promoPrice > 0 && (
        <>
          <span style={{ display: "block", color: COLORS.green, fontSize: 12, fontWeight: 850, marginTop: 2 }}>{retailer ? `${retailer} · ` : ""}{formatSmartPrice(promoPrice, suggestion.promoPriceUnitLabel)}</span>
          <span style={{ display: "block", color: COLORS.cyan, fontSize: 11, fontWeight: 900, marginTop: 2 }}>{txt.promotionSuggestion}</span>
        </>
      )}
    </button>
  )
}

export default function ShoppingListPage({ user, isMobile = false, onOpenReceipts, onNavigate, language = "fr" }) {
  const locale = isKreolLanguage(language) ? "cr" : "fr"
  const txt = useMemo(
    () => ({ ...(locale === "cr" ? COPY.kreol : COPY.fr), ...languages[locale].shoppingList }),
    [locale],
  )
  const [shoppingItems, setShoppingItems] = useState([])
  const [retailPromotions, setRetailPromotions] = useState([])
  const [retailObservedPrices, setRetailObservedPrices] = useState([])
  const [retailObservedOffers, setRetailObservedOffers] = useState([])
  const [items, setItems] = useState(() => loadShoppingListDraft({ userId: user?.id }))
  const [query, setQuery] = useState("")
  const [snapshots, setSnapshots] = useState([])
  const [hiddenSnapshotIds, setHiddenSnapshotIds] = useState(() => new Set())
  const [shareModal, setShareModal] = useState(null)
  const [previewSnapshot, setPreviewSnapshot] = useState(null)
  const [notice, setNotice] = useState(null)
  const [showAllSuggestions, setShowAllSuggestions] = useState(false)
  const [duplicateCandidate, setDuplicateCandidate] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingSnapshotIds, setDeletingSnapshotIds] = useState(() => new Set())
  const saveInFlightRef = useRef(false)
  const snapshotRequestVersionRef = useRef(0)
  const deletedSnapshotIdsRef = useRef(new Set())

  useEffect(() => {
    saveShoppingListDraft({ userId: user?.id, items })
  }, [items, user?.id])
  const deleteInFlightRef = useRef(new Set())

  useEffect(() => {
    let ignore = false
    listShoppingItems({ userId: user?.id, includeProductIdentity: true })
      .then(rows => !ignore && setShoppingItems(rows || []))
      .catch(error => {
        if (import.meta.env.DEV) console.warn("[Shopping promotions] historical load failed", error?.code || "unknown")
        if (!ignore) setShoppingItems([])
      })
    return () => { ignore = true }
  }, [user?.id])

  useEffect(() => {
    let ignore = false
    loadActiveRetailPromotions({ client: supabase })
      .then(rows => !ignore && setRetailPromotions(rows || []))
      .catch(error => {
        if (import.meta.env.DEV) console.warn("[Shopping promotions] active promotions load failed", error?.code || "unknown")
        if (!ignore) setRetailPromotions([])
      })
    return () => { ignore = true }
  }, [])

  useEffect(() => {
    let ignore = false
    loadPublishedRetailObservedPrices({ client: supabase })
      .then(rows => !ignore && setRetailObservedPrices(rows || []))
      .catch(error => {
        if (import.meta.env.DEV) console.warn("[Shopping retail] observed prices load failed", error?.code || "unknown")
        if (!ignore) setRetailObservedPrices([])
      })
    return () => { ignore = true }
  }, [])

  useEffect(() => {
    let ignore = false
    loadPublishedRetailObservedPriceOffers({ client: supabase })
      .then(rows => !ignore && setRetailObservedOffers(rows || []))
      .catch(error => {
        if (import.meta.env.DEV) console.warn("[Shopping retail] multi-retailer prices load failed", error?.code || "unknown")
        if (!ignore) setRetailObservedOffers([])
      })
    return () => { ignore = true }
  }, [])

  useEffect(() => {
    let ignore = false
    deletedSnapshotIdsRef.current.clear()
    const requestVersion = ++snapshotRequestVersionRef.current
    listShoppingListSnapshots({ userId: user?.id })
      .then(rows => {
        if (!ignore && requestVersion === snapshotRequestVersionRef.current) {
          setSnapshots((rows || []).filter(row => !deletedSnapshotIdsRef.current.has(row.id)))
        }
      })
      .catch(() => {
        if (!ignore && requestVersion === snapshotRequestVersionRef.current) setSnapshots([])
      })
    return () => {
      ignore = true
      if (requestVersion === snapshotRequestVersionRef.current) snapshotRequestVersionRef.current += 1
    }
  }, [user?.id])

  const historicalEstimate = useMemo(
    () => estimateShoppingList(items, shoppingItems, retailObservedPrices),
    [items, shoppingItems, retailObservedPrices],
  )
  const smartRetailPromotions = useMemo(
    () => retailPromotions
      .filter(isRetailPromotionUsableForSmartShopping)
      .map(promotion => {
        const reference = getSmartPromotionPriceReference(promotion)
        return {
          ...promotion,
          rawPromoPrice: promotion.promoPrice,
          promoPrice: reference?.value ?? promotion.promoPrice,
          smartPriceValue: reference?.value ?? null,
          smartPriceUnitLabel: reference?.unitLabel || "",
        }
      }),
    [retailPromotions],
  )
  const estimate = useMemo(
    () => enrichShoppingBasketWithPromotions({ estimate: historicalEstimate, promotions: smartRetailPromotions }),
    [historicalEstimate, smartRetailPromotions],
  )
  const allSuggestions = useMemo(
    () => getShoppingAutocompleteSuggestions(query, shoppingItems, retailPromotions, retailObservedPrices),
    [query, shoppingItems, retailPromotions, retailObservedPrices],
  )
  const suggestionCount = allSuggestions.historical.length + allSuggestions.observed.length + allSuggestions.retail.length
  const suggestions = useMemo(() => {
    if (showAllSuggestions) return allSuggestions
    let remaining = 4
    const take = rows => {
      const visible = rows.slice(0, remaining)
      remaining -= visible.length
      return visible
    }
    return {
      historical: take(allSuggestions.historical),
      observed: take(allSuggestions.observed),
      retail: take(allSuggestions.retail),
    }
  }, [allSuggestions, showAllSuggestions])
  const pairing = useMemo(() => getPairingSuggestion(items, shoppingItems), [items, shoppingItems])
  const foodReceiptCount = useMemo(() => new Set((shoppingItems || []).map(item => item.receipt_id).filter(Boolean)).size, [shoppingItems])
  const learningReady = foodReceiptCount >= 3
  const multiRetailOptimization = useMemo(
    () => buildMultiRetailBasketOptimization({
      items: estimate.items,
      observedPrices: retailObservedOffers,
      promotions: smartRetailPromotions,
    }),
    [estimate.items, retailObservedOffers, smartRetailPromotions],
  )

  const shareText = useMemo(() => buildShoppingListShareText({ title: snapshotTitle(txt), estimate }), [estimate, txt])
  const hasQueryWithoutResult = query.trim().length > 0 &&
    suggestions.historical.length === 0 &&
    suggestions.observed.length === 0 &&
    suggestions.retail.length === 0
  const visibleSnapshots = snapshots.filter(snapshot => !hiddenSnapshotIds.has(snapshot.id))

  useEffect(() => {
    if (!import.meta.env.DEV) return
    console.debug("[Shopping promotions]", buildShoppingPromotionDiagnostics({
      items: estimate.items,
      promotions: retailPromotions,
    }))
  }, [estimate, retailPromotions])

  function openPromotion(promotion) {
    if (!promotion) return
    const destination = resolveRetailPromotionDestination(promotion)
    if (destination.kind === "external_catalog" || destination.kind === "external_offer") {
      window.open(destination.url, "_blank", "noopener,noreferrer")
      return
    }
    if (!onNavigate) return
    onNavigate(createAppSectionTarget("goodDeals", {
      goodDealsView: "product_promotion",
      context: destination.kind === "internal_promotion" ? {
        source: "shopping-list",
        promotionId: destination.promotionId,
        productId: promotion.productId,
      } : undefined,
    }))
  }

  function addItem(value) {
    const selectedItem = value && typeof value === "object"
      ? buildShoppingListItemFromSuggestion(value)
      : { name: String(value || query).trim() }
    if (!selectedItem.name) return
    const identifiedItem = resolveActiveRetailPromotionIdentity(selectedItem, smartRetailPromotions)
    const itemToAdd = { ...identifiedItem, list_quantity: 1 }
    const duplicate = findExactShoppingListDuplicate(items, itemToAdd)
    if (duplicate) {
      setDuplicateCandidate({ existingId: duplicate.id, name: duplicate.name })
      setQuery("")
      return
    }
    setItems(prev => [...prev, {
      ...itemToAdd,
      id: `${Date.now()}-${Math.random()}`,
      checked: false,
    }])
    setDuplicateCandidate(null)
    setQuery("")
  }

  function changeItemQuantity(id, delta) {
    setItems(prev => prev.map(item => item.id === id
      ? { ...item, list_quantity: Math.max(1, getShoppingListQuantity(item) + delta) }
      : item))
  }

  function acceptDuplicateQuantity() {
    if (!duplicateCandidate?.existingId) return
    changeItemQuantity(duplicateCandidate.existingId, 1)
    setDuplicateCandidate(null)
  }

  function removeItem(id) {
    setItems(prev => prev.filter(item => item.id !== id))
    setDuplicateCandidate(prev => prev?.existingId === id ? null : prev)
  }

  async function refreshSnapshots() {
    const requestVersion = ++snapshotRequestVersionRef.current
    try {
      const rows = await listShoppingListSnapshots({ userId: user?.id })
      if (requestVersion !== snapshotRequestVersionRef.current) return false
      setSnapshots((rows || []).filter(row => !deletedSnapshotIdsRef.current.has(row.id)))
      return true
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[Shopping snapshots] refresh failed", error?.code || "unknown")
      return false
    }
  }

  async function saveSnapshot(method, payload = {}) {
    const rows = payload.items || buildShoppingBasketSnapshotItems(estimate.items)
    try {
      const saved = await saveShoppingListSnapshot({
        userId: user?.id,
        title: payload.title || snapshotTitle(txt),
        items: rows,
        totalEstimated: payload.totalEstimated ?? estimate.total,
        missingPriceCount: payload.missingPriceCount ?? estimate.missingPriceCount,
        totalItems: payload.totalItems ?? estimate.totalItems,
        shareMethod: method,
      })
      if (saved) setSnapshots(prev => [saved, ...prev.filter(row => row.id !== saved.id)])
      return saved
    } catch (error) {
      console.warn("Sauvegarde temporaire liste impossible:", error)
      return null
    }
  }

  async function saveCurrentSnapshot() {
    if (saveInFlightRef.current) return
    if (estimate.items.length === 0) {
      setNotice({ message: txt.addBeforeSave, kind: "error" })
      return
    }

    saveInFlightRef.current = true
    setIsSaving(true)

    try {
      const saved = await saveSnapshot(MANUAL_SAVE_METHOD)
      if (!saved) throw new Error("snapshot_not_saved")
      await refreshSnapshots()
      setNotice({ message: txt.saved, kind: "success" })
    } catch {
      setNotice({ message: txt.saveError, kind: "error" })
    } finally {
      saveInFlightRef.current = false
      setIsSaving(false)
    }
  }

  async function startShare() {
    if (estimate.items.length === 0) {
      setNotice({ message: txt.addBeforeShare, kind: "error" })
      return
    }

    if (estimate.missingPriceCount > 0) {
      const ok = window.confirm(txt.unknownPricesConfirm(estimate.missingPriceCount))
      if (!ok) return
    }

    if (navigator.share) {
      try {
        await navigator.share({ title: snapshotTitle(txt), text: shareText })
        await saveSnapshot("native_share")
        await refreshSnapshots()
        setNotice({ message: txt.sharedNative, kind: "success" })
        return
      } catch (error) {
        if (error?.name === "AbortError") return
      }
    }

    setShareModal({
      text: shareText,
      items: buildShoppingBasketSnapshotItems(estimate.items),
      totalEstimated: estimate.total,
      missingPriceCount: estimate.missingPriceCount,
      totalItems: estimate.totalItems,
    })
  }

  async function shareWith(method, text = shareModal?.text || shareText) {
    const encoded = encodeURIComponent(text)

    if (method === "copy") {
      await navigator.clipboard?.writeText(text)
      setNotice({ message: txt.copied, kind: "success" })
    }

    if (method === "email") {
      window.location.href = `mailto:?subject=${encodeURIComponent(snapshotTitle(txt))}&body=${encoded}`
      setNotice({ message: txt.emailReady, kind: "success" })
    }

    if (method === "sms") {
      window.location.href = `sms:?&body=${encoded}`
      setNotice({ message: txt.smsReady, kind: "success" })
    }

    if (method === "whatsapp") {
      window.open(`https://wa.me/?text=${encoded}`, "_blank", "noopener,noreferrer")
      setNotice({ message: txt.whatsappReady, kind: "success" })
    }

    await saveSnapshot(method, shareModal || {})
    await refreshSnapshots()
    setShareModal(null)
  }

  async function deleteSnapshot(id) {
    if (!id || deleteInFlightRef.current.has(id)) return
    if (!window.confirm(txt.deleteConfirm)) return

    const previousSnapshot = snapshots.find(row => row.id === id) || null

    deleteInFlightRef.current.add(id)
    setDeletingSnapshotIds(prev => new Set(prev).add(id))

    // UI tombstone: once deletion is confirmed, no stale async response can
    // render this row again during the current session.
    setHiddenSnapshotIds(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setSnapshots(prev => prev.filter(row => row.id !== id))

    try {
      await markShoppingListSnapshotDeleted({ userId: user?.id, id })
      deletedSnapshotIdsRef.current.add(id)
      setPreviewSnapshot(prev => prev?.id === id ? null : prev)

      try {
        const rows = await listShoppingListSnapshots({ userId: user?.id })
        if ((rows || []).some(row => row.id === id)) {
          const error = new Error("snapshot_delete_not_persisted")
          error.code = "snapshot_delete_not_persisted"
          throw error
        }
        setSnapshots((rows || []).filter(row => row.id !== id))
      } catch (verificationError) {
        if (verificationError?.code === "snapshot_delete_not_persisted") {
          throw verificationError
        }
        if (import.meta.env.DEV) {
          console.warn("[Shopping snapshots] post-delete refresh unavailable", verificationError?.code || verificationError?.message || "unknown")
        }
      }

      setNotice({ message: txt.deleted, kind: "success" })
    } catch (error) {
      setHiddenSnapshotIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })

      try {
        const rows = await listShoppingListSnapshots({ userId: user?.id })
        setSnapshots(rows || [])
      } catch {
        if (previousSnapshot) {
          setSnapshots(prev => [
            previousSnapshot,
            ...prev.filter(row => row.id !== previousSnapshot.id),
          ])
        }
      }

      if (import.meta.env.DEV) {
        console.warn("[Shopping snapshots] deletion failed", error?.code || error?.message || "unknown")
      }
      setNotice({ message: txt.deleteError, kind: "error" })
    } finally {
      deleteInFlightRef.current.delete(id)
      setDeletingSnapshotIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  function shareSavedSnapshot(snapshot) {
    const text = buildShoppingListShareText({
      title: snapshot.title,
      estimate: {
        items: snapshot.items,
        total: snapshot.totalEstimated,
        missingPriceCount: snapshot.missingPriceCount,
        reliableSavingsTotal: snapshot.items.reduce((total, item) => total + Number(item.reliableSaving || 0), 0),
        optimizedBasketEstimate: Math.max(0, snapshot.totalEstimated - snapshot.items.reduce((total, item) => total + Number(item.reliableSaving || 0), 0)),
      },
    })
    setShareModal({
      text,
      items: snapshot.items,
      totalEstimated: snapshot.totalEstimated,
      missingPriceCount: snapshot.missingPriceCount,
      totalItems: snapshot.totalItems,
      title: snapshot.title,
      snapshot,
    })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={card({ padding: isMobile ? 18 : 24, order: 3 })}>
        <div style={{ color: COLORS.cyan, fontSize: 13, fontWeight: 950 }}>{txt.smartLabel}</div>
        <h2 style={{ color: COLORS.text, margin: "8px 0", fontFamily: "'DM Serif Display', serif", fontSize: isMobile ? 34 : 42, fontWeight: 400 }}>{txt.title}</h2>
        {estimate.items.length > 0 ? (
          <>
            <div style={{ color: COLORS.green, fontSize: 28, fontWeight: 950 }}>
              {estimate.missingPriceCount > 0 ? txt.knownSubtotal : txt.estimate} : {formatMontant(estimate.total)}
            </div>
            {estimate.missingPriceCount > 0 && (
              <div role="status" style={{ color: COLORS.yellow, marginTop: 6, fontWeight: 850 }}>
                {txt.incompleteEstimate(estimate.missingPriceCount)}
              </div>
            )}
            <div style={{ color: COLORS.muted, marginTop: 6 }}>
              {estimate.promotionPricedItemCount > 0
                ? txt.mixedBasketInfo
                : estimate.missingPriceCount > 0
                  ? txt.mixedPriceInfo
                  : txt.basketRange(formatMontant(estimate.min), formatMontant(estimate.max))}
            </div>
            {estimate.reliableSavingsTotal > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 16 }}>
                <SummaryAmount label={txt.historicalBudget} value={estimate.historicalBasketEstimate} color={COLORS.text} />
                <SummaryAmount label={txt.reliablePromotions} value={-estimate.reliableSavingsTotal} color={COLORS.green} />
                <SummaryAmount label={txt.optimizedBudget} value={estimate.optimizedBasketEstimate} color={COLORS.cyan} />
              </div>
            )}
          </>
        ) : foodReceiptCount === 0 ? (
          <>
            <div style={{ color: COLORS.yellow, fontSize: 22, fontWeight: 950 }}>{txt.learningTitle}</div>
            <div style={{ color: COLORS.muted, marginTop: 6 }}>{txt.learningText}</div>
          </>
        ) : !learningReady && estimate.total <= 0 ? (
          <>
            <div style={{ color: COLORS.yellow, fontSize: 22, fontWeight: 950 }}>{txt.moreDataTitle}</div>
            <div style={{ color: COLORS.muted, marginTop: 6 }}>{txt.moreDataText}</div>
          </>
        ) : null}
        {multiRetailOptimization.retailOfferMatchedCount > 0 && (
          <div
            data-shopping-multi-retail-optimizer
            style={{
              marginTop: 16,
              border: `1px solid ${COLORS.cyan}55`,
              borderRadius: 16,
              background: "rgba(35,211,214,.08)",
              padding: 14,
            }}
          >
            <div style={{ color: COLORS.cyan, fontWeight: 950, fontSize: 13 }}>
              {txt.multiRetailTitle}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginTop: 6 }}>
              <div>
                <span style={{ display: "block", color: COLORS.muted, fontSize: 11 }}>
                  {multiRetailOptimization.completePriceCoverage ? txt.optimizedBudget : txt.multiRetailKnownSubtotal}
                </span>
                <strong style={{ display: "block", color: COLORS.text, fontSize: 24 }}>
                  {formatMontant(multiRetailOptimization.optimizedTotal)}
                </strong>
              </div>
              <span style={{ color: COLORS.muted, fontSize: 12 }}>
                {txt.multiRetailCoverage(multiRetailOptimization.retailOfferMatchedCount, multiRetailOptimization.totalItems)}
              </span>
            </div>
            {multiRetailOptimization.missingPriceCount > 0 && (
              <div style={{ color: COLORS.yellow, fontSize: 12, fontWeight: 850, marginTop: 5 }}>
                {txt.multiRetailKnownSubtotal} · {txt.incompleteEstimate(multiRetailOptimization.missingPriceCount)}
              </div>
            )}
            <div style={{ color: multiRetailOptimization.potentialSaving > 0 ? COLORS.green : COLORS.muted, fontWeight: 850, marginTop: 6 }}>
              {multiRetailOptimization.potentialSaving > 0
                ? txt.multiRetailSaving(formatMontant(multiRetailOptimization.potentialSaving))
                : txt.multiRetailNoSaving}
            </div>
            <details style={{ marginTop: 10 }}>
              <summary style={{ color: COLORS.cyan, cursor: "pointer", fontWeight: 850 }}>{txt.compareDetails}</summary>
              {multiRetailOptimization.retailerBreakdown.length > 0 && (
                <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                  {multiRetailOptimization.retailerBreakdown.map(retailer => (
                    <div key={retailer.retailerKey} style={{ display: "flex", justifyContent: "space-between", gap: 12, color: COLORS.text, fontSize: 13 }}>
                      <span>{retailer.retailerName} · {txt.retailerItems(retailer.itemCount)}</span>
                      <strong>{formatMontant(retailer.subtotal)}</strong>
                    </div>
                  ))}
                </div>
              )}
              {multiRetailOptimization.splitAcrossRetailers && (
                <div style={{ color: COLORS.yellow, fontSize: 12, marginTop: 8 }}>{txt.multiRetailSplit}</div>
              )}
              {multiRetailOptimization.selectedRetailOfferCount < multiRetailOptimization.totalItems && (
                <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 8 }}>
                  {txt.multiRetailFallback(multiRetailOptimization.totalItems - multiRetailOptimization.selectedRetailOfferCount)}
                </div>
              )}
            </details>
          </div>
        )}

      </div>

      {notice?.message && (
        <div role={notice.kind === "error" ? "alert" : "status"} style={{ order: 0, background: notice.kind === "error" ? COLORS.redSoft : "rgba(35,211,214,.12)", border: `1px solid ${notice.kind === "error" ? `${COLORS.danger}55` : `${COLORS.cyan}55`}`, color: notice.kind === "error" ? COLORS.danger : COLORS.text, borderRadius: 14, padding: 12, fontWeight: 800 }}>
          {notice.message}
        </div>
      )}

      <div style={card({ order: 1 })}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) auto auto", gap: 10 }}>
          <input data-shopping-add value={query} onChange={e => { setQuery(e.target.value); setShowAllSuggestions(false) }} onKeyDown={e => e.key === "Enter" && addItem()} placeholder={txt.addPlaceholder} style={{ minHeight: 50, borderRadius: 14, border: `1px solid ${COLORS.inputBorder}`, background: COLORS.input, color: COLORS.text, padding: "0 14px" }} />
          <button type="button" onClick={() => addItem()} style={{ minHeight: 50, border: "none", borderRadius: 14, background: "linear-gradient(145deg, #8B5CF6, #6D28D9)", color: "#fff", border: "1px solid #A78BFA", boxShadow: "inset 2px 2px 0 rgba(255,255,255,.25), 0 6px 0 #5421B8, 0 12px 22px rgba(109,40,217,.22)", fontWeight: 950, padding: "0 16px" }}>{txt.add}</button>
          <div data-shopping-list-actions style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, minWidth: 0 }}>
            <button type="button" onClick={saveCurrentSnapshot} disabled={isSaving} style={{ minWidth: 0, minHeight: 50, border: "1px solid #C4A0F6", borderRadius: 14, background: "linear-gradient(145deg, #F2E9FF, #E1D1FA)", color: "#4F238C", fontSize: isMobile ? 12 : 13, fontWeight: 950, padding: "0 4px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, whiteSpace: "nowrap", opacity: isSaving ? 0.7 : 1, cursor: isSaving ? "wait" : "pointer" }}>
              <Save size={17} aria-hidden="true" /> <span>{isSaving ? txt.saving : txt.save}</span>
            </button>
            <button type="button" onClick={startShare} style={{ minWidth: 0, minHeight: 50, border: "1px solid #C4A0F6", borderRadius: 14, background: "linear-gradient(145deg, #F2E9FF, #E1D1FA)", color: "#4F238C", fontSize: isMobile ? 12 : 13, fontWeight: 950, padding: "0 4px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, whiteSpace: "nowrap" }}>
              <Share2 size={17} aria-hidden="true" /> <span>{txt.share}</span>
            </button>
          </div>
        </div>
        {duplicateCandidate && (
          <div role="status" data-shopping-duplicate-prompt style={{ marginTop: 12, border: `1px solid ${COLORS.yellow}66`, borderRadius: 14, background: "rgba(245,158,11,.10)", padding: 12 }}>
            <div style={{ color: COLORS.text, fontWeight: 900 }}>{txt.duplicateTitle(duplicateCandidate.name)}</div>
            <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 3 }}>{txt.duplicateText}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              <button type="button" onClick={acceptDuplicateQuantity} style={{ minHeight: 42, border: "none", borderRadius: 12, background: COLORS.accent, color: "#fff", fontWeight: 900, padding: "0 13px" }}>{txt.increaseDuplicate}</button>
              <button type="button" onClick={() => setDuplicateCandidate(null)} style={{ minHeight: 42, border: `1px solid ${COLORS.border}`, borderRadius: 12, background: COLORS.card, color: COLORS.text, fontWeight: 850, padding: "0 13px" }}>{txt.cancelDuplicate}</button>
            </div>
          </div>
        )}
        {suggestions.historical.length > 0 && (
          <div data-shopping-suggestion-group="history" style={{ marginTop: 12 }}>
            <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 950, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>{txt.habitualSuggestions}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {suggestions.historical.map(suggestion => <AutocompleteSuggestion key={suggestion.key} suggestion={suggestion} txt={txt} onSelect={() => addItem(suggestion)} />)}
            </div>
          </div>
        )}
        {suggestions.observed.length > 0 && (
          <div data-shopping-suggestion-group="observed" style={{ marginTop: 12 }}>
            <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 950, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>{txt.observedPriceSuggestions}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {suggestions.observed.map(suggestion => <AutocompleteSuggestion key={suggestion.key} suggestion={suggestion} txt={txt} onSelect={() => addItem(suggestion)} />)}
            </div>
          </div>
        )}
        {suggestions.retail.length > 0 && (
          <div data-shopping-suggestion-group="retail" style={{ marginTop: 12 }}>
            <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 950, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>{txt.currentPromotionSuggestions}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {suggestions.retail.map(suggestion => <AutocompleteSuggestion key={suggestion.key} suggestion={suggestion} txt={txt} onSelect={() => addItem(suggestion)} />)}
            </div>
          </div>
        )}
        {suggestionCount > 4 && (
          <button
            type="button"
            data-shopping-more-suggestions
            onClick={() => setShowAllSuggestions(value => !value)}
            style={{ minHeight: 42, marginTop: 12, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: COLORS.card, color: COLORS.cyan, fontWeight: 900, padding: "0 13px" }}
          >
            {showAllSuggestions ? txt.showFewerSuggestions : txt.showMoreSuggestions(suggestionCount - 4)}
          </button>
        )}
        {hasQueryWithoutResult && <div style={{ color: COLORS.muted, marginTop: 10 }}>{txt.noProduct}</div>}
        {pairing && <div style={{ color: COLORS.yellow, marginTop: 12, fontWeight: 900 }}>{pairing}</div>}
      </div>

      <div style={card({ order: 2 })}>
        {estimate.items.length === 0 ? <div style={{ color: COLORS.muted }}>{txt.empty}</div> : estimate.items.map(item => {
          const displayedPrice = Number(item.estimatedLineCost || 0)
          const listQuantity = getShoppingListQuantity(item)
          const priceLearning = item.historicalPrice === null && item.estimatedPriceSource === "promotion"
          const retailObservedPrice = item.estimatedPriceSource === "retail_observed"
          return <div key={item.id} style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", gap: 10, alignItems: "start", color: COLORS.text, borderBottom: `1px solid ${COLORS.borderSubtle}`, padding: "12px 0" }}>
            <input aria-label={item.name} type="checkbox" checked={item.checked} onChange={e => setItems(prev => prev.map(row => row.id === item.id ? { ...row, checked: e.target.checked } : row))} style={{ marginTop: 4 }} />
            <div style={{ minWidth: 0 }}>
              <span style={{ textDecoration: item.checked ? "line-through" : "none" }}>
                {item.name}
                <span style={{ display: "block", color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
                  {priceLearning
                    ? txt.usualPriceLearning
                    : retailObservedPrice
                      ? txt.observedLinePrice(item.retailObservedRetailerName)
                      : item.historicalPrice !== null
                        ? item.priceLabel
                        : txt.priceMissing}
                </span>
                {listQuantity > 1 && (
                  <span style={{ display: "block", color: COLORS.cyan, fontSize: 12, fontWeight: 850, marginTop: 2 }}>
                    {txt.quantity(listQuantity)}
                    {item.estimatedUnitPrice > 0 ? ` · ${formatSmartPrice(item.estimatedUnitPrice, item.priceUnitLabel)}` : ""}
                  </span>
                )}
              </span>
              {item.promotionMatchStatus === "reliable" && item.promotion && (
                <PromotionHint item={item} txt={txt} onOpen={() => openPromotion(item.promotion)} reliable />
              )}
              {item.promotionMatchStatus === "suggested" && item.promotion && (
                <PromotionHint item={item} txt={txt} onOpen={() => openPromotion(item.promotion)} />
              )}
            </div>
            <div style={{ display: "grid", justifyItems: "end", gap: 7 }}>
              <strong style={{ color: displayedPrice ? COLORS.green : COLORS.muted, whiteSpace: "nowrap" }}>
                {displayedPrice
                  ? listQuantity > 1
                    ? formatMontant(displayedPrice)
                    : formatSmartPrice(displayedPrice, item.priceUnitLabel)
                  : txt.priceMissing}
              </strong>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <IconButton
                  label={txt.decreaseQuantity(item.name)}
                  onClick={() => changeItemQuantity(item.id, -1)}
                  disabled={listQuantity <= 1}
                  icon={<Minus size={16} aria-hidden="true" />}
                />
                <span aria-label={txt.quantity(listQuantity)} style={{ minWidth: 22, textAlign: "center", color: COLORS.text, fontSize: 13, fontWeight: 900 }}>{listQuantity}</span>
                <IconButton
                  label={txt.increaseQuantity(item.name)}
                  onClick={() => changeItemQuantity(item.id, 1)}
                  icon={<Plus size={16} aria-hidden="true" />}
                />
                <IconButton
                  label={txt.removeItem(item.name)}
                  onClick={() => removeItem(item.id)}
                  icon={<Trash2 size={17} aria-hidden="true" />}
                  danger
                />
              </div>
            </div>
          </div>
        })}
      </div>

      <div style={card({ order: 5 })}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ color: COLORS.text, margin: 0, fontSize: 22 }}>{txt.savedLists}</h2>
            <div style={{ color: COLORS.muted, marginTop: 4 }}>{txt.savedListsText}</div>
          </div>
        </div>
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {visibleSnapshots.length === 0 ? (
            <div style={{ color: COLORS.muted }}>{txt.noSavedLists}</div>
          ) : visibleSnapshots.map(snapshot => {
            const isDeleting = deletingSnapshotIds.has(snapshot.id)
            return (
            <div key={snapshot.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr auto", gap: 12, alignItems: "center", border: `1px solid ${COLORS.border}`, background: COLORS.row, borderRadius: 14, padding: 12 }}>
              <div>
                <div style={{ color: COLORS.text, fontWeight: 950 }}>{snapshot.title}</div>
                <div style={{ color: COLORS.muted, marginTop: 4, fontSize: 13 }}>
                  {[
                    new Date(snapshot.createdAt).toLocaleDateString("fr-FR"),
                    txt.expiresIn(daysUntil(snapshot.expiresAt)),
                    txt.products(snapshot.totalItems),
                    snapshot.totalEstimated > 0 ? txt.estimatedTotal(formatMontant(snapshot.totalEstimated)) : null,
                    snapshot.missingPriceCount > 0 ? txt.missingPrices(snapshot.missingPriceCount) : null,
                  ].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <SmallButton onClick={() => setPreviewSnapshot(snapshot)} icon={<Eye size={16} />} label={txt.view} />
                <SmallButton onClick={() => shareSavedSnapshot(snapshot)} icon={<Send size={16} />} label={txt.share} />
                <SmallButton onClick={() => deleteSnapshot(snapshot.id)} icon={<Trash2 size={16} />} label={isDeleting ? txt.deleting : txt.delete} disabled={isDeleting} danger />
              </div>
            </div>
            )
          })}
        </div>
      </div>

      {shareModal && (
        <Modal title={txt.shareTitle} closeLabel={txt.close} onClose={() => setShareModal(null)}>
          <textarea readOnly value={shareModal.text} style={{ width: "100%", minHeight: 190, borderRadius: 12, border: `1px solid ${COLORS.inputBorder}`, background: COLORS.input, color: COLORS.text, padding: 12, resize: "vertical" }} />
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: 10, marginTop: 12 }}>
            <ActionButton onClick={() => shareWith("copy", shareModal.text)} icon={<Copy size={18} />} label={txt.copy} />
            <ActionButton onClick={() => shareWith("email", shareModal.text)} icon={<Mail size={18} />} label="Email" />
            <ActionButton onClick={() => shareWith("sms", shareModal.text)} icon={<MessageCircle size={18} />} label="SMS" />
            <ActionButton onClick={() => shareWith("whatsapp", shareModal.text)} icon={<Send size={18} />} label="WhatsApp" />
          </div>
        </Modal>
      )}

      {previewSnapshot && (
        <Modal title={previewSnapshot.title} closeLabel={txt.close} onClose={() => setPreviewSnapshot(null)}>
          <div style={{ display: "grid", gap: 8 }}>
            {previewSnapshot.items.map((item, index) => (
              <div key={`${item.name}-${index}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, color: COLORS.text }}>
                <span style={{ textDecoration: item.checked ? "line-through" : "none", minWidth: 0 }}>
                  {item.name}{getShoppingListQuantity(item) > 1 ? ` · ${txt.quantity(getShoppingListQuantity(item))}` : ""}
                  {item.promotionSnapshot && (
                    <span style={{ display: "block", color: item.promotionMatchStatus === "suggested" ? COLORS.yellow : COLORS.green, fontSize: 12, marginTop: 3 }}>
                      {item.promotionMatchStatus === "suggested" ? txt.nearbyOffer : txt.currentPromotion} : {formatSmartPrice(item.promotionSnapshot.smartPriceValue ?? item.promotionSnapshot.promoPrice, item.promotionSnapshot.smartPriceUnitLabel)}
                      {item.promotionSnapshot.retailerName ? ` chez ${item.promotionSnapshot.retailerName}` : ""}
                    </span>
                  )}
                </span>
                <strong style={{ color: item.estimatedPrice ? COLORS.green : COLORS.muted }}>
                  {item.estimatedPrice ? formatMontant(item.estimatedPrice) : txt.priceMissing}
                </strong>
              </div>
            ))}
            {previewSnapshot.totalEstimated > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: `1px solid ${COLORS.border}`, color: COLORS.text, paddingTop: 10, marginTop: 4 }}>
                <strong>{previewSnapshot.missingPriceCount > 0 ? txt.knownSubtotal : txt.estimate}</strong>
                <strong style={{ color: COLORS.green }}>{formatMontant(previewSnapshot.totalEstimated)}</strong>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

function SummaryAmount({ label, value, color }) {
  return (
    <div style={{ border: `1px solid ${COLORS.border}`, background: COLORS.row, borderRadius: 13, padding: 10 }}>
      <div style={{ color: COLORS.muted, fontSize: 12 }}>{label}</div>
      <strong style={{ display: "block", color, marginTop: 3 }}>{formatMontant(value)}</strong>
    </div>
  )
}

function PromotionHint({ item, txt, onOpen, reliable = false }) {
  const promotion = item.promotion
  const saving = reliable ? item.reliableSaving : item.possibleSaving
  const store = [promotion.retailerName, promotion.storeName || promotion.storeCity].filter(Boolean).join(" · ")
  const destination = resolveRetailPromotionDestination(promotion)
  const actionLabel = destination.kind === "external_catalog"
    ? txt.seeCatalog
    : destination.kind === "external_offer"
      ? txt.seeOffer
      : txt.seeDeal
  return (
    <div style={{ marginTop: 8, borderRadius: 12, padding: 10, background: reliable ? "rgba(34,197,94,.10)" : "rgba(245,158,11,.10)", border: `1px solid ${reliable ? `${COLORS.green}55` : `${COLORS.yellow}55`}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: reliable ? COLORS.green : COLORS.yellow, fontSize: 13, fontWeight: 950 }}>
        <Tag size={15} aria-hidden="true" /> {reliable ? txt.currentPromotion : txt.nearbyOffer}
      </div>
      <div style={{ color: COLORS.text, fontSize: 13, marginTop: 4 }}>
        {formatSmartPrice(promotion.smartPriceValue ?? promotion.promoPrice, promotion.smartPriceUnitLabel)}{store ? ` chez ${store}` : ""}
      </div>
      {!reliable && <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 3 }}>{txt.verifyOffer}</div>}
      {Number(saving || 0) > 0 && (
        <div style={{ color: reliable ? COLORS.green : COLORS.yellow, fontSize: 12, fontWeight: 850, marginTop: 3 }}>
          {txt.potentialSaving(formatMontant(saving))}
        </div>
      )}
      <button type="button" onClick={onOpen} style={{ minHeight: 38, marginTop: 8, borderRadius: 11, border: `1px solid ${COLORS.cyan}66`, background: COLORS.card, color: COLORS.text, fontWeight: 900, padding: "0 11px", display: "inline-flex", alignItems: "center", gap: 6 }}>
        {actionLabel} <ExternalLink size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

function SmallButton({ icon, label, onClick, disabled = false, danger = false }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ minHeight: 36, borderRadius: 12, border: `1px solid ${danger ? `${COLORS.danger}55` : COLORS.border}`, background: danger ? COLORS.redSoft : COLORS.card, color: danger ? COLORS.danger : COLORS.text, fontWeight: 850, padding: "0 10px", display: "inline-flex", alignItems: "center", gap: 6, opacity: disabled ? 0.65 : 1, cursor: disabled ? "wait" : "pointer" }}>
      {icon} {label}
    </button>
  )
}

function IconButton({ icon, label, onClick, disabled = false, danger = false }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{ width: 44, minWidth: 44, height: 44, display: "inline-grid", placeItems: "center", borderRadius: 11, border: `1px solid ${danger ? `${COLORS.danger}55` : COLORS.border}`, background: danger ? COLORS.redSoft : COLORS.card, color: danger ? COLORS.danger : COLORS.text, opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
    >
      {icon}
    </button>
  )
}

function ActionButton({ icon, label, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ minHeight: 44, borderRadius: 14, border: `1px solid ${COLORS.cyan}55`, background: "rgba(35,211,214,.12)", color: COLORS.text, fontWeight: 950, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      {icon} {label}
    </button>
  )
}

function Modal({ title, children, onClose, closeLabel = "Fermer" }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(2,6,23,.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div style={{ width: "min(680px, 100%)", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 18, boxShadow: COLORS.shadow }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, color: COLORS.text }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ minHeight: 36, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: COLORS.surface, color: COLORS.text, fontWeight: 900, padding: "0 12px" }}>{closeLabel}</button>
        </div>
        {children}
      </div>
    </div>
  )
}
