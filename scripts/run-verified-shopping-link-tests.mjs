import assert from "node:assert/strict";
import { applyVerifiedShoppingLinks } from "../src/features/receipts/services/verifiedShoppingLinkRules.js";

const draft={store_name:"CLA SAINT LEU",total_amount:35.57,items:[
 {name:"Lait Viva 1 L",corrected_name:"Lait Viva 1 L",market_canonical_name:"Lait Viva 1 L",market_product_id:"m1",market_matched:true,total_price:1.27,category:"alimentaire"},
 {name:"Autre lait 1 L",corrected_name:"Autre lait 1 L",market_canonical_name:"Lait Viva 1 L",market_product_id:"m1",market_matched:true,total_price:2.00},
 {name:"Fromage Babybel 120 g",market_canonical_name:"Fromage Babybel 120 g",market_product_id:"m2",market_matched:false,total_price:3.59},
 {name:"Pain 540 g",market_canonical_name:"Pain 540 g",market_product_id:"m3",market_matched:true,total_price:3.84}
]};
const links=[{market_product_id:"m1",shopping_product_id:"s1"},{market_product_id:"m2",shopping_product_id:"s2"}];
const products=[{id:"s1",display_name:"Lait Viva 1 L"},{id:"s2",display_name:"Fromage Babybel 120 g"}];
const result=applyVerifiedShoppingLinks(draft,links,products);
assert.equal(result.items[0]._verified_shopping_product_id,"s1");
assert.equal(result.items[0]._verified_shopping_product_name,"Lait Viva 1 L");
assert.equal(result.items[1]._verified_shopping_product_id,undefined);
assert.equal(result.items[2]._verified_shopping_product_id,undefined);
assert.equal(result.items[3]._verified_shopping_product_id,undefined);
assert.equal(result.total_amount,35.57);
assert.deepEqual(result.items.map(x=>x.total_price),draft.items.map(x=>x.total_price));
assert.deepEqual(result.items.map(x=>x.name),draft.items.map(x=>x.name));
assert.deepEqual(result.items.map(x=>x.market_matched),draft.items.map(x=>x.market_matched));
assert.equal(applyVerifiedShoppingLinks({},links,products).items,undefined);
console.log("OK: verified market→shopping links are exact, read-only and protect corrected names.");
