import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  buildShoppingSpendingSummary,
  classifyShoppingSpendingCategory,
} from "../src/features/shopping/services/shoppingSpendingCategories.js"

const entry = (name, price, receiptId, extra = {}) => ({
  product_name: name,
  normalized_name: name.toLowerCase(),
  category: "alimentaire", // Historical receipt category is not informative.
  receipt_id: receiptId,
  price,
  ...extra,
})

const rows = [
  entry("Lait de chèvre Lactel demi-écrémé 1 L", 2.97, "m1"),
  entry("LAIT DE CHEVRE PACK 6X1L", 16.38, "m2"),
  entry("Chocolat noir extra 47 % 3 x 100 g", 3.46, "c1"),
  entry("Pains au chocolat x10", 4.90, "c2"),
  entry("Pomme Granny Smith", 2.50, "f1"),
  entry("Tomates pelées Notre Jardin 240 g", 1.30, "s1"),
  entry("Chocolat en poudre Poulain 450 g", 4.66, "d1"),
  entry("CROQ POULET FOIE LEG,2KG", 6.40, "a1"),
  entry("COTONS CARRE BIO X80", 1.80, "h1"),
  entry("20 SACS POUBELLE 20 L EK", 2.50, "h2"),
  entry("Référence inconnue 10 pièces", 6.40, "x1"),
  entry("Boucherie coupe", 99, "invalid1"),
  entry("Produit en attente de validation", 90, "invalid2", { needs_review: true }),
  entry("Dentifrice COLGATE", 0, "invalid3"),
]

const summary = buildShoppingSpendingSummary(rows)
assert.equal(summary.totalSpent, 53.27)
assert.equal(summary.classifiedSpent, 46.87)
assert.equal(summary.classificationPercent, 88)
assert.equal(summary.purchaseCount, 11)
assert.equal(summary.receiptCount, 11)
assert.equal(Math.round(summary.categories.reduce((sum, category) => sum + category.spent, 0) * 100) / 100, 53.27)
assert.equal(summary.categories.at(-1).key, "other")
assert.equal(summary.categories.at(-1).spent, 6.4)
assert.equal(summary.categories.find(row => row.key === "dairy").spent, 19.35)
assert.equal(summary.categories.find(row => row.key === "dairy").purchaseCount, 2)
assert.equal(summary.categories.find(row => row.key === "treats").spent, 8.36)
assert.equal(summary.categories.find(row => row.key === "treats").receiptCount, 2)
assert.equal(summary.categories.find(row => row.key === "pantry").spent, 1.3)
assert.equal(summary.categories.find(row => row.key === "produce").spent, 2.5)
assert.equal(summary.categories.find(row => row.key === "drinks").spent, 4.66)
assert.equal(summary.categories.find(row => row.key === "pets").spent, 6.4)
assert.equal(summary.categories.find(row => row.key === "household").spent, 2.5)
assert.equal(summary.categories.find(row => row.key === "care").spent, 1.8)
assert.equal(summary.categories.find(row => row.key === "other").suggestedAction, null)

for (const [name, expected] of [
  ["Lait de chèvre Lactel 1,5 %", "dairy"],
  ["Fromage de chèvre 200 g", "dairy"],
  ["Yaourts nature Yoplait 12 x 125 g", "dairy"],
  ["OEUFS X12 KOKOT SOL", "dairy"],
  ["Gouda 8 tranches 200 g", "dairy"],
  ["Chocolat noir extra 47 %", "treats"],
  ["Goûters fourrés au chocolat 225 g", "treats"],
  ["Biscuits Crackers emmental 100 g", "treats"],
  ["CHIPS NATURE 200 G", "treats"],
  ["Bananes de La Réunion", "produce"],
  ["BROCOLIS SURG 900G ECO+", "produce"],
  ["Salade batavia verte", "produce"],
  ["Choux de Bruxelles Notre Jardin", "produce"],
  ["Pomme de Terre Réunion", "produce"],
  ["Compote de pomme 4 x 100 g", "treats"],
  ["JUS DE RAISIN 6X20 CL LP", "drinks"],
  ["Boisson coco 1 L", "drinks"],
  ["Chocolat en poudre Poulain 450 g", "drinks"],
  ["Tomates pelées Notre Jardin 240gr", "pantry"],
  ["RIZ BASMATI 2KG LE FORBAN", "pantry"],
  ["Mayonnaise 470 g", "pantry"],
  ["Feuilleté au fromage 70 g", "pantry"],
  ["Croq poulet foie legumes 2 kg", "pets"],
  ["Barquette pour chien à la volaille 300 g", "pets"],
  ["Papier toilette 18 rouleaux", "household"],
  ["Lessive Xeor 24 lavages", "household"],
  ["Mouchoirs blanc 15x10 étuis", "household"],
  ["Coloration Permanente ACAJOU", "care"],
  ["Dentifrice COLGATE", "care"],
  ["Pain de mie complet 350 g", "breakfast"],
  ["Pains au lait x10 460g", "breakfast"],
  ["Poulet Le Jaune", "proteins"],
  ["Escalope thon", "proteins"],
  ["VEGGIE NUGGETS 300 G", "proteins"],
  ["Saucisson sec 90 g", "proteins"],
]) {
  assert.equal(classifyShoppingSpendingCategory({ product_name: name }), expected, name)
}

assert.equal(classifyShoppingSpendingCategory({ product_name: "Boucherie coupe" }), null)
assert.equal(classifyShoppingSpendingCategory({ product_name: "Non identifiable" }), "other")
assert.equal(classifyShoppingSpendingCategory({ product_name: "" }), null)

// Messages ne sont disponibles que pour un groupe présent sur plusieurs tickets.
const repeated = buildShoppingSpendingSummary([
  ...rows,
  entry("Goûters fourrés au cacao 225g", 2.65, "c3"),
]).categories.find(row => row.key === "treats")
assert.equal(repeated.purchaseCount, 3)
assert.ok(repeated.suggestedAction?.includes("prix au kilo"))
const oneVisit = buildShoppingSpendingSummary([
  entry("Chocolat noir 3x100g", 3.5, "receipt-one"),
  entry("Biscuits au chocolat 250g", 2.1, "receipt-one"),
  entry("Chips nature 200g", 1.9, "receipt-one"),
]).categories.find(row => row.key === "treats")
assert.equal(oneVisit.receiptCount, 1)
assert.equal(oneVisit.suggestedAction, null)

// No false comparisons with price/kg, and totals are observed line prices.
// Quantity=6 on one receipt remains one line, not six inferred purchases.
const multipack = buildShoppingSpendingSummary([
  entry("Lait de chèvre 6x1L", 16.38, "pack-one", { quantity: 6, unit: "l" }),
])
assert.equal(multipack.purchaseCount, 1)
assert.equal(multipack.totalSpent, 16.38)
assert.equal(buildShoppingSpendingSummary([]).purchaseCount, 0)

const page = readFileSync(new URL("../src/features/shopping/pages/ShoppingInsightsPage.jsx", import.meta.url), "utf8")
const view = readFileSync(new URL("../src/features/shopping/components/SpendingCategoryCard.jsx", import.meta.url), "utf8")
assert.match(page, /buildShoppingSpendingSummary\(items\)/)
assert.match(page, /<SpendingCategoryCard summary=\{spendingSummary\}/)
assert.ok(page.indexOf("<SpendingCategoryCard") < page.indexOf("<HabitAdviceCard"))
assert.match(view, /Mon budget par famille/)
assert.match(view, /Dépenses/)
assert.match(view, /Fréquence/)
assert.match(view, /Voir toutes les/)
assert.match(view, /aria-expanded=\{expanded\}/)
assert.match(view, /Piste pour \{priority\.label\.toLowerCase\(\)\}/)
assert.match(view, /Premier poste reconnu/)
assert.doesNotMatch(view, /dépense annuelle|par an|économie garantie/)

console.log("Shopping spend-by-category classification and mobile UX tests passed")
