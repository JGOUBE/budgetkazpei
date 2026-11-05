import assert from "node:assert/strict";
import { normalizePersonalAlias, buildPersonalAliasMap, applyPersonalAliasesToDraft } from "../src/features/receipts/services/personalReceiptAliasRules.js";

const past = [
  {ocr_name:"PAP.TOIL.DOUDOU 2PLIS X18 4", corrected_name:"Papier Toilette Doudou 2PLIS X18", item_status:"user_validated"},
  {ocr_name:"CHAB PT DEJ MULTI CEREAL", corrected_name:"CHABRIOR Petit DEJ MULTI CEREAL",item_status:"user_validated"},
  {ocr_name:"SAUCISSON CANARD 150G TAL", corrected_name:"SAUCISSON CANARD 150G",item_status:"trusted"},
  {ocr_name:"COLGATE SMILE BATMAN 5OML", corrected_name:"Dentifrice Colgate 50 ml",item_status:"user_validated"},
  {ocr_name:"COLGATE SMILE BATMAN 5OML", corrected_name:"Autre produit",item_status:"user_validated"},
];
const aliases=buildPersonalAliasMap(past);
assert.equal(normalizePersonalAlias("PAP.TOIL.DOUDOU 2PLIS X18 4"),"pap toil doudou 2plis x18 4");
assert.equal(aliases.get("pap toil doudou 2plis x18 4"),"Papier Toilette Doudou 2PLIS X18");
assert.equal(aliases.has("saucisson canard 150g tal"),false);
assert.equal(aliases.has("colgate smile batman 5oml"),false);
const draft={store_name:"CLA SAINT LEU",total_amount:35.57,items:[
 {name:"PAP.TOIL.DOUDOU 2PLIS X18 4",ocr_name:"PAP.TOIL.DOUDOU 2PLIS X18 4",total_price:4.29,category:"alimentaire",market_matched:false},
 {name:"CHAB PT DEJ MULTI CEREAL",ocr_name:"CHAB PT DEJ MULTI CEREAL",total_price:3.28,market_matched:false},
 {name:"SAUCISSON CANARD 150G TAL",ocr_name:"SAUCISSON CANARD 150G TAL",total_price:3.87,market_matched:false},
 {name:"OTHER RAW",ocr_name:"OTHER RAW",total_price:1.2,market_matched:true},
]};
const changed=applyPersonalAliasesToDraft(draft,aliases);
assert.equal(changed.items[0].name,"Papier Toilette Doudou 2PLIS X18");
assert.equal(changed.items[0].ocr_name,"PAP.TOIL.DOUDOU 2PLIS X18 4");
assert.equal(changed.items[0].needs_review,true);
assert.equal(changed.items[0]._personal_alias_suggestion,true);
assert.equal(changed.items[1].name,"CHABRIOR Petit DEJ MULTI CEREAL");
assert.equal(changed.items[2].name,"SAUCISSON CANARD 150G TAL");
assert.equal(changed.items[3].market_matched,true);
assert.equal(changed.items.reduce((n,x)=>n+x.total_price,0),draft.items.reduce((n,x)=>n+x.total_price,0));
console.log("OK: personal OCR corrections are scoped suggestions, conflict-safe, and price-preserving.");
