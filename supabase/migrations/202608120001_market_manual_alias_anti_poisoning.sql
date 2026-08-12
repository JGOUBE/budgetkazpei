-- Anti-poisoning for aliases learned from user receipt corrections.
--
-- This migration is additive:
--   * historical/admin aliases remain curated and immediately usable;
--   * user-learned aliases are promoted only from independent users/tickets;
--   * the anti-abuse ledger stores keyed, irreversible fingerprints only;
--   * no free-form correction can create a market product.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

alter table public.market_manual_product_aliases
  add column if not exists trust_origin text not null default 'curated',
  add column if not exists promotion_state text not null default 'curated',
  add column if not exists community_eligible boolean not null default true,
  add column if not exists independent_user_count integer not null default 0,
  add column if not exists distinct_ticket_count integer not null default 0,
  add column if not exists quality_state text not null default 'trusted',
  add column if not exists quality_reason text null,
  add column if not exists conflict_detected_at timestamptz null;

-- Snapshot backfill: every alias present before this migration belongs to the
-- administrator-assisted bootstrap, even though the legacy learner recorded
-- source = user_manual_correction. The legacy validation_count is deliberately
-- reset because it did not represent independent users. Two audited aliases are
-- explicitly quarantined below and never inherit curated trust.
update public.market_manual_product_aliases
set
  source = 'curated',
  trust_origin = 'curated',
  promotion_state = 'curated',
  community_eligible = true,
  independent_user_count = 0,
  distinct_ticket_count = 0,
  validation_count = 1,
  quality_state = 'trusted',
  quality_reason = null,
  status = 'active'
where id not in (
  '4711b418-d439-4c9a-b0f9-1fc03bf25eb7'::uuid,
  '8e03fec0-7848-4b15-8a43-e62e16aec2a0'::uuid
);

update public.market_manual_product_aliases
set
  source = 'user_manual_correction',
  trust_origin = 'user_learned',
  promotion_state = 'quarantined',
  community_eligible = false,
  independent_user_count = 0,
  distinct_ticket_count = 0,
  validation_count = 1,
  quality_state = 'quarantined',
  quality_reason = case id
    when '4711b418-d439-4c9a-b0f9-1fc03bf25eb7'::uuid
      then 'historical_gochugaru_gochujang_mismatch'
    when '8e03fec0-7848-4b15-8a43-e62e16aec2a0'::uuid
      then 'historical_canonical_label_overinterpreted'
  end,
  status = 'needs_review',
  rejection_reason = case id
    when '4711b418-d439-4c9a-b0f9-1fc03bf25eb7'::uuid
      then 'Admin review required: gochugaru and gochujang are different products.'
    when '8e03fec0-7848-4b15-8a43-e62e16aec2a0'::uuid
      then 'Admin review required: canonical label is too interpretive for the OCR evidence.'
  end
where id in (
  '4711b418-d439-4c9a-b0f9-1fc03bf25eb7'::uuid,
  '8e03fec0-7848-4b15-8a43-e62e16aec2a0'::uuid
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'market_manual_product_aliases_trust_origin_valid'
      and conrelid = 'public.market_manual_product_aliases'::regclass
  ) then
    alter table public.market_manual_product_aliases
      add constraint market_manual_product_aliases_trust_origin_valid
      check (trust_origin in ('curated', 'user_learned'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'market_manual_product_aliases_promotion_state_valid'
      and conrelid = 'public.market_manual_product_aliases'::regclass
  ) then
    alter table public.market_manual_product_aliases
      add constraint market_manual_product_aliases_promotion_state_valid
      check (promotion_state in ('curated', 'candidate', 'eligible', 'conflict', 'quarantined'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'market_manual_product_aliases_quality_state_valid'
      and conrelid = 'public.market_manual_product_aliases'::regclass
  ) then
    alter table public.market_manual_product_aliases
      add constraint market_manual_product_aliases_quality_state_valid
      check (quality_state in ('trusted', 'pending_review', 'passed', 'quarantined'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'market_manual_product_aliases_independent_counts_valid'
      and conrelid = 'public.market_manual_product_aliases'::regclass
  ) then
    alter table public.market_manual_product_aliases
      add constraint market_manual_product_aliases_independent_counts_valid
      check (independent_user_count >= 0 and distinct_ticket_count >= 0);
  end if;
end $$;

create table if not exists public.market_alias_abuse_secrets (
  singleton boolean primary key default true check (singleton),
  secret text not null,
  created_at timestamptz not null default now()
);

insert into public.market_alias_abuse_secrets (singleton, secret)
values (
  true,
  replace(extensions.gen_random_uuid()::text, '-', '')
    || replace(extensions.gen_random_uuid()::text, '-', '')
)
on conflict (singleton) do nothing;

create table if not exists public.market_manual_alias_validations (
  id uuid primary key default extensions.gen_random_uuid(),
  alias_id uuid not null references public.market_manual_product_aliases(id) on delete cascade,
  user_fingerprint bytea not null,
  ticket_fingerprint bytea not null,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  observed_count integer not null default 1 check (observed_count >= 1),
  last_observed_price numeric null
);

create unique index if not exists market_manual_alias_validations_ticket_uk
  on public.market_manual_alias_validations (alias_id, ticket_fingerprint);

create index if not exists market_manual_alias_validations_user_idx
  on public.market_manual_alias_validations (alias_id, user_fingerprint);

create index if not exists market_manual_product_aliases_community_idx
  on public.market_manual_product_aliases (
    normalized_raw_label,
    scope,
    store_chain_key,
    store_id,
    community_eligible,
    promotion_state
  );

alter table public.market_alias_abuse_secrets enable row level security;
alter table public.market_manual_alias_validations enable row level security;
revoke all on table public.market_alias_abuse_secrets from public, anon, authenticated;
revoke all on table public.market_manual_alias_validations from public, anon, authenticated;
grant all on table public.market_alias_abuse_secrets to postgres, service_role;
grant all on table public.market_manual_alias_validations to postgres, service_role;

comment on table public.market_manual_alias_validations is
  'Private anti-abuse ledger. User and receipt identities are stored only as HMAC-SHA-256 fingerprints.';
comment on column public.market_manual_product_aliases.validation_count is
  'Compatibility count. For user_learned aliases this mirrors the number of independent user fingerprints.';
comment on column public.market_manual_product_aliases.community_eligible is
  'Server-maintained promotion gate used before a user-learned alias may be active.';

create or replace function public.market_assess_manual_alias_quality(
  p_raw_label text,
  p_corrected_label text,
  p_canonical_label text default null
)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $quality$
declare
  v_raw text := left(trim(coalesce(p_raw_label, '')), 180);
  v_corrected text := left(trim(coalesce(p_corrected_label, '')), 400);
  v_normalized_raw text := public.market_normalize_manual_alias_text(v_raw);
  v_normalized_corrected text := public.market_normalize_manual_alias_text(v_corrected);
  v_normalized_canonical text := public.market_normalize_manual_alias_text(coalesce(p_canonical_label, ''));
  v_raw_similarity numeric := 0;
  v_product_similarity numeric := 0;
  v_special_count integer := 0;
  v_reason text := null;
begin
  if v_normalized_raw = '' or v_normalized_corrected = '' then
    v_reason := 'missing_label';
  elsif v_normalized_raw ~ '^(total|sous total|net a payer|reste a payer|paiement|cb|carte bleue|tva|ttc|fidelite|caisse)( |$)' then
    v_reason := 'raw_receipt_metadata_label';
  elsif length(v_corrected) > 140 then
    v_reason := 'corrected_label_too_long';
  elsif v_corrected ~* '(https?://|www\.|[[:alnum:]-]+\.(com|net|org|io|fr|re))' then
    v_reason := 'url_forbidden';
  elsif v_corrected ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' then
    v_reason := 'email_forbidden';
  elsif lower(v_corrected) ~ '([[:alnum:]])\1{5,}' then
    v_reason := 'repeated_characters';
  elsif v_normalized_corrected ~ '^(total|sous total|net a payer|reste a payer|paiement|cb|carte bleue|tva|ttc|fidelite|caisse)( |$)' then
    v_reason := 'receipt_metadata_label';
  elsif length(regexp_replace(v_normalized_corrected, '[^a-z]', '', 'g')) < 2 then
    v_reason := 'not_product_text';
  else
    v_special_count := length(regexp_replace(v_corrected, '[[:alnum:][:space:]]', '', 'g'));
    if v_special_count > greatest(12, floor(length(v_corrected) * 0.34)::integer) then
      v_reason := 'excessive_special_characters';
    end if;
  end if;

  if v_reason is null then
    v_raw_similarity := similarity(v_normalized_raw, v_normalized_corrected);
    if v_normalized_canonical <> '' then
      v_product_similarity := similarity(v_normalized_corrected, v_normalized_canonical);
    end if;

    -- A distant OCR correction is accepted only when it strongly resembles an
    -- already resolved canonical product. The learner never creates that product.
    if v_raw_similarity < 0.18 and v_product_similarity < 0.55 then
      v_reason := 'lexically_unrelated_without_product_evidence';
    end if;
  end if;

  return jsonb_build_object(
    'safe', v_reason is null,
    'reason', coalesce(v_reason, ''),
    'raw_similarity', round(v_raw_similarity, 4),
    'product_similarity', round(v_product_similarity, 4),
    'requires_extra_evidence', v_raw_similarity < 0.25
  );
end;
$quality$;

revoke execute on function public.market_assess_manual_alias_quality(text, text, text) from public;
grant execute on function public.market_assess_manual_alias_quality(text, text, text) to authenticated, service_role;

-- Reconstruct independent evidence for pre-migration user aliases when receipt
-- history is still present. No clear user or receipt id is copied to the ledger.
insert into public.market_manual_alias_validations (
  alias_id,
  user_fingerprint,
  ticket_fingerprint,
  first_observed_at,
  last_observed_at,
  observed_count,
  last_observed_price
)
select
  aliases.id,
  extensions.hmac('user:' || receipt_items.user_id::text, secrets.secret, 'sha256'::text),
  extensions.hmac('ticket:' || receipt_items.receipt_id::text, secrets.secret, 'sha256'::text),
  min(coalesce(receipt_items.created_at, aliases.first_observed_at, now())),
  max(coalesce(receipt_items.created_at, aliases.last_observed_at, now())),
  count(*)::integer,
  max(coalesce(receipt_items.total_price, receipt_items.unit_price))
from public.market_manual_product_aliases aliases
cross join public.market_alias_abuse_secrets secrets
join public.receipt_items
  on receipt_items.market_product_id = aliases.product_id
 and public.market_normalize_manual_alias_text(receipt_items.ocr_name) = aliases.normalized_raw_label
where aliases.trust_origin = 'user_learned'
  and aliases.promotion_state <> 'quarantined'
  and receipt_items.item_status = 'user_validated'
  and coalesce(receipt_items.line_type, 'product') = 'product'
group by aliases.id, secrets.secret, receipt_items.user_id, receipt_items.receipt_id
on conflict (alias_id, ticket_fingerprint) do update
set
  last_observed_at = greatest(
    public.market_manual_alias_validations.last_observed_at,
    excluded.last_observed_at
  ),
  observed_count = greatest(
    public.market_manual_alias_validations.observed_count,
    excluded.observed_count
  ),
  last_observed_price = coalesce(
    excluded.last_observed_price,
    public.market_manual_alias_validations.last_observed_price
  );

update public.market_manual_product_aliases aliases
set
  quality_state = case
    when coalesce((public.market_assess_manual_alias_quality(
      aliases.raw_label,
      aliases.corrected_label,
      products.canonical_name
    )->>'safe')::boolean, false) then 'passed'
    else 'quarantined'
  end,
  quality_reason = nullif(public.market_assess_manual_alias_quality(
    aliases.raw_label,
    aliases.corrected_label,
    products.canonical_name
  )->>'reason', '')
from public.market_products products
where aliases.product_id = products.id
  and aliases.trust_origin = 'user_learned'
  and aliases.promotion_state <> 'quarantined';

with counts as (
  select
    aliases.id,
    count(distinct validations.user_fingerprint)::integer as user_count,
    count(distinct validations.ticket_fingerprint)::integer as ticket_count
  from public.market_manual_product_aliases aliases
  left join public.market_manual_alias_validations validations
    on validations.alias_id = aliases.id
  where aliases.trust_origin = 'user_learned'
    and aliases.promotion_state <> 'quarantined'
  group by aliases.id
)
update public.market_manual_product_aliases aliases
set
  independent_user_count = counts.user_count,
  distinct_ticket_count = counts.ticket_count,
  validation_count = greatest(1, counts.user_count),
  confidence = least(
    0.995,
    greatest(
      aliases.confidence,
      case aliases.scope when 'store' then 0.86 when 'chain' then 0.82 else 0.78 end
      + least(counts.user_count, 3) * 0.04
    )
  )
from counts
where aliases.id = counts.id;

-- Any competing product for the same normalized label and scope blocks every
-- user-learned contender. Curated aliases are never downgraded by user input.
update public.market_manual_product_aliases aliases
set
  community_eligible = false,
  promotion_state = 'conflict',
  status = case when aliases.status = 'rejected' then 'rejected' else 'needs_review' end,
  conflict_detected_at = coalesce(aliases.conflict_detected_at, now()),
  quality_reason = coalesce(aliases.quality_reason, 'conflicting_product_targets'),
  updated_at = now()
where aliases.trust_origin = 'user_learned'
  and exists (
    select 1
    from public.market_manual_product_aliases competing
    where competing.id <> aliases.id
      and competing.product_id <> aliases.product_id
      and competing.normalized_raw_label = aliases.normalized_raw_label
      and competing.scope = aliases.scope
      and coalesce(competing.store_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(aliases.store_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and coalesce(competing.store_chain_key, '') = coalesce(aliases.store_chain_key, '')
      and competing.status <> 'rejected'
      and competing.promotion_state <> 'quarantined'
  );

update public.market_manual_product_aliases aliases
set
  community_eligible = (
    aliases.quality_state = 'passed'
    and aliases.promotion_state <> 'conflict'
    and aliases.promotion_state <> 'quarantined'
    and aliases.status <> 'rejected'
    and aliases.independent_user_count >= case when aliases.scope = 'global' then 3 else 2 end
    and aliases.distinct_ticket_count >= case when aliases.scope = 'global' then 3 else 2 end
    and aliases.confidence >= case when aliases.scope = 'global' then 0.90 else 0.84 end
  ),
  promotion_state = case
    when aliases.status = 'rejected' or aliases.quality_state = 'quarantined' then 'quarantined'
    when aliases.promotion_state = 'conflict' then 'conflict'
    when aliases.independent_user_count >= case when aliases.scope = 'global' then 3 else 2 end
      and aliases.distinct_ticket_count >= case when aliases.scope = 'global' then 3 else 2 end
      and aliases.confidence >= case when aliases.scope = 'global' then 0.90 else 0.84 end
      then 'eligible'
    else 'candidate'
  end,
  status = case
    when aliases.status = 'rejected' then 'rejected'
    when aliases.quality_state = 'passed'
      and aliases.promotion_state <> 'conflict'
      and aliases.promotion_state <> 'quarantined'
      and aliases.independent_user_count >= case when aliases.scope = 'global' then 3 else 2 end
      and aliases.distinct_ticket_count >= case when aliases.scope = 'global' then 3 else 2 end
      and aliases.confidence >= case when aliases.scope = 'global' then 0.90 else 0.84 end
      then 'active'
    else 'needs_review'
  end,
  updated_at = now()
where aliases.trust_origin = 'user_learned';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'market_manual_product_aliases_active_requires_trust'
      and conrelid = 'public.market_manual_product_aliases'::regclass
  ) then
    alter table public.market_manual_product_aliases
      add constraint market_manual_product_aliases_active_requires_trust
      check (
        status <> 'active'
        or trust_origin = 'curated'
        or community_eligible = true
      );
  end if;
end $$;

create or replace function public.market_learn_alias_from_receipt_item(
  p_receipt_item_id uuid,
  p_source text default 'user_manual_correction',
  p_allow_global boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $learner$
declare
  v_user_id uuid := auth.uid();
  v_item record;
  v_store_id uuid;
  v_store_chain_key text;
  v_scope text;
  v_raw_label text;
  v_corrected_label text;
  v_normalized_raw_label text;
  v_normalized_corrected_label text;
  v_price numeric;
  v_product record;
  v_resolution_item jsonb;
  v_product_strategy text := 'unresolved';
  v_quality jsonb;
  v_alias_id uuid;
  v_existing record;
  v_secret text;
  v_user_fingerprint bytea;
  v_ticket_fingerprint bytea;
  v_independent_user_count integer := 0;
  v_distinct_ticket_count integer := 0;
  v_required_count integer;
  v_confidence numeric;
  v_status text;
  v_promotion_state text;
  v_community_eligible boolean := false;
  v_conflict_exists boolean := false;
  v_is_curated boolean := false;
  v_result text := 'candidate';
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_receipt_item_id is null then
    raise exception 'receipt item required';
  end if;

  select
    receipt_items.id,
    receipt_items.receipt_id,
    receipt_items.user_id,
    receipt_items.ocr_name,
    receipt_items.corrected_name,
    receipt_items.name,
    receipt_items.item_status,
    receipt_items.review_status,
    receipt_items.line_type,
    receipt_items.market_product_id,
    receipt_items.market_package_format,
    receipt_items.brand,
    receipt_items.category,
    receipt_items.total_price,
    receipt_items.unit_price,
    receipts.store_name,
    receipts.store_location,
    receipts.purchase_date
  into v_item
  from public.receipt_items
  join public.receipts on receipts.id = receipt_items.receipt_id
  where receipt_items.id = p_receipt_item_id
    and receipt_items.user_id = v_user_id
    and receipts.user_id = v_user_id;

  if not found then
    raise exception 'receipt item not found or forbidden' using errcode = '42501';
  end if;

  if coalesce(v_item.item_status, '') <> 'user_validated'
    or coalesce(v_item.line_type, 'product') <> 'product'
    or coalesce(v_item.review_status, '') = 'rejected' then
    return jsonb_build_object(
      'ok', true,
      'learned', false,
      'result', 'skipped',
      'reason', 'item_not_user_validated_product'
    );
  end if;

  v_raw_label := left(trim(coalesce(v_item.ocr_name, '')), 180);
  v_corrected_label := left(trim(coalesce(v_item.corrected_name, v_item.name, '')), 180);
  v_normalized_raw_label := public.market_normalize_manual_alias_text(v_raw_label);
  v_normalized_corrected_label := public.market_normalize_manual_alias_text(v_corrected_label);
  v_price := case
    when v_item.total_price is not null and v_item.total_price > 0 then v_item.total_price
    when v_item.unit_price is not null and v_item.unit_price > 0 then v_item.unit_price
    else null
  end;

  if v_normalized_raw_label = '' or v_normalized_corrected_label = '' then
    return jsonb_build_object('ok', true, 'learned', false, 'result', 'skipped', 'reason', 'missing_label');
  end if;

  if v_normalized_raw_label = v_normalized_corrected_label then
    return jsonb_build_object('ok', true, 'learned', false, 'result', 'skipped', 'reason', 'no_manual_change');
  end if;

  v_store_chain_key := public.market_store_chain_key(v_item.store_name);
  v_store_id := null;

  if public.market_normalize_text(v_item.store_name) <> '' then
    select case when count(*) = 1 then (array_agg(id order by id))[1] else null end
    into v_store_id
    from public.market_stores
    where normalized_store_name = public.market_normalize_text(v_item.store_name)
      and (
        public.market_normalize_text(coalesce(v_item.store_location, '')) = ''
        or normalized_city = public.market_normalize_text(v_item.store_location)
      );
  end if;

  if v_store_chain_key <> '' then
    v_scope := 'chain';
  elsif v_store_id is not null then
    v_scope := 'store';
  elsif p_allow_global then
    v_scope := 'global';
  else
    return jsonb_build_object('ok', true, 'learned', false, 'result', 'skipped', 'reason', 'global_disabled');
  end if;

  select
    products.id,
    products.canonical_name,
    products.brand,
    products.category,
    products.subcategory,
    products.package_format
  into v_product
  from public.market_products products
  where products.id = v_item.market_product_id;

  if v_product.id is not null then
    v_product_strategy := 'receipt_item_market_product';
  end if;

  select value
  into v_resolution_item
  from jsonb_array_elements(
    public.market_resolve_exact_products(
      jsonb_build_array(jsonb_build_object(
        'index', 0,
        'raw_name', v_corrected_label,
        'barcode', null,
        'observed_price', v_price,
        'store_name', left(trim(coalesce(v_item.store_name, '')), 120),
        'store_city', left(trim(coalesce(v_item.store_location, '')), 80),
        'observed_date', case
          when v_item.purchase_date is not null then to_char(v_item.purchase_date, 'YYYY-MM-DD')
          else null
        end,
        'alternate_names', jsonb_build_array()
      ))
    )
  ) value
  limit 1;

  if coalesce((v_resolution_item->>'market_matched')::boolean, false) then
    select
      products.id,
      products.canonical_name,
      products.brand,
      products.category,
      products.subcategory,
      products.package_format
    into v_product
    from public.market_products products
    where products.id = (v_resolution_item->>'market_product_id')::uuid;

    if v_product.id is not null then
      v_product_strategy := 'exact_existing_product';
    end if;
  end if;

  -- Deliberately no fallback insert into market_products here. A free-form user
  -- correction may only point to a product that already exists and is resolved.
  if v_product.id is null then
    return jsonb_build_object(
      'ok', true,
      'learned', false,
      'result', 'quarantined',
      'reason', 'product_unresolved'
    );
  end if;

  v_quality := public.market_assess_manual_alias_quality(
    v_raw_label,
    v_corrected_label,
    v_product.canonical_name
  );

  if not coalesce((v_quality->>'safe')::boolean, false) then
    return jsonb_build_object(
      'ok', true,
      'learned', false,
      'result', 'quarantined',
      'reason', coalesce(v_quality->>'reason', 'suspicious_correction'),
      'quality', v_quality
    );
  end if;

  v_confidence := case v_scope when 'store' then 0.86 when 'chain' then 0.82 else 0.78 end;
  if v_product_strategy = 'exact_existing_product' then
    v_confidence := least(0.92, v_confidence + 0.04);
  end if;
  if v_price is not null then
    v_confidence := least(0.94, v_confidence + 0.02);
  end if;

  insert into public.market_manual_product_aliases (
    product_id,
    raw_label,
    normalized_raw_label,
    corrected_label,
    normalized_corrected_label,
    scope,
    store_id,
    store_chain_key,
    source,
    status,
    confidence,
    validation_count,
    first_observed_at,
    last_observed_at,
    observed_price,
    brand,
    category,
    package_format,
    trust_origin,
    promotion_state,
    community_eligible,
    independent_user_count,
    distinct_ticket_count,
    quality_state,
    quality_reason
  ) values (
    v_product.id,
    v_raw_label,
    v_normalized_raw_label,
    v_corrected_label,
    v_normalized_corrected_label,
    v_scope,
    case when v_scope = 'store' then v_store_id else null end,
    case when v_scope = 'chain' then v_store_chain_key else null end,
    'user_manual_correction',
    'needs_review',
    v_confidence,
    1,
    now(),
    now(),
    v_price,
    coalesce(nullif(v_item.brand, ''), v_product.brand),
    coalesce(nullif(v_item.category, ''), v_product.category),
    coalesce(nullif(v_item.market_package_format, ''), v_product.package_format),
    'user_learned',
    'candidate',
    false,
    0,
    0,
    'passed',
    null
  )
  on conflict (
    product_id,
    normalized_raw_label,
    scope,
    (coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(store_chain_key, ''))
  ) do nothing
  returning id into v_alias_id;

  if v_alias_id is null then
    select *
    into v_existing
    from public.market_manual_product_aliases aliases
    where aliases.product_id = v_product.id
      and aliases.normalized_raw_label = v_normalized_raw_label
      and aliases.scope = v_scope
      and coalesce(aliases.store_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(case when v_scope = 'store' then v_store_id else null end, '00000000-0000-0000-0000-000000000000'::uuid)
      and coalesce(aliases.store_chain_key, '')
        = coalesce(case when v_scope = 'chain' then v_store_chain_key else null end, '')
    for update;
    v_alias_id := v_existing.id;
    v_is_curated := v_existing.trust_origin = 'curated';
  else
    select * into v_existing
    from public.market_manual_product_aliases aliases
    where aliases.id = v_alias_id
    for update;
  end if;

  if v_alias_id is null then
    raise exception 'alias upsert failed';
  end if;

  select secret into v_secret
  from public.market_alias_abuse_secrets
  where singleton = true;

  if v_secret is null then
    raise exception 'alias abuse secret unavailable';
  end if;

  v_user_fingerprint := extensions.hmac('user:' || v_user_id::text, v_secret, 'sha256'::text);
  v_ticket_fingerprint := extensions.hmac('ticket:' || v_item.receipt_id::text, v_secret, 'sha256'::text);

  insert into public.market_manual_alias_validations (
    alias_id,
    user_fingerprint,
    ticket_fingerprint,
    first_observed_at,
    last_observed_at,
    observed_count,
    last_observed_price
  ) values (
    v_alias_id,
    v_user_fingerprint,
    v_ticket_fingerprint,
    now(),
    now(),
    1,
    v_price
  )
  on conflict (alias_id, ticket_fingerprint) do update
  set
    last_observed_at = now(),
    observed_count = public.market_manual_alias_validations.observed_count + 1,
    last_observed_price = coalesce(excluded.last_observed_price, public.market_manual_alias_validations.last_observed_price);

  select
    count(distinct validations.user_fingerprint)::integer,
    count(distinct validations.ticket_fingerprint)::integer
  into v_independent_user_count, v_distinct_ticket_count
  from public.market_manual_alias_validations validations
  where validations.alias_id = v_alias_id;

  v_confidence := least(
    0.995,
    greatest(
      coalesce(v_existing.confidence, v_confidence),
      (case v_scope when 'store' then 0.86 when 'chain' then 0.82 else 0.78 end)
      + least(v_independent_user_count, 3) * 0.04
      + case when v_product_strategy = 'exact_existing_product' then 0.04 else 0 end
    )
  );

  select exists (
    select 1
    from public.market_manual_product_aliases competing
    where competing.id <> v_alias_id
      and competing.product_id <> v_product.id
      and competing.normalized_raw_label = v_normalized_raw_label
      and competing.scope = v_scope
      and coalesce(competing.store_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(case when v_scope = 'store' then v_store_id else null end, '00000000-0000-0000-0000-000000000000'::uuid)
      and coalesce(competing.store_chain_key, '')
        = coalesce(case when v_scope = 'chain' then v_store_chain_key else null end, '')
      and competing.status <> 'rejected'
      and competing.promotion_state <> 'quarantined'
  ) into v_conflict_exists;

  if v_conflict_exists then
    update public.market_manual_product_aliases aliases
    set
      community_eligible = false,
      promotion_state = 'conflict',
      status = case when aliases.status = 'rejected' then 'rejected' else 'needs_review' end,
      conflict_detected_at = coalesce(aliases.conflict_detected_at, now()),
      quality_reason = coalesce(aliases.quality_reason, 'conflicting_product_targets'),
      updated_at = now()
    where aliases.trust_origin = 'user_learned'
      and aliases.normalized_raw_label = v_normalized_raw_label
      and aliases.scope = v_scope
      and coalesce(aliases.store_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(case when v_scope = 'store' then v_store_id else null end, '00000000-0000-0000-0000-000000000000'::uuid)
      and coalesce(aliases.store_chain_key, '')
        = coalesce(case when v_scope = 'chain' then v_store_chain_key else null end, '');
  end if;

  if v_is_curated then
    v_status := coalesce(v_existing.status, 'active');
    v_promotion_state := 'curated';
    v_community_eligible := v_status = 'active';
    v_result := 'curated_confirmed';

    update public.market_manual_product_aliases
    set
      last_observed_at = now(),
      observed_price = coalesce(v_price, observed_price),
      independent_user_count = v_independent_user_count,
      distinct_ticket_count = v_distinct_ticket_count,
      updated_at = now()
    where id = v_alias_id;
  else
    v_required_count := case when v_scope = 'global' then 3 else 2 end;
    v_community_eligible := not v_conflict_exists
      and coalesce(v_existing.status, '') <> 'rejected'
      and coalesce(v_existing.promotion_state, '') <> 'quarantined'
      and coalesce(v_existing.quality_state, '') <> 'quarantined'
      and v_independent_user_count >= v_required_count
      and v_distinct_ticket_count >= v_required_count
      and v_confidence >= case when v_scope = 'global' then 0.90 else 0.84 end;
    v_promotion_state := case
      when coalesce(v_existing.status, '') = 'rejected' then 'quarantined'
      when coalesce(v_existing.promotion_state, '') = 'quarantined'
        or coalesce(v_existing.quality_state, '') = 'quarantined' then 'quarantined'
      when v_conflict_exists then 'conflict'
      when v_community_eligible then 'eligible'
      else 'candidate'
    end;
    v_status := case
      when coalesce(v_existing.status, '') = 'rejected' then 'rejected'
      when v_community_eligible then 'active'
      else 'needs_review'
    end;
    v_result := case
      when v_promotion_state = 'eligible' then 'promoted'
      else v_promotion_state
    end;

    update public.market_manual_product_aliases
    set
      raw_label = v_raw_label,
      corrected_label = v_corrected_label,
      normalized_corrected_label = v_normalized_corrected_label,
      source = 'user_manual_correction',
      status = v_status,
      confidence = v_confidence,
      validation_count = greatest(1, v_independent_user_count),
      last_observed_at = now(),
      observed_price = coalesce(v_price, observed_price),
      brand = coalesce(nullif(v_item.brand, ''), v_product.brand, brand),
      category = coalesce(nullif(v_item.category, ''), v_product.category, category),
      package_format = coalesce(nullif(v_item.market_package_format, ''), v_product.package_format, package_format),
      promotion_state = v_promotion_state,
      community_eligible = v_community_eligible,
      independent_user_count = v_independent_user_count,
      distinct_ticket_count = v_distinct_ticket_count,
      quality_state = case
        when coalesce(v_existing.quality_state, '') = 'quarantined' then 'quarantined'
        else 'passed'
      end,
      quality_reason = case
        when coalesce(v_existing.quality_state, '') = 'quarantined' then v_existing.quality_reason
        when v_conflict_exists then 'conflicting_product_targets'
        else null
      end,
      conflict_detected_at = case when v_conflict_exists then coalesce(conflict_detected_at, now()) else conflict_detected_at end,
      updated_at = now()
    where id = v_alias_id;
  end if;

  update public.receipt_items
  set
    market_product_id = v_product.id,
    market_matched = v_community_eligible,
    market_match_type = case
      when v_is_curated then 'manual_curated_alias'
      when v_conflict_exists then 'manual_user_correction_conflict'
      when v_community_eligible then 'manual_user_correction_promoted'
      else 'manual_user_correction_candidate'
    end,
    market_match_confidence = v_confidence,
    market_canonical_name = v_product.canonical_name,
    market_brand = v_product.brand,
    market_category = v_product.category,
    market_subcategory = v_product.subcategory,
    market_package_format = v_product.package_format
  where id = p_receipt_item_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'learned', true,
    'result', v_result,
    'alias_id', v_alias_id,
    'product_id', v_product.id,
    'canonical_name', v_product.canonical_name,
    'scope', v_scope,
    'status', v_status,
    'promotion_state', v_promotion_state,
    'community_eligible', v_community_eligible,
    'validation_count', case when v_is_curated then greatest(coalesce(v_existing.validation_count, 1), 1) else greatest(v_independent_user_count, 1) end,
    'independent_user_count', v_independent_user_count,
    'distinct_ticket_count', v_distinct_ticket_count,
    'confidence', v_confidence,
    'product_strategy', v_product_strategy,
    'quality', v_quality
  );
end;
$learner$;

revoke execute on function public.market_learn_alias_from_receipt_item(uuid, text, boolean) from public, anon;
grant execute on function public.market_learn_alias_from_receipt_item(uuid, text, boolean) to authenticated, service_role;
