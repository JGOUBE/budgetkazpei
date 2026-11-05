import assert from "node:assert/strict";
import { formatSharedPriceRetailer, isSharedPriceHistorical, getSharedPriceStatusLabel } from "../src/services/shoppingList/sharedPricePresentation.js";
import { loadSharedShoppingCatalog, loadSharedShoppingPrices } from "../src/services/shoppingList/sharedCatalogLoader.js";

assert.equal(formatSharedPriceRetailer({ retailer_slug: "leader-price", commune: "Saint-Paul", locality: "Ermitage" }), "Leader Price · Ermitage · Saint-Paul");
assert.equal(formatSharedPriceRetailer({ retailer_slug: "super-u", commune: "Saint-Leu" }), "Super U · Saint-Leu");
assert.equal(formatSharedPriceRetailer({ retailer_slug: "carrefour", commune: "La Réunion" }), "Carrefour");
assert.equal(formatSharedPriceRetailer({ retailer_slug: "e-leclerc", commune: "Saint-Pierre" }), "E.Leclerc · Saint-Pierre");
assert.equal(isSharedPriceHistorical("2026-10-29T12:00:00Z", "2026-11-05T12:00:00Z"), false);
assert.equal(isSharedPriceHistorical("2026-07-29T12:00:00Z", "2026-11-05T12:00:00Z"), true);
assert.match(getSharedPriceStatusLabel(null, "2026-11-05T12:00:00Z"), /historique/);

const makeClient = (table, source) => ({
  from(name) {
    assert.equal(name, table);
    let start = 0, end = 0;
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      order() { return builder; },
      range(a,b) { start=a; end=b; return Promise.resolve({ data: source.slice(start,end+1), error: null }); },
    };
    return builder;
  },
});
const products = Array.from({length: 1507}, (_,i)=>({id:String(i),display_name:"Product "+i}));
const prices = Array.from({length: 2051}, (_,i)=>({id:String(i),product_id:String(i),price:1}));
const gotProducts = await loadSharedShoppingCatalog({ client: makeClient("shopping_products", products) });
const gotPrices = await loadSharedShoppingPrices({ client: makeClient("shopping_price_observations", prices) });
assert.equal(gotProducts.length,1507);
assert.equal(gotPrices.length,2051);
assert.equal(new Set(gotProducts.map(p=>p.id)).size,1507);
assert.equal(new Set(gotPrices.map(p=>p.id)).size,2051);
console.log("OK: shared price attribution, freshness, and paginated catalog coverage.");
