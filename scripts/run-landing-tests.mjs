import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = path => readFileSync(join(root, path), "utf8")

const publicHome = read("src/pages/PublicHomePage.jsx")
const header = read("src/components/landing/LandingHeader.jsx")
const content = read("src/components/landing/landingContent.js")
const pillar = read("src/components/landing/LandingPillar.jsx")
const productDemo = read("src/components/landing/HeroProductDemo.jsx")
const productPhone = read("src/components/landing/ProductPhoneMockup.jsx")
const referenceImages = read("src/components/landing/landingReferenceImages.js")
const advisor = read("src/components/landing/AdvisorAndLocalDeals.jsx")
const css = read("src/styles/landing-public.css")
const plans = read("src/config/plans.js")
const index = read("index.html")
const androidReferenceViewports = [[360, 800], [360, 780], [393, 873], [412, 915], [430, 932], [320, 720]]
const referenceAssets = [
  "public/landing-reference/dashboard-mobile.png",
  "public/landing-reference/conseiller-mobile.png",
  "public/landing-reference/bons-plans-mobile.png",
  "public/landing-reference/bons-plans-loisirs-mobile.png",
]

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length
}

assert.equal(countMatches(publicHome, /<h1\b/g), 1, "landing must keep a single H1")
assert.ok(countMatches(publicHome, /<section\b/g) <= 4, "landing must keep a short section structure")
assert.match(publicHome, /landing-public\.css/, "public landing must use its dedicated visual layer")
assert.match(content, /Votre budget, vos courses et vos aides\. Au même endroit\./, "global hero title missing")
assert.match(content, /préparez vos courses/, "hero must mention course preparation")
assert.match(publicHome, /href=\{isAuthenticated \? "\/app" : "\/register"\}/, "hero register CTA missing")
assert.match(publicHome, /href="#fonctionnalites"/, "hero features CTA missing")
assert.match(publicHome, /drapeau-reunionnais\.png/, "stable Reunion visual mark missing")
assert.doesNotMatch(publicHome + content, /🇷🇪|sans carte bancaire/i, "unstable flag or old reassurance must not return")
assert.doesNotMatch(publicHome, /Un budget plus lisible|Trois gestes simples|Cas d'usage|demo-scanner/, "old repetitive sections must not remain")

assert.match(header, /navItems/, "features nav missing")
assert.match(content, /Bons plans locaux|Bons plans près de chez vous|Bons plans/, "local deals content missing")
assert.match(header, /href="\/login"/, "login CTA missing")
assert.match(header + content, /Créer mon compte/, "create account CTA missing")
assert.match(header, /aria-expanded=\{isMenuOpen\}/, "mobile menu must expose aria-expanded")
assert.match(header, /key === "Escape"/, "mobile menu must close on Escape")

for (const pillarTitle of ["Mon budget", "Mes courses", "Mes aides & démarches", "Mon Conseiller BudgetKazPéi"]) {
  assert.match(content, new RegExp(pillarTitle.replace(/[&]/g, "\\&")), `pillar missing: ${pillarTitle}`)
}
for (const visual of ["budget", "courses", "aides", "advisor"]) {
  assert.match(content, new RegExp(`visual: "${visual}"`), `pillar visual missing: ${visual}`)
}
assert.match(pillar, /ProductPhoneMockup/, "features must show product smartphones")
assert.match(pillar, /CoursesProductScreen|AidesProductScreen/, "features must show real product fragments")
assert.match(pillar, /conseiller-mobile\.png|LANDING_REFERENCE_IMAGES\.advisor/, "advisor feature must use real reference")

assert.match(productDemo, /ProductSignal/, "hero product signals missing")
assert.match(productDemo, /ProductListCard/, "shareable shopping list scene missing")
assert.match(productDemo, /ProductPhoneMockup/, "hero must use the shared smartphone mockup")
assert.match(productDemo, /dashboard-mobile\.png|LANDING_REFERENCE_IMAGES\.dashboard/, "real dashboard reference image missing")
assert.match(productDemo, /aria-label=\{copy\.ariaLabel\}/, "hero product scene must be labelled")
assert.match(productPhone, /product-phone__back|product-phone__edge|product-phone__front/, "phone must expose material layers")
assert.match(css, /transform-style:\s*preserve-3d/, "phone must use preserve-3d layers")
assert.match(css, /perspective:\s*1100px/, "phone scene perspective missing")
assert.match(css, /rotateY\(-13deg\)/, "desktop phone perspective missing")
assert.match(css, /rotateY\(-12deg\)/, "mobile phone perspective missing")
assert.match(css, /translate3d\(/, "phone thickness depth missing")
assert.match(css, /product-phone__back/, "phone back layer styling missing")
assert.match(css, /hero-product-demo__contact-shadow/, "phone contact shadow missing")
assert.match(css, /product-list-card/, "shopping list card styling missing")

assert.match(advisor, /ProductPhoneMockup/, "deals must use a product smartphone")
assert.match(advisor, /bons-plans-mobile\.png|LANDING_REFERENCE_IMAGES\.deals/, "real deals reference image missing")
assert.match(advisor, /bons-plans-loisirs-mobile\.png|LANDING_REFERENCE_IMAGES\.leisure/, "real leisure reference image missing")
assert.match(content, /BudgetKazPéi./, "advisor product context missing")
assert.match(content, /Offres autour de vous/, "neutral deal preview missing")
assert.match(content, /Événements et loisirs/, "leisure preview missing")
assert.match(content, /Retrouvez les offres disponibles autour de votre commune/, "deal disclosure missing")
assert.match(content, /Exposition Les Engagés du sucre/, "real local event content missing")
assert.match(content, /24 événements à venir/, "real local event count missing")
assert.match(content, /Sorties et bons plans famille|Sorti ek Bon Plan famiy/, "family preview missing")
assert.match(content, /LANDING_DEMO_DATA/, "landing demo data must be centralized")
assert.match(content, /dashboard-mobile\.png/, "real dashboard asset must be configured")
assert.match(content, /bons-plans-mobile\.png|bons-plans-loisirs-mobile\.png/, "real local-deals assets must be configured")
assert.match(referenceImages, /dashboard-mobile\.png/)
for (const asset of referenceAssets) assert.ok(existsSync(join(root, asset)), `reference asset missing: ${asset}`)
for (const value of ["3 450 €", "2 180 €", "1 270 €", "742 €", "186,40 €", "+118 €", "Partager la liste", "WhatsApp"]) {
  assert.match(content + productDemo + pillar, new RegExp(value.replace(/[+€]/g, "\\$&")), `coherent demo value missing: ${value}`)
}
assert.match(content, /NEUTRAL_KR_DEALS/, "créole deal previews must use the neutral content override")
assert.match(advisor, /id="bons-plans"/, "Bons plans anchor missing")
assert.match(publicHome, /contact\.budgetkazpei@gmail\.com/, "professional contact must remain available")
assert.doesNotMatch(publicHome + content, /Chez\s+[A-Z]|SARL\s+[A-Z]|partenaire officiel/, "landing must not invent partners")

assert.match(plans, /publicScanLabel/, "public scan label missing")
assert.match(plans, /commercialScanLimit/, "commercial quota missing")
assert.match(plans, /operationalScanLimit/, "operational quota missing")
assert.match(plans, /isUnlimitedForUser/, "user unlimited flag missing")
assert.match(plans, /isSafetyLimited/, "safety flag missing")
assert.match(plans, /quota gratuit reste à valider/, "free quota validation comment missing")
assert.match(content + plans, /Accès découverte au scanner/, "free public scanner wording missing")
assert.doesNotMatch(content, /\b(?:1|5|10)\s+scans?\b[\s\S]{0,80}Gratuit|Gratuit[\s\S]{0,80}\b(?:1|5|10)\s+scans?\b/i, "free public plan must not show a numeric scan quota")
assert.match(content + plans, /10 scans par mois/, "Premium public quota missing")
assert.match(content + plans, /Scans illimités/, "Premium+ public unlimited wording missing")

assert.match(css, /@media \(max-width: 1024px\)|@media \(max-width: 1080px\)/, "tablet responsive breakpoint missing")
assert.match(css, /@media \(max-width: 640px\)/, "mobile responsive breakpoint missing")
assert.match(css, /@media \(max-width: 370px\)/, "small mobile responsive breakpoint missing")
assert.match(css, /prefers-reduced-motion: reduce/, "reduced motion support missing")
assert.match(css, /min-height: 44px/, "44px touch target rule missing")
assert.match(css, /min-height: 48px/, "primary Android CTA must target 48px")
assert.match(css, /safe-area-inset-top|safe-area-inset-bottom/, "Android safe-area support missing")
assert.doesNotMatch(css, /\.landing-page \.landing-hero\s*\{[^}]*height:\s*100vh/, "mobile hero must not be tied to a rigid 100vh")
assert.doesNotMatch(css, /device-pixel-ratio/, "layout must not depend on device pixel density")
assert.match(css, /overflow-x: clip/, "landing must prevent horizontal overflow")
assert.match(css, /scroll-snap-type:\s*x\smandatory/, "mobile pillars must use native scroll snap")
assert.doesNotMatch(css, /backdrop-filter:\s*blur/i, "public landing must not use backdrop blur")
assert.deepEqual(androidReferenceViewports, [[360, 800], [360, 780], [393, 873], [412, 915], [430, 932], [320, 720]], "Android reference viewports must remain explicit")

assert.match(index, /BudgetKazPéi — Budget, courses, aides et bons plans à La Réunion/, "landing title missing")
assert.match(index, /Suivez votre budget, comprenez vos courses/, "landing meta description missing")
assert.match(index, /og:title/, "Open Graph title missing")

console.log("Landing redesign tests passed.")
