import assert from "node:assert/strict"

import { normalizeAssistantLanguage } from "../src/services/ai/assistantLanguage.js"
import { resolveBudgetPeriod } from "../src/services/ai/budgetPeriodResolver.js"
import { buildAssistantAiSummary, buildAssistantInsights } from "../src/services/ai/assistantInsightsService.js"
import { buildShoppingAdvisorContext } from "../src/services/ai/shoppingAdvisorContext.js"
import {
  ASSISTANT_INTENTS,
  answerAssistantQuestion,
  detectAssistantIntent,
  isBudgetAssistantIntent,
  selectAssistantAnswerText,
} from "../src/services/ai/assistantIntentEngine.js"
import { reviewAssistantAnswer } from "../supabase/functions/assistant-aisupabase/engine/review/reviewerEngine.ts"

const now = new Date("2026-09-05T12:00:00+04:00")

const historyTransactions = [
  { id: "income-current", date: "2026-09-01", amount: 2000, category: "revenus", label: "Revenus du foyer" },
  { id: "food-current", date: "2026-09-03", amount: -286.4, category: "alimentaire", label: "Courses" },
  { id: "transport-current", date: "2026-09-04", amount: -132, category: "transport", label: "Transport" },
  { id: "leisure-current", date: "2026-09-05", amount: -58, category: "loisirs", label: "Loisirs" },
  { id: "income-previous", date: "2026-08-01", amount: 1900, category: "revenus", label: "Revenus du foyer" },
  { id: "food-previous", date: "2026-08-03", amount: -255.2, category: "alimentaire", label: "Courses" },
  { id: "transport-previous", date: "2026-08-04", amount: -94, category: "transport", label: "Transport" },
  { id: "leisure-previous", date: "2026-08-05", amount: -60, category: "loisirs", label: "Loisirs" },
]

const recurringCharges = [
  { id: "rent", nom: "Loyer", montant: 500, categorie: "logement" },
  { id: "insurance", nom: "Assurance", montant: 50, categorie: "assurances" },
  { id: "netflix", nom: "Netflix", montant: 15, categorie: "loisirs" },
]

const shoppingBasket = {
  source: "current_draft",
  itemsCount: 4,
  historicalBasketEstimate: 76.3,
  reliableSavingsTotal: 6.85,
  optimizedBasketEstimate: 69.45,
  missingPriceCount: 0,
  reliablePromotionCount: 2,
  promotionWithoutHistoricalPriceCount: 0,
}

function baseInsights(overrides = {}) {
  return buildAssistantInsights({
    now,
    historyTransactions,
    recurringCharges,
    profile: {
      revenus_foyer: 2000,
      revenus_details: { salaire_parent_1: 1600, aides: [{ label: "CAF", amount: 400 }] },
    },
    receipts: [
      { id: "r1", purchase_date: "2026-09-03", store_name: "Carrefour", total_amount: 120 },
      { id: "r2", purchase_date: "2026-09-04", store_name: "Leader Price", total_amount: 80 },
      { id: "r3", purchase_date: "2026-08-03", store_name: "Carrefour", total_amount: 90 },
    ],
    shoppingItems: [],
    shoppingBasket,
    budgetTargets: [{ category: "alimentaire", amount: 600 }],
    dataAvailability: { transactions: true, recurringCharges: true, receipts: true, shoppingItems: true },
    ...overrides,
  })
}

function assertClean(answer) {
  const text = `${answer.fr} ${answer.kr}`
  assert.equal(/NaN|undefined|Infinity/.test(text), false)
  assert.equal(/-0(?:[,.]00)?\s*€/.test(text), false)
}

// Résolution des périodes : mois civil et fenêtre glissante restent distincts.
const currentMonth = resolveBudgetPeriod("ce mois-ci", now)
assert.equal(currentMonth.current.type, "current_month_to_date")
assert.equal(currentMonth.current.startDate, "2026-09-01")
assert.equal(currentMonth.current.endDate, "2026-09-06")
assert.equal(currentMonth.current.label, "1er septembre → 5 septembre")
assert.equal(currentMonth.previous.startDate, "2026-08-01")
assert.equal(currentMonth.previous.endDate, "2026-08-06")
assert.equal(resolveBudgetPeriod("mois dernier", now).current.type, "previous_month")
assert.equal(resolveBudgetPeriod("aujourd'hui", now).current.type, "today")
assert.equal(resolveBudgetPeriod("cette semaine", now).current.type, "current_week_to_date")
assert.equal(resolveBudgetPeriod("semaine dernière", now).current.type, "previous_week")
assert.equal(resolveBudgetPeriod("derniers 30 jours", now).current.type, "rolling_30_days")

assert.equal(normalizeAssistantLanguage("fr"), "fr")
assert.equal(normalizeAssistantLanguage("cr"), "kr")
assert.equal(normalizeAssistantLanguage("kreol"), "kr")

// Intents budget FR / kréol.
const intentCases = [
  ["Combien me reste-t-il après mes charges fixes ?", ASSISTANT_INTENTS.BUDGET_REMAINING],
  ["Où est-ce que je dépense le plus ?", ASSISTANT_INTENTS.BUDGET_CATEGORY],
  ["Combien j'ai dépensé en courses ?", ASSISTANT_INTENTS.BUDGET_GROCERY],
  ["Mes dépenses ont-elles augmenté ?", ASSISTANT_INTENTS.BUDGET_PERIOD_COMPARE],
  ["Quel abonnement me coûte le plus ?", ASSISTANT_INTENTS.BUDGET_SUBSCRIPTIONS],
  ["Est-ce que j'ai eu une dépense inhabituelle ?", ASSISTANT_INTENTS.BUDGET_UNUSUAL_EXPENSE],
  ["Combien pourrais-je économiser avec les promos actuelles ?", ASSISTANT_INTENTS.BUDGET_SAVINGS],
  ["Ma liste de courses rentre-t-elle dans mon budget ?", ASSISTANT_INTENTS.BUDGET_SHOPPING_AFFORDABILITY],
  ["Kombien i reste apré mon sarz fix ?", ASSISTANT_INTENTS.BUDGET_REMAINING],
  ["Kot mi dépans le plis ?", ASSISTANT_INTENTS.BUDGET_CATEGORY],
  ["Mon bidzé manzé i ogmant ?", ASSISTANT_INTENTS.BUDGET_GROCERY],
  ["Mon bann dépans la ogmanté ?", ASSISTANT_INTENTS.BUDGET_PERIOD_COMPARE],
]
intentCases.forEach(([question, expected]) => {
  const detected = detectAssistantIntent(question)
  assert.equal(detected, expected, question)
  assert.equal(isBudgetAssistantIntent(detected), true)
})

const insights = baseInsights()
const context = insights.budgetAdvisorContext
assert.equal(context.income.total, 2000)
assert.equal(context.period.end, "2026-09-05")
assert.equal(context.periodComparison.previousPeriod.end, "2026-08-05")
assert.equal(context.expenses.fixed, 565)
assert.equal(context.expenses.variable, 476.4)
assert.equal(context.expenses.total, 1041.4)
assert.equal(context.remainingAfterFixedExpenses, 1435)
assert.equal(context.currentAvailableMargin, 958.6)
assert.equal(context.grocery.currentSpend, 286.4)
assert.equal(context.grocery.previousSpend, 255.2)
assert.equal(context.grocery.changeAmount, 31.2)
assert.equal(context.periodComparison.previousExpenses, 409.2)
assert.equal(context.periodComparison.expenseChange, 67.2)
assert.equal(context.spendingByCategory[0].category, "alimentaire")
assert.equal(context.recurringCharges[0].label, "Loyer")

// Questions simples : réponses directes, chiffrées, identiques en FR/kréol.
const groceryAnswer = answerAssistantQuestion({ question: "Combien j'ai dépensé en courses ce mois-ci ?", insights })
assert.match(groceryAnswer.fr, /286,40\s*€/)
assert.match(groceryAnswer.fr, /31,20\s*€ de plus/)
assert.match(groceryAnswer.kr, /286,40\s*€/)
assertClean(groceryAnswer)

const categoryAnswer = answerAssistantQuestion({ question: "Où est-ce que je dépense le plus ?", insights })
assert.match(categoryAnswer.fr, /alimentation.*286,40\s*€/i)
assertClean(categoryAnswer)

const fixedAnswer = answerAssistantQuestion({ question: "Combien représentent mes charges fixes ?", insights })
assert.match(fixedAnswer.fr, /565,00\s*€/)
assert.match(fixedAnswer.fr, /Loyer.*500,00\s*€/)
assertClean(fixedAnswer)

const remainingAnswer = answerAssistantQuestion({ question: "Combien me reste après mes charges fixes ?", insights })
assert.match(remainingAnswer.fr, /1\s?435,00\s*€/)
assert.match(remainingAnswer.fr, /958,60\s*€/)
assertClean(remainingAnswer)

const subscriptionAnswer = answerAssistantQuestion({ question: "Quel abonnement me coûte le plus ?", insights })
assert.match(subscriptionAnswer.fr, /charge la plus élevée.*Loyer.*500,00\s*€/i)
assertClean(subscriptionAnswer)

// Analyse complexe sans causalité inventée.
const lowMarginAnswer = answerAssistantQuestion({ question: "Pourquoi il me reste si peu ce mois-ci ?", insights })
assert.match(lowMarginAnswer.fr, /données montrent ces montants, mais ne suffisent pas à attribuer une cause/i)
assert.match(lowMarginAnswer.fr, /958,60\s*€/)
assertClean(lowMarginAnswer)

// Comparaison même durée : hausse et baisse.
const increaseAnswer = answerAssistantQuestion({ question: "Est-ce que je dépense plus ce mois-ci ?", insights })
assert.match(increaseAnswer.fr, /hausse.*67,20\s*€/i)
assert.match(increaseAnswer.fr, /période précédente de même durée/i)
assertClean(increaseAnswer)

const lowerInsights = baseInsights({
  historyTransactions: historyTransactions.map(row => row.id === "food-current" ? { ...row, amount: -100 } : row),
})
const decreaseAnswer = answerAssistantQuestion({ question: "Mes dépenses ont-elles augmenté ?", insights: lowerInsights })
assert.match(decreaseAnswer.fr, /baisse/i)
assertClean(decreaseAnswer)

const noPreviousInsights = baseInsights({ historyTransactions: historyTransactions.filter(row => !row.date.startsWith("2026-08")) })
const noPreviousAnswer = answerAssistantQuestion({ question: "Mes dépenses ont-elles augmenté ?", insights: noPreviousInsights })
assert.match(noPreviousAnswer.fr, /pas de période précédente comparable/i)
assertClean(noPreviousAnswer)

// Courses intelligentes : les économies suggérées et les prix barrés ne deviennent jamais des économies utilisateur.
const promotion = {
  id: "promo-noodles",
  productId: "shopping-noodles",
  marketProductId: "market-noodles",
  productName: "Nouilles instantanées saveur légumes",
  normalizedProductName: "nouilles instantanees saveur legumes",
  controlledNormalization: true,
  brand: "KEE ZEN",
  packageFormat: "70 g",
  quantityValue: 70,
  quantityUnit: "g",
  retailerName: "Leader Price Réunion",
  promoPrice: 0.49,
  originalPrice: 0.74,
  promotionProven: true,
  isActive: true,
}
const draftItem = {
  id: "noodles",
  name: "Nouilles instantanées saveur légumes",
  shopping_product_id: "shopping-noodles",
  market_product_id: "market-noodles",
  brand: "KEE ZEN",
  package_format: "70 g",
}
const noodleHistory = [{
  product_name: "Nouilles instantanées saveur légumes",
  normalized_name: "nouilles instantanees saveur legumes",
  price: 0.74,
  market_product_id: "market-noodles",
  market_package_format: "70 g",
  created_at: "2026-09-01T12:00:00.000Z",
}]
const reliableBasket = buildShoppingAdvisorContext({ draftItems: [draftItem], shoppingItems: noodleHistory, promotions: [promotion] })
assert.equal(reliableBasket.historicalBasketEstimate, 0.74)
assert.equal(reliableBasket.reliableSavingsTotal, 0.25)
assert.equal(reliableBasket.optimizedBasketEstimate, 0.49)

const suggestedBasket = buildShoppingAdvisorContext({
  snapshot: {
    totalEstimated: 1,
    missingPriceCount: 0,
    items: [{ name: "Produit proche", historicalPrice: 1, estimatedPrice: 1, promotionMatchStatus: "suggested", reliableSaving: 0.5 }],
  },
})
assert.equal(suggestedBasket.reliableSavingsTotal, 0)

const promotionOnlyBasket = buildShoppingAdvisorContext({ draftItems: [draftItem], shoppingItems: [], promotions: [promotion] })
assert.equal(promotionOnlyBasket.historicalBasketEstimate, null)
assert.equal(promotionOnlyBasket.reliableSavingsTotal, 0)
assert.equal(promotionOnlyBasket.optimizedBasketEstimate, 0.49)
assert.equal(promotionOnlyBasket.promotionWithoutHistoricalPriceCount, 1)
const promotionOnlyInsights = baseInsights({ shoppingBasket: promotionOnlyBasket })
const promotionOnlyAnswer = answerAssistantQuestion({ question: "Combien puis-je économiser avec les promos ?", insights: promotionOnlyInsights })
assert.match(promotionOnlyAnswer.fr, /sans prix historique personnel comparable/i)
assert.doesNotMatch(promotionOnlyAnswer.fr, /0,25\s*€/)

const savingsAnswer = answerAssistantQuestion({ question: "Combien pourrais-je économiser avec les promos actuelles ?", insights })
assert.match(savingsAnswer.fr, /6,85\s*€/)
assert.match(savingsAnswer.fr, /76,30\s*€.*69,45\s*€/)
assertClean(savingsAnswer)

const affordabilityAnswer = answerAssistantQuestion({ question: "Ma liste de courses rentre-t-elle dans mon budget ?", insights })
assert.match(affordabilityAnswer.fr, /69,45\s*€.*958,60\s*€/)
assert.match(affordabilityAnswer.fr, /autres dépenses prévues/i)
assertClean(affordabilityAnswer)

const weeklyGroceryAnswer = answerAssistantQuestion({ question: "Combien je peux encore mettre dans mes courses cette semaine ?", insights })
assert.match(weeklyGroceryAnswer.fr, /958,60\s*€.*313,60\s*€/)
assert.match(weeklyGroceryAnswer.fr, /ne peux donc pas fixer un montant hebdomadaire fiable sans l'inventer/i)
assertClean(weeklyGroceryAnswer)

// Données manquantes : aucune absence n'est maquillée en zéro.
const missingIncome = buildAssistantInsights({
  now,
  historyTransactions: [{ id: "expense", date: "2026-09-03", amount: -50, category: "alimentaire" }],
  recurringCharges,
})
assert.equal(missingIncome.budgetAdvisorContext.income.total, null)
assert.equal(missingIncome.budgetAdvisorContext.currentAvailableMargin, null)
assert.ok(missingIncome.budgetAdvisorContext.dataCompleteness.missingFields.includes("income"))
assert.match(answerAssistantQuestion({ question: "Combien me reste-t-il ?", insights: missingIncome }).fr, /revenus ne sont pas renseignés/i)

const missingCharges = buildAssistantInsights({ now, historyTransactions, recurringCharges: [] })
assert.equal(missingCharges.budgetAdvisorContext.expenses.fixed, null)
assert.ok(missingCharges.budgetAdvisorContext.dataCompleteness.missingFields.includes("fixedExpenses"))
assert.match(answerAssistantQuestion({ question: "Combien représentent mes charges fixes ?", insights: missingCharges }).fr, /Aucune charge fixe n'est enregistrée/i)

const insufficientGroceryHistory = baseInsights({ receipts: [
  { id: "r1", purchase_date: "2026-09-03", total_amount: 30 },
  { id: "r2", purchase_date: "2026-09-04", total_amount: 40 },
] })
assert.ok(insufficientGroceryHistory.budgetAdvisorContext.dataCompleteness.missingFields.includes("groceryHistory"))

const noTransactions = buildAssistantInsights({ now, historyTransactions: [], profile: { revenus_foyer: 2000 }, recurringCharges })
assert.equal(noTransactions.budgetAdvisorContext.expenses.variable, null)
assert.equal(noTransactions.budgetAdvisorContext.currentAvailableMargin, null)

// Anomalies prudentes : transaction élevée, aucune anomalie et forte hausse de catégorie.
const unusualInsights = baseInsights({ historyTransactions: [
  ...historyTransactions,
  { id: "large", date: "2026-09-05", amount: -150, category: "sante", label: "Pharmacie" },
  { id: "h1", date: "2026-07-01", amount: -18, category: "sante" },
  { id: "h2", date: "2026-07-08", amount: -20, category: "sante" },
  { id: "h3", date: "2026-07-15", amount: -22, category: "sante" },
] })
assert.equal(unusualInsights.budgetAdvisorContext.unusualExpenses[0].type, "large_transaction")
assert.match(answerAssistantQuestion({ question: "Ai-je une dépense inhabituelle ?", insights: unusualInsights }).fr, /Pharmacie.*150,00\s*€/i)
assert.equal(insights.budgetAdvisorContext.unusualExpenses.length, 0)

const categorySpike = buildAssistantInsights({ now, historyTransactions: [
  { id: "c1", date: "2026-09-03", amount: -100, category: "transport" },
  { id: "p1", date: "2026-08-03", amount: -20, category: "transport" },
] })
assert.equal(categorySpike.budgetAdvisorContext.unusualExpenses[0].type, "category_increase")

// Le contexte IA est compact et ciblé par intent.
const grocerySummary = buildAssistantAiSummary(insights, ASSISTANT_INTENTS.BUDGET_GROCERY)
assert.ok(grocerySummary.budgetAdvisorContext.grocery)
assert.equal("recurringCharges" in grocerySummary.budgetAdvisorContext, false)

const trustedBudgetReview = reviewAssistantAnswer("Tes courses atteignent 286,40 €.", "fr", [], [286.4])
assert.equal(trustedBudgetReview.revisedAnswer, "Tes courses atteignent 286,40 €.")
const inventedBudgetReview = reviewAssistantAnswer("Tu peux dépenser 999 €.", "fr", [], [286.4])
assert.doesNotMatch(inventedBudgetReview.revisedAnswer, /999/)
const negativeMarginReview = reviewAssistantAnswer("Ta marge est de -50 €.", "fr", [], [50])
assert.equal(negativeMarginReview.revisedAnswer, "Ta marge est de -50 €.")

// Parité des montants FR / kréol et garde-fous de sortie.
assert.notEqual(selectAssistantAnswerText(groceryAnswer, "fr"), selectAssistantAnswerText(groceryAnswer, "cr"))
assert.match(selectAssistantAnswerText(groceryAnswer, "cr"), /286,40\s*€/)
;[
  groceryAnswer,
  categoryAnswer,
  fixedAnswer,
  remainingAnswer,
  subscriptionAnswer,
  lowMarginAnswer,
  increaseAnswer,
  decreaseAnswer,
  savingsAnswer,
  affordabilityAnswer,
].forEach(assertClean)

if (process.argv.includes("--show-examples")) {
  const questions = [
    "Combien j'ai dépensé en courses ce mois-ci ?",
    "Où est-ce que je dépense le plus ?",
    "Pourquoi il me reste si peu ce mois-ci ?",
    "Combien me reste après mes charges fixes ?",
    "Mon budget courses augmente-t-il ?",
    "Combien pourrais-je économiser avec les promos actuelles ?",
    "Ma liste de courses rentre-t-elle dans mon budget ?",
  ]
  questions.forEach(question => {
    const answer = answerAssistantQuestion({ question, insights: baseInsights({ question }) })
    console.log(`\nQ: ${question}\nR: ${answer.fr}`)
  })
}

console.log("Conseiller Budget V2 tests passed")
