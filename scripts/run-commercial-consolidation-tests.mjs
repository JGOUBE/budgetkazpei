import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  PLAN_FEATURE_STATUS,
  PLAN_IDS,
  PUBLIC_PLAN_CARDS,
} from "../src/config/plans.js"
import {
  DISCOVER_ROUTE,
  resolveAuthRoute,
} from "../src/services/authNavigation.js"

const root = process.cwd()
const read = path => readFileSync(join(root, path), "utf8")

const landingContent = read("src/components/landing/landingContent.js")
const publicHome = read("src/pages/PublicHomePage.jsx")
const discover = read("src/pages/PremiumLandingPage.jsx")
const pricing = read("src/components/landing/PricingSection.jsx")
const premiumPage = read("src/components/premium/PremiumPage.jsx")
const advisor = read("src/components/conseiller/ConseillerPage.jsx")
const aides = read("src/components/aides/AidesPage.jsx")
const statistics = read("src/pages/StatisticsPage.jsx")
const app = read("src/App.jsx")

const activeCommercialText = [
  landingContent,
  publicHome,
  discover,
  pricing,
  premiumPage,
  advisor,
  aides,
].join("\n")

for (const obsolete of [
  /Assistant standard/i,
  /Conseiller renforcé/i,
  /Asistan standar/i,
  /Konseyé ranforsé/i,
  /(?:5|50|250)\s+(?:échanges|echanges)/i,
]) {
  assert.doesNotMatch(activeCommercialText, obsolete, `obsolete commercial wording found: ${obsolete}`)
}

const free = PUBLIC_PLAN_CARDS.find(plan => plan.id === PLAN_IDS.free)
const premium = PUBLIC_PLAN_CARDS.find(plan => plan.id === PLAN_IDS.premium)
const premiumPlus = PUBLIC_PLAN_CARDS.find(plan => plan.id === PLAN_IDS.premiumPlus)

assert.equal(PUBLIC_PLAN_CARDS.length, 3)
assert.equal(free.items.some(item => item.status === PLAN_FEATURE_STATUS.locked && /Conseiller BudgetKazPéi/.test(item.text)), true)
assert.equal(free.items.some(item => item.status === PLAN_FEATURE_STATUS.included && /Conseiller BudgetKazPéi/.test(item.text)), false)
assert.equal(premium.items.some(item => /Conseiller BudgetKazPéi — utilisation limitée/.test(item.text)), true)
assert.equal(premiumPlus.items.some(item => /Conseiller BudgetKazPéi\+ — utilisation illimitée/.test(item.text)), true)
assert.equal(premiumPlus.items.some(item => /Dossiers, courriers, emails, relances et rendez-vous/.test(item.text)), true)
assert.equal(premiumPlus.items.some(item => /refus et préparation des recours/.test(item.text)), true)

assert.deepEqual(resolveAuthRoute({ pathname: DISCOVER_ROUTE }), { type: "render", page: "premium" })
assert.deepEqual(resolveAuthRoute({ pathname: DISCOVER_ROUTE, isAuthenticated: true }), { type: "render", page: "premium" })
assert.match(app, /route\.page === "premium"/)
assert.match(discover, /sharedContent\.pricing\.plans\.map/)
assert.match(publicHome, /<AdvisorSection content=\{content\.advisor\}/)
assert.match(publicHome, /href="\/decouvrir"/)
assert.match(discover, /!isAuthenticated[\s\S]{0,100}"\/register"/)
assert.match(discover, /STRIPE_LINKS\.premiumMonthly/)

assert.match(advisor, /Découvrir Premium/)
assert.match(advisor, /if \(!access\.canUseAdvisor\)/)
assert.doesNotMatch(advisor.match(/function LockedAdvisor[\s\S]*?\n\}/)?.[0] || "", /AssistantConseiller|textarea|input/)
assert.equal((aides.match(/<PremiumPlusPromotion/g) || []).length, 1)
assert.match(aides, /Accompagnement avancé des démarches — Premium\+/)

assert.match(statistics, /themeName === "dark"/)
assert.match(statistics, /const \{ themeName, tokens \} = useTheme\(\)/)
assert.match(statistics, /getStatisticsColors\(tokens\)/)
assert.match(statistics, /linear-gradient\(135deg, \$\{colors\.bg\}/)
assert.match(statistics, /colors\.pastelBlue[\s\S]{0,120}colors\.card/)
assert.doesNotMatch(statistics, /createColorAliases/)

console.log("✓ Doctrine commerciale Gratuit / Premium / Premium+ vérifiée")
console.log("✓ /decouvrir, CTA et teaser Conseiller vérifiés")
console.log("✓ Paywall Premium+ et correctif sombre Mes stats vérifiés")
