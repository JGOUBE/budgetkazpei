import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { normalizeAdvisorAnswerFormatting } from "../src/services/advisorAnswerFormatting.js"

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8")
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

// Regression: Android screenshots from 22/11 showed detached numbering and
// punctuation at the beginning of an association's description.
const malformed = [
  "À Saint-Leu, plusieurs options s'offrent à vous :",
  "",
  "1.",
  "**K’DI LE CŒUR**",
  ": C'est une épicerie sociale et solidaire. Une prescription est nécessaire.",
  "",
  "2.",
  "",
  "**Croix-Rouge sur Roues**",
  "",
  ": Cet organisme propose une distribution itinérante.",
  "",
  "Pour en savoir plus : [Croix-Rouge sur Roues](https://reunion.deets.gouv.fr/L-aide-alimentaire).",
].join("\n")
const formatted = normalizeAdvisorAnswerFormatting(malformed)
assert.ok(formatted.includes("1. **K’DI LE CŒUR** — C'est une épicerie sociale"))
assert.ok(formatted.includes("2. **Croix-Rouge sur Roues** — Cet organisme"))
assert.doesNotMatch(formatted, /^\s*:/m, "Description must not start with a colon")
assert.doesNotMatch(formatted, /^\d+[.)]\s*$/m, "List numbers must stay with headings")
assert.match(formatted, /\[Croix-Rouge sur Roues\]\(https:\/\/reunion\.deets\.gouv\.fr/)
assert.equal(
  normalizeAdvisorAnswerFormatting("Mon budget :\n**Conseil**\n: Mi peut mett in pé larzan de côté."),
  "Mon budget :\n**Conseil** — Mi peut mett in pé larzan de côté."
)
assert.equal(normalizeAdvisorAnswerFormatting("1. Dépenser moins\n2. Vérifier mes achats"),
  "1. Dépenser moins\n2. Vérifier mes achats", "Healthy numbered answers must stay intact")
assert.match(chat, /normalizeAdvisorAnswerFormatting\(value\)/)
assert.match(chat, /target="_blank" rel="noopener noreferrer"/)
assert.match(css, /bkp-advisor-bubble\.bkp-advisor-answer strong\s*\{\s*display: inline/)

console.log("OK: Conseiller compact and accessible; price collectors stay separate from local bons plans.")
