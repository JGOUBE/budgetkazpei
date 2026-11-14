-- Share safe data from validated scanned receipts with the searchable shopping list.
-- Restricted to the current user's own validated receipt.
-- Weak labels are quarantined in market_external_product_candidates.
CREATE OR REPLACE FUNCTION public.shopping_learn_receipt_to_shared_catalog(p_receipt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  r public.receipts%rowtype;
  s record;
  v_norm text;
  v_original_norm text;
  v_label text;
  v_retailer text;
  v_chain text;
  v_commune text;
  v_locality text;
  v_store_count integer;
  v_score numeric;
  v_status text;
  v_count integer;
  v_shopping_id uuid;
  v_market_id uuid;
  v_pack text;
  v_pack_count integer;
  v_product_key text;
  v_has_specific_format boolean;
  v_specific boolean;
  v_observed timestamptz;
  v_prices integer := 0;
  v_products integer := 0;
  v_links integer := 0;
  v_aliases integer := 0;
  v_review integer := 0;
  v_known integer := 0;
  v_skipped integer := 0;
  v_checked integer := 0;
  v_max integer := 120;
  v_candidate_reason text;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select * into r from public.receipts
  where id=p_receipt_id and user_id=v_user;

  if not found then
    raise exception 'receipt_not_found_or_not_owned' using errcode='42501';
  end if;

  if r.validation_status is distinct from 'validated'
     or r.date_status is distinct from 'detected'
     or r.is_food_ticket is distinct from true
     or r.ocr_status not in ('python_api','validated','ai','ocr','success')
     or r.purchase_date is null
     or r.purchase_date > current_date
     or r.purchase_date < current_date - 730
     or r.duplicate_of_receipt_id is not null then
    return jsonb_build_object('ok',true,'skipped',true,'reason','receipt_not_eligible');
  end if;

  v_retailer := case
    when public.market_normalize_text(r.store_name) like '%leclerc%' then 'e-leclerc'
    when public.market_normalize_text(r.store_name) like '%leader price%' then 'leader-price'
    when public.market_normalize_text(r.store_name) like '%super u%' then 'super-u'
    when public.market_normalize_text(r.store_name) like '%carrefour%' then 'carrefour'
    else null end;

  v_chain := case v_retailer
    when 'e-leclerc' then 'e leclerc'
    when 'leader-price' then 'leader price'
    when 'super-u' then 'super u'
    when 'carrefour' then 'carrefour'
    else null end;

  if v_retailer is null then
    return jsonb_build_object('ok',true,'skipped',true,'reason','store_not_supported');
  end if;

  -- Never invent the city of a store. Only publish prices if the location is uniquely identified.
  select count(distinct coalesce(loc.id::text,'')),min(loc.commune),min(loc.locality)
  into v_store_count,v_commune,v_locality
  from public.shopping_store_locations loc
  where loc.is_active and loc.retailer_slug=v_retailer
    and length(public.market_normalize_text(coalesce(r.store_location,'')))>=4
    and (
      public.market_normalize_text(loc.locality)=public.market_normalize_text(r.store_location)
      or public.market_normalize_text(loc.store_name) like '%'||public.market_normalize_text(r.store_location)||'%'
    );

  if v_store_count<>1 then
    v_commune:=null;
    v_locality:=null;
  end if;

  v_observed:=(r.purchase_date::text||' 12:00:00+04')::timestamptz;

  for s in
    select si.*,
      (select case when ri.item_status='user_validated' then 'user_validated' else 'trusted' end
       from public.receipt_items ri
       where ri.receipt_id=si.receipt_id and ri.user_id=si.user_id
         and ri.line_type='product'
         and ri.item_status in ('trusted','user_validated')
         and (
          public.market_normalize_text(coalesce(ri.corrected_name,ri.name))=
             public.market_normalize_text(coalesce(si.corrected_name,si.product_name))
          or public.market_normalize_text(coalesce(ri.ocr_name,ri.name))=
             public.market_normalize_text(coalesce(si.original_name,si.product_name))
         )
       order by case when ri.item_status='user_validated' then 0 else 1 end limit 1) as safe_status,
      (select max(case when ri.confidence_score between 0 and 1 then ri.confidence_score*100 else ri.confidence_score end)
       from public.receipt_items ri
       where ri.receipt_id=si.receipt_id and ri.user_id=si.user_id
         and ri.line_type='product'
         and ri.item_status in ('trusted','user_validated')
         and (
          public.market_normalize_text(coalesce(ri.corrected_name,ri.name))=
             public.market_normalize_text(coalesce(si.corrected_name,si.product_name))
          or public.market_normalize_text(coalesce(ri.ocr_name,ri.name))=
             public.market_normalize_text(coalesce(si.original_name,si.product_name))
         )
      ) as safe_confidence
    from public.shopping_items si
    where si.receipt_id=p_receipt_id and si.user_id=v_user
      and si.price>0 and si.price<500
      and length(btrim(coalesce(si.product_name,''))) between 8 and 120
    order by si.id limit 120
  loop
    v_checked:=v_checked+1;
    v_status:=s.safe_status;
    v_score:=s.safe_confidence;
    v_norm:=public.market_normalize_text(coalesce(nullif(s.corrected_name,''),s.product_name));
    v_original_norm:=public.market_normalize_text(coalesce(nullif(s.original_name,''),s.product_name));

    if v_status is null or v_score is null or v_score<95
       or length(v_norm)<8 or length(v_norm)>110
       or v_norm ~ '(^| )(total|sous total|tva|carte|paiement|credit|ticket|caisse|monnaie|rendu|code barre|fidelite|telephone|siret|facture)( |$)'
       or v_norm ~ '(^| )(produit a verifier|article illisible)( |$)'
       or coalesce(s.currency,'EUR')<>'EUR' then
      v_skipped:=v_skipped+1;
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtextextended('bkp-shopping-learn|'||v_norm,1));

    -- Only exact names or established store-scoped aliases may match an existing product.
    select count(distinct p.id),min(p.id::text)::uuid into v_count,v_shopping_id
    from public.shopping_products p
    where p.is_active and
      (public.market_normalize_text(p.display_name)=v_norm
       or exists (select 1 from public.shopping_product_aliases a
                  where a.product_id=p.id and a.normalized_alias in (v_norm,v_original_norm)
                    and (a.retailer_slug is null or a.retailer_slug=v_retailer))
       or exists (select 1 from public.shopping_market_product_links lk
         join public.market_product_aliases ma on ma.product_id=lk.market_product_id
         where lk.shopping_product_id=p.id and ma.status='active'
          and ma.normalized_raw_label in(v_norm,v_original_norm)
          and (ma.scope='global' or ma.store_chain_key=v_chain)));

    if v_count>1 then
      v_candidate_reason:='multiple_existing_products';
    else
      v_candidate_reason:=null;
    end if;

    v_pack:=null;
    v_pack_count:=null;
    v_has_specific_format:=false;
    select (regexp_match(v_norm,'(^| )x ?([1-9][0-9]?)( |$)'))[2] into v_pack;
    if v_pack is not null then
      v_pack_count:=v_pack::int;
      v_pack:='x'||v_pack;
      v_has_specific_format:=true;
    else
      select (regexp_match(v_norm,'([0-9]{1,4}(?:[,.][0-9]+)? ?(?:kg|g|gr|ml|cl|l))( |$)'))[1] into v_pack;
      v_has_specific_format:=v_pack is not null;
    end if;

    v_specific:=v_score>=97 and v_has_specific_format
       and cardinality(string_to_array(v_norm,' '))>=4
       and (select count(*) from regexp_matches(v_norm, '\m[a-z]{5,}\M', 'g'))>=2
       and v_norm !~ '(^| )(eur|promo|remise|offert|solde|prix)( |$)'
       and coalesce(s.promotion,false) = false;

    if v_count=0 and not v_specific then
      v_candidate_reason:='insufficient_specificity';
    end if;

    if v_candidate_reason is not null then
      insert into public.market_external_product_candidates
        (source_type,source_name,source_identifier,raw_label,normalized_raw_label,
         candidate_canonical_name,normalized_candidate_name,brand,category,package_format,
         observed_price,store_name,store_city,source_confidence,matching_evidence,status)
      values
        ('receipt_manual','BudgetKazPei receipt learning',
         md5('candidate|'||v_retailer||'|'||v_norm),
         coalesce(nullif(s.original_name,''),s.product_name),v_original_norm,
         coalesce(nullif(s.corrected_name,''),s.product_name),v_norm,
         nullif(s.brand,''),nullif(s.category,''),v_pack,
         s.price,r.store_name,r.store_location,least(1,v_score/100),
         jsonb_build_object('reason',v_candidate_reason,'store_chain',v_chain,
          'input_type','validated_receipt','source_label_only',true,'privacy','no_user_identifiers'),
         'candidate')
      on conflict do nothing;
      v_review:=v_review+1;
      continue;
    end if;

    if v_count=0 then
      -- Keep the full recognized designation so brands and pack sizes are not merged.
      v_label:=initcap(lower(btrim(coalesce(nullif(s.corrected_name,''),s.product_name))));
      v_label:=regexp_replace(v_label,'^Pains Lait ','Pains au lait ','i');
      insert into public.shopping_products
        (display_name,normalized_name,brand,size_label,category,subcategory,is_active)
      values (v_label,public.market_normalize_text(v_label),nullif(s.brand,''),v_pack,
         case when s.category is null or lower(s.category) in ('alimentaire','alimentation','divers')
              then 'Alimentation' else s.category end,
         nullif(s.subcategory,''),true)
      returning id into v_shopping_id;
      v_products:=v_products+1;
    else
      v_known:=v_known+1;
    end if;

    -- Establish a market identity without ever merging different packs by fuzzy similarity.
    select count(distinct m.id),min(m.id::text)::uuid into v_count,v_market_id
    from public.market_products m
    where m.normalized_name in(v_norm,public.market_normalize_text((select display_name from public.shopping_products where id=v_shopping_id)))
       or exists(select 1 from public.shopping_market_product_links lk
                 where lk.shopping_product_id=v_shopping_id and lk.market_product_id=m.id);

    if v_count=0 then
      v_product_key:='name|'||public.market_normalize_text((select display_name from public.shopping_products where id=v_shopping_id))
        ||'|brand||size||unit||count|'||coalesce(v_pack_count::text,'');
      insert into public.market_products
        (canonical_name,normalized_name,brand,normalized_brand,category,subcategory,
         package_count,package_format,product_key)
      select display_name,public.market_normalize_text(display_name),brand,
         public.market_normalize_text(coalesce(brand,'')),category,subcategory,
         v_pack_count,v_pack,v_product_key
      from public.shopping_products where id=v_shopping_id
      on conflict(product_key) do nothing
      returning id into v_market_id;
      if v_market_id is null then
         select id into v_market_id from public.market_products where product_key=v_product_key;
      end if;
    elsif v_count>1 then
      v_market_id:=null;
    end if;

    if v_market_id is not null then
      insert into public.shopping_market_product_links
        (market_product_id,shopping_product_id,match_method,verified_at)
      select v_market_id,v_shopping_id,'exact_name_brand_size',now()
      where not exists(select 1 from public.shopping_market_product_links
        where market_product_id=v_market_id or shopping_product_id=v_shopping_id)
      on conflict do nothing;
      if found then v_links:=v_links+1; end if;
    end if;

    insert into public.shopping_product_aliases
      (product_id,alias_text,normalized_alias,source_kind,retailer_slug,confidence_score)
    values(v_shopping_id,coalesce(nullif(s.original_name,''),s.product_name),v_original_norm,
           'receipt',v_retailer,least(1,v_score/100))
    on conflict do nothing;
    if found then v_aliases:=v_aliases+1; end if;

    if v_market_id is not null then
      insert into public.market_product_aliases
        (product_id,raw_label,normalized_raw_label,source,confidence,scope,
         store_chain_key,status,evidence,verified_at)
      select v_market_id,coalesce(nullif(s.original_name,''),s.product_name),
         v_original_norm,'receipt_scan_anonymized',least(.99,v_score/100),
         'chain',v_chain,'active',
         jsonb_build_object('source_type','validated_receipt','source_date',r.purchase_date,
           'source_chain',v_chain,'auto_catalog_learning',true,'privacy','no_user_identifiers'),now()
      where not exists(select 1 from public.market_product_aliases ma where
          ma.normalized_raw_label=v_original_norm and ma.status='active'
          and (ma.scope='global' or ma.store_chain_key=v_chain))
      on conflict do nothing;
    end if;

    -- A dated observed pack price is only shared when store location is unambiguous.
    if v_store_count=1 and v_score>=97 and coalesce(s.promotion,false)=false
        and not exists(select 1 from public.shopping_price_observations o
          where o.product_id=v_shopping_id and o.retailer_slug=v_retailer
          and o.commune=v_commune and o.observed_at::date=v_observed::date
          and o.price=s.price) then
      insert into public.shopping_price_observations
        (product_id,retailer_slug,commune,locality,observed_at,price,quantity,
         unit_label,unit_price,source_kind,source_reference_hash,
         confidence_score,is_publishable,verified_at)
      values(v_shopping_id,v_retailer,v_commune,v_locality,v_observed,
             s.price,1,null,null,'receipt',
             md5('bkp-receipt-catalog-v1|'||p_receipt_id::text||'|'||s.id::text),
             least(1,v_score/100),true,now())
      on conflict do nothing;
      if found then v_prices:=v_prices+1; end if;
    end if;
  end loop;

  return jsonb_build_object('ok',true,'checked',v_checked,'products_created',v_products,
    'existing_products',v_known,'prices_added',v_prices,'links_added',v_links,
    'aliases_added',v_aliases,'candidates_to_review',v_review,'skipped_lines',v_skipped,
    'price_store_resolved',v_store_count=1);
end;
$function$
;

revoke all on function public.shopping_learn_receipt_to_shared_catalog(uuid) from public,anon;
grant execute on function public.shopping_learn_receipt_to_shared_catalog(uuid) to authenticated;
