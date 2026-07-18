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
const css = read("src/styles/landing.css")
const index = read("index.html")

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length
}

assert.equal(countMatches(publicHome, /<h1\b/g), 1, "landing must keep a single H1")
assert.match(publicHome, /Vos tickets deviennent des conseils utiles\./, "hero promise missing")
assert.match(publicHome, /id="benefits-title"/, "benefits section heading id missing")
assert.match(publicHome, /id="use-cases-title"/, "use cases section heading id missing")
assert.match(publicHome, /href=\{isAuthenticated \? "\/app" : "\/register"\}/, "hero connected/non-connected CTA missing")
assert.match(publicHome, /href="#demo-scanner"/, "scanner anchor missing")

assert.match(header, /href="\/login"/, "login CTA missing")
assert.match(header, /primaryHref = isAuthenticated \? "\/app" : "\/register"/, "header auth-aware CTA missing")
assert.match(header, /aria-expanded=\{isMenuOpen\}/, "mobile menu must expose aria-expanded")
assert.match(header, /key === "Escape"/, "mobile menu must close on Escape")

assert.match(content, /PUBLIC_PLAN_CARDS/, "landing pricing must use central public plan cards")
assert.match(plans, /2,99 €\/mois/, "Premium price changed")
assert.match(plans, /4,99 €\/mois/, "Premium+ price changed")
assert.match(plans, /Bientôt disponible/, "future features must be labelled")
assert.doesNotMatch(content, /\b(?:10|30|100)\s+(?:scans?|analyses?|tickets?)/i, "public landing must not lead with numeric quotas")
assert.doesNotMatch(content, /Le Tampon|Saint-Leu|Saint-Denis|testimonials/i, "fake testimonials must not remain")
assert.match(content, /tous les magasins \?"/, "honest Courses intelligentes FAQ missing")
assert.match(content, /organisme officiel/, "official organism caution missing")

assert.match(faq, /aria-expanded=\{isOpen\}/, "FAQ must expose aria-expanded")
assert.match(faq, /aria-controls=\{panelId\}/, "FAQ must expose aria-controls")
assert.match(faq, /role="region"/, "FAQ answer panel must be a labelled region")

assert.match(pricing, /pricing-card--featured/, "pricing cards must be visually differentiated")
assert.match(publicHome, /href="\/privacy"|href=\{.*"\/privacy"/, "privacy link missing")
assert.match(publicHome, /href="\/terms"|href=\{.*"\/terms"/, "terms link missing")
assert.match(publicHome, /href="\/suppression-compte"|href=\{.*"\/suppression-compte"/, "account deletion link missing")

assert.match(css, /html\[data-theme="dark"\] \.landing-page/, "dark theme styles missing")
assert.match(css, /@media \(max-width: 1024px\)/, "1024 responsive breakpoint missing")
assert.match(css, /@media \(max-width: 640px\)/, "mobile responsive breakpoint missing")
assert.match(css, /@media \(max-width: 360px\)/, "small mobile responsive breakpoint missing")
assert.match(css, /prefers-reduced-motion: reduce/, "reduced motion support missing")
assert.match(css, /min-height: 44px/, "44px touch target rule missing")

assert.match(index, /BudgetKazPei — Budget, tickets et aides à La Réunion/, "landing title missing")
assert.match(index, /Scannez vos tickets, suivez votre budget/, "landing meta description missing")
assert.match(index, /og:title/, "Open Graph title missing")

console.log("Landing redesign tests passed.")
