import assert from "node:assert/strict"
import { normalizeAssistantLanguage } from "../src/services/ai/assistantLanguage.js"
import { buildAssistantInsights } from "../src/services/ai/assistantInsightsService.js"
import {
  ASSISTANT_INTENTS,
  answerAssistantQuestion,
  detectAssistantIntent,
  selectAssistantAnswerText,
} from "../src/services/ai/assistantIntentEngine.js"

const now = new Date("2026-07-11T12:00:00+04:00")

function baseInsights(overrides = {}) {
  return buildAssistantInsights({
    now,
    historyTransactions: [
      { id: "t1", date: "2026-07-05", amount: -120, category: "alimentaire" },
      { id: "t2", date: "2026-07-06", amount: -80, category: "transport" },
      { id: "t3", date: "2026-06-05", amount: -80, category: "alimentaire" },
      { id: "t4", date: "2026-06-06", amount: -60, category: "transport" },
    ],
    receipts: [
      { id: "r1", purchase_date: "2026-07-05", store_name: "E.Leclerc", total_amount: 48 },
      { id: "r2", purchase_date: "2026-07-07", store_name: "Leader Price", total_amount: 42 },
      { id: "r3", purchase_date: "2026-06-07", store_name: "E.Leclerc", total_amount: 35 },
    ],
    shoppingItems: [
      { id: "i1", created_at: "2026-07-05", store: "E.Leclerc", product_name: "Riz", normalized_name: "riz", category: "alimentaire", price: 3.2 },
      { id: "i2", created_at: "2026-07-07", store: "Leader Price", product_name: "Riz", normalized_name: "riz", category: "alimentaire", price: 2.8 },
      { id: "i3", created_at: "2026-07-05", store: "E.Leclerc", product_name: "Lait", normalized_name: "lait", category: "alimentaire", price: 1.7 },
      { id: "i4", created_at: "2026-07-07", store: "Leader Price", product_name: "Lait", normalized_name: "lait", category: "alimentaire", price: 1.5 },
      { id: "i5", created_at: "2026-06-07", store: "E.Leclerc", product_name: "Riz", normalized_name: "riz", category: "alimentaire", price: 2.6 },
    ],
    stats: { revenus: 1600, depenses: 200, resteAVivre: 1400 },
    ...overrides,
  })
}

function assertClean(answer) {
  const text = `${answer.fr} ${answer.kr}`
  assert.equal(/NaN|undefined|null|Infinity/.test(text), false)
}

assert.equal(normalizeAssistantLanguage("fr"), "fr")
assert.equal(normalizeAssistantLanguage("cr"), "kr")
assert.equal(normalizeAssistantLanguage("kreol"), "kr")

assert.equal(detectAssistantIntent("Pourquoi ai-je dépensé plus ce mois-ci ?"), ASSISTANT_INTENTS.SPENDING_INCREASE)
assert.equal(detectAssistantIntent("Quels magasins me coûtent le moins cher ?"), ASSISTANT_INTENTS.CHEAPEST_STORES)
assert.equal(detectAssistantIntent("Comment économiser 100 € ?"), ASSISTANT_INTENTS.SAVE_TARGET)
assert.equal(detectAssistantIntent("Pourquoi mon budget alimentation augmente-t-il ?"), ASSISTANT_INTENTS.FOOD_BUDGET_INCREASE)

assert.equal(detectAssistantIntent("Pou kosa mi dépans plis sa mwa-la ?"), ASSISTANT_INTENTS.SPENDING_INCREASE)
assert.equal(detectAssistantIntent("Ki magazin i kout moins cher pou mwin ?"), ASSISTANT_INTENTS.CHEAPEST_STORES)
assert.equal(detectAssistantIntent("Koman économiz 100 € ?"), ASSISTANT_INTENTS.SAVE_TARGET)
assert.equal(detectAssistantIntent("Pou kosa mon bidzé manzé i ogmant ?"), ASSISTANT_INTENTS.FOOD_BUDGET_INCREASE)

const noPrevious = answerAssistantQuestion({
  question: "Pourquoi ai-je dépensé plus ce mois-ci ?",
  insights: buildAssistantInsights({
    now,
    historyTransactions: [{ id: "t1", date: "2026-07-05", amount: -120, category: "alimentaire" }],
  }),
})
assert.equal(noPrevious.intent, ASSISTANT_INTENTS.SPENDING_INCREASE)
assert.match(noPrevious.fr, /mois précédent comparable/)
assertClean(noPrevious)

const noComparableStores = answerAssistantQuestion({
  question: "Quels magasins me coûtent le moins cher ?",
  insights: buildAssistantInsights({
    now,
    receipts: [
      { id: "r1", purchase_date: "2026-07-05", store_name: "E.Leclerc", total_amount: 48 },
      { id: "r2", purchase_date: "2026-07-07", store_name: "Leader Price", total_amount: 42 },
    ],
    shoppingItems: [
      { id: "i1", created_at: "2026-07-05", store: "E.Leclerc", product_name: "Riz", normalized_name: "riz", price: 3.2 },
      { id: "i2", created_at: "2026-07-07", store: "Leader Price", product_name: "Lait", normalized_name: "lait", price: 1.5 },
    ],
  }),
})
assert.match(noComparableStores.fr, /produits comparables/)
assertClean(noComparableStores)

const saveTooHigh = answerAssistantQuestion({
  question: "Comment économiser 100 € ?",
  insights: buildAssistantInsights({
    now,
    historyTransactions: [{ id: "t1", date: "2026-07-05", amount: -60, category: "alimentaire" }],
  }),
})
assert.match(saveTooHigh.fr, /trop ambitieux/)
assertClean(saveTooHigh)

const foodWithoutTickets = answerAssistantQuestion({
  question: "Pourquoi mon budget alimentation augmente-t-il ?",
  insights: buildAssistantInsights({ now }),
})
assert.match(foodWithoutTickets.fr, /tickets alimentaires/)
assertClean(foodWithoutTickets)

const bilingual = answerAssistantQuestion({
  question: "Pourquoi ai-je dépensé plus ce mois-ci ?",
  insights: baseInsights(),
})
assert.notEqual(selectAssistantAnswerText(bilingual, "fr"), selectAssistantAnswerText(bilingual, "cr"))
assert.match(selectAssistantAnswerText(bilingual, "cr"), /Sa mwa-la|Out|Mi/)
assertClean(bilingual)

const nullValues = answerAssistantQuestion({
  question: "Pourquoi ai-je dépensé plus ce mois-ci ?",
  insights: buildAssistantInsights({
    now,
    historyTransactions: [
      { id: "bad1", date: "2026-07-05", amount: null, category: null },
      { id: "bad2", date: "2026-06-05", amount: undefined, category: undefined },
    ],
    receipts: [{ id: "r1", purchase_date: "2026-07-05", store_name: null, total_amount: null }],
    shoppingItems: [{ id: "i1", created_at: "2026-07-05", store: null, product_name: null, price: null }],
  }),
})
assertClean(nullValues)

console.log("Assistant financier V2 tests passed")
