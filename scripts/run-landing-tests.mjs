import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = path => readFileSync(join(root, path), "utf8")

const publicHome = read("src/pages/PublicHomePage.jsx")
const header = read("src/components/landing/LandingHeader.jsx")
const content = read("src/components/landing/landingContent.js")
const plans = read("src/config/plans.js")
const faq = read("src/components/landing/LandingFAQ.jsx")
const pricing = read("src/components/landing/PricingSection.jsx")
const productDemo = read("src/components/landing/ScanJourney.jsx")
const css = read("src/styles/landing.css")
const index = read("index.html")

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length
}

assert.equal(countMatches(publicHome, /<h1\b/g), 1, "landing must keep a single H1")
assert.ok(countMatches(publicHome, /<section\b/g) <= 6, "landing must keep six large visible sections maximum")
assert.match(publicHome, /Votre budget, vos courses et vos aides\. Au même endroit\./, "global hero title missing")
assert.match(publicHome, /href=\{isAuthenticated \? "\/app" : "\/register"\}/, "hero register CTA missing")
assert.match(publicHome, /href="#fonctionnalites"/, "hero features CTA missing")
assert.doesNotMatch(publicHome + content, /sans carte bancaire/i, "landing must not mention no-card reassurance")
assert.doesNotMatch(publicHome, /Un budget plus lisible|Trois gestes simples|Cas d'usage|demo-scanner/, "old repetitive sections must not remain")

assert.match(header, /Fonctionnalités|navItems/, "features nav missing")
assert.match(content, /Bons plans/, "Bons plans nav/content missing")
assert.match(header, /href="\/login"/, "login CTA missing")
assert.match(header, /Créer mon compte/, "create account CTA missing")
assert.match(header, /aria-expanded=\{isMenuOpen\}/, "mobile menu must expose aria-expanded")
assert.match(header, /key === "Escape"/, "mobile menu must close on Escape")

for (const pillar of [
  "Mon budget en clair",
  "Mes courses mieux comprises",
  "Mes aides et mes démarches",
  "Mes bons plans locaux",
]) {
  assert.match(content, new RegExp(pillar), `pillar missing: ${pillar}`)
}

assert.match(productDemo, /role="tablist"/, "product demo tabs missing")
assert.match(productDemo, /aria-selected=\{selected\}/, "product demo tabs must expose aria-selected")
assert.match(productDemo, /aria-controls=\{`product-panel-/, "product demo tabs must expose aria-controls")
assert.match(content, /Un ticket difficile peut demander une nouvelle photo ou une correction/, "ticket caution missing")
assert.match(content, /organisme officiel/, "official organism caution missing")

assert.match(publicHome, /id="bons-plans"/, "Bons plans section missing")
assert.match(content, /Restaurants et snacks/, "local deal categories missing")
assert.match(content, /Filtre par ville/, "city filter principle missing")
assert.match(content, /Offres sponsorisées identifiées/, "sponsored offer caution missing")
assert.match(publicHome, /Nous contacter/, "professional CTA missing")
assert.match(publicHome, /contact\.budgetkazpei@gmail\.com/, "professional CTA must reuse existing public contact")
assert.doesNotMatch(publicHome + content, /Chez\s+[A-Z]|SARL\s+[A-Z]|prix publicitaire|partenaire officiel/, "landing must not invent partners or ad prices")

assert.match(plans, /publicScanLabel/, "public scan label missing")
assert.match(plans, /commercialScanLimit/, "commercial quota missing")
assert.match(plans, /operationalScanLimit/, "operational quota missing")
assert.match(plans, /isUnlimitedForUser/, "user unlimited flag missing")
assert.match(plans, /isSafetyLimited/, "safety flag missing")
assert.match(plans, /quota gratuit reste à valider/, "free quota validation comment missing")

assert.match(plans, /Accès découverte au scanner/, "free public scanner wording missing")
assert.doesNotMatch(content, /\b(?:1|5|10)\s+scans?\b[\s\S]{0,80}Gratuit|Gratuit[\s\S]{0,80}\b(?:1|5|10)\s+scans?\b/i, "free public plan must not show a numeric scan quota")
assert.match(content + plans, /10 scans par mois/, "Premium public quota missing")
assert.match(content + plans, /Scans illimités/, "Premium+ public unlimited wording missing")
assert.doesNotMatch(content + publicHome + pricing, /\b50\b|50 sur 50/, "Premium+ safety limit must not be public")
assert.doesNotMatch(content + pricing, /Disponible/, "repeated Disponible badges must be removed")
assert.match(pricing, /Bientôt/, "future features must be marked")

const faqBlock = content.match(/export const faqs = \[[\s\S]*?\n\]/)?.[0] || ""
assert.equal(countMatches(faqBlock, /\[\s*\n?\s*"/g), 5, "FAQ must contain five questions")
assert.match(faq, /aria-expanded=\{isOpen\}/, "FAQ must expose aria-expanded")
assert.match(faq, /aria-controls=\{panelId\}/, "FAQ must expose aria-controls")
assert.match(faq, /role="region"/, "FAQ answer panel must be a labelled region")

assert.match(css, /html\[data-theme="dark"\] \.landing-page/, "dark theme styles missing")
assert.match(css, /@media \(max-width: 1024px\)/, "1024 responsive breakpoint missing")
assert.match(css, /@media \(max-width: 640px\)/, "mobile responsive breakpoint missing")
assert.match(css, /@media \(max-width: 360px\)/, "small mobile responsive breakpoint missing")
assert.match(css, /prefers-reduced-motion: reduce/, "reduced motion support missing")
assert.match(css, /min-height: 44px/, "44px touch target rule missing")
assert.match(css, /overflow-x: hidden/, "landing must prevent horizontal overflow")
assert.doesNotMatch(css, /blur\(18px\)|backdrop-filter:\s*blur/i, "landing must not reintroduce heavy blur")

assert.match(index, /BudgetKazPei — Budget, courses, aides et bons plans à La Réunion/, "landing title missing")
assert.match(index, /Suivez votre budget, comprenez vos courses/, "landing meta description missing")
assert.match(index, /og:title/, "Open Graph title missing")

console.log("Landing redesign tests passed.")
