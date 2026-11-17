import assert from "node:assert/strict";
import { inferUnitFromName, computeUnitPrice } from "../src/features/shopping/services/unitPrice.ts";
import { enrichShoppingItemsWithReceiptIdentities } from "../src/features/shopping/services/shoppingProductIdentity.js";
import { shoppingProductGroupingKey, buildTopProducts } from "../src/features/shopping/services/priceHistory.ts";
import { buildSavingsInsights } from "../src/services/savings/savingsEngine.ts";

assert.deepEqual(inferUnitFromName("Chocolat noir extra 47 % 3 x 100 g"), {quantity:300,unit:"g"});
assert.deepEqual(inferUnitFromName("LAIT DE CHEVRE PACK 6X1L"), {quantity:6,unit:"l"});
assert.deepEqual(inferUnitFromName("LAIT FLUIDE UHT U3X20CL"), {quantity:60,unit:"cl"});
assert.deepEqual(inferUnitFromName("Cornichons en bocal 72 cl / 360 g"), {quantity:360,unit:"g"});
assert.deepEqual(inferUnitFromName("Wraps de blé complet x6 370 g"), {quantity:370,unit:"g"});
assert.equal(computeUnitPrice({price:3.46,quantity:300,unit:"g"}).value,11.53);
assert.equal(computeUnitPrice({price:16.38,quantity:6,unit:"l"}).value,2.73);
assert.equal(computeUnitPrice({price:4.58,quantity:1000,unit:"g"}).value,4.58);

const purchased = [
  {id:"choc",receipt_id:"receipt",product_name:"Chocolat noir extra 47 % 3 x 100 g",
    corrected_name:"Chocolat noir extra 47 % 3 x 100 g",normalized_name:"chocolat noir extra 47",price:3.46},
  {id:"milk",receipt_id:"receipt",product_name:"LAIT DE CHEVRE PACK 6X1L",
    corrected_name:"LAIT DE CHEVRE PACK 6X1L",normalized_name:"lait de chevre 6x1l",price:16.38},
];
const receiptLines = [
  {receipt_id:"receipt",corrected_name:purchased[0].product_name,normalized_name:"chocolat noir extra 47 3 x",
    market_matched:true,market_product_id:"choc-market",market_canonical_name:purchased[0].product_name,
    unit_price:3.46,quantity:1,total_price:3.46},
  {receipt_id:"receipt",corrected_name:purchased[1].product_name,normalized_name:"lait de chevre pack 6x1l",
    market_matched:true,market_product_id:"milk-market",market_canonical_name:purchased[1].product_name,
    unit_price:16.38,quantity:1,total_price:16.38},
];
const enriched=enrichShoppingItemsWithReceiptIdentities(purchased,receiptLines);
assert.equal(enriched[0].market_product_id,"choc-market");
assert.equal(enriched[1].market_product_id,"milk-market");
assert.equal(shoppingProductGroupingKey(enriched[0]),"market:choc-market");
assert.equal(buildTopProducts(enriched,2).length,2);
const wrongSize=[...receiptLines, {
  receipt_id:"receipt",corrected_name:"Chocolat noir extra 47 % 1 x 100 g",
  normalized_name:"chocolat noir extra 47 3 x",market_matched:true,
  market_product_id:"other-format",unit_price:1.5,quantity:1,total_price:1.5,
}];
assert.equal(enrichShoppingItemsWithReceiptIdentities([purchased[0]],wrongSize)[0].market_product_id,"choc-market");

const tagliatelles=[
  {id:"later",receipt_id:"new",product_name:"Tagliatelles 500 g",market_product_id:"pasta-id",
    controlled_normalization:true,receipt_pack_unit_price:2.29,price:4.58,
    store:"E.Leclerc",created_at:"2026-11-17T12:00:00Z",confidence_score:99},
  {id:"earlier",receipt_id:"old",product_name:"Tagliatelles 500 g",market_product_id:"pasta-id",
    controlled_normalization:true,receipt_pack_unit_price:1.49,price:1.49,
    store:"Leader Price",created_at:"2026-11-10T12:00:00Z",confidence_score:99},
];
const comparison=buildSavingsInsights({shoppingItems:tagliatelles});
assert.equal(comparison.suggestions.length,1);
assert.equal(comparison.suggestions[0].referencePrice,2.29);
assert.equal(comparison.suggestions[0].alternativePrice,1.49);
assert.equal(comparison.totalPotential,0.8);
const catalogRow={
 shopping_product_id:"verified-uuid",product_name:"Yami pain de mie 420 g",
 reference_price:3.29,reference_store:"E.Leclerc",reference_date:"2026-11-17",
 alternative_price:2.99,alternative_retailer_slug:"leader-price",
 alternative_store_name:"Leader Price · Saint-Leu",alternative_date:"2026-11-02",
 saving_per_pack:0.30,
};
const merged=buildSavingsInsights({shoppingItems:[],catalogComparisons:[catalogRow]});
assert.equal(merged.suggestions.length,1);
assert.equal(merged.suggestions[0].bestStore,"Leader Price · Saint-Leu");
assert.equal(merged.totalPotential,0.3);
assert.equal(buildSavingsInsights({shoppingItems:[],catalogComparisons:[{
 ...catalogRow,alternative_price:4.5,saving_per_pack:-1.21,
}]}).suggestions.length,0);
const apples=enrichShoppingItemsWithReceiptIdentities([
  {receipt_id:"fruit-1",product_name:"Pomme Granny Smith",corrected_name:"Pomme Granny Smith",
    normalized_name:"pomme granny smith",price:1.36,unit:"piece",store:"E.Leclerc",
    created_at:"2026-09-20T12:00:00Z",confidence_score:99},
],[
  {receipt_id:"fruit-1",corrected_name:"Pomme Granny Smith",normalized_name:"pomme granny smith",
    market_matched:true,market_product_id:"apple-market",unit_price:2.99,
    quantity:1,total_price:1.36},
]);
assert.equal(apples[0].receipt_variable_weight,true);
assert.equal(buildSavingsInsights({shoppingItems:[
  ...apples,
  {...apples[0],receipt_id:"fruit-2",store:"Leader Price",price:1.01,
    created_at:"2026-08-18T12:00:00Z"},
]}).suggestions.length,0,"Different produce weights must not create fake savings");

assert.equal(buildSavingsInsights({shoppingItems:[],catalogComparisons:[
 catalogRow,{...catalogRow,shopping_product_id:"duplicate-id",saving_per_pack:0.2},
]}).suggestions.length,1);
console.log("OK: receipt matching, pack sizes, price units, and exact-SKU savings regressions.");
