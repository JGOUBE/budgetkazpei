import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const content = readFileSync(new URL("../src/pages/ShoppingListPage.jsx", import.meta.url), "utf8");
assert.match(content,/Prix relevé le \$\{new Date\(suggestion\.observedAt\)/);
assert.match(content,/Prix relevé le \$\{new Date\(item\.retailObservedAt\)/);
assert.doesNotMatch(content,/Prix observé récemment|Prix historique \(plus de 30 jours|disponibilité à confirmer|getSharedPriceStatusLabel/);
assert.doesNotMatch(content,/\{txt\.observedSuggestion\}/);
console.log("OK: shopping prices display clear observed date without stale status labels.");
