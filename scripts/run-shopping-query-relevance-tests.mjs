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
