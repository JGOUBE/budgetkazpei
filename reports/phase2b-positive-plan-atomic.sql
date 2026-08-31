with
input as (
  select
    '[{"recommended_action":"library","classification":"active_library_ready","proposed_alias":{"product_id":"f3061576-1e12-4ee2-8b8f-58919383c104","raw_label":"POULAIN SP","normalized_raw_label":"poulain sp","source":"open_prices","confidence":1,"scope":"chain","store_id":null,"store_chain_key":"e leclerc","status":"active","evidence":{"candidate_canonical_name":"Chocolat en poudre Poulain 450 g","classification":"active_library_ready","fixture_only":true}}}]'::jsonb as p_items,
    '[{"normalized_raw_label":"poulain sp","store_chain_key":"e leclerc","expected_count":8}]'::jsonb as expectations
),

rpc as materialized (
  select public.market_apply_scoped_alias_library(input.p_items) as result
  from input
),

rpc_guard as (
  select
    1 / case
      when jsonb_array_length(coalesce(rpc.result -> 'errors', '[]'::jsonb)) = 0
       and jsonb_array_length(coalesce(rpc.result -> 'skipped', '[]'::jsonb)) = 0
      then 1
      else 0
    end as ok
  from rpc
),

expected as (
  select *
  from input,
  jsonb_to_recordset(input.expectations) as rows(
    normalized_raw_label text,
    store_chain_key text,
    expected_count integer
  )
),

resolved_aliases as (
  select
    expected.normalized_raw_label,
    expected.store_chain_key,
    expected.expected_count,
    aliases.product_id
  from expected
  join public.market_product_aliases aliases
    on aliases.normalized_raw_label = expected.normalized_raw_label
   and aliases.scope = 'chain'
   and aliases.store_chain_key = expected.store_chain_key
   and aliases.status = 'active'
),

alias_counts as (
  select
    expected.normalized_raw_label,
    expected.store_chain_key,
    expected.expected_count,
    count(resolved_aliases.product_id)::integer as alias_count
  from expected
  left join resolved_aliases
    on resolved_aliases.normalized_raw_label = expected.normalized_raw_label
   and resolved_aliases.store_chain_key = expected.store_chain_key
  group by
    expected.normalized_raw_label,
    expected.store_chain_key,
    expected.expected_count
),

alias_guard as (
  select
    1 / case
      when count(*) filter (where alias_count <> 1) = 0
      then 1
      else 0
    end as ok
  from alias_counts
),

target_lines as (
  select
    receipt_items.id,
    receipt_items.market_product_id,
    resolved_aliases.normalized_raw_label,
    resolved_aliases.store_chain_key,
    resolved_aliases.expected_count,
    resolved_aliases.product_id
  from resolved_aliases
  join public.receipts receipts
    on public.market_store_chain_key(receipts.store_name)
       = resolved_aliases.store_chain_key
  join public.receipt_items receipt_items
    on receipt_items.receipt_id = receipts.id
   and coalesce(receipt_items.line_type, 'product') = 'product'
   and public.market_normalize_manual_alias_text(
         trim(
           coalesce(
             nullif(receipt_items.corrected_name, ''),
             nullif(receipt_items.ocr_name, ''),
             nullif(receipt_items.name, ''),
             ''
           )
         )
       ) = resolved_aliases.normalized_raw_label
),

line_counts as (
  select
    resolved_aliases.normalized_raw_label,
    resolved_aliases.store_chain_key,
    resolved_aliases.expected_count,
    resolved_aliases.product_id,
    count(target_lines.id)::integer as live_count,
    count(target_lines.id) filter (
      where target_lines.market_product_id is null
    )::integer as unresolved_count,
    count(target_lines.id) filter (
      where target_lines.market_product_id = resolved_aliases.product_id
    )::integer as already_correct_count,
    count(target_lines.id) filter (
      where target_lines.market_product_id is not null
        and target_lines.market_product_id <> resolved_aliases.product_id
    )::integer as conflict_count
  from resolved_aliases
  left join target_lines
    on target_lines.normalized_raw_label = resolved_aliases.normalized_raw_label
   and target_lines.store_chain_key = resolved_aliases.store_chain_key
   and target_lines.product_id = resolved_aliases.product_id
  group by
    resolved_aliases.normalized_raw_label,
    resolved_aliases.store_chain_key,
    resolved_aliases.expected_count,
    resolved_aliases.product_id
),

line_guard as (
  select
    1 / case
      when count(*) filter (
        where live_count <> expected_count
           or conflict_count <> 0
      ) = 0
      then 1
      else 0
    end as ok
  from line_counts
),

all_guards as (
  select
    rpc_guard.ok as rpc_ok,
    alias_guard.ok as alias_ok,
    line_guard.ok as line_ok
  from rpc_guard
  cross join alias_guard
  cross join line_guard
),

updated as (
  update public.receipt_items receipt_items
  set
    market_product_id = target_lines.product_id,
    market_matched = true,
    market_match_type = 'alias_exact',
    market_match_confidence = 1,
    market_canonical_name = products.canonical_name,
    market_brand = products.brand,
    market_category = products.category,
    market_subcategory = products.subcategory,
    market_package_format = products.package_format
  from
    target_lines,
    public.market_products products,
    all_guards
  where receipt_items.id = target_lines.id
    and products.id = target_lines.product_id
    and receipt_items.market_product_id is null
    and all_guards.rpc_ok = 1
    and all_guards.alias_ok = 1
    and all_guards.line_ok = 1
  returning
    receipt_items.id,
    target_lines.normalized_raw_label,
    target_lines.store_chain_key,
    target_lines.product_id
),

updated_counts as (
  select
    normalized_raw_label,
    store_chain_key,
    product_id,
    count(*)::integer as updated_count
  from updated
  group by normalized_raw_label, store_chain_key, product_id
)

select jsonb_build_object(
  'rpc_result', rpc.result,
  'backfill',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'normalized_raw_label', line_counts.normalized_raw_label,
          'store_chain_key', line_counts.store_chain_key,
          'product_id', line_counts.product_id,
          'expected_count', line_counts.expected_count,
          'live_count', line_counts.live_count,
          'already_correct_count', line_counts.already_correct_count,
          'updated_count', coalesce(updated_counts.updated_count, 0),
          'conflict_count', line_counts.conflict_count
        )
        order by line_counts.normalized_raw_label
      )
      from line_counts
      left join updated_counts
        on updated_counts.normalized_raw_label = line_counts.normalized_raw_label
       and updated_counts.store_chain_key = line_counts.store_chain_key
       and updated_counts.product_id = line_counts.product_id
    ),
    '[]'::jsonb
  )
) as result
from rpc
cross join all_guards;
