import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getShoppingAutocompleteSuggestions } from "../src/services/shoppingList/shoppingListEngine.ts";

// Ticket réel : produit U3X20CL = trois briques de 20 cl vendues 2,59 €.
// Une quantité "1" désigne un lot, pas un centilitre.
const history = [{
  id: "lot-u3x20cl",
  product_name: "LAIT FLUIDE UHT 5%MG U3X20CL",
  normalized_name: "lait fluide uht 5 mg u3x20cl",
  quantity: 1, unit: "cl", price: 2.59, price_per_unit: 12.95,
  created_at: "2026-07-23T12:00:00Z",
}];
const result = getShoppingAutocompleteSuggestions("lait fluide", history, [], []);
assert.equal(result.historical.length, 1);
assert.equal(result.historical[0].lastPrice, 2.59);
assert.equal(result.historical[0].priceUnitLabel, "");
assert.equal(result.historical[0].label, history[0].product_name);
// Weighted produce must retain its accurate per-kg reference.
const weighted = getShoppingAutocompleteSuggestions("pomme", [{
  id: "weighted-apple", product_name:"Pomme Granny Smith",
  normalized_name:"pomme granny smith", quantity:0.428, unit:"kg",
  price:1.86, price_per_unit:1.86, created_at:"2026-11-01T00:00:00Z",
}], [], []);
assert.equal(weighted.historical[0].lastPrice, 4.35);
assert.equal(weighted.historical[0].priceUnitLabel, "€/kg");
const page = readFileSync(new URL("../src/pages/ShoppingListPage.jsx", import.meta.url), "utf8");
assert.match(page, /Number\(sharedPrice\?\.price\) > 0 \? 25 : 0/);
console.log("OK: U3X20CL displays €2.59/package, kg prices unaffected, priced catalog ranks first.");

const eggBox = getShoppingAutocompleteSuggestions("oeuf", [], [], [{
  id: "egg-10", productName: "Oeufs frais bio de plein air - 10 oeufs",
  normalizedProductName: "oeufs frais bio de plein air 10 oeufs",
  marketProductId: "test-egg-box", packageFormat: "10 oeufs",
  packCount: 10, price: 7.17, unitPrice: 0.717, unitPriceUnit: "unit",
  retailerName: "Leader Price Réunion", storeName: "LP Ermitage",
  observedAt: "2026-07-29T16:27:48Z", isFresh: false,
}]);
assert.equal(eggBox.observed.length, 1, "The dated, older egg box price should appear as a suggestion");
assert.equal(eggBox.observed[0].observedPrice, 7.17, "Egg box price must not be mistaken for one egg");
assert.equal(eggBox.observed[0].observedPriceUnitLabel, "");
assert.equal(eggBox.observed[0].observedPriceIsFresh, false, "Old price must never become a fresh estimate");
assert.match(page, /packPrice: sharedPrice\?\.price/, "Published catalogue box price must be displayed");
console.log("OK: published egg box prices use pack totals, with old prices kept dated.");
