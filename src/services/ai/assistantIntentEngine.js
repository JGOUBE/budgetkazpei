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

function asksWhyRemainingIsLow(question = "") {
  const text = normalizeForAssistantMatch(question)
  return (
    hasAny(text, ["pourquoi", "pou kosa", "pourkoi"]) &&
    hasAny(text, ["si peu", "peu", "reste peu", "reste si peu", "ti gin", "reste pa bokou"])
  )
}

function asksSpendingIncrease(question = "") {
  const text = normalizeForAssistantMatch(question)
  return hasAny(text, [
    "augmente",
    "augmentation",
    "hausse",
    "explose",
    "depense plus",
    "depenses plus",
    "plus que",
    "ogmant",
    "depans plis",
  ])
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
  // The amount and distribution of recorded expenses can be computed locally.
  const categoryBreakdown = hasAny(text, ["pourcentage", "proportion", "repartition", "part de", "part des", "en pourcent"]) &&
    hasAny(text, ["depense", "depans", "courses", "aliment", "manze", "logement", "loyer", "transport", "essence", "sante", "energie", "assurance", "categorie", "poste"])
  if (categoryBreakdown || hasAny(text, [
    "mes principales depenses", "mes plus grosses depenses",
    "mes trois principaux postes", "mes 3 principaux postes",
    "mes trois plus gros postes", "mes 3 plus gros postes",
  ])) return ASSISTANT_INTENTS.BUDGET_CATEGORY
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
  if (
    asksSpendingIncrease(question) &&
    grocery.changeAmount !== null &&
    grocery.changeAmount !== undefined &&
    Number(grocery.changeAmount) <= 0
  ) {
    const delta = Math.abs(Number(grocery.changeAmount))
    const frDetail = delta === 0
      ? "Le montant est identique à la période précédente comparable."
      : `C'est ${formatMontant(delta)} de moins que sur la période précédente comparable.`
    const krDetail = delta === 0
      ? "Montant-la lé pareil ke période précédente comparable."
      : `Lé ${formatMontant(delta)} moins ke période précédente comparable.`

    return response({
      fr: `Tes dépenses de courses n'ont pas augmenté ${periodPhrase(context)}. Tu as dépensé ${formatMontant(grocery.currentSpend)}. ${frDetail}`,
      kr: `Out dépans courses la pa augmenté ${periodPhrase(context)}. Ou la dépans ${formatMontant(grocery.currentSpend)}. ${krDetail}`,
      intent: ASSISTANT_INTENTS.BUDGET_GROCERY,
      insights,
      actions: [action("statistics", "Voir mes statistiques", "War mon bann statistik")],
      confidence: 0.99,
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

function categoryRequested(question = "") {
  const text = normalizeForAssistantMatch(question)
  const categories = [
    ["alimentaire", ["alimentation", "alimentaire", "courses", "manze"]],
    ["logement", ["logement", "loyer"]],
    ["transport", ["transport", "essence", "carburant"]],
    ["energie", ["energie", "electricite", "edf"]],
    ["telecom", ["telephonie", "telephone", "internet"]],
    ["assurances", ["assurances", "assurance"]],
    ["sante", ["sante", "pharmacie"]],
    ["loisirs", ["loisirs", "loisir"]],
  ]
  return categories.find(([, labels]) => labels.some(label => text.split(" ").includes(label)))?.[0] || null
}

function buildCategoryAnswer(question, insights) {
  const context = contextOf(insights)
  const rows = context.spendingByCategory || []
  const top = rows[0]
  if (!top) return missingResponse(ASSISTANT_INTENTS.BUDGET_CATEGORY, insights, "transactions")
  const text = normalizeForAssistantMatch(question)
  const shares = hasAny(text, ["pourcentage", "proportion", "repartition", "part de", "part des", "en pourcent"])
  const target = shares ? categoryRequested(question) : null
  const actions = [action("depenses", "Voir mes dépenses", "War mon bann dépans")]
  if (target) {
    const row = rows.find(item => item.category === target)
    const fr = getAssistantCategoryLabel(target, "fr")
    const kr = getAssistantCategoryLabel(target, "kr")
    if (!row) return response({
      fr: "Aucune dépense classée dans " + fr + " " + periodPhrase(context) + " dans les transactions enregistrées. Cela ne signifie pas qu'il n'y a eu aucun achat.",
      kr: "Nana poin dépans classé dann " + kr + " " + periodPhrase(context) + " parmi bann tranzaksion anrezistré.",
      intent: ASSISTANT_INTENTS.BUDGET_CATEGORY, insights, actions,
    })
    const share = row.share === null || row.share === undefined ? "" : " (" + Math.round(row.share) + " % des dépenses variables enregistrées)"
    return response({
      fr: "Pour " + fr + ", " + formatMontant(row.amount) + " " + periodPhrase(context) + share + ". Les charges fixes suivies séparément ne sont pas ajoutées dans ce pourcentage.",
      kr: "Pou " + kr + ", " + formatMontant(row.amount) + " " + periodPhrase(context) + share + ". Bann sarz fixes suivies séparément lé pa ajouté dann pourcentage-la.",
      intent: ASSISTANT_INTENTS.BUDGET_CATEGORY, insights, actions,
    })
  }
  const details = shares || hasAny(text, ["trois", "3", "principaux", "principales", "grosses", "gros", "detail", "ventilation"])
  if (details) {
    const three = rows.slice(0, 3)
    const parts = language => three.map(row =>
      getAssistantCategoryLabel(row.category, language) + " : " + formatMontant(row.amount) +
      (row.share === null || row.share === undefined ? "" : " (" + Math.round(row.share) + " %)")
    ).join(" ; ")
    return response({
      fr: "Les " + three.length + " principaux postes de dépenses variables enregistrées " + periodPhrase(context) + " : " + parts("fr") + ". Ces parts ne comprennent pas les charges fixes suivies séparément.",
      kr: "Bann " + three.length + " pli gro postes dépans variables anrezistré " + periodPhrase(context) + " : " + parts("kr") + ". Bann sarz fixes suivies séparément lé pa ajouté.",
      intent: ASSISTANT_INTENTS.BUDGET_CATEGORY, insights, actions,
    })
  }
  const share = top.share === null ? "" : ", soit " + Math.round(top.share) + " % de tes dépenses variables enregistrées"
  const shareKr = top.share === null ? "" : ", soit " + Math.round(top.share) + " % out dépans variables anrezistré"
  return response({
    fr: "Le poste le plus élevé est " + getAssistantCategoryLabel(top.category, "fr") + " avec " + formatMontant(top.amount) + " " + periodPhrase(context) + share + ".",
    kr: "Poste le plus haut lé " + getAssistantCategoryLabel(top.category, "kr") + " avèk " + formatMontant(top.amount) + " " + periodPhrase(context) + shareKr + ".",
    intent: ASSISTANT_INTENTS.BUDGET_CATEGORY, insights, actions,
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

  if (
    asksWhyRemainingIsLow(question) &&
    context.currentAvailableMargin !== null &&
    context.currentAvailableMargin !== undefined &&
    Number(context.currentAvailableMargin) >= 0
  ) {
    return response({
      fr: `D'après les dépenses enregistrées dans BudgetKazPéi, je ne peux pas confirmer qu'il te reste peu ce mois-ci. Après tes charges fixes, il restait ${formatMontant(context.remainingAfterFixedExpenses)}. Tes dépenses variables enregistrées atteignent ${formatMontant(context.expenses?.variable || 0)}, ce qui laisse une marge estimée à ${formatMontant(context.currentAvailableMargin)}. Les données montrent ces montants, mais ne suffisent pas à attribuer une cause. Si ton solde réel est plus bas, compare les opérations enregistrées avec tes relevés avant de conclure.`,
      kr: `Dapré bann dépans anrezistré dann BudgetKazPéi, mi pé pa confirme ke i reste aou peu sa mwa-la. Apré out sarz fix, té reste ${formatMontant(context.remainingAfterFixedExpenses)}. Out dépans variables anrezistré i monte ${formatMontant(context.expenses?.variable || 0)}, sak i laisse in marge estimé ${formatMontant(context.currentAvailableMargin)}. Bann donné i montre montants-la, mé sa suffit pa pou trouve in cause. Si out solde réel lé pli bas, compare bann opérations anrezistré avèk out relevés avan tire in conclusion.`,
      intent: ASSISTANT_INTENTS.BUDGET_REMAINING,
      insights,
      actions: [action("depenses", "Voir mes dépenses", "War mon bann dépans")],
      confidence: 0.99,
    })
  }

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
      actions: [action("savings", "Voir mes économies", "War mon bann lékonomi")],
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
    actions: [action("savings", "Voir mes économies", "War mon bann lékonomi")],
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
  if (Number(grocery.missingPriceCount || 0) > 0) {
    return response({fr: `Les produits chiffrés de ta liste représentent environ ${formatMontant(grocery.optimizedBasketEstimate)}, mais ${grocery.missingPriceCount} produit(s) n’ont pas de prix. Je ne peux donc pas confirmer que le panier complet rentre dans ta marge théorique.`, kr: `Bann produits avèk pri su out liste i fé environ ${formatMontant(grocery.optimizedBasketEstimate)}, mé ${grocery.missingPriceCount} produit(s) nana poin pri. Mi pé pa confirme panier entier i rentre dann out marge théorique.`, intent: ASSISTANT_INTENTS.BUDGET_SHOPPING_AFFORDABILITY, insights, actions: [action("shoppingList", "Voir ma liste de courses", "War ma liste courses")]})
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

// An advice request needs an ordered decision, not a ranking of expenses.
// Use observed amounts only; the trial percentage is explicitly hypothetical.
function buildBudgetPriorityAnswer(insights) {
  const c=contextOf(insights)
  const valid=n=>typeof n==="number"&&Number.isFinite(n)
  const rows=(c.spendingByCategory||[]).filter(r=>valid(r.amount)&&r.amount>0)
  const charges=(c.recurringCharges||[]).filter(r=>valid(r.amount)&&r.amount>0)
  const period=c.period?.label||"la période enregistrée"
  const optional=rows.find(r=>r.category==="loisirs")
  const food=rows.find(r=>r.category==="alimentaire")
  const essential=charges.find(r=>r.category==="logement"||/\b(?:loyer|credit immobilier|loye)\b/.test(normalizeForAssistantMatch(r.label)))
  const optionalCharge=charges.find(r=>["loisirs","telecom"].includes(r.category)&&!/\b(?:loyer|assurance|sante|mutuelle|credit|energie|eau)\b/.test(normalizeForAssistantMatch(r.label)))
  if(!rows.length||(!charges.length&&!valid(c.currentAvailableMargin)))return null
  const fr=["À ta place, je commencerais par les dépenses que tu peux ajuster, pas par celles dont tu as besoin."],kr=["A out place, mi commenceré par bann dépans ou pé ajusté, pa bann dépans indispensables."]
  const actions=[]
  if(essential){
    fr.push("**Je protégerais le logement.** "+essential.label+" : "+formatMontant(essential.amount)+" par mois"+(["monthly","mensuel",undefined].includes(essential.frequency)?".":" (montant enregistré à vérifier).")+" Je ne compterais pas sur une baisse de cette charge pour équilibrer le budget.")
    kr.push("**Mi garderé lo logement en priorité.** "+essential.label+" : "+formatMontant(essential.amount)+". Mi compteré pa su in baisse de sa sarz-la pou équilibre out bidzé.")
  }
  if(optional){
    const trial=Math.round(optional.amount*5)/100
    fr.push("**Je regarderais les loisirs en premier.** "+formatMontant(optional.amount)+" enregistrés ("+period+"). Un objectif d'essai de 5 % sur un montant comparable représenterait "+formatMontant(trial)+", si tu trouves des achats que tu souhaites vraiment espacer.")
    kr.push("**Mi regarderé bann loizir en premier.** "+formatMontant(optional.amount)+" anrezistré ("+period+"). In essai de 5 % su minm montant i fé "+formatMontant(trial)+", si ou trouve bann achats ou vé espacé.")
    actions.push(action("depenses","Revoir mes dépenses","Revoir mon bann dépans"))
  }else if(food){
    const trial=Math.round(food.amount*5)/100
    const h=c.shoppingHabits
    const examples=(h?.available&&!h?.truncated?(h.products||[]):[]).filter(p=>p.purchaseDays>=2&&p.label).slice(0,2).map(p=>String(p.label).slice(0,80)).join(" et ")
    fr.push("**Je commencerais par les courses, sans réduire les repas.** Tu as enregistré "+formatMontant(food.amount)+" ("+period+"). "+(examples?"Compare d'abord les prix unitaires de "+examples+", à format comparable. ":"Compare d'abord les prix unitaires des produits que tu achètes souvent. ")+"À titre de repère, 5 % de ce montant représente "+formatMontant(trial)+". C'est un objectif d'essai, pas une économie constatée.")
    kr.push("**Mi commenceré par bann courses, san diminié bann repas.** Ou la anrezistré "+formatMontant(food.amount)+" ("+period+"). "+(examples?"Compare dabor pri "+examples+", minm format. ":"Compare dabor pri à l'unité bann produits ou aste souvan. ")+"Pou in essai, 5 % de sa montant-la i fé "+formatMontant(trial)+". Sa lé pa in lékonomi garanti.")
    actions.push(action("shoppingSavingsOnly","Comparer mes achats","Compare mon bann achats"))
  }else if(optionalCharge){
    fr.push("**Je vérifierais les contrats ajustables.** "+optionalCharge.label+" représente "+formatMontant(optionalCharge.amount)+" sur le relevé des charges. Compare les offres et les services réellement utilisés, sans résilier avant de vérifier les conditions.")
    kr.push("**Mi vérifieré bann kontra ou pé ajusté.** "+optionalCharge.label+" i représente "+formatMontant(optionalCharge.amount)+" dann bann sarz. Compare bann offres ek services ou i utilise avan résilié.")
    actions.push(action("abonnements","Revoir mes charges fixes","Revoir mon bann sarz fixes"))
  }else{
    fr.push("**Je vérifierais les achats reportables.** Je ne vois pas de poste clairement facultatif à réduire dans ces relevés. Je ne te proposerais donc pas une baisse chiffrée au hasard.")
    kr.push("**Mi vérifieré bann achats ou pé reporte.** Mi trouve poin poste clairement facultatif dann relevés-la. Mi préfère pa invente in montant lékonomi.")
  }
  if(valid(c.currentAvailableMargin)){
    if(c.currentAvailableMargin>0){
      fr.push("**Je garderais une réserve.** La marge estimée est de "+formatMontant(c.currentAvailableMargin)+". Avant de mettre de côté, déduis les paiements qui restent à venir : ce n'est pas ton solde bancaire.")
      kr.push("**Mi garderé in réserve.** Out marge estimé lé "+formatMontant(c.currentAvailableMargin)+". Avan mèt de koté, enlève sak reste pou payé : sa lé pa out solde bancaire.")
    }else{
      fr.push("**Je sécuriserais les prochaines dépenses.** La marge estimée "+(c.currentAvailableMargin<0?"est négative de "+formatMontant(-c.currentAvailableMargin):"est nulle")+". Vérifie les revenus et paiements attendus avant d'engager d'autres achats.")
      kr.push("**Mi sécuriseré bann prochaines dépans.** Out marge estimé "+(c.currentAvailableMargin<0?"lé négative de "+formatMontant(-c.currentAvailableMargin):"lé à zéro")+". Vérifie sak i doi rentré ek sak reste pou payé.")
    }
  }else{
    fr.push("Avant de fixer un objectif d'épargne, je vérifierais le montant qu'il te reste réellement après les dépenses prévues.")
    kr.push("Avan fixe in objectif d'épargne, mi vérifieré kombyin i reste aou vraiment apré bann dépans prévues.")
  }
  if(!actions.length)actions.push(action("depenses","Voir mes dépenses","War mon bann dépans"))
  // Preserve paragraphs for this structured conversational answer.
  return {...response({fr:fr.join(" "),kr:kr.join(" "),intent:ASSISTANT_INTENTS.BUDGET_GENERAL,insights,actions}),fr:fr.join("\n\n"),kr:kr.join("\n\n")}
}

function buildGeneralBudgetAnswer(insights) {
  const prioritized=buildBudgetPriorityAnswer(insights)
  if(prioritized)return prioritized
  const context = contextOf(insights)
  const topCategory = context.spendingByCategory?.[0]
  const topCharge = context.recurringCharges?.[0]
  if (!topCategory && !topCharge) return missingResponse(ASSISTANT_INTENTS.BUDGET_GENERAL, insights, "transactions")

  const categoryFr = topCategory
    ? `Le poste de dépenses classées le plus élevé ${periodPhrase(context)} est ${getAssistantCategoryLabel(topCategory.category, "fr")} (${formatMontant(topCategory.amount)}).`
    : "Je n'ai pas encore assez de dépenses classées pour établir un classement fiable."
  const categoryKr = topCategory
    ? `Poste dépans classé le pli haut ${periodPhrase(context)} lé ${getAssistantCategoryLabel(topCategory.category, "kr")} (${formatMontant(topCategory.amount)}).`
    : "Mi nana pa ankor assez dépans classées pou fé in classement fiable."

  const chargeFr = topCharge
    ? ` Ta charge récurrente la plus élevée enregistrée est « ${topCharge.label} » (${formatMontant(topCharge.amount)}). Vérifie si elle est toujours adaptée, sans supposer qu'elle peut être supprimée.`
    : ""
  const chargeKr = topCharge
    ? ` Out sarz récurrente le pli haut anrezistrée lé « ${topCharge.label} » (${formatMontant(topCharge.amount)}). Vérifie si li lé ankor adapté, sans imagine ou pé supprim ali.`
    : ""

  const practicalFr = topCategory?.category === "alimentaire"
    ? " Pour commencer à économiser, compare les prix unitaires de tes produits achetés régulièrement dans Mes économies. Les prix historiques peuvent avoir changé."
    : topCategory?.category === "transport"
      ? " Pour avancer, regarde d'abord quelles dépenses de transport sont répétées et lesquelles peuvent éventuellement être regroupées."
      : topCategory
        ? " Pour avancer, examine les achats répétitifs de ce poste avant de chercher des économies."
        : ""
  const practicalKr = topCategory?.category === "alimentaire"
    ? " Pou économiz, compare bann pri à l'unité out produits réguliers dann Mes économies. Bann anciens pri i pé avoir changé."
    : topCategory?.category === "transport"
      ? " Pou avancé, regarde bann dépans transport ki revient souvent ek sak ou pé regroupe."
      : topCategory
        ? " Pou avancé, regarde bann achats réguliers dann sa poste-la avan cherche bann lékonomi."
        : ""

  return response({
    fr: `${categoryFr}${chargeFr}${practicalFr}`,
    kr: `${categoryKr}${chargeKr}${practicalKr}`,
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
  if (intent === ASSISTANT_INTENTS.BUDGET_CATEGORY) return buildCategoryAnswer(question, insights)
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
