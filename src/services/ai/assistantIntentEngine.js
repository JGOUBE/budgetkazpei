import { formatMontant } from "../../utils/format.js"
import { normalizeAssistantLanguage, normalizeForAssistantMatch } from "./assistantLanguage.js"
import { getAssistantCategoryLabel } from "./assistantInsightsService.js"

export const ASSISTANT_INTENTS = {
  SPENDING_INCREASE: "spending_increase",
  CHEAPEST_STORES: "cheapest_stores",
  SAVE_TARGET: "save_target",
  FOOD_BUDGET_INCREASE: "food_budget_increase",
  UNKNOWN: "unknown",
}

function money(value) {
  const number = Number(String(value ?? 0).replace(",", "."))
  return Number.isFinite(number) ? number : 0
}

function percent(value) {
  return `${Math.round(value)} %`
}

function sentenceList(values = [], fallback = "") {
  const clean = values.filter(Boolean)
  if (clean.length === 0) return fallback
  if (clean.length === 1) return clean[0]
  if (clean.length === 2) return `${clean[0]} et ${clean[1]}`
  return `${clean.slice(0, -1).join(", ")} et ${clean[clean.length - 1]}`
}

function dataUsed(insights = {}) {
  return {
    transactionsCount: money(insights.dataUsed?.transactionsCount),
    receiptsCount: money(insights.dataUsed?.receiptsCount),
    storesCount: money(insights.dataUsed?.storesCount),
    productsCount: money(insights.dataUsed?.productsCount),
    comparableProductsCount: money(insights.dataUsed?.comparableProductsCount),
  }
}

function transparency(used = {}, language = "fr") {
  const lang = normalizeAssistantLanguage(language)

  if (lang === "kr") {
    return `Baze su ${used.receiptsCount || 0} tiké ek ${used.productsCount || 0} produits.`
  }

  return `Basé sur ${used.receiptsCount || 0} tickets et ${used.productsCount || 0} produits.`
}

function cleanAnswer(answer) {
  return String(answer || "")
    .replace(/\bNaN\b/g, "0")
    .replace(/\bInfinity\b/g, "0")
    .replace(/\bundefined\b/g, "")
    .replace(/\bnull\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function response({ fr, kr, intent, confidence = 0.9, insights, actions = [], source = "local" }) {
  const used = dataUsed(insights)

  return {
    fr: cleanAnswer(fr),
    kr: cleanAnswer(kr),
    intent,
    confidence,
    dataUsed: used,
    transparency: {
      fr: transparency(used, "fr"),
      kr: transparency(used, "kr"),
    },
    actions,
    source,
  }
}

function insufficientData(intent, insights, detail = "generic") {
  const actions = [
    { type: "open_page", target: "receipts", label_fr: "Ajouter des tickets", label_kr: "Azout tiké" },
  ]

  const messages = {
    generic: {
      fr: "Je n'ai pas encore assez de données pour répondre précisément. Ajoute quelques dépenses ou scanne davantage de tickets.",
      kr: "Mi nana pankor assez donné pou réponn bien. Azout quelques dépans ou scanne plis tiké.",
    },
    stores: {
      fr: "Je n'ai pas encore assez de tickets avec des produits comparables pour classer tes magasins. Scanne quelques courses dans au moins deux enseignes.",
      kr: "Mi nana pankor assez tiké ek produits comparable pou klase out magasins. Scanne quelques courses dann au moins dé enseignes.",
    },
    previousMonth: {
      fr: "Je vois tes dépenses du mois, mais je n'ai pas encore de mois précédent comparable. Ajoute ou conserve quelques dépenses sur deux mois pour mesurer la hausse.",
      kr: "Mi voi out dépans pou sa mwa-la, mé mi nana pankor mwa dernier pou compare. Azout ou garde quelques dépans su dé mwa pou mesir la hausse.",
    },
    food: {
      fr: "Je n'ai pas encore assez de tickets alimentaires pour expliquer l'évolution. Scanne quelques courses avec leurs produits pour comparer le panier moyen et les passages en magasin.",
      kr: "Mi nana pankor assez tiké manzé pou explik l'évolution. Scanne quelques courses ek produits pou compare panier moyen ek passages magasin.",
    },
  }

  const message = messages[detail] || messages.generic
  return response({
    ...message,
    intent,
    confidence: 0.8,
    insights,
    actions,
  })
}

export function detectAssistantIntent(question = "") {
  const text = normalizeForAssistantMatch(question)

  const hasSaveAmount =
    /\b(100|cent)\b/.test(text) &&
    (text.includes("economiser") || text.includes("economiz") || text.includes("economise") || text.includes("economie"))

  if (hasSaveAmount) return ASSISTANT_INTENTS.SAVE_TARGET

  if (
    (text.includes("magasin") || text.includes("magazin") || text.includes("enseigne")) &&
    (text.includes("moins cher") || text.includes("kout moins cher") || text.includes("coutent le moins") || text.includes("coutent moins"))
  ) {
    return ASSISTANT_INTENTS.CHEAPEST_STORES
  }

  if (
    (text.includes("alimentation") || text.includes("alimentaire") || text.includes("manze")) &&
    (text.includes("augmente") || text.includes("ogmant") || text.includes("hausse") || text.includes("plis"))
  ) {
    return ASSISTANT_INTENTS.FOOD_BUDGET_INCREASE
  }

  if (
    (text.includes("depense") || text.includes("depenses") || text.includes("depans")) &&
    (text.includes("plus") || text.includes("plis") || text.includes("augmente") || text.includes("hausse"))
  ) {
    return ASSISTANT_INTENTS.SPENDING_INCREASE
  }

  return ASSISTANT_INTENTS.UNKNOWN
}

function extractTargetAmount(question = "") {
  const match = normalizeForAssistantMatch(question).match(/\b(\d{2,4})\b/)
  const value = match ? Number(match[1]) : 100
  return Number.isFinite(value) && value > 0 ? value : 100
}

function categoryIncreaseText(increases = [], language = "fr") {
  const labels = increases
    .slice(0, 2)
    .map(category => getAssistantCategoryLabel(category.id, language))

  return sentenceList(labels, language === "kr" ? "" : "")
}

function buildSpendingIncreaseAnswer({ insights }) {
  const current = money(insights.currentMonth?.expenses)
  const previous = money(insights.previousMonth?.expenses)

  if (current <= 0) return insufficientData(ASSISTANT_INTENTS.SPENDING_INCREASE, insights)
  if (previous <= 0) {
    return response({
      fr: `Ce mois-ci, tes dépenses s'élèvent à ${formatMontant(current)}. Je n'ai pas de mois précédent comparable, donc je ne peux pas affirmer une hausse. Commence par suivre quelques dépenses sur deux mois pour obtenir une comparaison fiable.`,
      kr: `Sa mwa-la, out dépans i monte a ${formatMontant(current)}. Mi nana pankor mwa dernier pou compare, alors mi pé pa affirme in hausse. Swiv quelques dépans su dé mwa pou gagn in comparaison fiable.`,
      intent: ASSISTANT_INTENTS.SPENDING_INCREASE,
      confidence: 0.86,
      insights,
      actions: [{ type: "open_page", target: "statistics", label_fr: "Voir mes stats", label_kr: "War mes stats" }],
    })
  }

  const diff = current - previous
  const ratio = previous > 0 ? (diff / previous) * 100 : null
  const increaseLabelsFr = categoryIncreaseText(insights.categoryIncreases, "fr")
  const increaseLabelsKr = categoryIncreaseText(insights.categoryIncreases, "kr")

  if (diff <= 0) {
    return response({
      fr: `Ce mois-ci, tes dépenses s'élèvent à ${formatMontant(current)}. Elles n'ont pas augmenté par rapport au mois précédent : elles sont plus basses de ${formatMontant(Math.abs(diff))}. Garde le réflexe de vérifier les catégories qui restent les plus élevées.`,
      kr: `Sa mwa-la, out dépans i monte a ${formatMontant(current)}. Zot la pa ogmant par rapport mwa dernier : zot lé plus bas de ${formatMontant(Math.abs(diff))}. Kontinyé surveille bann catégories i reste les plus hautes.`,
      intent: ASSISTANT_INTENTS.SPENDING_INCREASE,
      confidence: 0.94,
      insights,
      actions: [{ type: "open_page", target: "statistics", label_fr: "Voir mes stats", label_kr: "War mes stats" }],
    })
  }

  const percentText = ratio === null ? "" : `, soit ${percent(ratio)}`
  const percentTextKr = ratio === null ? "" : `, soit ${percent(ratio)}`
  const causeFr = increaseLabelsFr
    ? `La hausse vient surtout de ${increaseLabelsFr}.`
    : "Je ne vois pas encore de catégorie assez nette pour expliquer toute la hausse."
  const causeKr = increaseLabelsKr
    ? `La hausse i vien surtout ${increaseLabelsKr}.`
    : "Mi voi pa encore in catégorie assez nette pou explik toute la hausse."

  return response({
    fr: `Ce mois-ci, tes dépenses s'élèvent à ${formatMontant(current)}. Elles ont augmenté de ${formatMontant(diff)}${percentText} par rapport au mois précédent. ${causeFr} Commence par vérifier les achats répétés et les dépenses ponctuelles élevées.`,
    kr: `Sa mwa-la, out dépans i monte a ${formatMontant(current)}. Zot la ogmant de ${formatMontant(diff)}${percentTextKr} par rapport mwa dernier. ${causeKr} Regarde dabor bann achats i revient souvent ek bann gro dépans ponctuelles.`,
    intent: ASSISTANT_INTENTS.SPENDING_INCREASE,
    confidence: 0.95,
    insights,
    actions: [{ type: "open_page", target: "statistics", label_fr: "Voir mes stats", label_kr: "War mes stats" }],
  })
}

function buildCheapestStoresAnswer({ insights }) {
  const stores = insights.stores || []
  const comparisons = insights.storeComparisons || {}

  if (stores.length < 2) {
    return insufficientData(ASSISTANT_INTENTS.CHEAPEST_STORES, insights, "stores")
  }

  if (!comparisons.hasReliableComparison) {
    const lowestSpend = stores[0]

    return response({
      fr: `Je vois où tu dépenses le moins : ${lowestSpend.store}, avec ${formatMontant(lowestSpend.totalSpend)} observés ce mois-ci. Mais je n'ai pas encore assez de produits comparables pour affirmer que ce magasin est globalement le moins cher. Scanne quelques courses dans au moins deux enseignes avec des produits proches.`,
      kr: `Mi voi kot ou dépans le moins : ${lowestSpend.store}, avek ${formatMontant(lowestSpend.totalSpend)} observé sa mwa-la. Mé mi nana pankor assez produits comparable pou dire sa magasin-la lé vraiment moins cher globalement. Scanne quelques courses dann au moins dé enseignes ek produits proches.`,
      intent: ASSISTANT_INTENTS.CHEAPEST_STORES,
      confidence: 0.88,
      insights,
      actions: [{ type: "open_page", target: "shopping", label_fr: "Voir mes courses", label_kr: "War mes courses" }],
    })
  }

  const best = comparisons.ranking[0]
  const examples = (comparisons.examples || [])
    .filter(item => item.bestStore === best.store)
    .slice(0, 2)
    .map(item => item.product)

  return response({
    fr: `Sur ${comparisons.comparableProductsCount} produits comparables, ${best.store} ressort moins cher sur ${best.wins} produit(s). C'est une indication sur tes tickets, pas une preuve que l'enseigne est toujours la moins chère. Vérifie surtout ${sentenceList(examples, "les produits fréquents")} avant de changer tes habitudes.`,
    kr: `Su ${comparisons.comparableProductsCount} produits comparable, ${best.store} i ressort moins cher su ${best.wins} produit(s). Sa lé in indication su out tiké, pa in preuve que l'enseigne lé toujours moins cher. Vérifie surtout ${sentenceList(examples, "bann produits fréquents")} avan shanz out habitudes.`,
    intent: ASSISTANT_INTENTS.CHEAPEST_STORES,
    confidence: 0.93,
    insights,
    actions: [{ type: "open_page", target: "shopping", label_fr: "Voir mes courses", label_kr: "War mes courses" }],
  })
}

function buildSaveTargetAnswer({ question, insights }) {
  const target = extractTargetAmount(question)
  const current = money(insights.currentMonth?.expenses)
  const topCategory = insights.currentMonth?.topCategories?.[0]

  if (current <= 0) return insufficientData(ASSISTANT_INTENTS.SAVE_TARGET, insights)

  if (current < target * 1.5) {
    const realistic = Math.max(10, Math.round((current * 0.1) / 5) * 5)

    return response({
      fr: `Avec ${formatMontant(current)} de dépenses visibles ce mois-ci, viser ${formatMontant(target)} d'économie serait trop ambitieux sans couper dans l'essentiel. Un premier objectif plus réaliste serait autour de ${formatMontant(realistic)} : choisis une catégorie variable et bloque un petit plafond hebdomadaire.`,
      kr: `Avek ${formatMontant(current)} dépans visibles sa mwa-la, vise ${formatMontant(target)} lé trop ambitieux sans coupe dann l'essentiel. In objectif plus réaliste serait autour ${formatMontant(realistic)} : choisit in catégorie variable ek met in ti plafond chaque semaine.`,
      intent: ASSISTANT_INTENTS.SAVE_TARGET,
      confidence: 0.9,
      insights,
      actions: [{ type: "open_page", target: "depenses", label_fr: "Voir mes dépenses", label_kr: "War mes dépans" }],
    })
  }

  const weekly = target / 4
  const categoryAmount = money(topCategory?.amount)
  const categoryCut = Math.min(target * 0.45, Math.max(0, categoryAmount * 0.12))
  const smallCut = Math.min(target * 0.25, Math.max(0, money(insights.smallRepeatedPurchases?.total) * 0.4))
  const basketCut = Math.max(0, target - categoryCut - smallCut)
  const categoryFr = getAssistantCategoryLabel(topCategory?.id || "divers", "fr")
  const categoryKr = getAssistantCategoryLabel(topCategory?.id || "divers", "kr")

  return response({
    fr: `Pour viser ${formatMontant(target)}, commence par un objectif de ${formatMontant(weekly)} par semaine. Plan réaliste : réduire ${categoryFr} d'environ ${formatMontant(categoryCut)}, limiter les petits achats répétés d'environ ${formatMontant(smallCut)}, puis baisser le panier moyen ou reporter quelques achats pour ${formatMontant(basketCut)}. Total visé : ${formatMontant(categoryCut + smallCut + basketCut)}, sans garantie et à ajuster selon tes dépenses essentielles.`,
    kr: `Pou vise ${formatMontant(target)}, commence par ${formatMontant(weekly)} par semaine. Plan réaliste : baisse ${categoryKr} d'environ ${formatMontant(categoryCut)}, limite bann petits achats répétés d'environ ${formatMontant(smallCut)}, puis baisse panier moyen ou reporte quelques achats pou ${formatMontant(basketCut)}. Total visé : ${formatMontant(categoryCut + smallCut + basketCut)}, sans garantie ek à ajuster selon out dépans essentielles.`,
    intent: ASSISTANT_INTENTS.SAVE_TARGET,
    confidence: 0.92,
    insights,
    actions: [{ type: "open_page", target: "savings", label_fr: "Voir mes économies", label_kr: "War mes ekonomi" }],
  })
}

function buildFoodBudgetAnswer({ insights }) {
  const currentFood = money(insights.currentMonth?.foodExpenses)
  const previousFood = money(insights.previousMonth?.foodExpenses)
  const currentReceipts = money(insights.currentMonth?.receiptsCount)
  const previousReceipts = money(insights.previousMonth?.receiptsCount)
  const basket = money(insights.currentMonth?.basketAverage)
  const previousBasket = money(insights.previousMonth?.basketAverage)

  if (currentFood <= 0 && currentReceipts <= 0) {
    return insufficientData(ASSISTANT_INTENTS.FOOD_BUDGET_INCREASE, insights, "food")
  }

  const topProducts = (insights.frequentProducts || []).slice(0, 2).map(product => product.label)

  if (previousFood <= 0) {
    return response({
      fr: `Ton alimentation représente ${formatMontant(currentFood)} ce mois-ci. Je n'ai pas encore de mois précédent alimentaire comparable, donc je ne peux pas prouver une hausse. Les prochains tickets permettront de distinguer panier moyen, passages en magasin et produits fréquents${topProducts.length ? ` comme ${sentenceList(topProducts)}` : ""}.`,
      kr: `Out manzé i représente ${formatMontant(currentFood)} sa mwa-la. Mi nana pankor mwa dernier comparable pou manzé, alors mi pé pa prouve in hausse. Bann prochains tiké va aide distingue panier moyen, passages magasin ek produits fréquents${topProducts.length ? ` comme ${sentenceList(topProducts)}` : ""}.`,
      intent: ASSISTANT_INTENTS.FOOD_BUDGET_INCREASE,
      confidence: 0.86,
      insights,
      actions: [{ type: "open_page", target: "receipts", label_fr: "Voir mes tickets", label_kr: "War mes tiké" }],
    })
  }

  const diff = currentFood - previousFood
  const reasonsFr = []
  const reasonsKr = []

  if (currentReceipts > previousReceipts) {
    reasonsFr.push("davantage de passages en magasin")
    reasonsKr.push("plis passages magasin")
  }

  if (basket > previousBasket && previousBasket > 0) {
    reasonsFr.push("un panier moyen plus élevé")
    reasonsKr.push("in panier moyen plus haut")
  }

  if (topProducts.length > 0) {
    reasonsFr.push(`des produits fréquents comme ${sentenceList(topProducts)}`)
    reasonsKr.push(`bann produits fréquents comme ${sentenceList(topProducts)}`)
  }

  if (diff <= 0) {
    return response({
      fr: `Je ne vois pas de hausse alimentaire prouvée ce mois-ci : ${formatMontant(currentFood)} contre ${formatMontant(previousFood)} le mois précédent. Surveille quand même le panier moyen, actuellement à ${formatMontant(basket)}, et les passages en magasin.`,
      kr: `Mi voi pa hausse manzé prouvée sa mwa-la : ${formatMontant(currentFood)} contre ${formatMontant(previousFood)} mwa dernier. Surveille quand même panier moyen, actuellement ${formatMontant(basket)}, ek passages magasin.`,
      intent: ASSISTANT_INTENTS.FOOD_BUDGET_INCREASE,
      confidence: 0.92,
      insights,
      actions: [{ type: "open_page", target: "receipts", label_fr: "Voir mes tickets", label_kr: "War mes tiké" }],
    })
  }

  const reasonTextFr = reasonsFr.length
    ? `Les signaux visibles : ${sentenceList(reasonsFr)}.`
    : "Je vois la hausse, mais pas encore assez de détail pour isoler une cause certaine."
  const reasonTextKr = reasonsKr.length
    ? `Bann signaux visibles : ${sentenceList(reasonsKr)}.`
    : "Mi voi la hausse, mé pas encore assez détail pou isoler in cause certaine."

  return response({
    fr: `Ton budget alimentation augmente de ${formatMontant(diff)} : ${formatMontant(currentFood)} ce mois-ci contre ${formatMontant(previousFood)} le mois précédent. ${reasonTextFr} Commence par comparer les produits qui reviennent souvent et les tickets les plus élevés.`,
    kr: `Out bidzé manzé i ogmant de ${formatMontant(diff)} : ${formatMontant(currentFood)} sa mwa-la contre ${formatMontant(previousFood)} mwa dernier. ${reasonTextKr} Regarde dabor bann produits i revient souvent ek bann tiké les plus hauts.`,
    intent: ASSISTANT_INTENTS.FOOD_BUDGET_INCREASE,
    confidence: 0.94,
    insights,
    actions: [{ type: "open_page", target: "receipts", label_fr: "Voir mes tickets", label_kr: "War mes tiké" }],
  })
}

export function buildUnknownAssistantFallback({ insights } = {}) {
  return response({
    fr: "Je peux répondre précisément sur les dépenses du mois, les magasins, les produits fréquents et les économies possibles. Pour cette question, je n'ai pas assez de contexte fiable sans analyse IA. Reformule avec une question budget concrète ou ouvre Mes stats pour vérifier les chiffres.",
    kr: "Mi pé réponn bien su dépans du mwa, magasins, produits fréquents ek lékonomi possible. Pou sa kestyon-la, mi nana pa assez contexte fiable sans analiz IA. Reformule avek in kestyon budget concrète ou ouvre Mes stats pou vérifier chiffres.",
    intent: ASSISTANT_INTENTS.UNKNOWN,
    confidence: 0.45,
    insights,
    actions: [{ type: "open_page", target: "statistics", label_fr: "Voir mes stats", label_kr: "War mes stats" }],
    source: "fallback",
  })
}

export function answerAssistantQuestion({ question = "", insights = {} } = {}) {
  const intent = detectAssistantIntent(question)

  if (intent === ASSISTANT_INTENTS.SPENDING_INCREASE) return buildSpendingIncreaseAnswer({ insights })
  if (intent === ASSISTANT_INTENTS.CHEAPEST_STORES) return buildCheapestStoresAnswer({ insights })
  if (intent === ASSISTANT_INTENTS.SAVE_TARGET) return buildSaveTargetAnswer({ question, insights })
  if (intent === ASSISTANT_INTENTS.FOOD_BUDGET_INCREASE) return buildFoodBudgetAnswer({ insights })

  return buildUnknownAssistantFallback({ insights })
}

export function selectAssistantAnswerText(answer, language = "fr") {
  const lang = normalizeAssistantLanguage(language)
  return lang === "kr" ? answer?.kr || answer?.fr || "" : answer?.fr || answer?.kr || ""
}

export function selectAssistantActionLabel(action = {}, language = "fr") {
  return normalizeAssistantLanguage(language) === "kr"
    ? action.label_kr || action.label_fr || ""
    : action.label_fr || action.label_kr || ""
}
