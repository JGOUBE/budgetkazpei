import assert from "node:assert/strict";
import { hasUsefulShoppingQuery, filterShoppingIntentSuggestions } from "../src/services/shoppingList/shoppingQueryRelevance.js";
assert.equal(hasUsefulShoppingQuery("la"),false);
assert.equal(hasUsefulShoppingQuery("lait"),true);
assert.equal(hasUsefulShoppingQuery("lai"),true);
assert.equal(hasUsefulShoppingQuery("  "),false);
assert.equal(hasUsefulShoppingQuery("riz"),true);
const items=[
{label:"Lait demi-écrémé UHT 1L"},
{label:"Lait corps nourrissant MIXA 25cl"},
{label:"Lanières de poivron 600g"},
{label:"Lait d'amandes 1L"}
];
assert.deepEqual(filterShoppingIntentSuggestions(items,"la"),[]);
assert.deepEqual(filterShoppingIntentSuggestions(items,"lai").map(x=>x.label),[
"Lait demi-écrémé UHT 1L","Lanières de poivron 600g","Lait d\u0027amandes 1L"
]);
assert.deepEqual(filterShoppingIntentSuggestions(items,"lait").map(x=>x.label),[
"Lait demi-écrémé UHT 1L","Lanières de poivron 600g","Lait d'amandes 1L"
]);
assert.equal(filterShoppingIntentSuggestions(items,"lait corps").length,4);
console.log("OK: searches require 3 characters and avoid cosmetic milk.");

const oilResults = [
  {label: "Huile Cœur de tournesol Lesieur 1 L"},
  {label: "Huile d'olive vierge extra 75 cl"},
  {display_name: "Lesieur Huile de colza 1 L"},
  {label: "Sardines à l'huile de tournesol Bouj'd'Or 125 g"},
  {label: "Lentilles à l'huile Notre Jardin"},
  {label: "Miettes de thon huile 104 g"},
  {productName: "Gel WC aux huiles essentielles Harpic 75 cl"},
  {label: "Huile essentielle de lavande 10 ml"},
  {label: "Huile moteur 5W30 1 L"},
  {label: "Huile pour cheveux 100 ml"},
]
assert.deepEqual(
  filterShoppingIntentSuggestions(oilResults, "huile").map(row => row.label || row.display_name || row.productName),
  ["Huile Cœur de tournesol Lesieur 1 L", "Huile d'olive vierge extra 75 cl", "Lesieur Huile de colza 1 L"],
)
assert.equal(filterShoppingIntentSuggestions(oilResults, "huil").length, 3)
assert.equal(filterShoppingIntentSuggestions(oilResults, "huile de tournesol").length, 3)
assert.equal(filterShoppingIntentSuggestions(oilResults, "huile essentielle").length, oilResults.length)
assert.equal(filterShoppingIntentSuggestions(oilResults, "huile moteur").length, oilResults.length)
console.log("OK: cooking oil suggestions exclude incidental ingredients and other product families.");

const eggs = [
  {label:"Œufs plein air Kokot x12"},
  {display_name:"Oeufs Kokot plein air x6"},
  {productName:"Oeufs frais bio plein air - 10 oeufs"},
  {label:"Bœuf assaisonné 405 g"},
  {label:"Œufs de lompe rouges 100 g"},
];
for (const query of ["œuf","œufs","oeuf","oeufs"]) {
  assert.deepEqual(
    filterShoppingIntentSuggestions(eggs, query).map(item => item.label || item.display_name || item.productName),
    ["Œufs plein air Kokot x12","Oeufs Kokot plein air x6","Oeufs frais bio plein air - 10 oeufs"],
  );
}
assert.equal(filterShoppingIntentSuggestions(eggs, "oeufs de lompe").length, eggs.length);
console.log("OK: œuf/oeuf matching and unrelated-product exclusions.");
