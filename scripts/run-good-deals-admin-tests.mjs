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
import {
  canCandidateBeApproved,
  candidateReadyToPublish,
  getRetailAdminBucket,
  getRetailAdminBucketLabel,
  getRetailApprovalStatusForItem,
  getRetailQuantityValidationErrors,
  getRetailProductStateLabel,
  getRetailPublishFunctionName,
  RETAIL_UNIT_OPTIONS,
} from "../src/pages/admin/retailPriceValidationState.js"

const root = process.cwd()
const read = file => readFileSync(join(root, file), "utf8")
const normalizeSql = sql => sql.toLowerCase().replace(/\s+/g, " ").trim()
const resolveRetailMarketStore = ({ candidate, mappings, stores }) => {
  const mappedStoreId = mappings.find(entry =>
    entry.retailer_slug === candidate.retailer_slug
    && entry.store_slug === candidate.store_slug,
  )?.market_store_id ?? null
  if (mappedStoreId) return mappedStoreId

  const normalizedStoreName = candidate.store_name.trim().toLowerCase()
  const normalizedStoreCity = candidate.store_city.trim().toLowerCase()
  const exactNameCityMatches = stores.filter(store =>
    store.normalized_store_name === normalizedStoreName
    && (normalizedStoreCity === "" || store.normalized_city === normalizedStoreCity),
  )
  if (exactNameCityMatches.length === 1) return exactNameCityMatches[0].id

  const storeChain = candidate.store_name.trim().toLowerCase().replace(/\s+/g, " ")
  if (storeChain !== "" && normalizedStoreCity !== "") {
    const exactChainCityMatches = stores.filter(store =>
      store.store_chain_key === storeChain
      && store.normalized_city === normalizedStoreCity,
    )
    if (exactChainCityMatches.length === 1) return exactChainCityMatches[0].id
  }

  throw new Error(`market store unresolved for retail candidate ${candidate.id} (store_name=${candidate.store_name}, store_city=${candidate.store_city})`)
}

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
assert.match(retailPage, /retail_publish_price_candidates/, "Retail admin page must publish observed prices through the dedicated RPC")
assert.match(retailPage, /retail_publish_promotion_candidates/, "Retail admin page must publish promotions through the dedicated RPC")
assert.match(retailPage, /\.rpc\("retail_create_reference_product_from_candidate"/, "Retail admin page must create a market reference product through the dedicated RPC")
assert.match(retailPage, /profile\?\.is_admin === true/, "Retail admin page must gate access with the existing is_admin authority")
assert.match(retailPage, /window\.open\(selectedItem\.source_url/, "Retail admin page must allow opening the official source")
assert.match(retailPage, /Valider et publier/, "Retail admin page must expose a publish action only when ready")
assert.match(retailPage, /Associer ou creer le produit/, "Retail admin page must block publication until a reference product exists")
assert.match(retailPage, /Prix observe pret a publier\./, "Retail admin page must distinguish ready-to-publish from published success")
assert.match(retailPage, /Promotion publiee avec succes\./, "Retail admin page must confirm promotion publication precisely")
assert.match(retailPage, /Prix observe publie avec succes\./, "Retail admin page must confirm observed-price publication precisely")
assert.match(retailPage, /quantity_value: item\.quantity_value \?\? ""/, "Retail admin page must hydrate the structured quantity value into the draft")
assert.match(retailPage, /quantity_unit: item\.quantity_unit \|\| ""/, "Retail admin page must hydrate the structured quantity unit into the draft")
assert.match(retailPage, /pack_count: item\.pack_count \?\? ""/, "Retail admin page must hydrate the structured pack_count into the draft")
assert.match(retailPage, /total_quantity_value: item\.total_quantity_value \?\? ""/, "Retail admin page must hydrate the structured total quantity into the draft")
assert.match(retailPage, /total_quantity_unit: item\.total_quantity_unit \|\| ""/, "Retail admin page must hydrate the structured total quantity unit into the draft")
assert.match(retailPage, /quantity_value: toNumberOrNull\(activeDraft\.quantity_value\)/, "Retail admin page must persist quantity_value when saving corrections")
assert.match(retailPage, /quantity_unit: textOrNull\(activeDraft\.quantity_unit\)/, "Retail admin page must persist quantity_unit when saving corrections")
assert.match(retailPage, /pack_count: toIntegerOrNull\(activeDraft\.pack_count\)/, "Retail admin page must persist pack_count when saving corrections")
assert.match(retailPage, /total_quantity_value: toNumberOrNull\(activeDraft\.total_quantity_value\)/, "Retail admin page must persist total_quantity_value when saving corrections")
assert.match(retailPage, /total_quantity_unit: textOrNull\(activeDraft\.total_quantity_unit\)/, "Retail admin page must persist total_quantity_unit when saving corrections")
assert.match(retailPage, /RETAIL_UNIT_OPTIONS\.map\(option => \(/, "Retail admin page must expose controlled unit options instead of a free-text unit field")
assert.doesNotMatch(retailPage, /<LabeledField label="Unite prix">\s*<input/s, "Retail admin page must not keep Unite prix as an opaque free-text input")
assert.doesNotMatch(retailPage, /service_role|SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE_SERVICE_ROLE_KEY/i, "Retail admin page must never embed the service role")
assert.doesNotMatch(retailPage, /Approved price|Approved promotion|Needs review/, "Retail admin page must hide the technical English status labels")

const supabaseClient = read("src/services/supabase.js")
assert.doesNotMatch(supabaseClient, /SERVICE_ROLE|service_role/i, "Shared frontend Supabase client must stay anon-key only")

assert.equal(getRetailApprovalStatusForItem({ price_type: "observed_price" }), "approved_price")
assert.equal(getRetailApprovalStatusForItem({ price_type: "promotion" }), "approved_promotion")
assert.equal(getRetailAdminBucketLabel("needs_review"), "A verifier")
assert.equal(getRetailAdminBucketLabel("ready"), "Prets a publier")
assert.equal(getRetailAdminBucketLabel("published"), "Publies")
assert.equal(getRetailAdminBucketLabel("rejected"), "Rejetes")
assert.equal(getRetailProductStateLabel({ matched_market_product_id: null }), "Produit de reference a associer")
assert.equal(getRetailProductStateLabel({ matched_market_product_id: "product-1" }), "Produit associe")
assert.equal(canCandidateBeApproved({
  price_type: "observed_price",
  status: "matched",
  current_price: 2.49,
  matched_market_product_id: "product-1",
}, "approved_price"), true)
assert.equal(canCandidateBeApproved({
  price_type: "observed_price",
  status: "matched",
  current_price: 2.49,
  matched_market_product_id: null,
}, "approved_price"), false)
assert.equal(canCandidateBeApproved({
  price_type: "promotion",
  status: "matched",
  current_price: 3.99,
  matched_market_product_id: "product-2",
  promotion_proven: true,
}, "approved_promotion"), true)
assert.equal(canCandidateBeApproved({
  price_type: "promotion",
  status: "matched",
  current_price: 3.99,
  matched_market_product_id: "product-2",
  promotion_proven: false,
}, "approved_promotion"), false)
assert.equal(candidateReadyToPublish({
  price_type: "observed_price",
  status: "approved_price",
  current_price: 1.99,
  matched_market_product_id: "product-3",
}), true)
assert.equal(candidateReadyToPublish({
  price_type: "observed_price",
  status: "approved_price",
  current_price: 1.99,
  matched_market_product_id: null,
}), false)
assert.equal(getRetailAdminBucket({
  price_type: "promotion",
  status: "approved_promotion",
  current_price: 4.5,
  matched_market_product_id: "product-4",
  promotion_proven: true,
}), "ready")
assert.equal(getRetailAdminBucket({
  price_type: "promotion",
  status: "published",
  current_price: 4.5,
  matched_market_product_id: "product-4",
  promotion_proven: true,
}), "published")
assert.equal(getRetailPublishFunctionName({ price_type: "promotion" }), "retail_publish_promotion_candidates")
assert.equal(getRetailPublishFunctionName({ price_type: "observed_price" }), "retail_publish_price_candidates")
assert.deepEqual(RETAIL_UNIT_OPTIONS.map(option => option.value), ["", "unite", "bloc", "piece", "kg", "g", "l", "cl", "ml"])
assert.deepEqual(getRetailQuantityValidationErrors({
  package_format: "2 blocs",
  quantity_value: null,
  quantity_unit: null,
  pack_count: null,
  total_quantity_value: null,
  total_quantity_unit: null,
  unit_price: 1.56,
  unit_price_unit: "bloc",
}), [], "Harpic 2 blocs must support 1.56 EUR per bloc without liquid units")
assert.notEqual(getRetailQuantityValidationErrors({
  package_format: "2 blocs",
  quantity_value: 75,
  quantity_unit: "cl",
  pack_count: null,
  total_quantity_value: 75,
  total_quantity_unit: "cl",
  unit_price: 1.56,
  unit_price_unit: "l",
}).length, 0, "A bloc format must reject stale cl/l structured fields")
assert.deepEqual(getRetailQuantityValidationErrors({
  package_format: "75 cl",
  quantity_value: 75,
  quantity_unit: "cl",
  pack_count: null,
  total_quantity_value: 75,
  total_quantity_unit: "cl",
  unit_price: 1.4,
  unit_price_unit: "l",
}), [], "A liquid product must preserve litre pricing")
assert.deepEqual(getRetailQuantityValidationErrors({
  package_format: "Contenu : 175 g",
  quantity_value: 175,
  quantity_unit: "g",
  pack_count: null,
  total_quantity_value: 175,
  total_quantity_unit: "g",
  unit_price: 34,
  unit_price_unit: "kg",
}), [], "A mass product must preserve kilogram pricing")
assert.deepEqual(getRetailQuantityValidationErrors({
  package_format: "Lot de 4 pieces",
  quantity_value: null,
  quantity_unit: null,
  pack_count: 4,
  total_quantity_value: null,
  total_quantity_unit: null,
  unit_price: 0.5,
  unit_price_unit: "piece",
}), [], "A lot of pieces must preserve a piece or unite unit price")
assert.equal(canCandidateBeApproved({
  price_type: "observed_price",
  status: "matched",
  current_price: 3.12,
  matched_market_product_id: "product-harpic",
  package_format: "2 blocs",
  quantity_value: 75,
  quantity_unit: "cl",
  total_quantity_value: 75,
  total_quantity_unit: "cl",
  unit_price: 1.56,
  unit_price_unit: "l",
}, "approved_price"), false, "A bloc format with litre pricing must be blocked before publication")

const retailMigration = read("supabase/migrations/202607290003_retail_publication_visibility_and_review_contract.sql")
const retailSourceConstraintMigration = read("supabase/migrations/202607290004_market_seed_batches_retail_source.sql")
const retailBatchIdFixMigration = read("supabase/migrations/202607290005_retail_market_batch_id_ambiguity_fix.sql")
const retailQuantityContractMigration = read("supabase/migrations/202607290006_retail_quantity_contract_and_harpic_fix.sql")
const normalizedRetailMigration = normalizeSql(retailMigration)
const retailReviewViewContractMatch = retailMigration.match(/create or replace view public\.retail_price_candidates_review[\s\S]*?left join public\.shopping_products[\s\S]*?;/)
assert.ok(retailReviewViewContractMatch, "Retail migration must still define the retail_price_candidates_review view contract")
const normalizedRetailReviewViewContract = normalizeSql(retailReviewViewContractMatch[0])
const publishedGoodDealsViewContractMatch = retailMigration.match(/create or replace view public\.published_good_deals[\s\S]*?comment on view public\.published_good_deals is[\s\S]*?;/)
assert.ok(publishedGoodDealsViewContractMatch, "Retail migration must still define the published_good_deals view contract")
const normalizedPublishedGoodDealsViewContract = normalizeSql(publishedGoodDealsViewContractMatch[0])
assert.match(retailMigration, /approved retail candidates require matched_market_product_id/, "Retail migration must forbid approved statuses without a matched market product")
assert.match(retailMigration, /create or replace view public\.published_good_deals/, "Retail migration must replace the public view contract")
assert.match(retailMigration, /add column if not exists published_market_observation_id uuid null/, "Retail migration must track the linked market observation on each retail candidate")
assert.match(retailMigration, /create or replace function public\.retail_resolve_market_store\(p_candidate_id uuid\)/, "Retail migration must add a deterministic market store resolver")
assert.match(retailMigration, /create table if not exists public\.retail_market_store_mappings/, "Retail migration must add a reusable explicit store mapping table when no existing mapping table is available")
assert.match(retailMigration, /constraint retail_market_store_mappings_retailer_store_unique unique \(retailer_slug, store_slug\)/, "Retail store mappings must stay unique per retailer_slug and store_slug")
assert.match(retailMigration, /market_store_id uuid not null references public\.market_stores\(id\) on delete restrict/, "Retail store mappings must keep a strict FK to market_stores")
assert.match(retailMigration, /insert into public\.retail_market_store_mappings \(\s*retailer_slug,\s*store_slug,\s*market_store_id\s*\)\s*values \(\s*'leader-price-reunion',\s*'leaderprice-lp-ermitage',\s*'29ae25ce-eb77-4d8e-9f88-0b4b5c5b4eb3'\s*\)/s, "Retail migration must seed the proven LP Ermitage mapping only")
assert.match(retailMigration, /select mappings\.market_store_id\s+into v_store_id\s+from public\.retail_market_store_mappings mappings\s+where mappings\.retailer_slug = v_candidate\.retailer_slug\s+and mappings\.store_slug = v_candidate\.store_slug;/s, "Retail resolver must try the explicit retailer_slug plus store_slug mapping first")
assert.match(retailMigration, /create or replace function public\.retail_sync_market_price_observation\(/, "Retail migration must add a dedicated market sync helper")
assert.match(retailMigration, /check \(source in \('manual_seed', 'receipt_scan_anonymized', 'open_prices', 'retail_publication'\)\)/, "Retail migration must extend the market observation source contract without breaking the existing open_prices source")
assert.match(retailMigration, /format\('retail_publication:%s', v_candidate\.id\)/, "Retail market sync must use a stable retail batch key for idempotence")
assert.match(retailMigration, /format\('retail_candidate:%s', v_candidate\.id\)/, "Retail market sync must use a stable retail batch item key for idempotence")
assert.match(retailMigration, /insert into public\.market_seed_batches/, "Retail market sync must persist a stable market seed batch provenance record")
assert.match(retailMigration, /insert into public\.market_price_observations/, "Retail migration must feed the true market_price_observations table")
assert.match(retailMigration, /source = 'retail_publication'/, "Retail market sync must preserve the stable retail publication source")
assert.match(retailMigration, /published retail candidates require published_market_observation_id/, "The review audit trigger must require a linked market observation before a retail candidate can stay published")
assert.match(retailMigration, /published retail promotions require published_promotion_id/, "The review audit trigger must keep the promotion publication contract strict")
assert.match(retailMigration, /create or replace function public\.retail_publish_price_candidates\(p_candidate_ids uuid\[\]\).*?published_market_observation_id = v_market_result\.observation_id/s, "Observed-price publication must mark the candidate published only after market sync succeeds")
assert.match(retailMigration, /create or replace function public\.retail_publish_promotion_candidates\(p_candidate_ids uuid\[\]\).*?published_market_observation_id = v_market_result\.observation_id/s, "Promotion publication must mark the candidate published only after market sync succeeds")
assert.match(retailMigration, /market store unresolved for retail candidate/, "Retail publication must fail explicitly when the market store cannot be resolved deterministically")
assert.match(retailMigration, /from public\.shopping_promotions promotions/, "Retail migration must expose published retail promotions in the public view")
assert.match(retailMigration, /from public\.retail_price_observations observations/, "Retail migration must expose published retail observed prices in the public view")
assert.match(retailMigration, /array\['product_promo'\]::text\[\]/, "Retail migration must classify retail promotions as product promotions in the public view")
assert.match(retailMigration, /array\['observed_price'\]::text\[\]/, "Retail migration must classify retail observed prices in the public view")
assert.match(retailMigration, /'observed_price'::public\.good_deal_content_kind as content_kind/, "Retail migration must preserve the observed-price public content kind enum")
assert.match(retailMigration, /'promotion'::public\.good_deal_content_kind as content_kind/, "Retail migration must preserve the promotion public content kind enum")
assert.match(retailMigration, /select\s+\*\s+from\s+base_good_deals\s+union all\s+select\s+\*\s+from\s+retail_promotions\s+union all\s+select\s+\*\s+from\s+retail_observed_prices/s, "Retail migration must preserve historical good deals and append retail branches without collapsing rows")
assert.match(retailMigration, /where promotions\.collector_source_slug = 'leader-price-reunion-retail'/, "Retail promotions must stay scoped to the Leader Price retail collector")
assert.match(retailMigration, /and promotions\.verification_status = 'published'/, "Retail promotions must expose only published promotions")
assert.match(retailMigration, /and coalesce\(promotions\.is_active, true\) = true/, "Retail promotions must ignore inactive promotions")
assert.match(retailMigration, /and \(promotions\.ends_at is null or promotions\.ends_at >= now\(\)\)/, "Retail promotions must exclude expired promotions")
assert.match(retailMigration, /join public\.retail_price_candidates retail_candidates\s+on retail_candidates\.published_promotion_id = promotions\.id\s+and retail_candidates\.status = 'published'/s, "Retail promotions must be linked back to an actually published retail candidate")
assert.match(retailMigration, /and retail_candidates\.price_type = 'promotion'/, "Retail promotions must stay in the promotion branch only")
assert.match(retailMigration, /and retail_candidates\.published_market_observation_id is not null/, "Retail public branches must require a successful market sync link")
assert.match(retailMigration, /join public\.retail_price_candidates retail_candidates\s+on retail_candidates\.published_price_observation_id = observations\.id\s+and retail_candidates\.status = 'published'/s, "Retail observed prices must be linked back to an actually published retail candidate")
assert.match(retailMigration, /and retail_candidates\.price_type = 'observed_price'/, "Observed-price cards must stay in the observed-price branch only")
assert.doesNotMatch(retailMigration, /where retail_observed_prices\.business_name is not null/, "Retail observed prices must no longer rely on a business_name heuristic as proof of publication")
assert.match(retailMigration, /where gd\.collector_source_slug = promotions\.collector_source_slug\s+and gd\.external_key = promotions\.external_key/s, "Retail promotions must deduplicate against an already published good_deals row with the same external key")
assert.match(retailMigration, /gd\.verification_status = 'published'::good_deal_verification_status/, "Retail promotion deduplication must only consider published good deals")
assert.match(retailMigration, /gd\.is_active = true/, "Retail promotion deduplication must ignore inactive historical good deals")
assert.match(retailMigration, /null::uuid as business_id/, "Retail branches must preserve the public view business_id column type")
assert.match(retailMigration, /gd\.scope_type as scope_type/, "The base branch must preserve the historical enum type for scope_type")
assert.match(retailMigration, /gd\.deal_type as deal_type/, "The base branch must preserve the historical enum type for deal_type")
assert.match(retailMigration, /gd\.content_kind as content_kind/, "The base branch must preserve the historical enum type for content_kind")
assert.doesNotMatch(retailMigration, /gd\.scope_type::text as scope_type/, "The base branch must no longer coerce scope_type to text")
assert.doesNotMatch(retailMigration, /gd\.deal_type::text as deal_type/, "The base branch must no longer coerce deal_type to text")
assert.doesNotMatch(retailMigration, /gd\.content_kind::text as content_kind/, "The base branch must no longer coerce content_kind to text")
assert.match(retailMigration, /coalesce\(catalogs\.scope_type::text::public\.good_deal_scope_type, 'commune'::public\.good_deal_scope_type\) as scope_type/, "Retail promotions must cast scope_type back to the live good_deal_scope_type enum")
assert.match(retailMigration, /'commune'::public\.good_deal_scope_type as scope_type/, "Retail observed prices must cast scope_type to the live good_deal_scope_type enum")
assert.match(retailMigration, /null::public\.good_deal_type as deal_type/, "Retail branches must preserve the live deal_type enum when the value is null")
assert.match(retailMigration, /gd\.radius_km,/, "The base branch must preserve the live numeric(6,2) radius_km column")
assert.match(retailMigration, /null::numeric\(6,2\) as radius_km/, "Retail branches must preserve radius_km as numeric(6,2)")
assert.match(retailMigration, /null::numeric\(9,6\) as business_latitude/, "Retail branches must preserve business_latitude as numeric(9,6)")
assert.match(retailMigration, /null::numeric\(9,6\) as business_longitude/, "Retail branches must preserve business_longitude as numeric(9,6)")
assert.doesNotMatch(retailMigration, /null::numeric as radius_km/, "Retail branches must not widen radius_km to bare numeric")
assert.doesNotMatch(retailMigration, /null::numeric as business_latitude/, "Retail branches must not widen business_latitude to bare numeric")
assert.doesNotMatch(retailMigration, /null::numeric as business_longitude/, "Retail branches must not widen business_longitude to bare numeric")
assert.match(normalizedPublishedGoodDealsViewContract, /gd\.scope_type as scope_type, gd\.commune, gd\.micro_region, gd\.radius_km, gd\.starts_at, gd\.ends_at, gd\.source_url, gd\.contact_url, gd\.is_sponsored, gd\.is_featured, gd\.created_at, gd\.updated_at, b\.name as business_name, b\.description as business_description, b\.address as business_address, b\.commune as business_commune, b\.postal_code as business_postal_code, b\.latitude as business_latitude, b\.longitude as business_longitude, b\.phone as business_phone, b\.website_url as business_website_url, b\.social_url as business_social_url, b\.logo_url as business_logo_url, b\.is_verified as business_is_verified, b\.is_partner as business_is_partner, gd\.deal_type as deal_type, gd\.tags, gd\.is_free, gd\.price_note, gd\.content_kind as content_kind/s, "The base published_good_deals branch must preserve the live enum columns in place")
assert.match(normalizedPublishedGoodDealsViewContract, /'promotion'::public\.good_deal_content_kind as content_kind, coalesce\(stores\.store_name, retail_candidates\.store_name\) as locality/s, "Retail promotions must return the live content_kind enum")
assert.match(normalizedPublishedGoodDealsViewContract, /'observed_price'::public\.good_deal_content_kind as content_kind, observations\.store_name as locality/s, "Retail observed prices must return the live content_kind enum")
assert.match(normalizedRetailReviewViewContract, /candidates\.published_price_observation_id, candidates\.published_promotion_id, candidates\.duplicate_key, candidates\.extraction_confidence, candidates\.first_seen_at, candidates\.last_seen_at, candidates\.created_at, candidates\.updated_at, candidates\.published_market_observation_id from public\.retail_price_candidates as candidates/, "Retail review view must preserve the live historical tail contract and append published_market_observation_id at the end only")
assert.ok(normalizedRetailReviewViewContract.includes("candidates.duplicate_key"), "Retail review view must keep duplicate_key in the live contract")
assert.ok(normalizedRetailReviewViewContract.indexOf("candidates.duplicate_key") < normalizedRetailReviewViewContract.indexOf("candidates.published_market_observation_id"), "Retail review view must keep duplicate_key before the new published_market_observation_id column")
assert.match(retailMigration, /price_before_discount = v_price_before_discount/, "Promotion sync must preserve the historical pre-discount price in the market base")
assert.match(retailMigration, /discount_amount = v_discount_amount/, "Promotion sync must preserve the discount amount in the market base")
assert.match(retailMigration, /unit_price = v_unit_price/, "Retail market sync must preserve the unit price when it is valid")
assert.match(retailMigration, /unit_type = v_unit_type/, "Retail market sync must preserve the unit type when it is valid")
assert.match(retailMigration, /v_observed_date := \(v_candidate\.source_observed_at at time zone 'Indian\/Reunion'\)::date/, "Retail market sync must preserve the real observation date in Reunion time")
assert.match(retailMigration, /format\('source_url=%s', v_candidate\.source_url\)/, "Retail market provenance must keep the stable source URL in the batch notes")
assert.match(retailMigration, /format\('retail_price_observation_id=%s', p_retail_price_observation_id\)/, "Retail market provenance must keep the source retail observation id")
assert.doesNotMatch(retailMigration, /\b(user_id|email)\b/i, "Retail market sync migration must not persist personal identifiers")
assert.match(normalizedRetailMigration, /retail_price_candidates_apply_review_audit\(\).*?approved retail candidates require matched_market_product_id/s, "The review audit trigger must now block approved retail candidates without a canonical market product")
assert.doesNotMatch(retailMigration, /store_city\s*:=\s*'Saint-Paul'|store_city\s*:=\s*'Saint-Gilles Les Bains'|update public\.retail_price_candidates\s+set\s+store_city/i, "Retail store resolution must not mutate store_city")
assert.match(retailSourceConstraintMigration, /alter table public\.market_seed_batches\s+drop constraint market_seed_batches_source_allowed;/, "Retail source constraint migration must replace the existing market_seed_batches source constraint")
assert.match(retailSourceConstraintMigration, /'manual_seed'::text/, "Retail source constraint migration must preserve manual_seed")
assert.match(retailSourceConstraintMigration, /'receipt_scan_anonymized'::text/, "Retail source constraint migration must preserve receipt_scan_anonymized")
assert.match(retailSourceConstraintMigration, /'bqp_reunion_2026'::text/, "Retail source constraint migration must preserve bqp_reunion_2026")
assert.match(retailSourceConstraintMigration, /'open_prices'::text/, "Retail source constraint migration must preserve open_prices")
assert.match(retailSourceConstraintMigration, /'retail_publication'::text/, "Retail source constraint migration must add retail_publication")
assert.doesNotMatch(retailSourceConstraintMigration, /'manual_seed'::text[\s\S]*'receipt_scan_anonymized'::text[\s\S]*'open_prices'::text(?![\s\S]*'retail_publication'::text)/, "Retail source constraint migration must not drop any historical source when adding retail_publication")
assert.match(retailBatchIdFixMigration, /create or replace function public\.retail_sync_market_price_observation\(/, "Retail batch_id fix migration must replace the affected retail market sync function")
assert.match(retailBatchIdFixMigration, /from public\.market_price_observations as observations\s+where observations\.batch_id = v_batch_id\s+and observations\.batch_item_key = v_batch_item_key/s, "Retail batch_id fix migration must qualify the market_price_observations batch_id lookup")
assert.doesNotMatch(retailBatchIdFixMigration, /where batch_id = v_batch_id/, "Retail batch_id fix migration must not keep an ambiguous bare batch_id lookup")
assert.doesNotMatch(retailBatchIdFixMigration, /#variable_conflict use_column/, "Retail batch_id fix migration must not use a global variable_conflict workaround")
assert.doesNotMatch(retailBatchIdFixMigration, /on conflict\s*\(\s*batch_id\s*\)/i, "Retail batch_id fix migration must not introduce a new ambiguous ON CONFLICT target on batch_id")
assert.match(retailQuantityContractMigration, /create or replace function public\.retail_quantity_contract_error\(/, "Retail quantity contract migration must add a reusable server-side validator")
assert.match(retailQuantityContractMigration, /create or replace function public\.retail_price_candidates_apply_review_audit\(/, "Retail quantity contract migration must harden the review audit trigger")
assert.match(retailQuantityContractMigration, /create or replace function public\.retail_upsert_price_observation\(/, "Retail quantity contract migration must harden retail observation publication")
assert.match(retailQuantityContractMigration, /create or replace function public\.retail_sync_market_price_observation\(/, "Retail quantity contract migration must harden market observation publication")
assert.match(retailQuantityContractMigration, /new\.quantity_value is distinct from old\.quantity_value/, "Retail quantity contract migration must mark structured quantity corrections as reviewed")
assert.match(retailQuantityContractMigration, /v_quantity_contract_error := public\.retail_quantity_contract_error\(/, "Retail quantity contract migration must validate structured quantity server-side")
assert.match(retailQuantityContractMigration, /package_format bloc\(s\) requires unit_price_unit bloc/, "Retail quantity contract migration must reject bloc formats paired with litre or weight units")
assert.match(retailQuantityContractMigration, /2d4f7a3a-cdb3-4698-9da7-bed74cbd2a7c/, "Retail quantity contract migration must target the Harpic candidate explicitly")
assert.match(retailQuantityContractMigration, /package_format = '2 blocs'/, "Retail quantity contract migration must correct Harpic to 2 blocs")
assert.match(retailQuantityContractMigration, /quantity_value = null,\s+quantity_unit = null,\s+pack_count = null,\s+total_quantity_value = null,\s+total_quantity_unit = null,\s+unit_price = 1\.56,\s+unit_price_unit = 'bloc'/s, "Retail quantity contract migration must clear Harpic cl/l structured fields")
assert.match(retailQuantityContractMigration, /where id = v_candidate\.published_price_observation_id/, "Retail quantity contract migration must update the linked retail observation by published_price_observation_id")
assert.match(retailQuantityContractMigration, /where id = v_candidate\.published_market_observation_id/, "Retail quantity contract migration must update the linked market observation by published_market_observation_id")
assert.doesNotMatch(retailQuantityContractMigration, /where .*product_name/i, "Retail quantity contract migration must not target Harpic by product name")
const harpicFixBlockMatch = retailQuantityContractMigration.match(/do \$\$[\s\S]*?end;\s*\$\$;/i)
assert.ok(harpicFixBlockMatch, "Retail quantity contract migration must contain the targeted Harpic reconciliation block")
assert.doesNotMatch(harpicFixBlockMatch[0], /insert into public\.retail_price_observations|insert into public\.market_price_observations/i, "Retail quantity contract migration must not duplicate published observations inside the Harpic reconciliation block")

const provenMarketStoreId = "29ae25ce-eb77-4d8e-9f88-0b4b5c5b4eb3"
const mappingRows = [
  {
    retailer_slug: "leader-price-reunion",
    store_slug: "leaderprice-lp-ermitage",
    market_store_id: provenMarketStoreId,
  },
]
const availableStores = [
  {
    id: provenMarketStoreId,
    normalized_store_name: "leader price l hermitage",
    normalized_city: "saint paul",
    store_chain_key: "leader price l hermitage",
  },
  {
    id: "158ab037-9e1f-4b5b-96a2-0bd8b203db20",
    normalized_store_name: "leader price ermitage",
    normalized_city: "saint gilles les bains",
    store_chain_key: "leader price ermitage",
  },
]
assert.equal(resolveRetailMarketStore({
  candidate: {
    id: "candidate-1",
    retailer_slug: "leader-price-reunion",
    store_slug: "leaderprice-lp-ermitage",
    store_name: "LP Ermitage",
    store_city: "Saint-Gilles Les Bains",
  },
  mappings: mappingRows,
  stores: availableStores,
}), provenMarketStoreId, "LP Ermitage must resolve to the proven market_store_id through the explicit mapping")
assert.equal(resolveRetailMarketStore({
  candidate: {
    id: "candidate-2",
    retailer_slug: "leader-price-reunion",
    store_slug: "leaderprice-lp-ermitage",
    store_name: "LP Ermitage",
    store_city: "Saint-Paul",
  },
  mappings: mappingRows,
  stores: availableStores,
}), provenMarketStoreId, "The explicit store mapping must not depend on Saint-Gilles Les Bains versus Saint-Paul")
assert.equal(resolveRetailMarketStore({
  candidate: {
    id: "candidate-3",
    retailer_slug: "leader-price-reunion",
    store_slug: "leaderprice-lp-ermitage",
    store_name: "LP Ermitage",
    store_city: "Saint-Gilles Les Bains",
  },
  mappings: mappingRows,
  stores: availableStores,
}), provenMarketStoreId, "A second resolution must return the same proven market_store_id")
assert.throws(() => resolveRetailMarketStore({
  candidate: {
    id: "candidate-4",
    retailer_slug: "leader-price-reunion",
    store_slug: "unknown-store-slug",
    store_name: "LP Ermitage",
    store_city: "Saint-Gilles Les Bains",
  },
  mappings: mappingRows,
  stores: availableStores,
}), /market store unresolved for retail candidate candidate-4/, "An unknown store_slug must still fail when no exact fallback match applies")

console.log("Good deals and retail admin tests passed.")
