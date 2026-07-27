import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  APP_ROUTE,
  GOOD_DEALS_REVIEW_ADMIN_ROUTE,
  LOGIN_ROUTE,
  buildLoginPath,
  isProtectedPath,
  resolveAuthRoute,
  sanitizeNextPath,
} from "../src/services/authNavigation.js"

const root = process.cwd()
const read = file => readFileSync(join(root, file), "utf8")

assert.equal(GOOD_DEALS_REVIEW_ADMIN_ROUTE, "/admin/bons-plans-validation")
assert.equal(isProtectedPath(GOOD_DEALS_REVIEW_ADMIN_ROUTE), true)
assert.equal(sanitizeNextPath(GOOD_DEALS_REVIEW_ADMIN_ROUTE), GOOD_DEALS_REVIEW_ADMIN_ROUTE)
assert.deepEqual(resolveAuthRoute({ pathname: GOOD_DEALS_REVIEW_ADMIN_ROUTE }), {
  type: "redirect",
  to: buildLoginPath(GOOD_DEALS_REVIEW_ADMIN_ROUTE),
  replace: true,
})
assert.deepEqual(resolveAuthRoute({ pathname: GOOD_DEALS_REVIEW_ADMIN_ROUTE, isAuthenticated: true }), {
  type: "render",
  page: "admin-good-deals-review",
})

const app = read("src/App.jsx")
assert.match(app, /GoodDealsReviewPage/, "App must import the private good deals review page")
assert.match(app, /initialAppSection="goodDealsAdminReview"/, "Admin route must open the private review section")
assert.match(app, /navigate\(APP_ROUTE, \{ replace: true \}\)/, "Admin page must redirect back to app when leaving the private route")

const sidebar = read("src/components/sidebar/Sidebar.jsx")
assert.doesNotMatch(sidebar, /goodDealsAdminReview|bons-plans-validation|validation bons plans/i, "Private admin page must not appear in the normal navigation")

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

const supabaseClient = read("src/services/supabase.js")
assert.doesNotMatch(supabaseClient, /SERVICE_ROLE|service_role/i, "Shared frontend Supabase client must stay anon-key only")

console.log("Good deals admin tests passed.")
