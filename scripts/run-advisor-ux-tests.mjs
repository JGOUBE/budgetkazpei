import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8")
import { normalizeAdvisorAnswerTypography, tokenizeAdvisorAnswerLine } from "../src/services/advisorAnswerTypography.js"

const chat = await read("src/components/conseiller/AssistantConseiller.jsx")
const page = await read("src/components/conseiller/ConseillerPage.jsx")
const css = await read("src/components/conseiller/conseillerChat.css")
const refinements = await read("src/styles/budgetkazpei-refinement.css")
const homepage = await read("src/pages/HomePage.jsx")
const nav = await read("src/services/appSectionNavigation.js")
const deals = await read("src/pages/GoodDealsPage.jsx")
const shopping = await read("src/pages/ShoppingListPage.jsx")

assert.match(chat, /className="bkp-advisor-onboarding"/)
assert.match(chat, /rows=\{4\}/, "Composer must show at least four writing lines")
assert.match(chat, /minimumHeight = window\.matchMedia/, "Mobile textarea minimum should be responsive")
assert.match(chat, /\[question\]\)/, "Textarea should resize after controlled text updates")
assert.match(css, /min-height: 112px/, "Mobile composer should remain multi-line")
assert.match(css, /max-height: 200px/, "Long messages should not consume all conversation space")
assert.match(chat, /className="bkp-advisor-topic-picker"/)
assert.match(chat, /aria-expanded={showTopicPicker}/)
assert.match(chat, /setShowTopicPicker\(false\)/)
assert.match(chat, /className="bkp-advisor-starters"/)
assert.match(chat, /bkp-advisor-starter--\$\{mode\.mode\}/)
assert.match(chat, /className="bkp-advisor-quick-details"/)
assert.match(chat, /className="bkp-advisor-advanced"/)
assert.match(chat, /className="bkp-advisor-prompt-ready"/)
assert.match(chat, /aria-label=\{isKreol \? "Out question pou le conseiller"/)
assert.match(chat, /history\.length === 0 && !pendingMessage && !errorMessage\) return/)
assert.equal((chat.match(/quickQuestions\.map/g) || []).length,1,"Do not duplicate quick questions above the input")
assert.equal((chat.match(/advancedModes\.map/g) || []).length,1,"Show optional tools once")
assert.ok(chat.indexOf("bkp-advisor-starters") < chat.indexOf("{chronologicalHistory.map(item => ("),"Starters must be in the scrollable discussion, not over the composer")
assert.ok(chat.indexOf("bkp-advisor-composer") > chat.indexOf("{chronologicalHistory.map(item => ("),"Input stays outside the scrollable conversation")
assert.match(page,/getAdvisorAccess/)
assert.match(page,/access\.canUseAdvisor/)
assert.match(page,/quickQuestions=\{modes\.quickQuestions\}/)
assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.bkp-advisor-starters \{ grid-template-columns: 1fr/)
assert.match(css, /\.bkp-advisor-chat \{ height: calc\(100dvh - 198px\); min-height: 385px;/)
assert.match(refinements,/bkp-advisor-starter--trouver_aide/)
assert.match(refinements,/bkp-advisor-starter--comprendre_courrier/)
assert.match(refinements,/bkp-advisor-chat,[\s\S]*box-shadow: none !important/)
assert.match(deals,/includeRetailPromotions: false/)
assert.match(deals,/normalizeCategory\(deal\.category\) === "shopping"\) return false/)
assert.match(nav,/promotions: \{ section: "shopping", shoppingTab: "savings" \}/)
assert.match(shopping,/onNavigate\(createAppSectionTarget\("shopping", \{ shoppingTab: "savings" \}\)\)/)
// The advisor inherits the homepage's current 2026 card palette, rather than
// going back to low-contrast, nearly white surfaces on mobile.
const advisorColors = refinements.slice(refinements.indexOf("/* Conseiller 2026"))
assert.ok(advisorColors.length > 100, "The final advisor visual override is required")
for (const shade of ["#C8E4AA", "#C9D9F0", "#CFD6DD", "#CCE8E0"]) {
  assert.ok(homepage.includes(shade), `Missing home palette token ${shade}`)
  assert.ok(advisorColors.includes(shade), `Advisor should reuse home palette token ${shade}`)
}
assert.match(advisorColors, /bkp-advisor-bubble--assistant[\s\S]*#E9EDE3/)
assert.match(advisorColors, /bkp-advisor-bubble--user[\s\S]*#CCE8E0/)
assert.match(advisorColors, /bkp-advisor-composer[\s\S]*#E7F1E9/)
assert.match(advisorColors, /bkp-advisor-starter--trouver_aide[\s\S]*#C9D9F0/)
assert.match(advisorColors, /bkp-advisor-starter--comprendre_courrier[\s\S]*#CFD6DD/)
assert.match(advisorColors, /box-shadow: none !important/)


// Reproduce the exact colon/list issue shown in Android screenshots.
const screenshots = [
  "À Saint-Leu, plusieurs options s'offrent à vous :\\n\\n1.\\n**K’DI LE CŒUR**\\n: C'est une épicerie sociale et solidaire. Plus d'informations : [K’DI LE CŒUR](https://andes-france.com/structure/kdi-le-coeur/).",
  "2.\\n**Croix-Rouge sur Roues**\\n: Cet organisme propose une distribution itinérante de colis alimentaires.",
  "1. **CCAS** : Prenez contact avec votre travailleur social.",
  "3.\\nCCAS de Saint-Leu\\n: Informez-vous sur les permanences.",
  "1.\\n**Épicerie solidaire**\\n: Mi pé demande in aide.",
]
for (const raw of screenshots) {
  const output = normalizeAdvisorAnswerTypography(raw.replaceAll("\\n", "\n"))
  assert.doesNotMatch(output, /(?:^|\\n)\\s*:/, "No colon may appear detached at start of a line")
  assert.doesNotMatch(output, /(?:^|\\n)\\s*\\d+[.)]\\s*(?:\\n|$)/, "List numbers should stay with their headings")
  assert.doesNotMatch(output, /\\*\\*[^*]+\\*\\*\\s*(?::|\\n\\s*:)/, "Association heading must not have an orphan colon")
}
const sample = normalizeAdvisorAnswerTypography(screenshots[0].replaceAll("\\n", "\n"))
assert.match(sample, /1\\. \\*\\*K’DI LE CŒUR\\*\\* — C'est une épicerie/)
assert.match(sample, /\\[K’DI LE CŒUR\\]\\(https:\\/\\/andes-france\\.com\\/structure\\/kdi-le-coeur\\/\\)/)
const segments = tokenizeAdvisorAnswerLine(
  "**Croix-Rouge sur Roues** — Voir [la source officielle](https://reunion.deets.gouv.fr/L-aide-alimentaire)."
)
assert.ok(segments.some(part => part.kind === "strong" && part.value === "Croix-Rouge sur Roues"))
assert.ok(segments.some(part => part.kind === "link" && part.label === "la source officielle"))
assert.equal(tokenizeAdvisorAnswerLine("[mauvais lien](javascript:alert(1))").some(part => part.kind === "link"), false)
assert.match(chat, /normalizeAdvisorAnswerTypography\\(value\\)/, "All displayed advisor replies must normalize typography")
assert.match(chat, /tokenizeAdvisorAnswerLine\\(line\\)/, "Links and emphasis must render safely")
console.log("OK: corrected assistant response typography, attached list numbers, no orphan colons and HTTPS links.")

console.log("OK: Conseiller compact and accessible; price collectors stay separate from local bons plans.")
