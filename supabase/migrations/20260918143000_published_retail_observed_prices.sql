-- BudgetKazPei
-- Public, structured projection of validated retail observed prices for
-- Courses intelligentes.
--
-- Product identity stays explicit. The view exposes all latest published
-- observations, while is_fresh tells the frontend whether the price may be
-- used in a current basket estimate.

begin;

create or replace view public.published_retail_observed_prices
with (security_barrier = true)
as
with ranked as (
  select
    observations.id,
    observations.shopping_product_id as product_id,
    observations.market_product_id,
    coalesce(
      shopping_products.display_name,
      retail_candidates.product_name,
      market_products.canonical_name
    ) as product_name,
    coalesce(
      nullif(retail_candidates.normalized_product_name, ''),
      market_products.normalized_name
    ) as normalized_product_name,
    coalesce(
      nullif(retail_candidates.brand, ''),
      market_products.brand
    ) as brand,
    coalesce(
      nullif(retail_candidates.package_format, ''),
      market_products.package_format
    ) as package_format,
    coalesce(
      retail_candidates.quantity_value,
      market_products.package_size_value
    ) as quantity_value,
    coalesce(
      nullif(retail_candidates.quantity_unit, ''),
      market_products.package_size_unit
    ) as quantity_unit,
    coalesce(
      retail_candidates.pack_count,
      market_products.package_count
    ) as pack_count,
    retail_candidates.total_quantity_value,
    retail_candidates.total_quantity_unit,
    coalesce(
      nullif(retail_candidates.barcode, ''),
      market_products.barcode
    ) as barcode,
    observations.retailer_slug,
    retail_candidates.retailer_name,
    observations.store_slug,
    observations.store_name,
    observations.store_city,
    observations.price,
    observations.unit_price,
    observations.unit_price_unit,
    observations.currency,
    observations.observed_at,
    observations.first_seen_at,
    observations.last_seen_at,
    observations.source_url,
    observations.source_type,
    retail_candidates.match_method,
    retail_candidates.match_confidence,
    coalesce(observations.last_seen_at, observations.observed_at) >= now() - interval '30 days'
      as is_fresh,
    row_number() over (
      partition by
        observations.market_product_id,
        observations.retailer_slug,
        observations.store_slug
      order by
        coalesce(observations.last_seen_at, observations.observed_at) desc,
        observations.updated_at desc,
        observations.id desc
    ) as identity_position
  from public.retail_price_observations observations
  join public.retail_price_candidates retail_candidates
    on retail_candidates.published_price_observation_id = observations.id
   and retail_candidates.status = 'published'
   and retail_candidates.price_type = 'observed_price'
   and retail_candidates.matched_market_product_id is not null
   and retail_candidates.published_market_observation_id is not null
  join public.market_products market_products
    on market_products.id = observations.market_product_id
  left join public.shopping_products shopping_products
    on shopping_products.id = observations.shopping_product_id
  where observations.price_type = 'observed_price'
    and observations.promotion_proven is false
    and observations.price > 0
    and coalesce(retail_candidates.validation_errors, '[]'::jsonb) = '[]'::jsonb
    and coalesce(retail_candidates.match_warnings, '[]'::jsonb)
          <@ '["matching_backend_unavailable_in_local_session"]'::jsonb
)
select
  id,
  product_id,
  market_product_id,
  product_name,
  normalized_product_name,
  brand,
  package_format,
  quantity_value,
  quantity_unit,
  pack_count,
  total_quantity_value,
  total_quantity_unit,
  barcode,
  retailer_slug,
  retailer_name,
  store_slug,
  store_name,
  store_city,
  price,
  unit_price,
  unit_price_unit,
  currency,
  observed_at,
  first_seen_at,
  last_seen_at,
  source_url,
  source_type,
  match_method,
  match_confidence,
  is_fresh
from ranked
where identity_position = 1;

alter view public.published_retail_observed_prices owner to postgres;
revoke all on public.published_retail_observed_prices from public, anon, authenticated;
grant select on public.published_retail_observed_prices to anon, authenticated;

comment on view public.published_retail_observed_prices is
  'Latest validated published retail observed prices with structured product identity. is_fresh marks observations not older than 30 days for current basket estimation.';

commit;