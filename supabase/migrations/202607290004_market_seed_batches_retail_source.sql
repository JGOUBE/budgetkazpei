alter table public.market_seed_batches
  drop constraint market_seed_batches_source_allowed;

alter table public.market_seed_batches
  add constraint market_seed_batches_source_allowed
  check (
    source = any (
      array[
        'manual_seed'::text,
        'receipt_scan_anonymized'::text,
        'bqp_reunion_2026'::text,
        'open_prices'::text,
        'retail_publication'::text
      ]
    )
  );
