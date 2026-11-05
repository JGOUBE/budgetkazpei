import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const jsx = readFileSync(new URL("../src/pages/ShoppingListPage.jsx", import.meta.url), "utf8");
const component = jsx.split("function AutocompleteSuggestion(")[1]?.split("export default function ShoppingListPage(")[0];
assert.ok(component, "compact suggestion component present");
assert.match(component, /gridTemplateColumns: "minmax\(0, 1fr\) auto"/);
assert.match(component, /minHeight: 52/);
assert.match(component, /width: "100%"/);
assert.match(component, /boxShadow: "none"/);
assert.match(component, /Prix relevé le/);
assert.match(component, /data-shopping-suggestion-source/);
assert.match(component, /onClick=\{onSelect\}/);
assert.doesNotMatch(component, /rgba\(35,211,214,\.12\)/);
for (const [section, group] of [["history", "historical"], ["observed", "observed"], ["retail", "retail"], ["catalog", "catalog"]]) {
  const regex = new RegExp(`data-shopping-suggestion-group="${section}"[\\s\\S]*?display: "grid", gap: 0,[\\s\\S]*?suggestions\\.${group}\\.map`);
  assert.match(jsx, regex, `${group} suggestions should form compact list rows`);
}
console.log("OK: all shopping suggestion groups use compact accessible list rows.");
