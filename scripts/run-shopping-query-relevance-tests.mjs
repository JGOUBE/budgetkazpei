import assert from "node:assert/strict";
import { hasUsefulShoppingQuery, filterShoppingIntentSuggestions, getShoppingCatalogSuggestionScore, isCottonSwabQuery, normalizeShoppingSearchText, rankShoppingSuggestionGroups } from "../src/services/shoppingList/shoppingQueryRelevance.js";
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

const cottonResults = [
  { display_name: "Cotons-tiges Eco+, 200 bâtonnets" },
  { display_name: "Cotons-tiges Inell, 160 bâtonnets papier" },
  { label: "Coton-tige, boîte de 100" },
  { label: "Bâtonnets ouatés, 200 pièces" },
  { label: "Cotons carrés bio x80" },
  { label: "Déodorant Monsavon fleur de coton 200 ml" },
  { label: "Lessive en feuilles nuage de coton 20 doses" },
  { label: "Carrés coton bébé Mots d'Enfants, 50 carrés" },
]
const swabNames = cottonResults.slice(0, 4)
for (const query of ["coton tige", "cotons tiges", "cotons-tiges", "coton-tige", "cotontige", "cotontiges", "COTON TIGE"]) {
  assert.equal(isCottonSwabQuery(query), true, query)
  assert.deepEqual(filterShoppingIntentSuggestions(cottonResults, query), swabNames, query)
  const ranked = filterShoppingIntentSuggestions(cottonResults, query)
    .filter(row => getShoppingCatalogSuggestionScore(row.display_name || row.label, query) >= 0)
    .sort((a, b) => getShoppingCatalogSuggestionScore(b.display_name || b.label, query)
      - getShoppingCatalogSuggestionScore(a.display_name || a.label, query))
  assert.deepEqual(ranked.slice(0, 2), swabNames.slice(0, 2), query)
}
assert.equal(normalizeShoppingSearchText("cotons-tiges"), normalizeShoppingSearchText("coton tige"))
assert.equal(normalizeShoppingSearchText("cotontiges"), normalizeShoppingSearchText("coton-tige"))
assert.equal(isCottonSwabQuery("coton"), false)
assert.equal(isCottonSwabQuery("coton bio"), false)
assert.equal(filterShoppingIntentSuggestions(cottonResults, "coton").length, cottonResults.length)
assert.equal(filterShoppingIntentSuggestions(cottonResults, "coton ti").length, 4)
console.log("OK: cotton-swab searches only suggest cotton swabs, with correct variants and priority.")


const mixedSourceSuggestions = {
  historical: [],
  observed: [
    { key: "observed:1", source: "observed", label: "Déodorant spray 0% alcool parfum fleur de coton toute légère MONSAVON AU LAIT 20 cl" },
    { key: "observed:2", source: "observed", label: "Déodorant spray compressé 0% alcool parfum fleur de coton MONSAVON 10 cl" },
  ],
  retail: [],
  catalog: [
    { key: "catalog:eco", source: "catalog", label: "Cotons-tiges Eco+, 200 bâtonnets", packPrice: 0.86 },
    { key: "catalog:inell", source: "catalog", label: "Cotons-tiges Inell, 160 bâtonnets papier", packPrice: 1.01 },
    { key: "catalog:discs", source: "catalog", label: "Disques coton Eco+, 100 disques" },
    { key: "catalog:pads", source: "catalog", label: "Cotons carrés bébé x50" },
  ],
};
const shortCotton = rankShoppingSuggestionGroups(mixedSourceSuggestions, "Coton", { limit: 4 });
assert.deepEqual(shortCotton.groupOrder, ["catalog"]);
assert.deepEqual(shortCotton.catalog.slice(0, 2).map(row => row.label), [
  "Cotons-tiges Eco+, 200 bâtonnets",
  "Cotons-tiges Inell, 160 bâtonnets papier",
]);
assert.deepEqual(shortCotton.observed, []);
assert.equal(shortCotton.catalog.length, 4);
const pluralCotton = rankShoppingSuggestionGroups(mixedSourceSuggestions, "Cotons", { limit: 4 });
assert.deepEqual(pluralCotton.groupOrder, ["catalog"]);
assert.deepEqual(pluralCotton.catalog.slice(0, 2).map(row => row.label), [
  "Cotons-tiges Eco+, 200 bâtonnets",
  "Cotons-tiges Inell, 160 bâtonnets papier",
]);
assert.equal(normalizeShoppingSearchText("cotons"), "coton");
const expandedCotton = rankShoppingSuggestionGroups(mixedSourceSuggestions, "Coton", { showAll: true });
assert.deepEqual(expandedCotton.groupOrder, ["catalog", "observed"]);
assert.equal(expandedCotton.observed.length, 2);
const exactCotton = Object.fromEntries(Object.entries(mixedSourceSuggestions).map(([key, rows]) =>
  [key, filterShoppingIntentSuggestions(rows, "coton tige")]));
assert.deepEqual(rankShoppingSuggestionGroups(exactCotton, "coton tige", { limit: 4 }).catalog.map(row => row.label), [
  "Cotons-tiges Eco+, 200 bâtonnets",
  "Cotons-tiges Inell, 160 bâtonnets papier",
]);
const perfumeSearch = rankShoppingSuggestionGroups(mixedSourceSuggestions, "fleur de coton", { limit: 4 });
assert.equal(perfumeSearch.groupOrder[0], "observed");
assert.equal(perfumeSearch.observed.length, 2);
const milkAcrossGroups = rankShoppingSuggestionGroups({
  historical: [{label: "Lait demi-écrémé 1 L"}],
  observed: [{label: "Déodorant au lait pour le corps"}],
  retail: [],
  catalog: [{label: "Lait entier 1 L"}],
}, "lait");
assert.deepEqual(milkAcrossGroups.groupOrder, ["historical", "catalog", "observed"]);
console.log("OK: shopping autocomplete ranks real product matches ahead of incidental fragrance matches across sources.");
