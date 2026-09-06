import { formatMontant } from "../../utils/format.js"
import { normalizeAssistantLanguage, normalizeForAssistantMatch } from "./assistantLanguage.js"
import { getAssistantCategoryLabel } from "./assistantInsightsService.js"

export const ASSISTANT_INTENTS = Object.freeze({
  BUDGET_REMAINING: "budget_remaining",
  BUDGET_CATEGORY: "budget_category",
  BUDGET_PERIOD_COMPARE: "budget_period_compare",
  BUDGET_GROCERY: "budget_grocery",
  BUDGET_FIXED_EXPENSES: "budget_fixed_expenses",
  BUDGET_SUBSCRIPTIONS: "budget_subscriptions",
  BUDGET_UNUSUAL_EXPENSE: "budget_unusual_expense",
  BUDGET_SAVINGS: "budget_savings",
  BUDGET_SHOPPING_AFFORDABILITY: "budget_shopping_affordability",
  BUDGET_GENERAL: "budget_general",
  CHEAPEST_STORES: "cheapest_stores",
  SAVE_TARGET: "budget_general",
  SPENDING_INCREASE: "budget_period_compare",
  FOOD_BUDGET_INCREASE: "budget_grocery",
  UNKNOWN: "unknown",
})

const BUDGET_INTENTS = new Set(Object.values(ASSISTANT_INTENTS).filter(intent => intent.startsWith("budget_")))

function hasAny(text, values) {
  return values.some(value => text.includes(value))
}

function cleanAnswer(answer) {
  return String(answer || "")
    .replace(/\b(?:NaN|Infinity|undefined)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function response({ fr, kr, intent, insights, actions = [], source = "local", confidence = 0.98 }) {
  const used = {
    transactionsCount: Number(insights?.dataUsed?.transactionsCount || 0),
    receiptsCount: Number(insights?.dataUsed?.receiptsCount || 0),
    storesCount: Number(insights?.dataUsed?.storesCount || 0),
    productsCount: Number(insights?.dataUsed?.productsCount || 0),
    comparableProductsCount: Number(insights?.dataUsed?.comparableProductsCount || 0),
  }
  return {
    fr: cleanAnswer(fr),
    kr: cleanAnswer(kr),
    intent,
    confidence,
    dataUsed: used,
    transparency: {
      fr: `Calculé à partir de ${used.transactionsCount} transaction(s) enregistrée(s).`,
      kr: `Kalkilé avèk ${used.transactionsCount} tranzaksion anrezistré.`,
    },
    actions: actions.slice(0, 2),
    source,
  }
}

function action(target, labelFr, labelKr) {
  return { type: "open_page", target, label_fr: labelFr, label_kr: labelKr }
}

function contextOf(insights = {}) {
  return insights.budgetAdvisorContext || {}
}

function periodPhrase(context) {
  return context.period?.label ? `du ${context.period.label}` : "sur la période"
}

function percentText(value) {
  const number = Number(value)
  return Number.isFinite(number) ? `${Math.abs(Math.round(number))} %` : ""
}

function missingResponse(intent, insights, field) {
  const messages = {
    income: {
      fr: "Je peux analyser tes dépenses, mais tes revenus ne sont pas renseignés. Je ne peux donc pas calculer correctement ce qu'il te reste. Ajoute tes revenus mensuels.",
      kr: "Mi pé analiz out dépans, mé out revenus lé pa renseigné. Mi pé pa kalkil correctement sak i reste. Azout out revenus chaque mwa.",
      actions: [action("revenus", "Ajouter mes revenus", "Azout mon revenus")],
    },
    fixed: {
      fr: "Aucune charge fixe n'est enregistrée. Je ne peux pas calculer de marge après charges sans cette information. Ajoute d'abord tes charges fixes.",
      kr: "Nana poin sarz fix anrezistré. Mi pé pa kalkil marge apré sarz sans sa renseignman-la. Azout dabor out sarz fix.",
      actions: [action("abonnements", "Ajouter mes charges fixes", "Azout mon sarz fix")],
    },
    grocery: {
      fr: "Je n'ai pas encore de dépense courses enregistrée sur cette période. Ajoute tes dépenses ou scanne des tickets alimentaires.",
      kr: "Mi nana pankor dépans courses anrezistré su sa période-la. Azout out dépans ou scanne bann tiké manzé.",
      actions: [action("receipts", "Scanner un ticket", "Scanne in tiké")],
    },
    transactions: {
      fr: "Je n'ai pas de dépense enregistrée sur cette période. Je ne peux pas identifier ton principal poste de dépense.",
      kr: "Mi nana pa dépans anrezistré su sa période-la. Mi pé pa identifie out principal poste dépans.",
      actions: [action("depenses", "Ajouter une dépense", "Azout in dépans")],
    },
    previous: {
      fr: "Je vois la période actuelle, mais je n'ai pas de période précédente comparable. Je ne peux donc pas affirmer une hausse ou une baisse.",
      kr: "Mi voi période actuelle, mé mi nana pa période précédente comparable. Mi pé pa affirme in hausse ou in baisse.",
      actions: [action("statistics", "Voir mes statistiques", "War mon bann statistik")],
    },
    shopping: {
      fr: "Je n'ai pas de liste de courses courante ou sauvegardée à analyser. Ouvre Ma liste de courses et ajoute tes produits.",
      kr: "Mi nana pa liste courses actuelle ou sauvegardée pou analiz. Ouvre Ma liste courses ek azout out produits.",
      actions: [action("shoppingList", "Voir ma liste de courses", "War ma liste courses")],
    },
  }
  const message = messages[field] || messages.previous
  return response({ ...message, intent, insights, confidence: 0.99 })
}

export function detectAssistantIntent(question = "") {
  const text = normalizeForAssistantMatch(question)
  const grocery = hasAny(text, ["course", "courses", "aliment", "manze", "panier"])
  const list = hasAny(text, ["liste", "list", "panier"])
  const compare = hasAny(text, ["augmente", "augmentation", "ogmant", "hausse", "baisse", "plus que", "depense plus", "depenses plus", "depans plis", "compare", "evolution"])

  if (list && hasAny(text, ["rentre", "budget", "marge", "permettre", "afford", "assez"])) {
    return ASSISTANT_INTENTS.BUDGET_SHOPPING_AFFORDABILITY
  }
  if (hasAny(text, ["promo", "promotion"]) && hasAny(text, ["econom", "gagn", "saving"])) {
    return ASSISTANT_INTENTS.BUDGET_SAVINGS
  }
  if (hasAny(text, ["me reste", "reste t il", "marge", "reste apres", "i reste"])) return ASSISTANT_INTENTS.BUDGET_REMAINING
  if (hasAny(text, ["abonnement", "subscription"])) return ASSISTANT_INTENTS.BUDGET_SUBSCRIPTIONS
  if (hasAny(text, ["charge fixe", "charges fixes", "sarz fix"])) return ASSISTANT_INTENTS.BUDGET_FIXED_EXPENSES
  if (hasAny(text, ["inhabitu", "anormal", "grosse depense", "gro depans"])) return ASSISTANT_INTENTS.BUDGET_UNUSUAL_EXPENSE
  if (grocery) return ASSISTANT_INTENTS.BUDGET_GROCERY
  if (hasAny(text, ["categorie", "poste"]) || hasAny(text, ["ou est ce que je depense", "ou je depense", "kot mi depans"])) {
    return ASSISTANT_INTENTS.BUDGET_CATEGORY
  }
  if (compare && hasAny(text, ["depense", "depenses", "depans", "mois", "mwa", "periode"])) {
    return ASSISTANT_INTENTS.BUDGET_PERIOD_COMPARE
  }
  if (hasAny(text, ["magasin", "magazin", "enseigne"]) && hasAny(text, ["moins cher", "kout moins cher"])) {
    return ASSISTANT_INTENTS.CHEAPEST_STORES
  }
  if (hasAny(text, ["reduire", "economiser", "economiz", "budget", "depense", "depans"])) {
    return ASSISTANT_INTENTS.BUDGET_GENERAL
  }
  return ASSISTANT_INTENTS.UNKNOWN
}

export function isBudgetAssistantIntent(intent) {
  return BUDGET_INTENTS.has(intent)
}

function buildGroceryAnswer(question, insights) {
  const context = contextOf(insights)
  const grocery = context.grocery || {}
  if (grocery.currentSpend === null || grocery.currentSpend === undefined) {
    return missingResponse(ASSISTANT_INTENTS.BUDGET_GROCERY, insights, "grocery")
  }
  const asksAllowance = hasAny(normalizeForAssistantMatch(question), ["peux encore", "peut encore", "combien mettre", "konbien mettre", "combien depenser", "konbien depans"])
  if (asksAllowance) {
    const target = context.budgetTargets?.find(row => row.category === "alimentaire")
    const targetRemaining = target ? Math.max(0, target.amount - grocery.currentSpend) : null
    const factsFr = [
      context.currentAvailableMargin !== null ? `ta marge actuelle est de ${formatMontant(context.currentAvailableMargin)}` : "",
      targetRemaining !== null ? `il reste ${formatMontant(targetRemaining)} sur ton objectif courses mensuel` : "",
    ].filter(Boolean).join(" et ")
    const factsKr = [
      context.currentAvailableMargin !== null ? `out marge actuelle lé ${formatMontant(context.currentAvailableMargin)}` : "",
      targetRemaining !== null ? `i reste ${formatMontant(targetRemaining)} su out objectif courses du mwa` : "",
    ].filter(Boolean).join(" ek ")
    return response({
      fr: `${factsFr ? `${factsFr.charAt(0).toUpperCase()}${factsFr.slice(1)}. ` : ""}Je n'ai pas le calendrier de tes autres dépenses prévues ni l'échéance de tes charges : je ne peux donc pas fixer un montant hebdomadaire fiable sans l'inventer.`,
      kr: `${factsKr ? `${factsKr.charAt(0).toUpperCase()}${factsKr.slice(1)}. ` : ""}Mi nana pa calendrier out lezot dépans prévues ni échéance out sarz : mi pé pa fixe in montant semaine fiable sans invente ali.`,
      intent: ASSISTANT_INTENTS.BUDGET_GROCERY,
      insights,
      actions: [action("shoppingList", "Voir ma liste de courses", "War ma liste courses")],
    })
  }
  const comparisonFr = grocery.changeAmount === null || grocery.changeAmount === undefined
    ? " Je n'ai pas de période précédente comparable."
    : grocery.changeAmount === 0
      ? " C'est le même montant que sur la période précédente comparable."
      : ` C'est ${formatMontant(Math.abs(grocery.changeAmount))} de ${grocery.changeAmount > 0 ? "plus" : "moins"} que sur la période précédente comparable.`
  const comparisonKr = grocery.changeAmount === null || grocery.changeAmount === undefined
    ? " Mi nana pa période précédente comparable."
    : grocery.changeAmount === 0
      ? " Lé minm montant que période précédente comparable."
      : ` Lé ${formatMontant(Math.abs(grocery.changeAmount))} ${grocery.changeAmount > 0 ? "plis" : "moins"} que période précédente comparable.`
  return response({
    fr: `Tu as dépensé ${formatMontant(grocery.currentSpend)} en courses ${periodPhrase(context)}.${comparisonFr}`,
    kr: `Ou la dépans ${formatMontant(grocery.currentSpend)} pou courses ${periodPhrase(context)}.${comparisonKr}`,
    intent: ASSISTANT_INTENTS.BUDGET_GROCERY,
    insights,
    actions: [action("statistics", "Voir mes statistiques", "War mon bann statistik")],
  })
}

function buildCategoryAnswer(insights) {
  const context = contextOf(insights)
  const top = context.spendingByCategory?.[0]
  if (!top) return missingResponse(ASSISTANT_INTENTS.BUDGET_CATEGORY, insights, "transactions")
  const frLabel = getAssistantCategoryLabel(top.category, "fr")
  const krLabel = getAssistantCategoryLabel(top.category, "kr")
  const share = top.share === null ? "" : `, soit ${Math.round(top.share)} % de tes dépenses variables enregistrées`
  const shareKr = top.share === null ? "" : `, soit ${Math.round(top.share)} % out dépans variables anrezistré`
  return response({
    fr: `Le poste le plus élevé est ${frLabel} avec ${formatMontant(top.amount)} ${periodPhrase(context)}${share}.`,
    kr: `Poste le plus haut lé ${krLabel} avèk ${formatMontant(top.amount)} ${periodPhrase(context)}${shareKr}.`,
    intent: ASSISTANT_INTENTS.BUDGET_CATEGORY,
    insights,
    actions: [action("depenses", "Voir mes dépenses", "War mon bann dépans")],
  })
}

function buildFixedAnswer(insights, subscriptionsOnly = false) {
  const context = contextOf(insights)
  if (context.expenses?.fixed === null || context.expenses?.fixed === undefined) {
    return missingResponse(subscriptionsOnly ? ASSISTANT_INTENTS.BUDGET_SUBSCRIPTIONS : ASSISTANT_INTENTS.BUDGET_FIXED_EXPENSES, insights, "fixed")
  }
  const top = context.recurringCharges?.[0]
  const topFr = top ? ` La charge la plus élevée enregistrée est « ${top.label} » à ${formatMontant(top.amount)} par mois.` : ""
  const topKr = top ? ` Sarz le plus haut anrezistré lé « ${top.label} » à ${formatMontant(top.amount)} par mwa.` : ""
  return response({
    fr: `Tes charges fixes enregistrées représentent ${formatMontant(context.expenses.fixed)} par mois.${topFr}`,
    kr: `Out sarz fix anrezistré i représente ${formatMontant(context.expenses.fixed)} par mwa.${topKr}`,
    intent: subscriptionsOnly ? ASSISTANT_INTENTS.BUDGET_SUBSCRIPTIONS : ASSISTANT_INTENTS.BUDGET_FIXED_EXPENSES,
    insights,
    actions: [action("abonnements", "Voir mes charges fixes", "War mon sarz fix")],
  })
}

function buildRemainingAnswer(question, insights) {
  const context = contextOf(insights)
  if (!context.income?.available) return missingResponse(ASSISTANT_INTENTS.BUDGET_REMAINING, insights, "income")
  if (context.expenses?.fixed === null || context.expenses?.fixed === undefined) return missingResponse(ASSISTANT_INTENTS.BUDGET_REMAINING, insights, "fixed")
  const why = hasAny(normalizeForAssistantMatch(question), ["pourquoi", "pou kosa", "si peu", "ti gin"])
  if (!why || context.currentAvailableMargin === null) {
    const marginFr = context.currentAvailableMargin === null
      ? " Je n'ai pas assez de dépenses variables enregistrées pour calculer la marge actuelle."
      : ` Après les dépenses variables déjà enregistrées, ta marge actuelle est de ${formatMontant(context.currentAvailableMargin)}.`
    const marginKr = context.currentAvailableMargin === null
      ? " Mi nana pa assez dépans variables anrezistré pou kalkil marge actuelle."
      : ` Apré dépans variables déjà anrezistré, out marge actuelle lé ${formatMontant(context.currentAvailableMargin)}.`
    return response({
      fr: `Après ${formatMontant(context.expenses.fixed)} de charges fixes, il te reste ${formatMontant(context.remainingAfterFixedExpenses)} sur ${formatMontant(context.income.total)} de revenus enregistrés.${marginFr}`,
      kr: `Apré ${formatMontant(context.expenses.fixed)} sarz fix, i reste aou ${formatMontant(context.remainingAfterFixedExpenses)} su ${formatMontant(context.income.total)} revenus anrezistré.${marginKr}`,
      intent: ASSISTANT_INTENTS.BUDGET_REMAINING,
      insights,
      actions: [action("solde", "Voir le détail du solde", "War détail solde")],
    })
  }

  const top = context.spendingByCategory?.slice(0, 2) || []
  const factorsFr = top.map(row => `${getAssistantCategoryLabel(row.category, "fr")} : ${formatMontant(row.amount)}`).join(" ; ")
  const factorsKr = top.map(row => `${getAssistantCategoryLabel(row.category, "kr")} : ${formatMontant(row.amount)}`).join(" ; ")
  return response({
    fr: `Après tes charges fixes, il restait ${formatMontant(context.remainingAfterFixedExpenses)}. Tes dépenses variables enregistrées atteignent ${formatMontant(context.expenses.variable)}, surtout ${factorsFr || "sans catégorie dominante identifiable"}. Ta marge actuelle est donc de ${formatMontant(context.currentAvailableMargin)}. Les données montrent ces montants, mais ne suffisent pas à attribuer une cause. Priorité : vérifie le premier poste avant une nouvelle dépense.`,
    kr: `Apré out sarz fix, té reste ${formatMontant(context.remainingAfterFixedExpenses)}. Out dépans variables anrezistré i monte ${formatMontant(context.expenses.variable)}, surtout ${factorsKr || "sans catégorie dominante identifiable"}. Out marge actuelle lé donc ${formatMontant(context.currentAvailableMargin)}. Bann donné i montre montants-la, mé zot suffit pa pou donne in cause. Priorité : vérifie premier poste avan in nouvo dépans.`,
    intent: ASSISTANT_INTENTS.BUDGET_REMAINING,
    insights,
    actions: [action("depenses", "Voir mes dépenses", "War mon bann dépans")],
  })
}

function buildPeriodComparisonAnswer(insights) {
  const context = contextOf(insights)
  const comparison = context.periodComparison || {}
  if (!comparison.comparable || comparison.expenseChange === null) {
    return missingResponse(ASSISTANT_INTENTS.BUDGET_PERIOD_COMPARE, insights, "previous")
  }
  const current = context.expenses?.variable
  const difference = comparison.expenseChange
  const directionFr = difference === 0 ? "identiques" : difference > 0 ? "en hausse" : "en baisse"
  const directionKr = difference === 0 ? "parey" : difference > 0 ? "an hausse" : "an baisse"
  const detailFr = difference === 0 ? "" : ` de ${formatMontant(Math.abs(difference))}${comparison.expenseChangePercent === null ? "" : ` (${percentText(comparison.expenseChangePercent)})`}`
  const detailKr = difference === 0 ? "" : ` de ${formatMontant(Math.abs(difference))}${comparison.expenseChangePercent === null ? "" : ` (${percentText(comparison.expenseChangePercent)})`}`
  const topIncrease = context.spendingByCategory?.filter(row => Number(row.changeAmount) > 0).sort((left, right) => right.changeAmount - left.changeAmount)[0]
  const increaseFr = topIncrease ? ` La plus forte hausse visible est ${getAssistantCategoryLabel(topIncrease.category, "fr")} : +${formatMontant(topIncrease.changeAmount)}.` : ""
  const increaseKr = topIncrease ? ` Hausse le plus forte visible lé ${getAssistantCategoryLabel(topIncrease.category, "kr")} : +${formatMontant(topIncrease.changeAmount)}.` : ""
  return response({
    fr: `Tes dépenses variables sont ${directionFr}${detailFr} : ${formatMontant(current)} ${periodPhrase(context)}, contre ${formatMontant(comparison.previousExpenses)} sur la période précédente de même durée.${increaseFr}`,
    kr: `Out dépans variables lé ${directionKr}${detailKr} : ${formatMontant(current)} ${periodPhrase(context)}, contre ${formatMontant(comparison.previousExpenses)} su période précédente minm durée.${increaseKr}`,
    intent: ASSISTANT_INTENTS.BUDGET_PERIOD_COMPARE,
    insights,
    actions: [action("statistics", "Voir mes statistiques", "War mon bann statistik")],
  })
}

function buildSavingsAnswer(insights) {
  const grocery = contextOf(insights).grocery || {}
  if (grocery.shoppingListItemsCount === null || grocery.shoppingListItemsCount === undefined) {
    return missingResponse(ASSISTANT_INTENTS.BUDGET_SAVINGS, insights, "shopping")
  }
  if (Number(grocery.reliableSavingsTotal || 0) > 0) {
    return response({
      fr: `BudgetKazPéi a repéré ${formatMontant(grocery.reliableSavingsTotal)} d'économies personnelles suffisamment fiables sur ta liste. Le panier passe d'une estimation historique de ${formatMontant(grocery.historicalBasketEstimate)} à environ ${formatMontant(grocery.optimizedBasketEstimate)}.`,
      kr: `BudgetKazPéi la trouve ${formatMontant(grocery.reliableSavingsTotal)} lékonomi pèsonèl suffisamment fiable su out liste. Panier i passe in estimasyon historique ${formatMontant(grocery.historicalBasketEstimate)} à environ ${formatMontant(grocery.optimizedBasketEstimate)}.`,
      intent: ASSISTANT_INTENTS.BUDGET_SAVINGS,
      insights,
      actions: [action("savings", "Voir mes économies", "War mon bann lékonomi"), action("promotions", "Voir mes bons plans", "War mon bann bon plan")],
    })
  }
  const promoNote = Number(grocery.reliablePromotionCount || 0) > 0
    ? " Des promotions sont repérées, mais sans prix historique personnel comparable je ne peux pas annoncer d'économie."
    : " Aucune économie personnelle fiable n'est calculable avec les données actuelles."
  const promoNoteKr = Number(grocery.reliablePromotionCount || 0) > 0
    ? " Na bann promo repéré, mé sans prix historique pèsonèl comparable mi pé pa annonce lékonomi."
    : " Nana poin lékonomi pèsonèl fiable kalkilab avek bann donné actuelles."
  return response({
    fr: `Économie fiable calculée sur ta liste : ${formatMontant(0)}.${promoNote}`,
    kr: `Lékonomi fiable kalkilé su out liste : ${formatMontant(0)}.${promoNoteKr}`,
    intent: ASSISTANT_INTENTS.BUDGET_SAVINGS,
    insights,
    actions: [action("promotions", "Voir mes bons plans", "War mon bann bon plan")],
  })
}

function buildAffordabilityAnswer(insights) {
  const context = contextOf(insights)
  const grocery = context.grocery || {}
  if (grocery.shoppingListItemsCount === null || grocery.shoppingListItemsCount === undefined) {
    return missingResponse(ASSISTANT_INTENTS.BUDGET_SHOPPING_AFFORDABILITY, insights, "shopping")
  }
  if (!context.income?.available) return missingResponse(ASSISTANT_INTENTS.BUDGET_SHOPPING_AFFORDABILITY, insights, "income")
  if (context.expenses?.fixed === null) return missingResponse(ASSISTANT_INTENTS.BUDGET_SHOPPING_AFFORDABILITY, insights, "fixed")
  if (context.currentAvailableMargin === null || grocery.optimizedBasketEstimate === null) {
    return missingResponse(ASSISTANT_INTENTS.BUDGET_SHOPPING_AFFORDABILITY, insights, "shopping")
  }
  const fits = grocery.optimizedBasketEstimate <= context.currentAvailableMargin
  const after = context.currentAvailableMargin - grocery.optimizedBasketEstimate
  return response({
    fr: `Ta liste est estimée à ${formatMontant(grocery.optimizedBasketEstimate)} et ta marge actuelle à ${formatMontant(context.currentAvailableMargin)}. Elle ${fits ? `rentre dans cette marge, avec ${formatMontant(after)} restant` : `dépasse cette marge de ${formatMontant(Math.abs(after))}`}. Je n'ai toutefois pas assez d'informations sur tes autres dépenses prévues pour te conseiller d'utiliser tout le solde.`,
    kr: `Out liste lé estimé ${formatMontant(grocery.optimizedBasketEstimate)} ek out marge actuelle ${formatMontant(context.currentAvailableMargin)}. Li ${fits ? `i rentre dann marge-la, avèk ${formatMontant(after)} i reste` : `i dépasse marge-la de ${formatMontant(Math.abs(after))}`}. Mé mi nana pa assez renseignman su out lezot dépans prévues pou conseille aou utilise tout solde-la.`,
    intent: ASSISTANT_INTENTS.BUDGET_SHOPPING_AFFORDABILITY,
    insights,
    actions: [action("shoppingList", "Voir ma liste de courses", "War ma liste courses")],
  })
}

function buildUnusualAnswer(insights) {
  const rows = contextOf(insights).unusualExpenses || []
  if (rows.length === 0) {
    return response({
      fr: "Aucune dépense inhabituelle n'est repérée avec les données disponibles sur cette période. Cela ne signifie pas qu'il n'y en a aucune, seulement qu'aucune ne dépasse les seuils prudents de comparaison.",
      kr: "Nana poin dépans inhabituelle repéré avèk bann donné disponible su sa période-la. Sa veut pa dire nana poin ditou, seulement aucune i dépasse seuil comparaison prudent.",
      intent: ASSISTANT_INTENTS.BUDGET_UNUSUAL_EXPENSE,
      insights,
      actions: [action("depenses", "Voir mes dépenses", "War mon bann dépans")],
    })
  }
  const first = rows[0]
  const fr = first.type === "large_transaction"
    ? `Une dépense inhabituelle est repérée : « ${first.label} » à ${formatMontant(first.amount)}. Elle est plus élevée que les dépenses habituelles enregistrées dans cette catégorie.`
    : `Une hausse inhabituelle est repérée sur ${getAssistantCategoryLabel(first.category, "fr")} : +${formatMontant(first.changeAmount)} par rapport à la période comparable.`
  const kr = first.type === "large_transaction"
    ? `In dépans inhabituelle lé repéré : « ${first.label} » à ${formatMontant(first.amount)}. Li lé plus haute que bann dépans habituelles anrezistré dann sa catégorie-la.`
    : `In hausse inhabituelle lé repéré su ${getAssistantCategoryLabel(first.category, "kr")} : +${formatMontant(first.changeAmount)} par rapport période comparable.`
  return response({ fr, kr, intent: ASSISTANT_INTENTS.BUDGET_UNUSUAL_EXPENSE, insights, actions: [action("depenses", "Voir mes dépenses", "War mon bann dépans")] })
}

function buildGeneralBudgetAnswer(insights) {
  const context = contextOf(insights)
  const topCategory = context.spendingByCategory?.[0]
  const topCharge = context.recurringCharges?.[0]
  if (!topCategory && !topCharge) return missingResponse(ASSISTANT_INTENTS.BUDGET_GENERAL, insights, "transactions")
  const categoryFr = topCategory ? `${getAssistantCategoryLabel(topCategory.category, "fr")} (${formatMontant(topCategory.amount)})` : ""
  const categoryKr = topCategory ? `${getAssistantCategoryLabel(topCategory.category, "kr")} (${formatMontant(topCategory.amount)})` : ""
  const chargeFr = topCharge ? ` La charge récurrente la plus élevée est « ${topCharge.label} » (${formatMontant(topCharge.amount)}). Tu peux vérifier si elle est encore adaptée, sans supposer qu'elle est supprimable.` : ""
  const chargeKr = topCharge ? ` Sarz récurrente le plus haut lé « ${topCharge.label} » (${formatMontant(topCharge.amount)}). Ou pé vérifie si li lé ankor adapté, sans suppose li pé supprimé.` : ""
  return response({
    fr: `Le premier poste à examiner est ${categoryFr}.${chargeFr}`,
    kr: `Premier poste pou regarde lé ${categoryKr}.${chargeKr}`,
    intent: ASSISTANT_INTENTS.BUDGET_GENERAL,
    insights,
    actions: [action("depenses", "Voir mes dépenses", "War mon bann dépans")],
  })
}

function buildCheapestStoresAnswer(insights) {
  const stores = insights.stores || []
  if (stores.length < 2 || !insights.storeComparisons?.hasReliableComparison) {
    return response({
      fr: "Je n'ai pas encore assez de tickets avec des produits comparables pour classer tes magasins de façon fiable.",
      kr: "Mi nana pankor assez tiké ek produits comparable pou klase out magasins de fason fiable.",
      intent: ASSISTANT_INTENTS.CHEAPEST_STORES,
      insights,
      actions: [action("receipts", "Ajouter des tickets", "Azout bann tiké")],
    })
  }
  const best = insights.storeComparisons.ranking[0]
  return response({
    fr: `Sur ${insights.storeComparisons.comparableProductsCount} produits comparables, ${best.store} ressort le moins cher sur ${best.wins} produit(s). C'est une observation de tes tickets, pas une règle générale sur l'enseigne.`,
    kr: `Su ${insights.storeComparisons.comparableProductsCount} produits comparable, ${best.store} i ressort moins cher su ${best.wins} produit(s). Lé in observation out tiké, pa in règle générale su l'enseigne.`,
    intent: ASSISTANT_INTENTS.CHEAPEST_STORES,
    insights,
    actions: [action("shopping", "Voir mes courses", "War mon courses")],
  })
}

export function buildUnknownAssistantFallback({ insights } = {}) {
  return response({
    fr: "Je n'ai pas assez de contexte déterministe pour répondre sans analyse complémentaire.",
    kr: "Mi nana pa assez contexte déterministe pou réponn sans analiz complémentaire.",
    intent: ASSISTANT_INTENTS.UNKNOWN,
    insights,
    source: "fallback",
    confidence: 0.4,
  })
}

export function answerAssistantQuestion({ question = "", insights = {} } = {}) {
  const intent = detectAssistantIntent(question)
  if (intent === ASSISTANT_INTENTS.BUDGET_GROCERY) return buildGroceryAnswer(question, insights)
  if (intent === ASSISTANT_INTENTS.BUDGET_CATEGORY) return buildCategoryAnswer(insights)
  if (intent === ASSISTANT_INTENTS.BUDGET_FIXED_EXPENSES) return buildFixedAnswer(insights)
  if (intent === ASSISTANT_INTENTS.BUDGET_SUBSCRIPTIONS) return buildFixedAnswer(insights, true)
  if (intent === ASSISTANT_INTENTS.BUDGET_REMAINING) return buildRemainingAnswer(question, insights)
  if (intent === ASSISTANT_INTENTS.BUDGET_PERIOD_COMPARE) return buildPeriodComparisonAnswer(insights)
  if (intent === ASSISTANT_INTENTS.BUDGET_SAVINGS) return buildSavingsAnswer(insights)
  if (intent === ASSISTANT_INTENTS.BUDGET_SHOPPING_AFFORDABILITY) return buildAffordabilityAnswer(insights)
  if (intent === ASSISTANT_INTENTS.BUDGET_UNUSUAL_EXPENSE) return buildUnusualAnswer(insights)
  if (intent === ASSISTANT_INTENTS.BUDGET_GENERAL) return buildGeneralBudgetAnswer(insights)
  if (intent === ASSISTANT_INTENTS.CHEAPEST_STORES) return buildCheapestStoresAnswer(insights)
  return buildUnknownAssistantFallback({ insights })
}

export function selectAssistantAnswerText(answer, language = "fr") {
  const lang = normalizeAssistantLanguage(language)
  return lang === "kr" ? answer?.kr || answer?.fr || "" : answer?.fr || answer?.kr || ""
}

export function selectAssistantActionLabel(actionRow = {}, language = "fr") {
  return normalizeAssistantLanguage(language) === "kr"
    ? actionRow.label_kr || actionRow.label_fr || ""
    : actionRow.label_fr || actionRow.label_kr || ""
}
