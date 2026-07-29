import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  APP_ROUTE,
  GOOD_DEALS_REVIEW_ADMIN_ROUTE,
  LOGIN_ROUTE,
  RETAIL_PRICE_VALIDATION_ADMIN_ROUTE,
  buildLoginPath,
  isProtectedPath,
  resolveAuthRoute,
  sanitizeNextPath,
} from "../src/services/authNavigation.js"

const root = process.cwd()
const read = file => readFileSync(join(root, file), "utf8")

assert.equal(GOOD_DEALS_REVIEW_ADMIN_ROUTE, "/admin/bons-plans-validation")
assert.equal(RETAIL_PRICE_VALIDATION_ADMIN_ROUTE, "/admin/prix-promotions-validation")
assert.equal(isProtectedPath(GOOD_DEALS_REVIEW_ADMIN_ROUTE), true)
assert.equal(isProtectedPath(RETAIL_PRICE_VALIDATION_ADMIN_ROUTE), true)
assert.equal(sanitizeNextPath(GOOD_DEALS_REVIEW_ADMIN_ROUTE), GOOD_DEALS_REVIEW_ADMIN_ROUTE)
assert.equal(sanitizeNextPath(RETAIL_PRICE_VALIDATION_ADMIN_ROUTE), RETAIL_PRICE_VALIDATION_ADMIN_ROUTE)
assert.deepEqual(resolveAuthRoute({ pathname: GOOD_DEALS_REVIEW_ADMIN_ROUTE }), {
  type: "redirect",
  to: buildLoginPath(GOOD_DEALS_REVIEW_ADMIN_ROUTE),
  replace: true,
})
assert.deepEqual(resolveAuthRoute({ pathname: GOOD_DEALS_REVIEW_ADMIN_ROUTE, isAuthenticated: true }), {
  type: "render",
  page: "admin-good-deals-review",
})
assert.deepEqual(resolveAuthRoute({ pathname: RETAIL_PRICE_VALIDATION_ADMIN_ROUTE }), {
  type: "redirect",
  to: buildLoginPath(RETAIL_PRICE_VALIDATION_ADMIN_ROUTE),
  replace: true,
})
assert.deepEqual(resolveAuthRoute({ pathname: RETAIL_PRICE_VALIDATION_ADMIN_ROUTE, isAuthenticated: true }), {
  type: "render",
  page: "admin-retail-price-review",
})

const app = read("src/App.jsx")
assert.match(app, /GoodDealsReviewPage/, "App must import the private good deals review page")
assert.match(app, /RetailPriceValidationPage/, "App must import the private retail validation page")
assert.match(app, /initialAppSection="goodDealsAdminReview"/, "Admin route must open the private review section")
assert.match(app, /initialAppSection="retailPriceAdminReview"/, "Retail admin route must open the private review section")
assert.match(app, /navigate\(APP_ROUTE, \{ replace: true \}\)/, "Admin page must redirect back to app when leaving the private route")

const sidebar = read("src/components/sidebar/Sidebar.jsx")
assert.doesNotMatch(sidebar, /goodDealsAdminReview|bons-plans-validation|validation bons plans|retailPriceAdminReview|prix-promotions-validation|validation prix et promotions/i, "Private admin pages must not appear in the normal navigation")

const page = read("src/pages/admin/GoodDealsReviewPage.jsx")
assert.match(page, /\.from\("good_deal_candidates_review"\)/, "Admin page must read from the private review view")
assert.match(page, /\.from\("good_deal_candidates"\)\s*\.update/, "Admin page must write through the private candidates table")
assert.match(page, /\.rpc\("good_deals_publish_candidate"/, "Admin page must publish through the dedicated RPC")
assert.match(page, /profile\?\.is_admin === true/, "Admin page must gate access with the existing is_admin authority")
assert.doesNotMatch(page, /service_role|SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE_SERVICE_ROLE_KEY/, "Frontend must never embed the service role")
assert.match(page, /window\.open\(selectedItem\.source_url/, "Admin page must allow opening the official source")
assert.match(page, /Valider pour publication/, "Admin page must expose an approval action")
assert.doesNotMatch(page, /saveChanges\("approved"\)/, "Approval must no longer stop at the approved status")
assert.match(page, /Bon plan publié dans l'application\./, "Admin page must show a publication success message")
assert.match(page, /Publication en cours\.\.\./, "Admin page must prevent double-click publication with a visible busy state")
assert.match(page, /Rejeter/, "Admin page must expose a reject action")
assert.match(page, /Corriger/, "Admin page must expose a correction action")

const retailPage = read("src/pages/admin/RetailPriceValidationPage.jsx")
assert.match(retailPage, /\.from\("retail_price_candidate_runs_review"\)/, "Retail admin page must read the private retail runs view")
assert.match(retailPage, /\.from\("retail_price_candidates_review"\)/, "Retail admin page must read the private retail candidates view")
assert.match(retailPage, /\.from\("retail_price_candidates"\)\s*\.update/, "Retail admin page must write through the private retail candidates table")
assert.match(retailPage, /publishSelection\("retail_publish_price_candidates"/, "Retail admin page must publish observed prices through the dedicated RPC")
assert.match(retailPage, /publishSelection\("retail_publish_promotion_candidates"/, "Retail admin page must publish promotions through the dedicated RPC")
assert.match(retailPage, /\.rpc\("retail_create_reference_product_from_candidate"/, "Retail admin page must create a market reference product through the dedicated RPC")
assert.match(retailPage, /profile\?\.is_admin === true/, "Retail admin page must gate access with the existing is_admin authority")
assert.match(retailPage, /window\.open\(selectedItem\.source_url/, "Retail admin page must allow opening the official source")
assert.match(retailPage, /Valider tous les prix fiables/, "Retail admin page must allow batch approval of reliable observed prices")
assert.match(retailPage, /Valider toutes les promotions fiables/, "Retail admin page must allow batch approval of reliable promotions")
assert.match(retailPage, /Publier les prix selectionnes/, "Retail admin page must allow observed-price publication")
assert.match(retailPage, /Publier les promotions selectionnees/, "Retail admin page must allow promotion publication")
assert.match(retailPage, /Creer un produit de reference/, "Retail admin page must allow creating a reference product")
assert.doesNotMatch(retailPage, /service_role|SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE_SERVICE_ROLE_KEY/i, "Retail admin page must never embed the service role")

const supabaseClient = read("src/services/supabase.js")
assert.doesNotMatch(supabaseClient, /SERVICE_ROLE|service_role/i, "Shared frontend Supabase client must stay anon-key only")

console.log("Good deals and retail admin tests passed.")
