import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { buildShoppingHabitFamilies, identifyShoppingHabitFamily } from "../src/features/shopping/services/shoppingHabitFamilies.js"
import { buildProductStats, buildTopProducts } from "../src/features/shopping/services/priceHistory.ts"

const item = (name, normalized, price, date, receipt, overrides = {}) => ({
  product_name: name,
  corrected_name: name,
  normalized_name: normalized,
  price,
  created_at: date + "T12:00:00Z",
  receipt_id: receipt,
  ...overrides,
})

// Reproduction des six lignes de lait de chèvre avec prix de briques et packs
// et libellés OCR différents : leur prix par article NE DOIT PAS être mélangé.
const goatMilk = [
  item("Lait de chèvre Lactel demi-écrémé 1 L", "lait de chevre lactel demi ecreme", 2.97, "2026-09-20", "milk-1"),
  item("Lait de chèvre Lactel demi-écrémé 1 L", "lait de chevre lactel demi ecreme", 16.8, "2026-08-28", "milk-2", { quantity: 6, unit: "l" }),
  item("LAIT CHEVRE LACTEL 1/2 ECR 1L", "lait chevre lactel 1 2 ecr", 8.4, "2026-08-19", "milk-3", { quantity: 3, unit: "l" }),
  item("Lait de chèvre Lactel 1,5 %", "lait de chevre lactel 1 5", 3.18, "2026-08-06", "milk-4"),
  item("LAIT DE CHEVRE PACK 6X1L", "lait de chevre 6x1l", 16.38, "2026-11-10", "milk-5"),
  item("LAIT DE CHEVRE PACK 6X1L", "lait de chevre pack 6x1l", 16.38, "2026-08-08", "milk-6"),
]
const chocolate = [
  ...["2026-11-10", "2026-10-01", "2026-09-20"].map((date, i) => item(
    "Chocolat noir extra 47 % 3 x 100 g", "chocolat noir extra 47", 3.46, date, "choc-" + i,
  )),
  item("Chocolat noir extra 47 % 3 x 100 g", "chocolat noir extra 47", 3.36, "2026-08-28", "choc-3"),
  item("Chocolat noir extra 47 % 3 x 100 g", "chocolat noir extra 47 3 x 100 g", 3.36, "2026-08-08", "choc-4"),
  item("Tablette chocolat noir dessert 200 g", "tablette chocolat noir dessert 200 g", 1.99, "2026-08-08", "choc-4"),
  item("TAB MILKA LAIT NOISETTES", "tab milka lait noisettes", 1.65, "2026-08-06", "choc-5"),
  item("Tab choco noir 47%", "tab choco noir 47", 4.4, "2026-07-06", "choc-6"),
]
const unrelated = [
  item("Pains au chocolat x10", "pains au chocolat x10", 4.9, "2026-11-10", "other-1"),
  item("Biscuit tab choco noir", "biscuit tab choco noir", 1.7, "2026-11-10", "other-2"),
  item("Chocolat en poudre Poulain 450 g", "chocolat en poudre poulain", 4.66, "2026-11-10", "other-3"),
  item("BARRES CHOC LAIT NOIS", "barres choc lait nois", 2.24, "2026-11-10", "other-4"),
  item("MILKA CHOCO PAUSE 3X260G", "milka choco pause 3x260g", 5.51, "2026-11-10", "other-5"),
  item("Fromage de chèvre 200 g", "fromage de chevre", 2.99, "2026-11-10", "other-6"),
  item("Pains au lait x10", "pains au lait x10", 3.1, "2026-11-10", "other-7"),
]
const families = buildShoppingHabitFamilies([...goatMilk, ...chocolate, ...unrelated])
assert.equal(families.length, 2)
const milk = families.find(entry => entry.key === "goat-milk")
const tablets = families.find(entry => entry.key === "chocolate-tablets")
assert.equal(milk.purchaseCount, 6)
assert.equal(milk.receiptCount, 6)
assert.equal(milk.totalSpent, 64.11)
assert.equal(milk.variants.length, 4)
assert.equal(tablets.purchaseCount, 8)
assert.equal(tablets.receiptCount, 7)
assert.equal(tablets.totalSpent, 25.14)
assert.equal(tablets.variants.length, 4)
assert.equal(tablets.variants[0].purchaseCount, 5)
assert.equal(identifyShoppingHabitFamily(unrelated[0]), null)
assert.equal(identifyShoppingHabitFamily(unrelated[1]), null)
assert.equal(identifyShoppingHabitFamily(unrelated[2]), null)
assert.equal(identifyShoppingHabitFamily(unrelated[3]), null)
assert.equal(identifyShoppingHabitFamily(unrelated[4]), null)
assert.equal(identifyShoppingHabitFamily(unrelated[5]), null)
assert.equal(buildShoppingHabitFamilies(goatMilk.map(row => ({ ...row, needs_review: true }))).length, 0)
assert.equal(buildShoppingHabitFamilies([]).length, 0)

// Les désignations identiques sont regroupées, même quand normalized_name
// change au fil des tickets. Deux formats distincts restent deux articles.
const top = buildTopProducts([...goatMilk, ...chocolate, ...unrelated], 20)
const dark = top.find(row => row.label === "Chocolat noir extra 47 % 3 x 100 g")
assert.equal(dark.purchaseCount, 5)
assert.equal(dark.totalSpent, 17.1)
assert.equal(buildProductStats([...chocolate, ...unrelated], dark.normalizedName).purchaseCount, 5)
assert.equal(top.filter(row => row.label === "LAIT DE CHEVRE PACK 6X1L").length, 1)
const goatPack = top.find(row => row.label === "LAIT DE CHEVRE PACK 6X1L")
assert.equal(goatPack.purchaseCount, 2)
assert.equal(goatPack.totalSpent, 32.76)
assert.equal(top.find(row => row.label === "Lait de chèvre Lactel demi-écrémé 1 L").purchaseCount, 2)
// Preserve legacy normalized-name lookup for existing consumers/tests.
assert.equal(buildProductStats(chocolate, "chocolat noir extra 47").purchaseCount, 4)

const page = readFileSync(new URL("../src/features/shopping/pages/ShoppingInsightsPage.jsx", import.meta.url), "utf8")
const card = readFileSync(new URL("../src/features/shopping/components/FamilyHabitsCard.jsx", import.meta.url), "utf8")
assert.match(page, /<FamilyHabitsCard families=\{familyHabits\}/)
assert.match(page, /buildShoppingHabitFamilies\(items\)/)
assert.match(card, /Les prix restent suivis séparément par article/)
assert.doesNotMatch(card, /averagePrice|Prix moyen|prix moyen affiché/)
console.log("Shopping recurring family tests passed")
