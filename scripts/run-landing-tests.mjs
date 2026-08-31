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
const main = read("src/main.jsx")
const globalCss = read("src/index.css")
const androidReferenceViewports = [[305, 600], [350, 600], [393, 873], [412, 915], [430, 932]]
const referenceAssets = [
  "public/landing-reference/hero-dashboard-phone-master.png",
  "public/landing-reference/advisor-phone-master.png",
]

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length
}

assert.equal(countMatches(publicHome, /<h1\b/g), 1, "landing must keep a single H1")
assert.ok(countMatches(publicHome, /<section\b/g) <= 4, "landing must keep a short section structure")
assert.match(publicHome, /landing-public\.css/, "public landing must use its dedicated visual layer")
assert.match(main, /isPublicLandingPath/, "public routes need a first-render light bootstrap")
assert.match(main, /--bkp-page-bg.*#fffdf9/, "public bootstrap must set a light page background")
assert.match(globalCss, /--bkp-page-bg, #fffdf9/, "global fallback must not start dark")
assert.match(css, /color-scheme:\s*light/, "landing must force light color scheme")
assert.match(css, /data-theme="dark"\]:has\(\.landing-page\)/, "dark app theme must not contaminate landing")
assert.match(content, /Votre budget, vos courses et vos aides\. Au même endroit\./, "global hero title missing")
assert.match(content, /préparez vos courses/, "hero must mention course preparation")
assert.match(content, /Votre quotidien, simplifié/, "commercial feature transition missing")
assert.match(content, /Tout ce qu’il vous faut, au même endroit\./, "feature title missing")
assert.doesNotMatch(content, /Les écrans BudgetKazPéi|Vos fonctionnalités, en vrai\./, "technical feature heading must not return")
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
assert.doesNotMatch(pillar, /ProductPhoneMockup/, "feature pillars must remain phone-free")
assert.match(pillar, /CoursesFragment|AidesFragment|pillar-fragment/, "features must show real product fragments")

assert.match(productDemo, /ProductListCard/, "shareable shopping list scene missing")
assert.match(productDemo, /LANDING_REFERENCE_IMAGES\.heroPhone/, "hero must use the approved dashboard phone asset")
assert.match(referenceImages, /hero-dashboard-phone-master\.png/, "approved dashboard phone asset missing")
assert.match(productDemo, /aria-label=\{copy\.ariaLabel\}/, "hero product scene must be labelled")
assert.match(productPhone, /product-phone__back|product-phone__edge|product-phone__front/, "phone must expose material layers")
assert.match(productPhone, /premiumAsset|product-phone__asset-screen/, "phone mockup must support a real premium asset")
assert.match(css, /transform-style:\s*preserve-3d/, "phone must use preserve-3d layers")
assert.match(css, /perspective:\s*1100px/, "phone scene perspective missing")
assert.match(css, /rotateY\(-13deg\)/, "desktop phone perspective missing")
assert.match(css, /rotateY\(-12deg\)/, "mobile phone perspective missing")
assert.match(css, /translate3d\(/, "phone thickness depth missing")
assert.match(css, /product-phone__back/, "phone back layer styling missing")
assert.match(css, /hero-product-demo__contact-shadow/, "phone contact shadow missing")
assert.match(css, /product-list-card/, "shopping list card styling missing")

assert.match(advisor, /advisorPhone/, "advisor must use the approved second phone asset")
assert.doesNotMatch(advisor, /ProductPhoneMockup/, "deals must not add a third smartphone")
assert.doesNotMatch(advisor + content + referenceImages, /bons-plans-mobile\.png|bons-plans-loisirs-mobile\.png|conseiller-mobile\.png|dashboard-mobile\.png/, "obsolete landing screenshots must not be configured")
assert.equal(countMatches(advisor, /<img\b/g), 1, "advisor must be the only local-story phone image")
assert.doesNotMatch(advisor, /referenceImage|familyReferenceImage/, "local marketing fragments must not use screenshots")
assert.match(content, /BudgetKazPéi./, "advisor product context missing")
assert.match(content, /Les promotions près de chez vous\./, "promotion section title missing")
assert.match(content, /Retrouvez les promotions en cours et les catalogues disponibles autour de votre commune\./, "promotion disclosure missing")
assert.match(content, /Des offres utiles autour de vous\./, "local offers section missing")
assert.match(content, /Des idées pour profiter de La Réunion en famille\./, "family section missing")
assert.match(content, /Exposition Les Engagés du sucre/, "real local event content missing")
assert.match(content, /value: "24", label: "Événements à venir"/, "real local event count missing")
assert.match(content, /value: "80", label: "Activités disponibles toute l’année"/, "real local activity count missing")
assert.match(content, /Quelles aides existent pour les activités sportives pour mes enfants/, "validated advisor question missing")
assert.match(content, /BudgetKazPéi peut vous aider à repérer les aides/, "advisor answer missing")
assert.match(advisor, /conversation\.user/, "advisor scene must show the validated question")
assert.doesNotMatch(advisor + content, /Voir les catégories concernées|Cette réponse vous a-t-elle été utile|ChatGPT/i, "advisor must remain free of fake actions and third-party branding")
assert.match(productDemo, /whatsapp-mark\.svg/, "hero shopping list must use the WhatsApp mark")
assert.doesNotMatch(advisor, /WhatsApp/i, "advisor must not use WhatsApp branding")
assert.match(content, /LANDING_DEMO_DATA/, "landing demo data must be centralized")
assert.match(referenceImages, /hero-dashboard-phone-master\.png/)
assert.equal(countMatches(referenceImages, /landing-reference\//g), 2, "landing must configure exactly two phone assets")
for (const asset of referenceAssets) assert.ok(existsSync(join(root, asset)), `reference asset missing: ${asset}`)
for (const value of ["3 450 €", "2 180 €", "1 270 €", "742 €", "186,40 €", "+118 €", "Partager la liste", "WhatsApp"]) {
  assert.match(content + productDemo + pillar, new RegExp(value.replace(/[+€]/g, "\\$&")), `coherent demo value missing: ${value}`)
}
assert.match(content, /Bann promosyon près koté ou/, "créole promotion content missing")
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
assert.match(css, /landing-showcase-track\s*\{[\s\S]*?scroll-snap-type:\s*none/, "mobile product showcase must remain a vertical editorial flow")
assert.match(publicHome, /features\.pillars\.slice\(0, 3\)/, "daily-life section must show Budget, Courses and Aides fragments")
assert.doesNotMatch(css, /backdrop-filter:\s*blur/i, "public landing must not use backdrop blur")
assert.deepEqual(androidReferenceViewports, [[305, 600], [350, 600], [393, 873], [412, 915], [430, 932]], "Android reference viewports must remain explicit")

assert.match(index, /BudgetKazPéi — Budget, courses, aides et bons plans à La Réunion/, "landing title missing")
assert.match(index, /Suivez votre budget, comprenez vos courses/, "landing meta description missing")
assert.match(index, /og:title/, "Open Graph title missing")

console.log("Landing redesign tests passed.")
