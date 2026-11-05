import assert from "node:assert/strict";
import { computeReceiptVisibleLineSum, getReceiptAmountReconciliation, suggestReceiptCategory } from "../src/features/receipts/utils/receiptReconciliation.js";

// CLA Saint-Leu, 5 Nov 2026. Line totals include the discounts; paper products are not food.
const amounts = [
  4.29, 2.59, 2.59, 3.99, 3.87, 2.00,
  2.52, 3.06, 3.28, 1.54, 2.00, 3.84,
];
const items = amounts.map((total_price, index) => ({ name: "ARTICLE "+index, total_price }));
assert.equal(computeReceiptVisibleLineSum(items).total, 35.57);
assert.equal(getReceiptAmountReconciliation({ items, totalAmount: "35,57" }).mismatch, false);
assert.equal(getReceiptAmountReconciliation({ items: [...items, {name:"EPICERIE SALEE",total_price:5.58}], totalAmount:35.57 }).difference, 5.58);
assert.equal(getReceiptAmountReconciliation({ items: [...items, {name:"EPICERIE SALEE",total_price:5.58}], totalAmount:35.57 }).mismatch, true);
assert.equal(getReceiptAmountReconciliation({ items: items.map(item=>({...item})), totalAmount:35.57 }).mismatch, false);
assert.equal(computeReceiptVisibleLineSum(items, {isExcluded: item=>item.name==="ARTICLE 0"}).total, 31.28);
assert.equal(suggestReceiptCategory({name:"PAP.TOIL.DOUDOU 2PLIS X18",category:"alimentaire"}),"divers");
assert.equal(suggestReceiptCategory({name:"COLGATE SMILE BATMAN 50ML",category:"alimentaire"}),"divers");
assert.equal(suggestReceiptCategory({name:"SAUCISSON CANARD 150G",category:"alimentaire"}),"alimentaire");
assert.equal(suggestReceiptCategory({name:"COLGATE",category:"sante"}),"sante");
console.log("OK: CLA receipt €35.57, doubled subtotal guard, and hygiene classification.");
