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
// Les articles hors lait de chèvre et tablettes sont maintenant classés eux
// aussi, mais sans jamais rejoindre par erreur ces deux familles spéciales.
for (const row of unrelated) {
  const key = identifyShoppingHabitFamily(row)
  assert.notEqual(key, "goat-milk")
  assert.notEqual(key, "chocolate-tablets")
}
assert.notEqual(identifyShoppingHabitFamily(unrelated[0]), identifyShoppingHabitFamily(unrelated[2]))
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

// Le regroupement vaut pour TOUS les articles, y compris des désignations
// anciennes, des marques et des formats différents, sans fixer leur catégorie.
const examples = [
  ["CORNICHONS 72 CL,360G", "Cornichons en bocal 72 cl / 360 g", "auto:cornichon"],
  ["TRANCHETTES DE GOUDA 300G ECO+", "Gouda 8 tranches 200 g", "auto:gouda"],
  ["EMMENTAL RAP 45MG 200G", "Emmental râpé Eco+ 500 g", "auto:emmental"],
  ["TOMATES PELEES NOTR JARDIN 240", "Tomates pelées Notre Jardin 240gr", "auto:tomate-pelee"],
  ["MOUCHOIR ETUI STD 15X9 CO", "Mouchoirs blanc 15 x 10 étuis", "auto:mouchoir"],
  ["OEUFS X12 KOKOT SOL", "KOKOT X6 OEUFS PLEIN AIR", "auto:oeuf"],
  ["SAUCE MEXICAINE FAJITA 430G", "Sauce mexicaine médium 315g", "auto:sauce-mexicaine"],
  ["Pate à tartiner 400G", "Ivoria pâte à tartiner duo", "auto:pate-tartiner"],
  ["20 SACS POUBELLE 20L EK", "Sacs poubelle 30 L", "auto:sac-poubelle"],
  ["PAIN DE MIE COMPLET 350G", "Pain mie sandwich complet Yami 420 g", "auto:pain-mie"],
  ["JUS DE RAISIN 6X20CL", "Jus de raisin 1 L", "auto:jus-raisin"],
  ["TORTILLAS DE MAIS 320G", "TORTILLAS NATURE TOKAPI 150G", "auto:tortilla"],
  ["FRITES AU FOUR 600 G", "Frites surgelées 1 kg", "auto:frite-surgele"], // words differ: not an automatic equivalence
]
for (let index = 0; index < examples.length; index += 1) {
  const [left, right, expected] = examples[index]
  const a = identifyShoppingHabitFamily({ product_name: left })
  const b = identifyShoppingHabitFamily({ product_name: right })
  if (index === examples.length - 1) {
    // Ne pas inventer de correspondance si les mots essentiels diffèrent.
    assert.notEqual(a, b)
    continue
  }
  assert.equal(a, expected, left)
  assert.equal(b, expected, right)
}

const generalItems = examples.slice(0, -1).flatMap(([left, right], index) => [
  item(left, left.toLowerCase(), 1.29 + index, "2026-10-03", "generic-a-" + index),
  item(right, right.toLowerCase(), 2.19 + index, "2026-11-09", "generic-b-" + index),
])
const genericFamilies = buildShoppingHabitFamilies(generalItems)
assert.equal(genericFamilies.length, examples.length - 1)
assert.ok(genericFamilies.every(family => family.purchaseCount === 2 && family.receiptCount === 2))
assert.ok(genericFamilies.every(family => family.variants.length === 2))
assert.equal(genericFamilies.reduce((sum, family) => sum + family.purchaseCount, 0), generalItems.length)
assert.equal(
  identifyShoppingHabitFamily({ product_name: "Pomme de terre Réunion" }) ===
    identifyShoppingHabitFamily({ product_name: "Pomme Granny Smith" }),
  false,
)
assert.notEqual(
  identifyShoppingHabitFamily({ product_name: "PAINS AU CHOCOLAT X10" }),
  identifyShoppingHabitFamily({ product_name: "PAINS AU LAIT X10" }),
)
assert.notEqual(
  identifyShoppingHabitFamily({ product_name: "PATE A TARTINER" }),
  identifyShoppingHabitFamily({ product_name: "PATE AU POISSON" }),
)
assert.notEqual(
  identifyShoppingHabitFamily({ product_name: "GEL DOUCHE" }),
  identifyShoppingHabitFamily({ product_name: "GEL LESSIVE" }),
)
assert.notEqual(
  identifyShoppingHabitFamily({ product_name: "CHOCOLAT EN POUDRE POULAIN" }),
  identifyShoppingHabitFamily({ product_name: "Chocolat noir 3 x 100 g" }),
)
assert.equal(identifyShoppingHabitFamily({ product_name: "Boucherie coupe" }), null)
assert.equal(buildShoppingHabitFamilies([
  item("Boucherie coupe", "boucherie coupe", 12, "2026-10-01", "dept-1"),
  item("BOUCHERIE COUPE", "boucherie coupe", 8, "2026-10-09", "dept-2"),
]).length, 0)
assert.equal(buildShoppingHabitFamilies(generalItems.map(row => ({ ...row, needs_review: true }))).length, 0)

// Une famille peut réunir plusieurs formats pour la fréquence, mais le
// classement précis conserve deux articles et deux prix séparés.
const cornichonLines = generalItems.slice(0, 2)
assert.equal(buildTopProducts(cornichonLines, 10).length, 2)
const cornichonGroup = genericFamilies.find(entry => entry.key === "auto:cornichon")
assert.equal(cornichonGroup.purchaseCount, 2)
assert.equal(cornichonGroup.variants.length, 2)


// Les produits n'ont pas besoin d'être connus d'avance dans une liste :
// deux nouveaux libellés proches restent détectables par leurs mots utiles.
assert.equal(
  identifyShoppingHabitFamily({ product_name: "Colles bâton 20 g" }),
  identifyShoppingHabitFamily({ product_name: "Colles bâton 35 g" }),
)
assert.ok(
  buildShoppingHabitFamilies([
    item("Colles bâton 20 g", "colles baton", 2.5, "2026-10-01", "new-1"),
    item("Colles bâton 35 g", "colles baton", 3.1, "2026-10-28", "new-2"),
  ]).some(group => group.purchaseCount === 2 && group.variants.length === 2),
)

// Un SKU dont seul le format d'écriture OCR varie doit être compté une
// seule fois dans le top, sans mélanger les vrais formats 200 g et 300 g.
const skuOCR = [
  item("Tranchettes de Gouda 3O0G Eco+", "gouda 300 g", 2.89, "2026-10-01", "sku-1"),
  item("Tranchettes de Gouda 300 g Eco+", "gouda 300 g", 2.79, "2026-10-28", "sku-2"),
]
const skuTop = buildTopProducts(skuOCR, 10)
assert.equal(skuTop.length, 1)
assert.equal(skuTop[0].purchaseCount, 2)
assert.equal(skuTop[0].totalSpent, 5.68)
assert.equal(
  buildTopProducts([
    ...skuOCR,
    item("Tranchettes de Gouda 200 g Eco+", "gouda 200 g", 2.09, "2026-11-02", "sku-3"),
  ], 10).length,
  2,
)
assert.equal(
  buildTopProducts([
    item("Chocolat noir 47 % 3x100g", "choc noir", 3.29, "2026-09-01", "sku-4"),
    item("Chocolat noir 47% 3 x 100 g", "choc noir", 3.39, "2026-10-01", "sku-5"),
  ], 10).length,
  1,
)
const uiPage = readFileSync(new URL("../src/features/shopping/pages/ShoppingInsightsPage.jsx", import.meta.url), "utf8")
const uiFamilyCard = readFileSync(new URL("../src/features/shopping/components/FamilyHabitsCard.jsx", import.meta.url), "utf8")
assert.match(uiPage, /buildTopProducts\(items, items.length\)/)
assert.match(uiPage, /Voir tous les/)
assert.match(uiFamilyCard, /const visible = showAll \? families : families.slice\(0, 3\)/)
assert.match(uiFamilyCard, /Les prix restent suivis séparément par article/)


assert.equal(
  identifyShoppingHabitFamily({ product_name: "MAYONNAISE 470G" }),
  identifyShoppingHabitFamily({ product_name: "Mayonnaise bocal 470g Rustica" }),
)
assert.equal(
  identifyShoppingHabitFamily({ product_name: "FRITE INCURVEE SURG POM'LISSE" }),
  identifyShoppingHabitFamily({ product_name: "Frites au four 600 g" }),
)
assert.equal(
  identifyShoppingHabitFamily({ product_name: "PAINS WRAP X6 EPIDOR" }),
  identifyShoppingHabitFamily({ product_name: "6 Wraps de blé complet 370g" }),
)
assert.equal(
  identifyShoppingHabitFamily({ product_name: "Maïs croquant Notre Jardin" }),
  identifyShoppingHabitFamily({ product_name: "MAIS DX 1/2 285G" }),
)

console.log("Shopping recurring family tests passed")
